/**
 * Definitions and JSON Schemas for all MCP tools exposed by the PostMCP AI Server.
 */
import { PLATFORMS } from "../platforms.js";

/**
 * Workspace selector, accepted by every tool that reads or writes workspace data.
 *
 * An API key authenticates a person; the posts, connected profiles and brand
 * kits all live in a workspace. Callers who belong to more than one must say
 * which, or the backend picks the first workspace they own.
 */
const workspaceId = {
  type: "string",
  description:
    "Workspace (project) id to act on, from list_workspaces. Omit to use the caller's default workspace. Always pass this when the user belongs to more than one workspace.",
};

const targetAccountItem = (extra = "") => ({
  type: "object",
  properties: {
    platform: { type: "string", enum: PLATFORMS },
    profileId: { type: "string" },
    userId: { type: "string" },
    username: { type: "string" },
    content: {
      type: "string",
      description:
        "Copy for this profile only, overriding the shared content. Use it to write natively for each platform - a 280-character post for X, a longer one for LinkedIn.",
    },
    mediaUrl: {
      type: "string",
      description: "Media for this profile only, overriding the shared mediaUrl.",
    },
  },
  required: ["platform"],
  description: extra || undefined,
});

export const toolDefinitions = [
  {
    name: "get_user_info",
    description:
      "Retrieve details of the logged-in user including subscription plan, credit balance, AI token count, the active workspace, and the caller's role in it.",
    inputSchema: {
      type: "object",
      properties: { workspaceId },
    },
  },
  {
    name: "list_workspaces",
    description:
      "List every workspace (project) the user belongs to, with the id to pass as workspaceId, the caller's role, and which one is the default. Call this first whenever the user mentions a client, brand, or workspace by name.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_connected_accounts",
    description:
      "List every connected social profile in the workspace with the profileId needed to target it. Call this before creating a post so the post reaches the intended profile rather than every account on a platform.",
    inputSchema: {
      type: "object",
      properties: { workspaceId },
    },
  },
  {
    name: "get_account_health",
    description:
      "Report connections whose access token has expired or is about to, and which therefore need the user to reconnect. Check this before scheduling anything far out - a post scheduled onto a dead connection fails silently at publish time.",
    inputSchema: {
      type: "object",
      properties: { workspaceId },
    },
  },
  {
    name: "list_brandings",
    description:
      "List the workspace's brand kits: tone of voice, audience, keywords, and reference style images. Use one to keep drafted copy on-brand, and pass its id to generate_image for on-brand visuals.",
    inputSchema: {
      type: "object",
      properties: { workspaceId },
    },
  },
  {
    name: "list_posts",
    description:
      "Retrieve scheduled, published, draft, and failed posts, newest first, with per-profile delivery status. Every profile that received a post carries `url`, the link to the live copy - give the user that link when they ask where a post went. Returns pagination plus counts per status.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "scheduled", "published", "draft", "failed", "processing"],
          description: "Only return posts in this state. Defaults to all.",
        },
        page: {
          type: "number",
          description: "1-based page number. Defaults to 1.",
        },
        limit: {
          type: "number",
          description: "Posts per page. Defaults to 9 on the backend.",
        },
        all: {
          type: "boolean",
          description: "Return every matching post in one response, ignoring pagination.",
        },
        workspaceId,
      },
    },
  },
  {
    name: "get_post",
    description:
      "Fetch a single post by id, including per-profile delivery status, the live URL of each published copy, and the error for any profile that failed.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the post.",
        },
        workspaceId,
      },
      required: ["id"],
    },
  },
  {
    name: "preflight_post",
    description:
      "Dry-run a post before creating it: checks copy against each platform's character limit, flags profiles that are not connected or need reconnecting, warns when a platform requires media, reports each target's video limit when a video is attached, and reports the credit cost against the workspace balance. Costs nothing and publishes nothing. Run this before create_post whenever the copy is long, carries a link, or targets several platforms.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The post copy to check.",
        },
        targetAccounts: {
          type: "array",
          description: "Profiles the post would go to, same shape as create_post.",
          items: targetAccountItem(),
        },
        platforms: {
          type: "array",
          description: "Whole platforms the post would go to, same shape as create_post.",
          items: { type: "string", enum: PLATFORMS },
        },
        mediaUrl: {
          type: "string",
          description: "Media that would be attached, if any. A video URL makes the check report per-platform video limits.",
        },
        workspaceId,
      },
      required: ["content"],
    },
  },
  {
    name: "create_post",
    description:
      "Schedule or immediately publish a post to specific connected social profiles. Prefer targetAccounts so the post lands only on the profiles you name. Every targeted profile becomes its own post with its own id, so each can be edited, retried or cancelled on its own - the response lists them all. With publishImmediately, each delivered profile comes back with a `url` to the live copy; pass those on to the user.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The text body / commentary of the post. Used for any profile that does not carry its own content. On YouTube the first line becomes the Short's title (cut at 100 characters) and the whole body becomes the description, so lead with a hook.",
        },
        variants: {
          type: "object",
          description:
            "Per-platform copy, keyed by platform name (or \"platform:profileId\" for one profile), e.g. { \"twitter\": \"short punchy version\", \"linkedin\": \"longer version\" }. Overrides content for those destinations.",
          additionalProperties: { type: "string" },
        },
        targetAccounts: {
          type: "array",
          description:
            "The profiles to post to, each with platform and the profileId from get_connected_accounts. Only these profiles receive the post.",
          items: targetAccountItem(),
        },
        platforms: {
          type: "array",
          description:
            "Whole platforms to post to. Every connected profile on each platform listed here receives the post - use targetAccounts instead unless that fan-out is what you want.",
          items: {
            type: "string",
            enum: PLATFORMS,
          },
        },
        publishImmediately: {
          type: "boolean",
          description: "If true, publishes immediately. Otherwise schedules for later.",
        },
        scheduleDate: {
          type: "string",
          description: "Schedule date in YYYY-MM-DD format (required if publishImmediately is false).",
        },
        scheduleTime: {
          type: "string",
          description: "Schedule time in 24-hour HH:MM format (required if publishImmediately is false).",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone the schedule above is expressed in, e.g. \"Asia/Kolkata\". Defaults to UTC on the server, so pass the user's own zone whenever a wall-clock time matters.",
        },
        mediaUrl: {
          type: "string",
          description:
            "Optional public URL of an image/video to attach. Use the mediaUrl returned by generate_image to attach a generated image. Video is uploaded natively to every platform, but each has its own ceiling - Bluesky's 60 seconds is usually the binding one - so run preflight_post before sending one clip to several networks. Required, and must be a video file, when the post targets YouTube.",
        },
        workspaceId,
      },
      required: ["content"],
    },
  },
  {
    name: "publish_post_now",
    description:
      "Broadcast an existing scheduled post immediately to its platforms. Also the way to retry a failed post: profiles that already received it are skipped, so only the stragglers go out. The returned post carries a `url` per delivered profile - report those links rather than only saying it published.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the post to publish.",
        },
        workspaceId,
      },
      required: ["id"],
    },
  },
  {
    name: "delete_post",
    description: "Cancel and delete a scheduled or failed post from the database.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the post to delete.",
        },
        workspaceId,
      },
      required: ["id"],
    },
  },
  {
    name: "update_post",
    description:
      "Update the fields (content, target profiles, schedule date/time) of an existing post. To move a post to a different slot without touching anything else, use reschedule_post.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the post to update.",
        },
        content: {
          type: "string",
          description: "Updated text body of the post.",
        },
        targetAccounts: {
          type: "array",
          description:
            "Replacement profile list, each with platform and profileId. Supplying this re-points the post at exactly these profiles.",
          items: targetAccountItem(),
        },
        platforms: {
          type: "array",
          description: "Replacement platform list; each platform expands to all of its connected profiles.",
          items: {
            type: "string",
            enum: PLATFORMS,
          },
        },
        scheduleDate: {
          type: "string",
          description: "Updated schedule date in YYYY-MM-DD format.",
        },
        scheduleTime: {
          type: "string",
          description: "Updated schedule time in HH:MM format.",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone the schedule above is expressed in, e.g. \"Asia/Kolkata\". Defaults to UTC on the server, so pass the user's own zone whenever a wall-clock time matters.",
        },
        mediaUrl: {
          type: "string",
          description: "Replacement media URL to attach.",
        },
        status: {
          type: "string",
          enum: ["scheduled", "draft", "failed"],
          description: "Reset status of the post.",
        },
        workspaceId,
      },
      required: ["id"],
    },
  },
  {
    name: "reschedule_post",
    description:
      "Move a post to a different date and time, keeping its copy and target profiles. A failed or draft post is re-armed by this and will go out at the new slot; profiles that already received it are not sent to again. Published posts and posts currently publishing cannot be moved.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the post to move.",
        },
        scheduleDate: {
          type: "string",
          description: "New date in YYYY-MM-DD format.",
        },
        scheduleTime: {
          type: "string",
          description: "New time in 24-hour HH:MM format.",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone the new slot is expressed in, e.g. \"Asia/Kolkata\". Omit to keep the zone the post was scheduled in.",
        },
        workspaceId,
      },
      required: ["id", "scheduleDate", "scheduleTime"],
    },
  },
  {
    name: "reset_stuck_post",
    description:
      "Release a post left stuck mid-publish so it can be retried. Profiles that already went out keep their delivered state, so retrying afterwards will not double-post. Only use this on a post whose status is 'processing'; if it started publishing recently the call is refused unless force is true.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the stuck post.",
        },
        force: {
          type: "boolean",
          description:
            "Reset even if the post may still be publishing. Only set this after the user confirms - a run that is genuinely in flight can then deliver twice.",
        },
        workspaceId,
      },
      required: ["id"],
    },
  },
  {
    name: "generate_image",
    description:
      "Generate an image for a post from a text prompt and return its hosted URL, ready to pass to create_post as mediaUrl. Pass a brandingId from list_brandings to match the workspace's visual style. Spends AI tokens.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "What the image should show. Be specific about subject, composition, and mood.",
        },
        brandingId: {
          type: "string",
          description: "Brand kit id from list_brandings, whose reference image steers the visual style.",
        },
        styleImageUrl: {
          type: "string",
          description: "Public URL of a reference image to steer style directly, instead of a brand kit.",
        },
        workspaceId,
      },
      required: ["prompt"],
    },
  },
  {
    name: "multicall",
    description:
      "Run several PostMCP tools in one request, in the order given. Use it whenever a task needs more than one call - scheduling a week of posts, checking accounts then publishing, or cancelling a handful of posts - instead of one round trip per call. Calls run sequentially and every tool name is validated before anything executes, so a typo cannot leave half a batch written. Cannot nest: a call inside a batch may not itself be multicall.",
    inputSchema: {
      type: "object",
      properties: {
        calls: {
          type: "array",
          description: "The calls to run, in order. Between 1 and 20.",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              tool: {
                type: "string",
                description: "Name of the tool to run, e.g. \"create_post\".",
              },
              arguments: {
                type: "object",
                description: "Arguments for that tool, exactly as if it were called on its own.",
              },
              id: {
                type: "string",
                description: "Optional label echoed back on this call's result, for matching results to calls.",
              },
            },
            required: ["tool"],
          },
        },
        stopOnError: {
          type: "boolean",
          description:
            "Stop the batch at the first failing call and skip the rest (default true). Set false to attempt every call regardless - right for independent work like cancelling several posts, wrong when a later call depends on an earlier one.",
        },
        workspaceId,
      },
      required: ["calls"],
    },
  },
];
