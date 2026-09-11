import test from 'node:test';
import assert from 'node:assert/strict';

import { handleToolCall } from '../src/tools/handlers.js';
import { stubBackend, requests, resultOf, target } from './helpers/backend.js';

const KEY = 'test_key';

/** What the backend's analytics endpoints answer with for one post. */
const analyticsPayload = (extra = {}) => ({
    id: 'post_1',
    content: 'Launch day.',
    status: 'published',
    publishedAt: '2026-09-10T10:00:00.000Z',
    fetchedAt: '2026-09-11T09:00:00.000Z',
    totals: { views: 1200, likes: 40, comments: 6, shares: 9, saves: null, clicks: 12, engagements: 55 },
    measured: 2,
    measurable: 3,
    targets: [
        {
            platform: 'twitter',
            profileId: 'x1',
            username: 'acmehq',
            status: 'success',
            url: 'https://x.com/acmehq/status/1',
            measurable: true,
            analytics: {
                fetchedAt: '2026-09-11T09:00:00.000Z',
                summary: { views: 1000, likes: 30, comments: 5, shares: 8, saves: null, clicks: 12, engagements: 43 },
                metrics: { impression_count: 1000, like_count: 30, reply_count: 5, retweet_count: 6, quote_count: 2, url_link_clicks: 12 },
                source: 'x api v2 tweets public_metrics',
                error: '',
                unavailable: false,
            },
        },
        {
            platform: 'linkedin',
            profileId: 'li1',
            username: 'acme-corp',
            status: 'success',
            url: 'https://www.linkedin.com/feed/update/urn:li:share:7/',
            measurable: true,
            analytics: {
                fetchedAt: '2026-09-11T09:00:00.000Z',
                summary: { views: 200, likes: 10, comments: 1, shares: 1, saves: null, clicks: null, engagements: 12 },
                metrics: { impressionCount: 200, likeCount: 10, commentCount: 1, shareCount: 1 },
                source: 'linkedin rest organizationalEntityShareStatistics',
                error: '',
                unavailable: false,
            },
        },
        {
            platform: 'instagram',
            profileId: 'ig1',
            username: 'acme',
            status: 'success',
            url: 'https://www.instagram.com/p/abc/',
            measurable: true,
            analytics: null,
        },
        // A failed delivery is reported by the backend but is not something an
        // agent can read numbers from.
        { platform: 'threads', profileId: 'th1', username: 'acme', status: 'failed', url: '', measurable: false, analytics: null },
    ],
    notes: [{ platform: 'instagram', profile: 'acme', note: 'Not read yet. Refresh the post to read it.' }],
    pricing: { perRefresh: 1, stored: 0 },
    ...extra,
});

test('get_post_analytics reads the stored reading by default, free', async (t) => {
    const restore = stubBackend({ 'GET /post/post_1/analytics': analyticsPayload() });
    t.after(restore);

    const data = resultOf(await handleToolCall('get_post_analytics', { id: 'post_1' }, KEY));

    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'GET');
    assert.equal(data.totals.views, 1200);
    assert.equal(data.totals.engagements, 55);
    // Only measurable rows are returned; the failed Threads delivery is not.
    assert.deepEqual(data.targets.map((row) => row.platform), ['twitter', 'linkedin', 'instagram']);
    assert.equal(data.targets[0].analytics.metrics.url_link_clicks, 12);
    assert.equal(data.targets[2].analytics, null);
    assert.equal(data.notes[0].platform, 'instagram');
    assert.equal(data.credits, undefined, 'the stored reading costs nothing');
    assert.deepEqual(data.pricing, { perRefresh: 1, stored: 0 });
});

test('get_post_analytics with refresh posts to the refresh route and reports the fee', async (t) => {
    const restore = stubBackend({
        'POST /post/post_1/analytics/refresh': analyticsPayload({
            message: 'Read 2 profile(s); 1 could not be read.',
            refresh: { read: 2, skipped: 0, failed: 1, errors: [{ platform: 'instagram', error: 'Reconnect this instagram account to grant analytics access.' }] },
            credits: { charged: 1, remaining: 41 },
        }),
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('get_post_analytics', { id: 'post_1', refresh: true }, KEY));

    assert.equal(requests[0].method, 'POST');
    assert.equal(data.refresh.read, 2);
    assert.match(data.refresh.errors[0].error, /Reconnect/);
    assert.equal(data.message, 'Read 2 profile(s); 1 could not be read.');
    // The fee is reported so the agent can tell the user what the call cost.
    assert.deepEqual(data.credits, { charged: 1, remaining: 41 });
});

test('a refresh on an empty balance is a failure, not numbers', async (t) => {
    const restore = stubBackend({
        'POST /post/post_1/analytics/refresh': {
            __status: 402,
            __body: { message: "Insufficient credits. Reading a post's analytics costs 1 credit(s); the workspace has 0.", code: 'INSUFFICIENT_CREDITS' },
        },
    });
    t.after(restore);

    const result = await handleToolCall('get_post_analytics', { id: 'post_1', refresh: true }, KEY);
    assert.equal(result.isError, true);
    assert.match(resultOf(result), /Insufficient credits/);
});

test('get_post_analytics on a post that has not gone out is a clear failure', async (t) => {
    const restore = stubBackend({
        'GET /post/post_2/analytics': {
            __status: 409,
            __body: { message: 'This post is scheduled; analytics exist only once it has been published.', code: 'POST_NOT_PUBLISHED' },
        },
    });
    t.after(restore);

    const result = await handleToolCall('get_post_analytics', { id: 'post_2' }, KEY);
    assert.equal(result.isError, true);
    assert.match(resultOf(result), /only once it has been published/);
});

test('list_posts carries each delivery\'s compact analytics snapshot', async (t) => {
    const restore = stubBackend({
        '/post/list': {
            posts: [
                {
                    _id: 'post_1',
                    content: 'Launch day.',
                    platforms: ['twitter', 'bluesky'],
                    status: 'published',
                    targets: [
                        {
                            ...target('twitter', 'x1', 'success', { postId: '1', url: 'https://x.com/acmehq/status/1' }),
                            analytics: {
                                fetchedAt: '2026-09-11T09:00:00.000Z',
                                summary: { views: 1000, likes: 30, comments: 5, shares: 8, saves: 2, clicks: 12, engagements: 43 },
                                metrics: { impression_count: 1000 },
                                source: 'x',
                                error: '',
                                unavailable: false,
                            },
                        },
                        {
                            ...target('bluesky', 'b1', 'success', { postId: 'at://did/app.bsky.feed.post/1' }),
                            analytics: {
                                fetchedAt: null,
                                summary: {},
                                error: 'Bluesky no longer has this post; it may have been deleted.',
                                unavailable: true,
                            },
                        },
                    ],
                },
            ],
            pagination: { page: 1 },
            counts: {},
        },
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('list_posts', {}, KEY));
    const [x, bsky] = data.posts[0].targets;

    // The numbers are flattened onto the row; the raw metrics stay behind.
    assert.equal(x.analytics.views, 1000);
    assert.equal(x.analytics.engagements, 43);
    assert.equal(x.analytics.metrics, undefined);
    assert.equal(x.analytics.error, undefined, 'a clean read carries no error key');
    assert.equal(bsky.analytics.unavailable, true);
    assert.match(bsky.analytics.error, /deleted/);
});

test('the analytics tool can be batched', async (t) => {
    const restore = stubBackend({
        'GET /post/post_1/analytics': analyticsPayload(),
        'GET /post/post_2/analytics': analyticsPayload({ id: 'post_2' }),
    });
    t.after(restore);

    const data = resultOf(
        await handleToolCall(
            'multicall',
            {
                calls: [
                    { id: 'one', tool: 'get_post_analytics', arguments: { id: 'post_1' } },
                    { id: 'two', tool: 'get_post_analytics', arguments: { id: 'post_2' } },
                ],
            },
            KEY
        )
    );

    assert.equal(data.ok, true);
    assert.equal(data.results[0].result.totals.views, 1200);
    assert.equal(data.results[1].result.id, 'post_2');
});

const profilePayload = (extra = {}) => ({
    platform: 'linkedin',
    profileId: '135156231',
    username: 'postmcp-ai',
    name: 'PostMCP Ai',
    isOrganization: true,
    analytics: {
        fetchedAt: '2026-09-11T09:00:00.000Z',
        summary: { followers: 4, following: null, posts: null, views: 68 },
        metrics: { firstDegreeSize: 4, allPageViews: 68, allDesktopPageViews: 39, allMobilePageViews: 29 },
        window: 'lifetime',
        source: 'linkedin rest networkSizes + organizationPageStatistics',
        error: '',
        unavailable: false,
    },
    note: '',
    pricing: { perRefresh: 1, stored: 0 },
    ...extra,
});

test('get_profile_analytics reads the stored profile statistics for free', async (t) => {
    const restore = stubBackend({ 'GET /connect/linkedin/135156231/analytics': profilePayload() });
    t.after(restore);

    const data = resultOf(await handleToolCall('get_profile_analytics', { platform: 'LinkedIn', profileId: '135156231' }, KEY));

    assert.equal(requests[0].method, 'GET');
    assert.equal(data.analytics.summary.followers, 4);
    assert.equal(data.analytics.metrics.allPageViews, 68);
    assert.equal(data.credits, undefined);
});

test('get_profile_analytics with refresh reads the network and reports the fee', async (t) => {
    const restore = stubBackend({
        'POST /connect/twitter/1734968758094217216/analytics/refresh': profilePayload({
            platform: 'twitter',
            profileId: '1734968758094217216',
            username: '@helloshiva0801',
            isOrganization: false,
            message: 'Read twitter statistics for @helloshiva0801.',
            credits: { charged: 1, remaining: 14063 },
        }),
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('get_profile_analytics', { platform: 'twitter', profileId: '1734968758094217216', refresh: true }, KEY));

    assert.equal(requests[0].method, 'POST');
    assert.deepEqual(data.credits, { charged: 1, remaining: 14063 });
    assert.match(data.message, /Read twitter statistics/);
});

test('get_connected_accounts carries each profile\'s stored statistics', async (t) => {
    const restore = stubBackend({
        '/auth/user-data': {
            connectedAccounts: {
                twitter: [
                    { platform: 'twitter', profileId: 'x1', username: '@acme', connected: true, analytics: { fetchedAt: '2026-09-11T09:00:00.000Z', summary: { followers: 3, following: 2, posts: 4, views: null } } },
                ],
                bluesky: [{ platform: 'bluesky', profileId: 'b1', username: 'acme.bsky.social', connected: true }],
            },
        },
    });
    t.after(restore);

    const data = resultOf(await handleToolCall('get_connected_accounts', {}, KEY));
    assert.equal(data[0].analytics.followers, 3);
    assert.equal(data[1].analytics, undefined, 'never read: no analytics key');
});
