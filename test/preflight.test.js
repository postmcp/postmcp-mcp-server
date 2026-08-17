import test from 'node:test';
import assert from 'node:assert/strict';

import { handleToolCall } from '../src/tools/handlers.js';
import { stubBackend, resultOf, account, connectedAccounts } from './helpers/backend.js';

const KEY = 'test_key';

const userWith = (accounts, credits = 500) => ({
    name: 'Owner',
    credits,
    connectedAccounts: connectedAccounts(accounts),
});

const preflight = async (args, user) => {
    const restore = stubBackend({ '/auth/user-data': user });
    try {
        return resultOf(await handleToolCall('preflight_post', args, KEY));
    } finally {
        restore();
    }
};

test('copy inside every limit, on connected profiles, passes with no blockers', async () => {
    const data = await preflight(
        { content: 'Short and safe.', targetAccounts: [{ platform: 'twitter', profileId: 'x1' }] },
        userWith([account('twitter', 'x1')])
    );

    assert.equal(data.ok, true);
    assert.deepEqual(data.blockers, []);
    assert.equal(data.characterCount, 15);
    assert.deepEqual(data.resolvedTargets, [{ platform: 'twitter', profileId: 'x1', username: 'twitter_user' }]);
});

test('copy over a platform limit is a blocker naming the overage', async () => {
    const data = await preflight(
        { content: 'x'.repeat(300), platforms: ['twitter'] },
        userWith([account('twitter', 'x1')])
    );

    assert.equal(data.ok, false);
    assert.equal(data.blockers.length, 1);
    assert.match(data.blockers[0], /20 character\(s\) over twitter's 280-character limit/);
});

test('a platform that will not take a post without media is a blocker', async () => {
    const withoutMedia = await preflight(
        { content: 'Caption.', platforms: ['instagram'] },
        userWith([account('instagram', 'ig1')])
    );
    assert.equal(withoutMedia.ok, false);
    assert.match(withoutMedia.blockers[0], /instagram will not accept a post without media/);

    const withMedia = await preflight(
        { content: 'Caption.', platforms: ['instagram'], mediaUrl: 'https://cdn.example.com/a.jpg' },
        userWith([account('instagram', 'ig1')])
    );
    assert.equal(withMedia.ok, true);
});

test('a post costing more than the balance is blocked before it is charged', async () => {
    const data = await preflight(
        { content: 'Hello.', platforms: ['twitter'] },
        userWith([account('twitter', 'x1')], 3)
    );

    assert.equal(data.ok, false);
    // X deliveries cost 5; the workspace has 3.
    assert.equal(data.credits.cost, 5);
    assert.equal(data.credits.balance, 3);
    assert.match(data.blockers[0], /Costs 5 credits but the workspace has 3/);
});

test('a link in the copy is a warning about the surcharge, not a blocker', async () => {
    const data = await preflight(
        { content: 'Read it: https://example.com/post', platforms: ['linkedin'] },
        userWith([account('linkedin', 'li1')])
    );

    assert.equal(data.ok, true);
    assert.equal(data.credits.cost, 51);
    assert.match(data.warnings[0], /50-credit surcharge/);
});

test('naming a profile that is not connected blocks when nothing else resolves', async () => {
    const data = await preflight(
        { content: 'Hello.', targetAccounts: [{ platform: 'twitter', profileId: 'ghost' }] },
        userWith([account('linkedin', 'li1')])
    );

    assert.equal(data.ok, false);
    assert.deepEqual(data.unknownTargets, ['twitter:ghost']);
    assert.match(data.blockers[0], /None of the requested profiles are connected/);
});

test('an unconnected profile alongside a good one is a warning, not a blocker', async () => {
    const data = await preflight(
        {
            content: 'Hello.',
            targetAccounts: [
                { platform: 'linkedin', profileId: 'li1' },
                { platform: 'twitter', profileId: 'ghost' },
            ],
        },
        userWith([account('linkedin', 'li1')])
    );

    assert.equal(data.ok, true);
    assert.match(data.warnings[0], /Ignored, not connected: twitter:ghost/);
});

test('a profile whose token needs reconnecting is warned about before scheduling', async () => {
    const data = await preflight(
        { content: 'Hello.', platforms: ['linkedin'] },
        userWith([account('linkedin', 'li1', { username: 'acme-corp', needsReconnect: true })])
    );

    assert.equal(data.ok, true);
    assert.match(data.warnings[0], /linkedin:acme-corp needs reconnecting/);
});

test('a bare platform fans out to every connected profile on it, and is priced that way', async () => {
    const data = await preflight(
        { content: 'Hello.', platforms: ['linkedin'] },
        userWith([account('linkedin', 'li1'), account('linkedin', 'li2')])
    );

    assert.equal(data.resolvedTargets.length, 2);
    assert.equal(data.credits.cost, 2);
});

test('the same profile named twice is one delivery, not two', async () => {
    const data = await preflight(
        {
            content: 'Hello.',
            targetAccounts: [{ platform: 'linkedin', profileId: 'li1' }],
            platforms: ['linkedin'],
        },
        userWith([account('linkedin', 'li1')])
    );

    assert.equal(data.resolvedTargets.length, 1);
    assert.equal(data.credits.cost, 1);
});

test('no target at all is a blocker rather than a silent no-op', async () => {
    const data = await preflight({ content: 'Hello.' }, userWith([account('linkedin', 'li1')]));

    assert.equal(data.ok, false);
    assert.match(data.blockers[0], /No target profiles given/);
});

test('a disconnected account is not a valid target', async () => {
    const data = await preflight(
        { content: 'Hello.', platforms: ['linkedin'] },
        userWith([account('linkedin', 'li1', { connected: false })])
    );

    assert.equal(data.ok, false);
    assert.deepEqual(data.resolvedTargets, []);
});
