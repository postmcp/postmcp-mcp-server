import test from 'node:test';
import assert from 'node:assert/strict';

import { handleToolCall } from '../src/tools/handlers.js';
import { stubBackend, requests, resultOf } from './helpers/backend.js';

const KEY = 'test_key';

const USER = { name: 'Owner', email: 'owner@example.com', credits: 500, connectedAccounts: {} };

test('a batch runs in order and hands back each result as data', async (t) => {
    const restore = stubBackend({
        '/auth/user-data': USER,
        '/post/list': { posts: [] },
    });
    t.after(restore);

    const data = resultOf(
        await handleToolCall(
            'multicall',
            {
                calls: [
                    { id: 'me', tool: 'get_user_info' },
                    { id: 'queue', tool: 'list_posts', arguments: { status: 'failed' } },
                ],
            },
            KEY
        )
    );

    assert.equal(data.ok, true);
    assert.equal(data.succeeded, 2);
    assert.deepEqual(data.results.map((r) => r.id), ['me', 'queue']);
    // Results are parsed back into objects; a caller reading results[0].result
    // .credits should not have to parse a string out of a string.
    assert.equal(data.results[0].result.credits, 500);
    assert.deepEqual(data.results[1].result.posts, []);
    assert.deepEqual(requests.map((r) => r.path), ['/auth/user-data', '/post/list']);
});

test('an unknown tool name stops the batch before anything runs', async (t) => {
    const restore = stubBackend({ '/auth/user-data': USER });
    t.after(restore);

    const result = await handleToolCall(
        'multicall',
        { calls: [{ tool: 'get_user_info' }, { tool: 'publish_everything' }] },
        KEY
    );

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unknown tool 'publish_everything'/);
    // The point of validating up front: the first call must not have run, or a
    // typo in call 2 would leave a half-executed batch with no rollback.
    assert.equal(requests.length, 0);
});

test('a batch cannot nest inside itself', async (t) => {
    const restore = stubBackend({});
    t.after(restore);

    const result = await handleToolCall('multicall', { calls: [{ tool: 'multicall', arguments: { calls: [] } }] }, KEY);

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /cannot nest/);
    assert.equal(requests.length, 0);
});

test('an empty or oversized batch is refused with the reason', async (t) => {
    const restore = stubBackend({});
    t.after(restore);

    const empty = await handleToolCall('multicall', { calls: [] }, KEY);
    assert.equal(empty.isError, true);
    assert.match(empty.content[0].text, /non-empty/);

    const tooMany = await handleToolCall(
        'multicall',
        { calls: Array.from({ length: 21 }, () => ({ tool: 'get_user_info' })) },
        KEY
    );
    assert.equal(tooMany.isError, true);
    assert.match(tooMany.content[0].text, /at most 20 calls/);
    assert.equal(requests.length, 0);
});

test('by default a failing call stops the batch and the rest are named as skipped', async (t) => {
    const restore = stubBackend({
        '/auth/user-data': USER,
        '/post/list': { __status: 500, __body: { message: 'Backend exploded' } },
    });
    t.after(restore);

    const data = resultOf(
        await handleToolCall(
            'multicall',
            {
                calls: [
                    { id: 'one', tool: 'get_user_info' },
                    { id: 'two', tool: 'list_posts' },
                    { id: 'three', tool: 'get_user_info' },
                ],
            },
            KEY
        )
    );

    assert.equal(data.ok, false);
    assert.equal(data.succeeded, 1);
    assert.equal(data.failed, 1);
    // Reported rather than silently missing, so the caller knows what to retry.
    assert.deepEqual(data.skipped.map((s) => s.id), ['three']);
    assert.match(data.results[1].error, /Backend exploded/);
});

test('stopOnError false attempts every call', async (t) => {
    const restore = stubBackend({
        '/auth/user-data': USER,
        '/post/list': { __status: 500, __body: { message: 'Backend exploded' } },
    });
    t.after(restore);

    const data = resultOf(
        await handleToolCall(
            'multicall',
            {
                stopOnError: false,
                calls: [{ tool: 'list_posts' }, { tool: 'get_user_info' }],
            },
            KEY
        )
    );

    assert.equal(data.executed, 2);
    assert.equal(data.succeeded, 1);
    assert.equal(data.skipped, undefined);
});

test('a batch where nothing worked is an error, not a success full of failures', async (t) => {
    const restore = stubBackend({
        '/post/list': { __status: 500, __body: { message: 'Backend exploded' } },
    });
    t.after(restore);

    const result = await handleToolCall(
        'multicall',
        { stopOnError: false, calls: [{ tool: 'list_posts' }, { tool: 'list_posts' }] },
        KEY
    );

    assert.equal(result.isError, true);
    assert.equal(resultOf(result).succeeded, 0);
});

test("the batch's workspace applies to calls that did not name their own", async (t) => {
    const restore = stubBackend({ '/post/list': { posts: [] } });
    t.after(restore);

    await handleToolCall(
        'multicall',
        {
            workspaceId: 'ws_batch',
            calls: [{ tool: 'list_posts' }, { tool: 'list_posts', arguments: { workspaceId: 'ws_own' } }],
        },
        KEY
    );

    assert.equal(requests[0].headers['x-project-id'], 'ws_batch');
    // A call that named its own workspace keeps it.
    assert.equal(requests[1].headers['x-project-id'], 'ws_own');
});
