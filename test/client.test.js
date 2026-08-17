import test from 'node:test';
import assert from 'node:assert/strict';

import { extractApiKey, extractProjectId, makeBackendRequest } from '../src/client.js';
import { handleToolCall } from '../src/tools/handlers.js';
import { stubBackend, requests } from './helpers/backend.js';

test('an API key is read from query, custom header or Authorization', () => {
    assert.equal(extractApiKey({ query: { apikey: ' k1 ' } }), 'k1');
    assert.equal(extractApiKey({ query: { apiKey: 'k2' } }), 'k2');
    assert.equal(extractApiKey({ query: { api_key: 'k3' } }), 'k3');
    assert.equal(extractApiKey({ headers: { 'x-api-key': 'k4' } }), 'k4');
    assert.equal(extractApiKey({ headers: { authorization: 'Bearer k5' } }), 'k5');
    assert.equal(extractApiKey({ headers: { authorization: 'k6' } }), 'k6');
});

test('the OAuth placeholder token is not mistaken for a key', () => {
    // Clients that complete the OAuth dance send this literal; treating it as a
    // key would authenticate every caller as the same nonexistent user.
    assert.equal(extractApiKey({ headers: { authorization: 'Bearer dummy_access_token' } }), null);
    assert.equal(extractApiKey({ headers: { authorization: 'dummy_access_token' } }), null);
    assert.equal(extractApiKey({}), null);
    assert.equal(extractApiKey(null), null);
});

test('a workspace override is read from query or header, and is optional', () => {
    assert.equal(extractProjectId({ query: { projectId: 'p1' } }), 'p1');
    assert.equal(extractProjectId({ query: { workspace_id: 'p2' } }), 'p2');
    assert.equal(extractProjectId({ headers: { 'x-project-id': 'p3' } }), 'p3');
    // Absent by design: a key is bound to a workspace, so the backend resolves
    // one without this.
    assert.equal(extractProjectId({ query: {}, headers: {} }), null);
});

test('a request carries the key as a bearer token and sends no empty workspace header', async (t) => {
    const restore = stubBackend({ '/auth/user-data': { name: 'Owner' } });
    t.after(restore);

    await makeBackendRequest('/auth/user-data', 'GET', null, 'key_abc', null);

    assert.equal(requests[0].headers.Authorization, 'Bearer key_abc');
    // Sending it empty would resolve to a workspace named "" rather than
    // falling back to the one the key is bound to.
    assert.equal('x-project-id' in requests[0].headers, false);
});

test('a missing API key fails loudly rather than calling the backend anonymously', async (t) => {
    const restore = stubBackend({ '/auth/user-data': {} });
    t.after(restore);

    const previous = process.env.POSTMCPAI_API_KEY;
    delete process.env.POSTMCPAI_API_KEY;
    t.after(() => {
        if (previous !== undefined) process.env.POSTMCPAI_API_KEY = previous;
    });

    await assert.rejects(() => makeBackendRequest('/auth/user-data', 'GET', null, null), /Missing POSTMCPAI_API_KEY/);
    assert.equal(requests.length, 0);
});

test('a per-call workspaceId wins over the session default', async (t) => {
    const restore = stubBackend({ '/post/list': { posts: [] } });
    t.after(restore);

    await handleToolCall('list_posts', { workspaceId: 'ws_call' }, 'k', () => 'ws_session');
    assert.equal(requests[0].headers['x-project-id'], 'ws_call');

    await handleToolCall('list_posts', {}, 'k', () => 'ws_session');
    assert.equal(requests[1].headers['x-project-id'], 'ws_session');
});

test('the API key is read at call time, so a rotated key is picked up', async (t) => {
    const restore = stubBackend({ '/post/list': { posts: [] } });
    t.after(restore);

    let key = 'first';
    await handleToolCall('list_posts', {}, () => key);
    key = 'second';
    await handleToolCall('list_posts', {}, () => key);

    assert.equal(requests[0].headers.Authorization, 'Bearer first');
    assert.equal(requests[1].headers.Authorization, 'Bearer second');
});

test('an unknown tool name is an error, not a silent success', async (t) => {
    const restore = stubBackend({});
    t.after(restore);

    const result = await handleToolCall('delete_everything', {}, 'k');

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Tool not found: delete_everything/);
    assert.equal(requests.length, 0);
});
