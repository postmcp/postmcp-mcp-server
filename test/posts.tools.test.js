import test from 'node:test';
import assert from 'node:assert/strict';

import { handleToolCall } from '../src/tools/handlers.js';
import { stubBackend, requests, resultOf, target } from './helpers/backend.js';

const KEY = 'test_key';

/** A stored post as the backend serializes it, links already resolved. */
const publishedPost = (overrides = {}) => ({
    _id: 'post_1',
    content: 'Launch day.',
    platforms: ['twitter', 'linkedin'],
    targets: [
        target('twitter', 'x1', 'success', {
            username: 'acmehq',
            postId: '1899999999999999999',
            url: 'https://x.com/acmehq/status/1899999999999999999',
        }),
        target('linkedin', 'li1', 'success', {
            username: 'acme-corp',
            postId: 'urn:li:share:7123456789',
            url: 'https://www.linkedin.com/feed/update/urn:li:share:7123456789/',
        }),
    ],
    status: 'published',
    scheduleDate: '2026-08-15',
    scheduleTime: '11:00',
    timezone: 'UTC',
    mediaUrl: '',
    platformStatuses: {},
    attempts: 1,
    lastError: '',
    createdAt: '2026-08-15T10:00:00.000Z',
    ...overrides,
});

test('list_posts carries the live link of every delivered profile', async (t) => {
    const restore = stubBackend({
        '/post/list': { posts: [publishedPost()], pagination: { page: 1 }, counts: { published: 1 } },
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('list_posts', { status: 'published' }, KEY));

    assert.equal(data.posts.length, 1);
    assert.deepEqual(
        data.posts[0].targets.map((target) => target.url),
        [
            'https://x.com/acmehq/status/1899999999999999999',
            'https://www.linkedin.com/feed/update/urn:li:share:7123456789/',
        ]
    );
    // Pagination and counts are what a caller pages with; dropping them would
    // leave it unable to ask for anything past the first page.
    assert.deepEqual(data.pagination, { page: 1 });
    assert.deepEqual(data.counts, { published: 1 });
    assert.equal(requests[0].query.status, 'published');
});

test('list_posts still answers when the backend sends a bare array', async (t) => {
    const restore = stubBackend({ '/post/list': [publishedPost()] });
    t.after(restore);

    const data = resultOf(await handleToolCall('list_posts', {}, KEY));

    assert.equal(data.posts.length, 1);
    assert.equal(data.posts[0].targets[0].url, 'https://x.com/acmehq/status/1899999999999999999');
    assert.equal(data.pagination, undefined);
});

test('get_post reports the link, and the error for a profile that failed', async (t) => {
    // There is no single-post endpoint; get_post reads the whole list and picks.
    const restore = stubBackend({
        '/post/list': {
            posts: [
                publishedPost({ _id: 'other_post' }),
                publishedPost({
                    targets: [
                        target('twitter', 'x1', 'success', {
                            username: 'acmehq',
                            url: 'https://x.com/acmehq/status/1899999999999999999',
                        }),
                        target('facebook', 'fb1', 'failed', { username: 'acme-eu', error: 'Token expired' }),
                    ],
                }),
            ],
        },
    });
    t.after(restore);

    const post = resultOf(await handleToolCall('get_post', { id: 'post_1' }, KEY));

    assert.equal(post.id, 'post_1');
    assert.equal(post.targets[0].url, 'https://x.com/acmehq/status/1899999999999999999');
    // A profile that never received the post has nothing to link to, and must
    // not borrow the delivered profile's link.
    assert.equal(post.targets[1].url, '');
    assert.equal(post.targets[1].error, 'Token expired');
    assert.equal(requests[0].query.all, 'true');
});

test('get_post names the id it could not find rather than returning nothing', async (t) => {
    const restore = stubBackend({ '/post/list': { posts: [publishedPost()] } });
    t.after(restore);

    const result = await handleToolCall('get_post', { id: 'nope' }, KEY);

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /'nope' was not found/);
});

test('publish_post_now returns the per-profile outcome, not the raw backend body', async (t) => {
    const restore = stubBackend({
        'POST /post/post_1/publish-now': {
            message: 'Post published successfully',
            post: publishedPost(),
            // Fields a caller has no use for; the serializer should drop them.
            user: { credits: 90, email: 'owner@example.com' },
        },
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('publish_post_now', { id: 'post_1' }, KEY));

    assert.equal(data.message, 'Post published successfully');
    assert.equal(data.post.id, 'post_1');
    assert.equal(data.post.targets[0].url, 'https://x.com/acmehq/status/1899999999999999999');
    assert.equal(data.user, undefined);
    assert.equal(requests[0].method, 'POST');
});

test('create_post with publishImmediately reports one post per profile, each with its link', async (t) => {
    const restore = stubBackend({
        'POST /post/create': {
            message: '2 posts published successfully, one per profile',
            published: true,
            posts: [
                publishedPost({ _id: 'post_a', platforms: ['twitter'], targets: [publishedPost().targets[0]] }),
                publishedPost({ _id: 'post_b', platforms: ['linkedin'], targets: [publishedPost().targets[1]] }),
            ],
            postIds: ['post_a', 'post_b'],
            unknownTargets: [],
        },
    });
    t.after(restore);

    const data = resultOf(
        await handleToolCall(
            'create_post',
            { content: 'Launch day.', platforms: ['twitter', 'linkedin'], publishImmediately: true },
            KEY
        )
    );

    assert.deepEqual(data.posts.map((post) => post.id), ['post_a', 'post_b']);
    assert.deepEqual(data.posts.map((post) => post.targets[0].url), [
        'https://x.com/acmehq/status/1899999999999999999',
        'https://www.linkedin.com/feed/update/urn:li:share:7123456789/',
    ]);
    // `post` stays populated for callers written against the single-post shape.
    assert.equal(data.post.id, 'post_a');
    // Non-post fields of the response survive alongside the serialized posts.
    assert.equal(data.published, true);
    assert.deepEqual(data.postIds, ['post_a', 'post_b']);
    assert.equal(requests[0].body.publishImmediately, true);
});

test('a scheduled post has no links to report', async (t) => {
    const restore = stubBackend({
        '/post/list': {
            posts: [
                publishedPost({
                    status: 'scheduled',
                    targets: [target('bluesky', 'bs1', 'pending', { username: 'acme.bsky.social' })],
                }),
            ],
        },
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('list_posts', {}, KEY));

    assert.equal(data.posts[0].targets[0].url, '');
    assert.equal(data.posts[0].status, 'scheduled');
});

test('a backend failure comes back as a tool error, not a silent empty result', async (t) => {
    const restore = stubBackend({
        'POST /post/post_1/publish-now': {
            __status: 500,
            __body: { message: 'Access token for twitter is missing or invalid.' },
        },
    });
    t.after(restore);

    const result = await handleToolCall('publish_post_now', { id: 'post_1' }, KEY);

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Access token for twitter is missing or invalid/);
});
