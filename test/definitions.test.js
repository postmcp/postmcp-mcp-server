import test from 'node:test';
import assert from 'node:assert/strict';

import { toolDefinitions } from '../src/tools/definitions.js';
import { PLATFORMS, calculatePostCredits, containsLink } from '../src/platforms.js';

test('every tool is well formed enough for a client to call it', () => {
    assert.ok(toolDefinitions.length > 0);

    for (const tool of toolDefinitions) {
        assert.ok(tool.name, 'a tool has no name');
        assert.equal(typeof tool.description, 'string', `${tool.name} has no description`);
        assert.ok(tool.description.length > 20, `${tool.name}'s description is too thin to route on`);
        assert.equal(tool.inputSchema?.type, 'object', `${tool.name} has no object input schema`);

        for (const [field, schema] of Object.entries(tool.inputSchema.properties || {})) {
            assert.ok(schema?.type || schema?.enum || schema?.oneOf, `${tool.name}.${field} has no type`);
        }

        // A required field the schema does not define cannot ever be supplied.
        for (const field of tool.inputSchema.required || []) {
            assert.ok(
                tool.inputSchema.properties?.[field],
                `${tool.name} requires '${field}' but does not define it`
            );
        }
    }
});

test('tool names are unique', () => {
    const names = toolDefinitions.map((tool) => tool.name);
    assert.equal(new Set(names).size, names.length, 'two tools share a name');
});

test('every workspace-scoped tool can be pointed at a specific workspace', () => {
    // list_workspaces is the one tool that spans them all, so scoping it to one
    // would be meaningless.
    const unscoped = new Set(['list_workspaces']);

    for (const tool of toolDefinitions) {
        if (unscoped.has(tool.name)) continue;
        assert.ok(
            tool.inputSchema.properties?.workspaceId,
            `${tool.name} cannot be pointed at a specific workspace`
        );
    }
});

test('platform enums match the platforms actually supported', () => {
    for (const tool of toolDefinitions) {
        for (const [field, schema] of Object.entries(tool.inputSchema.properties || {})) {
            const enumValues = schema.enum || schema.items?.enum;
            if (!enumValues || !enumValues.includes('linkedin')) continue;
            assert.deepEqual(
                [...enumValues].sort(),
                [...PLATFORMS].sort(),
                `${tool.name}.${field} lists platforms the server does not support`
            );
        }
    }
});

test('the tools that return posts tell the caller the live link is there', () => {
    // The field existed in the serializer long before the backend populated it;
    // these descriptions are the only thing that makes an agent look for it.
    for (const name of ['list_posts', 'get_post', 'publish_post_now', 'create_post']) {
        const tool = toolDefinitions.find((t) => t.name === name);
        assert.ok(tool, `${name} is missing`);
        assert.match(tool.description, /url|URL/, `${name} does not mention the live link`);
    }
});

test('credits are priced per delivery, with X costing more', () => {
    assert.equal(calculatePostCredits('hi', [{ platform: 'linkedin' }]), 1);
    assert.equal(calculatePostCredits('hi', [{ platform: 'twitter' }]), 5);
    // Three LinkedIn pages are three deliveries, not one.
    assert.equal(
        calculatePostCredits('hi', [{ platform: 'linkedin' }, { platform: 'linkedin' }, { platform: 'linkedin' }]),
        3
    );
    assert.equal(calculatePostCredits('hi', []), 0);
    assert.equal(calculatePostCredits('hi', null), 0);
});

test('the link surcharge is charged once per post, not per delivery', () => {
    const targets = [{ platform: 'linkedin' }, { platform: 'linkedin' }];
    assert.equal(calculatePostCredits('see https://example.com', targets), 52);
    assert.equal(containsLink('see https://example.com'), true);
    assert.equal(containsLink('no link here'), false);
    assert.equal(containsLink(''), false);
    assert.equal(containsLink(undefined), false);
});
