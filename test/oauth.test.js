import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createExpressApp } from '../src/app.js';
import { PostMcpOAuthProvider } from '../src/auth/provider.js';
import { MongoOAuthStore } from '../src/auth/store.js';
import { MemoryOAuthStore } from './helpers/oauth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const key = 'pmcp_sec_' + 'a'.repeat(32);
const otherKey = 'pmcp_sec_' + 'b'.repeat(32);
const verifier = 'a'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const issuer = 'https://mcp.example.test';
const redirectUri = 'https://chatgpt.com/connector/oauth/test-connection';

async function fixture(t, enabled = true) {
  const store = new MemoryOAuthStore();
  const validateKey = async (k) => { if (![key, otherKey].includes(k)) throw new Error('Invalid key'); };
  const provider = new PostMcpOAuthProvider({ store, issuer, validateApiKey: validateKey });
  const app = createExpressApp({ oauth: enabled ? provider : null, validateKey });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, { ...options, redirect: 'manual' });
  const form = (path, body, headers = {}) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(body) });
  const register = async (data = {}) => {
    const res = await request('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [redirectUri], client_name: 'Test client', token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...data }) });
    return { status: res.status, ...await res.json() };
  };
  const authorize = async (client, changes = {}) => {
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', resource: provider.resource, scope: 'mcp', state: 'state-must-survive', ...changes });
    const res = await request(`/oauth/authorize?${params}`);
    const location = res.headers.get('location');
    return { status: res.status, location, cookie: res.headers.get('set-cookie')?.split(';')[0], transaction: location && new URL(location, base).searchParams.get('transaction') };
  };
  const consent = (auth, changes = {}, headers = {}) => form('/oauth/consent', { transaction: auth.transaction, apiKey: key, decision: 'allow', ...changes }, { Cookie: auth.cookie, Origin: issuer, ...headers });
  const exchange = (client, code, changes = {}) => form('/oauth/token', { client_id: client.client_id, grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, resource: provider.resource, ...changes });
  const grant = async () => {
    const client = await register();
    assert.equal(client.status, 201);
    const auth = await authorize(client);
    assert.equal(auth.status, 302);
    const result = await consent(auth);
    assert.equal(result.status, 303);
    const location = new URL(result.headers.get('location'));
    assert.equal(location.searchParams.get('state'), 'state-must-survive');
    const code = location.searchParams.get('code');
    const res = await exchange(client, code);
    assert.equal(res.status, 200);
    return { client, code, tokens: await res.json() };
  };
  return { store, provider, request, register, authorize, consent, exchange, grant, form, base };
}

test('discovery is canonical, advertises S256 and real endpoints, and unauthenticated MCP challenges', async (t) => {
  const f = await fixture(t);
  const metadata = await (await f.request('/.well-known/oauth-authorization-server', { headers: { Host: 'attacker.test' } })).json();
  assert.equal(metadata.issuer, issuer);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.equal(metadata.token_endpoint, `${issuer}/oauth/token`);
  const resource = await (await f.request('/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(resource.resource, f.provider.resource);
  for (const method of ['GET', 'POST', 'DELETE']) {
    const res = await f.request('/mcp', { method });
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate'), /oauth-protected-resource\/mcp/);
  }
});

test('consent requires browser binding and origin, escapes client names and never echoes the API key', async (t) => {
  const f = await fixture(t);
  const client = await f.register({ client_name: '<script>alert(1)</script>' });
  const auth = await f.authorize(client);
  assert.equal((await f.request(auth.location)).status, 400);
  const page = await f.request(auth.location, { headers: { Cookie: auth.cookie } });
  const html = await page.text();
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<script>'));
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal((await f.consent(auth, {}, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.consent(auth, {}, { Cookie: 'wrong=value' })).status, 400);
  const bad = await f.consent(auth, { apiKey: 'invalid' });
  assert.equal(bad.status, 401);
  assert.ok(!(await bad.text()).includes(key));
  const result = await f.consent(auth);
  assert.equal(result.status, 303);
  assert.ok(!result.headers.get('location').includes(key));
  assert.equal((await f.consent(auth)).status, 400);
});

test('denying access returns access_denied and preserves state without issuing a code', async (t) => {
  const f = await fixture(t);
  const auth = await f.authorize(await f.register());
  const result = await f.consent(auth, { decision: 'deny', apiKey: '' });
  const url = new URL(result.headers.get('location'));
  assert.equal(url.searchParams.get('error'), 'access_denied');
  assert.equal(url.searchParams.get('state'), 'state-must-survive');
  assert.equal(url.searchParams.has('code'), false);
});

test('registration rejects unsafe redirects, accepts unique durable clients and never returns dummy credentials', async (t) => {
  const f = await fixture(t);
  for (const uri of ['https://attacker.test/callback', 'javascript:alert(1)', 'https://chatgpt.com/evil', 'https://chatgpt.com/connector/oauth/ok#fragment']) {
    assert.equal((await f.register({ redirect_uris: [uri] })).status, 400);
  }
  const a = await f.register(); const b = await f.register();
  assert.notEqual(a.client_id, b.client_id);
  assert.equal(a.client_secret, undefined);
  const secret = await f.register({ token_endpoint_auth_method: 'client_secret_post' });
  assert.equal(secret.client_secret_expires_at, 0);
  assert.ok(secret.client_secret.length >= 32);
});

test('authorization rejects wrong resource, scope, plain PKCE and unregistered redirect', async (t) => {
  const f = await fixture(t); const client = await f.register();
  for (const changes of [{ resource: 'https://attacker.test/mcp' }, { scope: 'admin' }, { code_challenge_method: 'plain' }, { code_challenge: 'short' }]) {
    const auth = await f.authorize(client, changes);
    assert.equal(auth.status, 302);
    assert.ok(new URL(auth.location).searchParams.has('error'));
    assert.equal(auth.transaction, null);
  }
  const invalid = await f.authorize(client, { redirect_uri: 'https://attacker.test/callback' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.location, null);
});

test('code exchange validates PKCE, client, redirect and resource, and permits only one redemption', async (t) => {
  const f = await fixture(t); const client = await f.register();
  const res = await f.consent(await f.authorize(client));
  const code = new URL(res.headers.get('location')).searchParams.get('code');
  for (const changes of [{ code_verifier: 'wrong' }, { redirect_uri: redirectUri + 'wrong' }, { resource: 'https://attacker.test/mcp' }, { resource: '' }]) {
    assert.equal((await f.exchange(client, code, changes)).status, 400);
  }
  assert.equal((await f.exchange(await f.register(), code)).status, 400);
  const results = await Promise.all([f.exchange(client, code), f.exchange(client, code)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});

test('refresh rotates tokens; replay revokes the complete grant, and revoke is client-bound', async (t) => {
  const f = await fixture(t); const { client, tokens } = await f.grant();
  const refresh = (overrides = {}) => f.form('/oauth/token', { client_id: client.client_id, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: f.provider.resource, ...overrides });
  assert.equal((await refresh({ resource: 'https://attacker.test/mcp' })).status, 400);
  assert.equal((await refresh({ scope: 'admin' })).status, 400);
  assert.equal((await refresh({ client_id: (await f.register()).client_id })).status, 400);
  const response = await refresh(); assert.equal(response.status, 200);
  const rotated = await response.json();
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  assert.equal((await refresh()).status, 400);
  await assert.rejects(f.provider.verifyAccessToken(rotated.access_token));
  const fresh = await f.grant();
  await f.form('/oauth/revoke', { client_id: client.client_id, token: fresh.tokens.access_token });
  assert.ok(await f.provider.verifyAccessToken(fresh.tokens.access_token));
  await f.form('/oauth/revoke', { client_id: fresh.client.client_id, token: fresh.tokens.refresh_token });
  await assert.rejects(f.provider.verifyAccessToken(fresh.tokens.access_token));
});

test('expired codes and access tokens fail and API key rotation prevents refresh', async (t) => {
  const f = await fixture(t); const { client, code, tokens } = await f.grant();
  f.store.records.get(`code:${code}`).expiresAt = Date.now() - 1;
  assert.equal((await f.exchange(client, code)).status, 400);
  f.store.records.get(`access:${tokens.access_token}`).expiresAt = Date.now() - 1;
  await assert.rejects(f.provider.verifyAccessToken(tokens.access_token));
  f.provider.validateApiKey = async () => { throw new Error('rotated'); };
  const response = await f.form('/oauth/token', { client_id: client.client_id, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: f.provider.resource });
  assert.equal(response.status, 400);
});

test('MCP SDK discovers all tools through API key and OAuth; sessions reject other credentials on every verb', async (t) => {
  const f = await fixture(t); const { tokens } = await f.grant();
  const seen = [];
  const backend = createHttpServer((req, res) => {
    seen.push(req.headers.authorization);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ name: 'Test account', credits: 42, plan: 'test' }));
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => backend.once('listening', resolve));
  const previous = process.env.POSTMCPAI_API_URL;
  process.env.POSTMCPAI_API_URL = `http://127.0.0.1:${backend.address().port}`;
  t.after(() => { backend.closeAllConnections(); backend.close(); if (previous === undefined) delete process.env.POSTMCPAI_API_URL; else process.env.POSTMCPAI_API_URL = previous; });
  for (const credential of [key, tokens.access_token]) {
    const transport = new StreamableHTTPClientTransport(new URL(f.base + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${credential}` } } });
    const client = new Client({ name: 'integration-test', version: '1.0.0' });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 17);
    const info = await client.callTool({ name: 'get_user_info', arguments: {} });
    assert.equal(JSON.parse(info.content[0].text).credits, 42);
    assert.equal(seen.at(-1), `Bearer ${key}`); // OAuth token is never passed upstream.
    for (const name of ['create_post', 'reschedule_post', 'get_post_analytics', 'get_connected_accounts']) assert.ok(tools.tools.some((tool) => tool.name === name));
    for (const method of ['GET', 'POST', 'DELETE']) {
      assert.equal((await f.request('/mcp', { method, headers: { 'Mcp-Session-Id': transport.sessionId, Authorization: `Bearer ${otherKey}` } })).status, 403);
      assert.equal((await f.request('/mcp', { method, headers: { 'Mcp-Session-Id': transport.sessionId } })).status, 401);
    }
    await transport.terminateSession(); await client.close();
  }
  assert.equal((await f.request(`/mcp?apikey=${tokens.access_token}`)).status, 401);
});

test('API-only mode removes dummy OAuth and never borrows an environment key for remote requests', async (t) => {
  const f = await fixture(t, false);
  const previous = process.env.POSTMCPAI_API_KEY; process.env.POSTMCPAI_API_KEY = key;
  t.after(() => { if (previous === undefined) delete process.env.POSTMCPAI_API_KEY; else process.env.POSTMCPAI_API_KEY = previous; });
  assert.equal((await f.request('/mcp')).status, 401);
  assert.equal((await f.request('/api/tools/get_user_info', { method: 'POST' })).status, 401);
  assert.equal((await f.request('/oauth/token', { method: 'POST' })).status, 404);
  assert.equal((await f.request('/.well-known/oauth-authorization-server')).status, 404);
  assert.equal((await f.request(`/mcp?apikey=${key}`)).status, 400); // authenticated, but missing a session
  assert.equal((await f.request('/mcp', { headers: { 'x-api-key': key } })).status, 400);
});

test('OAuth persistence encrypts API keys, rejects tampering, checks expiry, and survives a new store instance', async () => {
  const encryptionKey = 'c'.repeat(64);
  const store = new MongoOAuthStore('mongodb://127.0.0.1/test', encryptionKey);
  const sealed = store.seal({ apiKey: key });
  assert.ok(!sealed.includes(key));
  const restored = new MongoOAuthStore('mongodb://127.0.0.1/test', encryptionKey);
  assert.equal(restored.open({ payload: sealed }).apiKey, key);
  const bytes = Buffer.from(sealed, 'base64'); bytes[30] ^= 1;
  assert.throws(() => restored.open({ payload: bytes.toString('base64') }));
  assert.equal(restored.open({ payload: sealed, expiresAt: new Date(0) }), null);
  assert.throws(() => new MongoOAuthStore('mongodb://127.0.0.1/test', 'invalid'));
  await store.close(); await restored.close();
});
