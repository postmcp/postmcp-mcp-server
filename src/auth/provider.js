import { InvalidClientMetadataError, InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { digest, randomToken } from './store.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class PostMcpOAuthProvider {
  constructor({ store, issuer, validateApiKey, allowedRedirectOrigins = [] }) {
    this.store = store;
    this.issuer = new URL(issuer).origin;
    if (issuer.replace(/\/$/, '') !== this.issuer || (!this.issuer.startsWith('https://') && !['localhost', '127.0.0.1'].includes(new URL(issuer).hostname))) {
      throw new Error('OAuth issuer must be a canonical HTTPS origin (HTTP loopback is allowed for tests)');
    }
    this.resource = `${this.issuer}/mcp`;
    this.validateApiKey = validateApiKey;
    this.allowedRedirectOrigins = allowedRedirectOrigins;
    this.clientsStore = {
      getClient: (id) => store.get('client', id),
      registerClient: async (client) => {
        if (!client.redirect_uris?.length || client.redirect_uris.length > 10 || !client.redirect_uris.every((uri) => this.validRedirect(uri))) {
          throw new InvalidClientMetadataError('Use an allowed ChatGPT callback, loopback callback, or configured redirect origin');
        }
        if (!['none', 'client_secret_post'].includes(client.token_endpoint_auth_method || 'client_secret_post')) throw new InvalidClientMetadataError('Unsupported client authentication');
        if ((client.grant_types || []).some((grant) => !['authorization_code', 'refresh_token'].includes(grant))) throw new InvalidClientMetadataError('Unsupported grant type');
        if (client.client_name?.length > 100) throw new InvalidClientMetadataError('Client name too long');
        await store.put('client', client.client_id, client);
        return client;
      },
    };
  }
  validRedirect(uri) {
    try {
      const url = new URL(uri);
      if (url.username || url.password || url.hash) return false;
      if (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) return true;
      if (url.protocol !== 'https:') return false;
      if (this.allowedRedirectOrigins.includes(url.origin)) return true;
      return url.origin === 'https://chatgpt.com' && !url.search &&
        (url.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname));
    } catch { return false; }
  }
  checkResource(resource) {
    if (resource?.href !== this.resource) throw new InvalidTargetError('resource must identify this MCP server');
  }
  scopes(scopes = []) {
    if (scopes.some((scope) => scope !== 'mcp')) throw new InvalidScopeError('Only the mcp scope is supported');
    return ['mcp'];
  }
  async authorize(client, params, res) {
    this.checkResource(params.resource);
    this.scopes(params.scopes);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidRequestError('S256 challenge required');
    const transaction = randomToken();
    const browserSecret = randomToken();
    await this.store.put('consent', transaction, {
      clientId: client.client_id, clientName: client.client_name || 'MCP client',
      redirectUri: params.redirectUri, state: params.state, codeChallenge: params.codeChallenge,
      resource: this.resource, scopes: ['mcp'], browserHash: digest(browserSecret),
    }, Date.now() + 10 * MINUTE);
    res.cookie(this.cookieName, browserSecret, { httpOnly: true, secure: this.issuer.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 10 * MINUTE });
    res.redirect(`/oauth/consent?transaction=${transaction}`);
  }
  get cookieName() { return this.issuer.startsWith('https:') ? '__Host-postmcp-consent' : 'postmcp-consent'; }
  async code(client, code) {
    const record = await this.store.get('code', code);
    if (!record || record.used || record.clientId !== client.client_id) throw new InvalidGrantError('Invalid or expired authorization code');
    return record;
  }
  async challengeForAuthorizationCode(client, code) { return (await this.code(client, code)).codeChallenge; }
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    this.checkResource(resource);
    const record = await this.code(client, code);
    if (redirectUri !== record.redirectUri) throw new InvalidGrantError('redirect_uri does not match');
    if (!await this.store.consume('code', code)) throw new InvalidGrantError('Authorization code already redeemed');
    const grantId = randomToken();
    const expiresAt = Date.now() + 30 * DAY;
    await this.store.put('grant', grantId, { apiKey: record.apiKey, clientId: client.client_id, scopes: record.scopes, resource: this.resource, expiresAt }, expiresAt);
    return this.issueTokens(grantId, expiresAt);
  }
  async issueTokens(grantId, grantExpiresAt) {
    const access = `pmcp_at_${randomToken()}`;
    const refresh = `pmcp_rt_${randomToken()}`;
    const expiresAt = Math.min(Date.now() + 60 * MINUTE, grantExpiresAt);
    await this.store.put('access', access, { grantId, expiresAt }, expiresAt);
    await this.store.put('refresh', refresh, { grantId }, grantExpiresAt);
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: Math.floor((expiresAt - Date.now()) / 1000), scope: 'mcp' };
  }
  async exchangeRefreshToken(client, token, scopes, resource) {
    this.checkResource(resource);
    this.scopes(scopes);
    const record = await this.store.get('refresh', token);
    const grant = record && await this.store.get('grant', record.grantId);
    if (!grant || grant.clientId !== client.client_id || grant.resource !== this.resource) throw new InvalidGrantError('Invalid refresh token');
    if (record.used || !await this.store.consume('refresh', token)) {
      await this.store.delete('grant', record.grantId);
      throw new InvalidGrantError('Refresh token reuse detected; reconnect your account');
    }
    try { await this.validateApiKey(grant.apiKey); }
    catch {
      await this.store.delete('grant', record.grantId);
      throw new InvalidGrantError('PostMCP API key is no longer valid; reconnect your account');
    }
    return this.issueTokens(record.grantId, grant.expiresAt);
  }
  async verifyAccessToken(token) {
    const record = await this.store.get('access', token);
    const grant = record && await this.store.get('grant', record.grantId);
    if (!grant || grant.resource !== this.resource || !grant.scopes.includes('mcp')) throw new InvalidTokenError('Invalid or expired access token');
    return { token, clientId: grant.clientId, scopes: grant.scopes, expiresAt: Math.floor(record.expiresAt / 1000), resource: new URL(grant.resource), extra: { apiKey: grant.apiKey } };
  }
  async revokeToken(client, { token }) {
    const kind = token.startsWith('pmcp_rt_') ? 'refresh' : 'access';
    const record = await this.store.get(kind, token);
    const grant = record && await this.store.get('grant', record.grantId);
    if (grant?.clientId === client.client_id) await this.store.delete('grant', record.grantId);
  }
}
