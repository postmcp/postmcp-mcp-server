/**
 * A stand-in for the PostMCP backend.
 *
 * The handlers reach the backend through `makeBackendRequest`, which is a thin
 * wrapper over global `fetch`. Stubbing fetch rather than the wrapper keeps the
 * real request-building in the test: the path, the method, the JSON body and
 * the workspace header are all things a handler can get wrong, and they are
 * only observable at this level.
 */

/** Every request the stub saw, in order. Reset with each `stubBackend` call. */
export const requests = [];

const jsonResponse = (status, payload) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
});

/**
 * Installs a fake backend for the duration of a test.
 *
 * @param {object} routes Keyed by `"<METHOD> <path>"` (query string excluded),
 *   or by path alone to match any method. A value may be the payload itself, or
 *   a function of the parsed request returning one. Wrap a payload in
 *   `{ __status, __body }` to answer with a failure status.
 * @returns {() => void} Restores the real fetch.
 */
export const stubBackend = (routes = {}) => {
    const original = globalThis.fetch;
    requests.length = 0;

    globalThis.fetch = async (url, options = {}) => {
        const parsed = new URL(url);
        const method = (options.method || 'GET').toUpperCase();
        const body = options.body ? JSON.parse(options.body) : null;

        const record = {
            method,
            path: parsed.pathname,
            query: Object.fromEntries(parsed.searchParams),
            body,
            headers: options.headers || {},
        };
        requests.push(record);

        const route = routes[`${method} ${parsed.pathname}`] ?? routes[parsed.pathname];
        if (route === undefined) {
            return jsonResponse(404, { message: `No stub for ${method} ${parsed.pathname}` });
        }

        const payload = typeof route === 'function' ? route(record) : route;
        if (payload && typeof payload === 'object' && '__status' in payload) {
            return jsonResponse(payload.__status, payload.__body ?? {});
        }
        return jsonResponse(200, payload);
    };

    return () => {
        globalThis.fetch = original;
    };
};

/** The JSON a tool result carries, which travels as text. */
export const resultOf = (result) => {
    const text = result?.content?.[0]?.text ?? '';
    try {
        return JSON.parse(text);
    } catch (_) {
        return text;
    }
};

/** A connected profile, in the shape `/auth/user-data` returns. */
export const account = (platform, profileId, extra = {}) => ({
    platform,
    profileId,
    username: extra.username ?? `${platform}_user`,
    name: extra.name ?? profileId,
    connected: extra.connected ?? true,
    ...extra,
});

/** Groups accounts into the `connectedAccounts` map the backend sends. */
export const connectedAccounts = (accounts = []) =>
    accounts.reduce((map, acc) => {
        (map[acc.platform] = map[acc.platform] || []).push(acc);
        return map;
    }, {});

/** One delivery row on a stored post. */
export const target = (platform, profileId, status = 'success', extra = {}) => ({
    platform,
    profileId,
    username: extra.username ?? `${platform}_user`,
    status,
    postId: extra.postId ?? '',
    url: extra.url ?? '',
    error: extra.error ?? '',
});
