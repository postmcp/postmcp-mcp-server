import test from 'node:test';
import assert from 'node:assert/strict';
import { handleToolCall } from '../src/tools/handlers.js';
import { createExpressApp } from '../src/app.js';
import { stubBackend, requests, resultOf } from './helpers/backend.js';

const metadata = { fileName: 'launch.png', contentType: 'image/png', fileSize: 245760 };
const publicUrl = 'https://media.example.com/launch.png';
const upload = { success: true, uploadUrl: 'https://storage.example.com/signed', publicUrl, key: 'launch.png', expiresIn: 900 };

test('upload authorization preserves signed URL and expiry, scopes the workspace, and does not transfer bytes', async (t) => {
  t.after(stubBackend({ 'POST /media/upload-url': upload }));
  const data = resultOf(await handleToolCall('create_media_upload_url', { ...metadata, contentType: 'Image/PNG; charset=binary', workspaceId: 'selected' }, 'key', 'default'));
  assert.equal(data.uploadUrl, upload.uploadUrl);
  assert.equal(data.publicUrl, publicUrl);
  assert.equal(data.expiresIn, 900);
  assert.equal(data.key, upload.key);
  assert.equal(data.method, 'PUT');
  assert.deepEqual(data.headers, { 'Content-Type': 'image/png' });
  assert.equal(data.uploaded, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.Authorization, 'Bearer key');
  assert.equal(requests[0].headers['x-project-id'], 'selected');
  assert.deepEqual(requests[0].body, metadata);
});

test('completion registers metadata in the selected workspace and returns a post-ready URL', async (t) => {
  t.after(stubBackend({ 'POST /media/assets': { success: true, asset: { _id: 'asset1', url: publicUrl } } }));
  const payload = { ...metadata, url: publicUrl, key: upload.key };
  const data = resultOf(await handleToolCall('complete_media_upload', payload, 'key', 'session-workspace'));
  assert.deepEqual(requests[0].body, payload);
  assert.equal(requests[0].headers['x-project-id'], 'session-workspace');
  assert.equal(data.mediaUrl, publicUrl);
  assert.equal(data.asset._id, 'asset1');
  assert.equal(data.librarySaved, true);
  assert.equal(data.warning, undefined);
});

test('library registration failure preserves the uploaded URL and tells the caller to retry', async (t) => {
  t.after(stubBackend({ 'POST /media/assets': { success: true, asset: null } }));
  const data = resultOf(await handleToolCall('complete_media_upload', { ...metadata, url: publicUrl, key: upload.key }, 'key'));
  assert.equal(data.mediaUrl, publicUrl);
  assert.equal(data.librarySaved, false);
  assert.match(data.warning, /Retry complete_media_upload/);
});

test('URL imports reuse backend downloading and support multicall workspace selection', async (t) => {
  t.after(stubBackend({ 'POST /media/import-url': { success: true, mediaUrl: publicUrl, asset: { _id: 'import1' } } }));
  const source = 'https://example.com/original.png';
  const data = resultOf(await handleToolCall('multicall', {
    workspaceId: 'batch-workspace',
    calls: [{ tool: 'import_media_from_url', arguments: { url: source } }],
  }, 'key'));
  assert.equal(data.succeeded, 1);
  assert.equal(data.results[0].result.mediaUrl, publicUrl);
  assert.equal(data.results[0].result.librarySaved, true);
  assert.deepEqual(requests[0].body, { url: source });
  assert.equal(requests[0].headers['x-project-id'], 'batch-workspace');
});

test('invalid metadata and non-HTTP URLs fail before any backend write', async (t) => {
  t.after(stubBackend({}));
  for (const args of [
    {}, { ...metadata, fileName: '' }, { ...metadata, contentType: null },
    ...[0, -1, 1.5, '20', Infinity].map(fileSize => ({ ...metadata, fileSize })),
  ]) {
    assert.equal((await handleToolCall('create_media_upload_url', args, 'key')).isError, true);
  }
  for (const url of ['', '/tmp/image.png', 'file:///tmp/image.png', 'data:image/png;base64,YQ==', 'https://user:password@example.com/file.png']) {
    assert.equal((await handleToolCall('import_media_from_url', { url }, 'key')).isError, true);
  }
  assert.equal((await handleToolCall('complete_media_upload', { ...metadata, url: publicUrl }, 'key')).isError, true);
  assert.equal(requests.length, 0);
});

test('backend type, size, permission, storage and unsafe URL failures remain tool errors', async (t) => {
  for (const [name, path, args, status, message] of [
    ['create_media_upload_url', '/media/upload-url', metadata, 413, 'Image exceeds the storage limit'],
    ['create_media_upload_url', '/media/upload-url', metadata, 400, 'Unsupported file type'],
    ['create_media_upload_url', '/media/upload-url', metadata, 503, 'Media storage is not configured'],
    ['complete_media_upload', '/media/assets', { ...metadata, url: publicUrl, key: upload.key }, 403, 'Workspace permission denied'],
    ['import_media_from_url', '/media/import-url', { url: 'http://127.0.0.1/image.png' }, 400, 'Private network URL rejected'],
  ]) {
    const restore = stubBackend({ [`POST ${path}`]: { __status: status, __body: { message } } });
    try {
      const result = await handleToolCall(name, args, 'key');
      assert.equal(result.isError, true);
        assert.equal(resultOf(result), `Error executing tool '${name}': ${message}`);
    } finally { restore(); }
  }
});

test('REST discovery and execution expose media tools with their required inputs', async (t) => {
  const app = createExpressApp({ oauth: null, validateKey: async () => {} });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const schema = await (await realFetch(`${base}/openapi.json`)).json();
  for (const name of ['create_media_upload_url', 'complete_media_upload', 'import_media_from_url']) {
    const operation = schema.paths[`/api/tools/${name}`].post;
    assert.equal(operation.operationId, name);
    assert.ok(operation.requestBody.content['application/json'].schema.required.length > 0);
  }
  t.after(stubBackend({ 'POST /media/upload-url': upload }));
  const response = await realFetch(`${base}/api/tools/create_media_upload_url`, {
    method: 'POST', headers: { Authorization: 'Bearer key', 'Content-Type': 'application/json', 'x-project-id': 'rest-workspace' },
    body: JSON.stringify(metadata),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).uploadUrl, upload.uploadUrl);
  assert.equal(requests[0].headers['x-project-id'], 'rest-workspace');
});
