import { makeBackendRequest } from "../client.js";
import { toolDefinitions } from "./definitions.js";
import {
  CHARACTER_LIMITS,
  MEDIA_REQUIRED,
  LINK_SURCHARGE_CREDITS,
  calculatePostCredits,
  containsLink,
} from "../platforms.js";

/**
 * How many calls one multicall batch may carry.
 *
 * Bounded because a batch is a single request that can write a post per entry:
 * an unbounded one is a way to spend a workspace's whole credit balance, or to
 * hold a connection open indefinitely, in one call.
 */
const MULTICALL_LIMIT = 20;

/** Wraps a value as a successful MCP tool result. */
const ok = (data) => ({
  content: [
    {
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    },
  ],
});

/** Wraps a message as a failed MCP tool result. */
const fail = (message) => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

/** Flattens the workspace's connectedAccounts map into one list of profiles. */
const flattenAccounts = (connectedAccounts = {}) => {
  const connected = [];
  for (const [platform, accounts] of Object.entries(connectedAccounts || {})) {
    if (!Array.isArray(accounts)) continue;
    accounts.forEach((acc) => {
      if (!acc?.connected) return;
      connected.push({
        platform,
        username: acc.username,
        name: acc.name,
        profileId: acc.profileId,
        isOrganization: acc.isOrganization || false,
        needsReconnect: !!acc.needsReconnect,
      });
    });
  }
  return connected;
};

/** The post shape returned to callers - the fields an agent can act on. */
const serializePost = (p) => ({
  id: p._id,
  content: p.content,
  platforms: p.platforms,
  // Per-profile delivery detail: which profile the post went to and how it fared.
  targets: (p.targets || []).map((t) => ({
    platform: t.platform,
    profileId: t.profileId,
    username: t.username,
    status: t.status,
    postId: t.postId,
    url: t.url,
    error: t.error,
  })),
  status: p.status,
  scheduleDate: p.scheduleDate,
  scheduleTime: p.scheduleTime,
  timezone: p.timezone,
  scheduledAt: p.scheduledAt,
  mediaUrl: p.mediaUrl,
  platformStatuses: p.platformStatuses,
  attempts: p.attempts,
  lastError: p.lastError,
  createdAt: p.createdAt,
});

/**
 * Resolves the profiles a post would reach, the same way the backend does:
 * named profiles are matched against the workspace's connections, and a bare
 * platform fans out to every connected profile on it.
 */
const resolveTargets = ({ targetAccounts = [], platforms = [], connected = [] }) => {
  const targets = [];
  const unknown = [];
  const seen = new Set();

  const add = (account) => {
    const key = `${account.platform}:${account.profileId}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(account);
  };

  (targetAccounts || []).forEach((ref) => {
    const platform = String(ref?.platform || "").toLowerCase();
    const id = ref?.profileId || ref?.userId;
    const match = connected.find(
      (acc) =>
        acc.platform === platform &&
        (!id || acc.profileId === String(id)) &&
        (!ref?.username || !acc.username || acc.username === ref.username)
    );
    if (match) add(match);
    else unknown.push(`${platform}:${id || ref?.username || "?"}`);
  });

  (platforms || []).forEach((name) => {
    const platform = String(name || "").toLowerCase();
    const matches = connected.filter((acc) => acc.platform === platform);
    if (matches.length) matches.forEach(add);
    else unknown.push(platform);
  });

  return { targets, unknown };
};

/**
 * Reads one tool result back into plain data.
 *
 * Tool results travel as text so they can be shown in a chat transcript. Inside
 * a batch they are data again - a caller reading `results[2].result.id` should
 * not have to parse a string out of a string.
 */
const readResult = (result) => {
  const text = result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
};

/** Tool names this server will actually dispatch. */
const KNOWN_TOOLS = new Set(toolDefinitions.map((tool) => tool.name));

/** What a batch may contain - itself excluded, since batches cannot nest. */
const BATCHABLE_TOOLS = [...KNOWN_TOOLS].filter((name) => name !== "multicall");

/**
 * Checks a whole batch before any of it runs.
 *
 * Half-executed batches are the failure that matters here: calls 1-4 have
 * already scheduled posts by the time call 5 turns out to be a typo, and there
 * is no rollback. Names are therefore validated up front, and the batch is
 * refused as a whole.
 *
 * @returns {string|null} The reason the batch cannot run, or null if it can.
 */
const validateBatch = (calls) => {
  if (!Array.isArray(calls) || calls.length === 0) {
    return "multicall needs a non-empty `calls` array, each entry naming a tool and its arguments.";
  }
  if (calls.length > MULTICALL_LIMIT) {
    return `multicall accepts at most ${MULTICALL_LIMIT} calls at a time; ${calls.length} were given. Split the work into smaller batches.`;
  }

  for (let i = 0; i < calls.length; i++) {
    const name = calls[i]?.tool || calls[i]?.name;
    const position = `Call ${i + 1}`;

    if (!name) {
      return `${position} has no \`tool\` name. Every entry needs the name of the tool to run.`;
    }
    if (name === "multicall") {
      return `${position} is itself a multicall. Batches cannot nest - list the calls directly instead.`;
    }
    if (!KNOWN_TOOLS.has(name)) {
      return `${position} names an unknown tool '${name}'. Nothing was run. Valid tools: ${BATCHABLE_TOOLS.join(", ")}.`;
    }
    if (calls[i].arguments !== undefined && (typeof calls[i].arguments !== "object" || Array.isArray(calls[i].arguments))) {
      return `${position} ('${name}') has \`arguments\` that are not an object.`;
    }
  }

  return null;
};

/**
 * Handles execution of an MCP tool call by name and arguments.
 *
 * @param {string} name - Name of the tool to execute
 * @param {object} args - Arguments passed to the tool
 * @param {Function|string} getApiKey - The API key, or a function returning it
 * @param {Function|string} [getProjectId] - Default workspace id, or a function returning it
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>}
 */
export const handleToolCall = async (name, args, getApiKey, getProjectId = null) => {
  const params = args || {};

  // An explicit workspaceId on the call wins over the session/env default, so a
  // single connection can drive several workspaces in one conversation.
  const sessionProjectId = typeof getProjectId === "function" ? getProjectId() : getProjectId;
  const projectId = params.workspaceId || sessionProjectId || null;

  const callBackend = (path, method = "GET", body = null) => {
    const apiKey = typeof getApiKey === "function" ? getApiKey() : getApiKey;
    return makeBackendRequest(path, method, body, apiKey, projectId);
  };

  try {
    switch (name) {
      case "get_user_info": {
        const data = await callBackend("/auth/user-data");
        const userInfo = {
          name: data.name,
          email: data.email,
          plan: data.plan,
          credits: data.credits,
          aiToken: data.aiToken,
          activeWorkspace: data.activeProject
            ? {
                id: data.activeProject._id,
                name: data.activeProject.name,
                role: data.workspaceRole,
                isOwner: data.isProjectOwner,
              }
            : null,
          workspaceCount: Array.isArray(data.projects) ? data.projects.length : undefined,
        };
        return ok(userInfo);
      }

      case "list_workspaces": {
        const data = await callBackend("/project/list");
        const projects = Array.isArray(data) ? data : data?.projects || [];
        const list = projects.map((p) => ({
          id: p._id || p.id,
          name: p.name,
          role: p.myRole || p.role,
          isOwner: (p.myRole || p.role) === "owner",
          connectedPlatforms: Object.entries(p.connectedAccounts || {})
            .filter(([, accounts]) => Array.isArray(accounts) && accounts.some((a) => a?.connected))
            .map(([platform]) => platform),
          memberCount: Array.isArray(p.members) ? p.members.length : undefined,
        }));
        return ok(list);
      }

      case "get_connected_accounts": {
        const data = await callBackend("/auth/user-data");
        return ok(flattenAccounts(data.connectedAccounts));
      }

      case "get_account_health": {
        const data = await callBackend("/auth/user-data");
        const health = Array.isArray(data.accountHealth) ? data.accountHealth : [];
        return ok({
          // An empty list is the healthy case, which is easy to misread as "no
          // data" - say so rather than returning a bare [].
          healthy: health.length === 0,
          message: health.length === 0
            ? "Every connected profile has a valid token."
            : `${health.length} connection(s) need attention before they are posted to.`,
          connections: health,
        });
      }

      case "list_brandings": {
        const user = await callBackend("/auth/user-data");
        const workspace = projectId || user.activeProject?._id;
        if (!workspace) {
          return fail("No workspace resolved for this user; cannot list brand kits.");
        }
        const data = await callBackend(`/project/${workspace}/brandings`);
        const brandings = Array.isArray(data) ? data : data?.brandings || [];
        return ok(
          brandings.map((b) => ({
            id: b._id || b.id,
            name: b.name,
            description: b.description,
            tone: b.tone,
            audience: b.audience,
            keywords: b.keywords,
            styleImage: b.styleImage,
            assets: (b.assets || []).map((a) => ({ url: a.url, name: a.name })),
          }))
        );
      }

      case "list_posts": {
        const query = new URLSearchParams();
        if (params.status && params.status !== "all") query.set("status", params.status);
        if (params.page) query.set("page", String(params.page));
        if (params.limit) query.set("limit", String(params.limit));
        if (params.all) query.set("all", "true");
        const suffix = query.toString() ? `?${query.toString()}` : "";

        // /post/list answers with { posts, pagination, counts }; older builds
        // answered with a bare array.
        const data = await callBackend(`/post/list${suffix}`);
        const posts = Array.isArray(data) ? data : data?.posts || [];
        return ok({
          posts: posts.map(serializePost),
          pagination: Array.isArray(data) ? undefined : data?.pagination,
          counts: Array.isArray(data) ? undefined : data?.counts,
        });
      }

      case "get_post": {
        // There is no single-post endpoint; the list is the source of truth, so
        // ask for all of them and pick the one requested.
        const data = await callBackend("/post/list?all=true");
        const posts = Array.isArray(data) ? data : data?.posts || [];
        const post = posts.find((p) => String(p._id) === String(params.id));
        if (!post) {
          return fail(
            `Post '${params.id}' was not found in this workspace. Check the id with list_posts, or pass the workspaceId it belongs to.`
          );
        }
        return ok(serializePost(post));
      }

      case "preflight_post": {
        const data = await callBackend("/auth/user-data");
        const connected = flattenAccounts(data.connectedAccounts);
        const { targets, unknown } = resolveTargets({
          targetAccounts: params.targetAccounts,
          platforms: params.platforms,
          connected,
        });

        const content = params.content || "";
        const length = content.length;
        const platformsHit = [...new Set(targets.map((t) => t.platform))];

        const tooLong = platformsHit
          .filter((platform) => CHARACTER_LIMITS[platform] && length > CHARACTER_LIMITS[platform])
          .map((platform) => ({
            platform,
            limit: CHARACTER_LIMITS[platform],
            over: length - CHARACTER_LIMITS[platform],
          }));

        const missingMedia = params.mediaUrl
          ? []
          : platformsHit.filter((platform) => MEDIA_REQUIRED.includes(platform));

        const stale = targets.filter((t) => t.needsReconnect).map((t) => `${t.platform}:${t.username || t.profileId}`);

        const credits = calculatePostCredits(content, targets);
        const balance = data.credits ?? 0;

        const blockers = [];
        if (!targets.length) {
          blockers.push(
            unknown.length
              ? `None of the requested profiles are connected: ${unknown.join(", ")}`
              : "No target profiles given. Pass targetAccounts or platforms."
          );
        }
        tooLong.forEach((t) =>
          blockers.push(`Copy is ${t.over} character(s) over ${t.platform}'s ${t.limit}-character limit.`)
        );
        missingMedia.forEach((platform) => blockers.push(`${platform} will not accept a post without media.`));
        if (credits > balance) {
          blockers.push(`Costs ${credits} credits but the workspace has ${balance}.`);
        }

        const warnings = [];
        if (unknown.length && targets.length) {
          warnings.push(`Ignored, not connected: ${unknown.join(", ")}`);
        }
        stale.forEach((t) => warnings.push(`${t} needs reconnecting and will likely fail at publish time.`));
        if (containsLink(content)) {
          warnings.push(`Copy contains a link, which adds a one-off ${LINK_SURCHARGE_CREDITS}-credit surcharge.`);
        }

        return ok({
          ok: blockers.length === 0,
          characterCount: length,
          resolvedTargets: targets.map((t) => ({
            platform: t.platform,
            profileId: t.profileId,
            username: t.username,
          })),
          unknownTargets: unknown,
          limits: Object.fromEntries(platformsHit.map((p) => [p, CHARACTER_LIMITS[p]])),
          credits: { cost: credits, balance, remainingAfter: balance - credits },
          blockers,
          warnings,
        });
      }

      case "create_post": {
        const payload = {
          content: params.content,
          // Per-destination copy, so one call can write natively for each
          // platform. The backend stores one post per profile either way.
          variants: params.variants,
          platforms: params.platforms,
          targetAccounts: params.targetAccounts,
          publishImmediately: params.publishImmediately ?? false,
          scheduleDate: params.scheduleDate || "",
          scheduleTime: params.scheduleTime || "",
          // The wall-clock slot above means nothing without the zone it was
          // picked in; the backend resolves the two into a firing instant.
          timezone: params.timezone || "",
          mediaUrl: params.mediaUrl || "",
          imageData: params.imageData || null,
        };
        const result = await callBackend("/post/create", "POST", payload);
        return ok(result);
      }

      case "publish_post_now": {
        const result = await callBackend(`/post/${params.id}/publish-now`, "POST");
        return ok(result);
      }

      case "delete_post": {
        const result = await callBackend(`/post/${params.id}`, "DELETE");
        return ok(result);
      }

      case "update_post": {
        const payload = {};
        if (params.content !== undefined) payload.content = params.content;
        if (params.targetAccounts !== undefined) payload.targetAccounts = params.targetAccounts;
        if (params.platforms !== undefined) payload.platforms = params.platforms;
        if (params.scheduleDate !== undefined) payload.scheduleDate = params.scheduleDate;
        if (params.scheduleTime !== undefined) payload.scheduleTime = params.scheduleTime;
        if (params.timezone !== undefined) payload.timezone = params.timezone;
        if (params.mediaUrl !== undefined) payload.mediaUrl = params.mediaUrl;
        if (params.status !== undefined) payload.status = params.status;

        const result = await callBackend(`/post/${params.id}`, "PUT", payload);
        return ok(result);
      }

      case "reschedule_post": {
        const payload = {
          scheduleDate: params.scheduleDate,
          scheduleTime: params.scheduleTime,
        };
        // Omitted rather than empty: the backend reads "no timezone" as "keep
        // the post's own zone", and an empty string is not that.
        if (params.timezone) payload.timezone = params.timezone;

        const result = await callBackend(`/post/${params.id}/reschedule`, "PATCH", payload);
        return ok(result);
      }

      case "reset_stuck_post": {
        const result = await callBackend(`/post/${params.id}/reset`, "POST", {
          force: params.force ?? false,
        });
        return ok(result);
      }

      case "generate_image": {
        const payload = { prompt: params.prompt };
        if (params.brandingId) payload.brandingId = params.brandingId;
        if (params.styleImageUrl) payload.styleImageUrl = params.styleImageUrl;

        const result = await callBackend("/agent/generate-image", "POST", payload);
        return ok({
          mediaUrl: result.mediaUrl || result.imageUrl,
          hint: "Pass this as mediaUrl to create_post or update_post to attach it.",
        });
      }

      case "multicall": {
        const calls = params.calls;
        const invalid = validateBatch(calls);
        if (invalid) return fail(invalid);

        // Sequential on purpose: a batch usually means "generate the image,
        // then post it", and later calls read state earlier ones wrote.
        const stopOnError = params.stopOnError ?? true;
        const results = [];
        const skipped = [];

        for (let i = 0; i < calls.length; i++) {
          const step = calls[i];
          const toolName = step.tool || step.name;
          const id = step.id || `call_${i + 1}`;

          // The batch's workspace applies to every call that did not name its
          // own, so a caller does not repeat workspaceId twenty times.
          const stepArgs = { ...(step.arguments || step.args || {}) };
          if (params.workspaceId && stepArgs.workspaceId === undefined) {
            stepArgs.workspaceId = params.workspaceId;
          }

          const stepResult = await handleToolCall(toolName, stepArgs, getApiKey, getProjectId);
          const payload = readResult(stepResult);

          if (stepResult?.isError) {
            results.push({ id, tool: toolName, ok: false, error: typeof payload === "string" ? payload : payload?.error || "Tool call failed" });
            if (stopOnError) {
              // Everything after the failure is reported as skipped rather
              // than silently missing, so the caller knows what to retry.
              for (let j = i + 1; j < calls.length; j++) {
                skipped.push({ id: calls[j].id || `call_${j + 1}`, tool: calls[j].tool || calls[j].name });
              }
              break;
            }
            continue;
          }

          results.push({ id, tool: toolName, ok: true, result: payload });
        }

        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.length - succeeded;

        const summary = {
          ok: failed === 0 && skipped.length === 0,
          requested: calls.length,
          executed: results.length,
          succeeded,
          failed,
          results,
          ...(skipped.length
            ? {
                skipped,
                note: `Stopped at the first failure; ${skipped.length} call(s) were not run. Pass stopOnError: false to attempt every call.`,
              }
            : {}),
        };

        // Nothing worked, so the batch as a whole failed - said plainly rather
        // than handed back as a success containing only errors.
        if (succeeded === 0) {
          return { isError: true, content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
        }
        return ok(summary);
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    return fail(`Error executing tool '${name}': ${error.message}`);
  }
};
