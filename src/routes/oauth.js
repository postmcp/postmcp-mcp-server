import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { MongoOAuthStore, digest, randomToken } from '../auth/store.js';
import { PostMcpOAuthProvider, escapeHtml } from '../auth/provider.js';
import { validateApiKey } from '../auth/request.js';

export function oauthFromEnvironment() {
  const issuer = process.env.POSTMCPAI_OAUTH_ISSUER;
  const uri = process.env.POSTMCPAI_OAUTH_MONGODB_URI;
  const key = process.env.POSTMCPAI_OAUTH_ENCRYPTION_KEY;
  if (!issuer && !uri && !key) return null;
  if (!issuer || !uri || !key) throw new Error('OAuth requires POSTMCPAI_OAUTH_ISSUER, POSTMCPAI_OAUTH_MONGODB_URI and POSTMCPAI_OAUTH_ENCRYPTION_KEY');
  return new PostMcpOAuthProvider({ store: new MongoOAuthStore(uri, key), issuer, validateApiKey,
    allowedRedirectOrigins: (process.env.POSTMCPAI_OAUTH_REDIRECT_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean) });
}

export function createOAuthRouter(provider) {
  const router = express.Router();
  if (!provider) return router;
  const { issuer, resource, store } = provider;
  const metadata = {
    issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`, revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['mcp'],
  };
  router.get('/.well-known/oauth-authorization-server', (_req, res) => res.json(metadata));
  router.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json({
    resource, authorization_servers: [issuer], scopes_supported: ['mcp'], bearer_methods_supported: ['header'], resource_name: 'PostMCP AI',
  }));
  router.use('/oauth/authorize', authorizationHandler({ provider }));
  router.use('/oauth/token', tokenHandler({ provider }));
  router.use('/oauth/register', clientRegistrationHandler({ clientsStore: provider.clientsStore, clientSecretExpirySeconds: 0 }));
  router.use('/oauth/revoke', revocationHandler({ provider }));
  router.use('/oauth/consent', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.use('/oauth/consent', (req, res, next) => {
    // no-referrer on the form page makes browsers send Origin: null on POST.
    // Preserve same-origin form attribution; suppress referrers to external sites
    // and on the callback redirect. Keep the strict POST origin check below.
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': req.method === 'GET' ? 'same-origin' : 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    next();
  });
  const pending = async (req, transaction) => {
    if (typeof transaction !== 'string') return null;
    const record = await store.get('consent', transaction);
    const cookie = req.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${provider.cookieName}=`))?.slice(provider.cookieName.length + 1);
    return record && !record.used && cookie && digest(cookie) === record.browserHash ? record : null;
  };
  router.get('/oauth/consent', async (req, res) => {
    const record = await pending(req, req.query.transaction);
    if (!record) return res.status(400).send('This connection request expired. Start again from your MCP client.');
    // Chromium applies form-action to the OAuth redirect as well as the POST.
    // Only permit this issuer and the already-validated, registered callback origin.
    const callbackOrigin = new URL(record.redirectUri).origin;
    res.set('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${issuer} ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`);
    const name = escapeHtml(record.clientName);
    res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect PostMCP AI</title>
<style>body{font:16px system-ui;color:#142d25;background:#f4f7f5;margin:0;padding:48px 20px}main{max-width:480px;margin:auto;padding:32px;background:white;border:1px solid #d8e3dc;border-radius:20px}h1{font-size:28px}p,li{line-height:1.55}input{box-sizing:border-box;width:100%;padding:13px;margin:10px 0 20px;border:1px solid #9aafa4;border-radius:8px}button{padding:12px 18px;border:0;border-radius:8px;font:inherit;cursor:pointer}button[value=allow]{background:#174f39;color:white}a{color:#174f39}small{display:block;margin-top:18px}</style>
<main><p>POSTMCP AI</p><h1>Connect to ${name}</h1><p>Only continue if you started this request. The client’s registered callback is <strong>${escapeHtml(new URL(record.redirectUri).origin)}</strong>.</p><p>Allow this client to use your PostMCP permissions to:</p><ul><li>View workspaces, connected accounts, credits and analytics.</li><li>Create, schedule, publish, update and delete posts.</li><li>Generate images and refresh analytics using your credits.</li></ul>
<p>Copy your API key from the <a href="https://www.postmcpai.com/dashboard" target="_blank" rel="noopener noreferrer">PostMCP dashboard</a>. Enter it here to connect this account. Your key is stored encrypted by PostMCP and is never sent to the client.</p>
<form method="post" action="/oauth/consent"><input type="hidden" name="transaction" value="${escapeHtml(req.query.transaction)}"><label for="apiKey">PostMCP API key</label><input id="apiKey" name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="pmcp_sec_…"><button name="decision" value="allow">Allow access</button> <button name="decision" value="deny">Cancel</button></form><small>This grant expires after 30 days. Disconnect in your client, or rotate your PostMCP API key to invalidate access.</small></main></html>`);
  });
  router.post('/oauth/consent', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
    if (req.headers.origin !== issuer) return res.status(403).send('Invalid request origin.');
    const transaction = req.body.transaction;
    const record = await pending(req, transaction);
    if (!record) return res.status(400).send('This connection request expired. Start again from your MCP client.');
    if (!['allow', 'deny'].includes(req.body.decision)) return res.status(400).send('Choose Allow access or Cancel.');
    const target = new URL(record.redirectUri);
    if (record.state) target.searchParams.set('state', record.state);
    if (req.body.decision === 'deny') {
      if (!await store.consume('consent', transaction)) return res.status(400).send('Request already completed.');
      target.searchParams.set('error', 'access_denied');
      return res.redirect(303, target.href);
    }
    const apiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
    try { await provider.validateApiKey(apiKey); }
    catch { return res.status(401).send('That API key could not be verified. Go back to try again, or obtain a current key from PostMCP.'); }
    if (!await store.consume('consent', transaction)) return res.status(400).send('Request already completed.');
    const code = randomToken();
    await store.put('code', code, { ...record, apiKey }, Date.now() + 5 * 60_000);
    target.searchParams.set('code', code);
    res.clearCookie(provider.cookieName, { path: '/', secure: issuer.startsWith('https:'), httpOnly: true, sameSite: 'lax' });
    res.redirect(303, target.href);
  });
  return router;
}
