/**
 * Definitions and JSON Schemas for all MCP tools exposed by the PostMCP AI Server.
 */
import { PLATFORMS, ANALYTICS_CREDITS_PER_CALL, MEDIA_SET_LIMITS, MAX_MEDIA_ITEMS } from "../platforms.js";

/** One line naming every network's carousel ceiling, for the schemas below. */
const MEDIA_SET_SUMMARY = Object.entries(MEDIA_SET_LIMITS)
  .filter(([, limit]) => limit.max > 1)
  .map(([platform, limit]) => `${platform} ${limit.note}`)
  .join("; ");

/**
 * The ordered attachment set: one URL is an ordinary media post, two or more
 * publish as a carousel or gallery on every network but YouTube. Offered
 * wherever media can be attached, with the same wording, so a caller who has
 * seen it once knows it everywhere.
 */
const mediaUrlsField = (scope = "the post") => ({
  type: "array",
  items: { type: "string" },
  maxItems: MAX_MEDIA_ITEMS,
  description:
    `Public URLs of every image/video to attach to ${scope}, in the order they should appear. One URL is a normal media post; two or more publish as a carousel (Instagram, Threads), a multi-photo post (Facebook, LinkedIn) or a gallery (X, Bluesky). Limits: ${MEDIA_SET_SUMMARY}; YouTube takes one video only. Only Instagram and Threads mix video into a carousel - elsewhere a set of several must be images only. Wins over mediaUrl when both are given. Run preflight_post with the same list to have each target's ceiling checked first.`,
});

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

/**
 * What a YouTube upload is sent with. YouTube's developer policies require
 * that the person uploading can set the title, description and privacy status
 * themselves, and that the visibility is stated before anything goes out - so
 * this is offered on every route that creates or edits a post, and the Short
 * is uploaded with exactly what is passed here.
 */
export const youtubeUploadDetails = (scope = "any YouTube profile in the target list") => ({
  type: "object",
  description: `Upload details for ${scope}; ignored for other platforms. The Short is uploaded with privacyStatus as its visibility - public unless set to unlisted or private - so confirm the visibility with the user before creating the post. Applies to this new upload only; nothing already on the channel is read or changed.`,
  properties: {
    title: {
      type: "string",
      description: "Video title, up to 100 characters. Defaults to the first line of the copy.",
    },
    description: {
      type: "string",
      description: "Video description, up to 5000 characters. Defaults to the whole copy.",
    },
    privacyStatus: {
      type: "string",
      enum: ["public", "unlisted", "private"],
      description: "Visibility of the uploaded Short. Defaults to public.",
    },
  },
});

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
      description: "Media for this profile only, overriding the shared mediaUrl / mediaUrls.",
    },
    mediaUrls: mediaUrlsField("this profile only, replacing the shared set"),
    youtube: youtubeUploadDetails("this profile only, when it is a YouTube channel"),
  },
  required: ["platform"],
  description: extra || undefined,
});

export const toolDefinitions = [
  {
    name: "get_user_info",
    description:
      "Retrieve details of the logged-in user including subscription plan, credit balance, the active workspace, and the caller's role in it.",
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
    name: "get_profile_analytics",
    description:
      `A connected profile's own statistics from its network: followers, following, post count, and - where the network reports it - views or page views, with the raw figures under the platform's own names. Nothing reads the networks on its own: without refresh this returns what the last reading stored, free, and says when it was read or that it never has been. With refresh it reads the network now and costs ${ANALYTICS_CREDITS_PER_CALL} credit - do that when the numbers are missing or the user wants them current, and say what it cost. Get platform and profileId from get_connected_accounts. LinkedIn only answers for organization pages (unavailable on personal profiles); a note mentioning reconnecting means the owner must reconnect that account to grant the insights permission. For how a single post did, use get_post_analytics.`,
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: PLATFORMS, description: "The profile's platform." },
        profileId: { type: "string", description: "The profileId from get_connected_accounts." },
        refresh: {
          type: "boolean",
          description: `Read the network now (${ANALYTICS_CREDITS_PER_CALL} credit) instead of returning the stored reading (free). Default false.`,
        },
        workspaceId,
      },
      required: ["platform", "profileId"],
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
    name: "get_post_analytics",
    description:
      `How a published post is doing on each network it went to: views, likes, comments, shares, saves and clicks per profile, with the raw metrics under the platform's own names. Nothing reads the networks on its own - a post's numbers exist only once someone has asked for them. Without refresh this returns what the last reading stored, free, and says per profile when it was read or that it never has been. With refresh it reads every network now and costs ${ANALYTICS_CREDITS_PER_CALL} credit: do that when the numbers are missing or the user wants them current, and tell the user what it cost. A profile with \`unavailable: true\` will never report - LinkedIn only answers for organization pages, never personal profiles - and one with an \`error\` mentioning reconnecting needs the owner to reconnect that account to grant the insights scope.`,
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the published post.",
        },
        refresh: {
          type: "boolean",
          description: `Read the numbers from the networks now (${ANALYTICS_CREDITS_PER_CALL} credit) instead of returning the stored reading (free). Default false.`,
        },
        workspaceId,
      },
      required: ["id"],
    },
  },
  {
    name: "preflight_post",
    description:
      "Dry-run a post before creating it: checks copy against each platform's character limit, flags profiles that are not connected or need reconnecting, warns when a platform requires media, reports each target's video limit when a video is attached, checks a carousel (mediaUrls) against each target's item ceiling, and reports the credit cost against the workspace balance. Costs nothing and publishes nothing. Run this before create_post whenever the copy is long, carries a link, attaches several files, or targets several platforms.",
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
        mediaUrls: mediaUrlsField("the post"),
        workspaceId,
      },
      required: ["content"],
    },
  },
  {
    name: "create_post",
    description:
      "Schedule or immediately publish a post to specific connected social profiles. Prefer targetAccounts so the post lands only on the profiles you name. Every targeted profile becomes its own post with its own id, so each can be edited, retried or cancelled on its own - the response lists them all. Attach one file with mediaUrl, or several with mediaUrls to publish a carousel (Instagram, Threads), multi-photo post (Facebook, LinkedIn) or gallery (X, Bluesky). With publishImmediately, each delivered profile comes back with a `url` to the live copy; pass those on to the user.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The text body / commentary of the post. Used for any profile that does not carry its own content. On YouTube, unless `youtube.title` / `youtube.description` are given, the first line becomes the Short's title (cut at 100 characters) and the whole body becomes the description, so lead with a hook.",
        },
        youtube: youtubeUploadDetails(),
        variants: {
          type: "object",
          description:
            "Per-platform copy, keyed by platform name (or \"platform:profileId\" for one profile), e.g. { \"twitter\": \"short punchy version\", \"linkedin\": \"longer version\" }. Overrides content for those destinations. A value may also be an object with content and/or mediaUrl / mediaUrls, e.g. { \"twitter\": { \"mediaUrls\": [\"...four slides...\"] } } to give one network its own cut of a carousel.",
          additionalProperties: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  content: { type: "string" },
                  mediaUrl: { type: "string" },
                  mediaUrls: { type: "array", items: { type: "string" }, maxItems: MAX_MEDIA_ITEMS },
                },
              },
            ],
          },
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
            "Optional public URL of one image/video to attach. Use the mediaUrl returned by generate_image to attach a generated image. Video is uploaded natively to every platform, but each has its own ceiling - Bluesky's 60 seconds is usually the binding one - so run preflight_post before sending one clip to several networks. Required, and must be a video file, when the post targets YouTube. For several files, use mediaUrls instead.",
        },
        mediaUrls: mediaUrlsField("the post"),
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
      "Update the fields (content, target profiles, schedule date/time, media) of an existing post. Pass mediaUrls to replace the whole attachment set - add or remove carousel slides, or reorder them - and an empty array to remove all media. To move a post to a different slot without touching anything else, use reschedule_post.",
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
          description: "Replacement single media URL. Replaces the whole attachment set with this one file; use mediaUrls to set several.",
        },
        mediaUrls: mediaUrlsField("the post, replacing whatever is attached now"),
        youtube: youtubeUploadDetails("a post going to a YouTube channel"),
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
      "Generate an image for a post from a text prompt and return its hosted URL, ready to pass to create_post as mediaUrl. Costs 20 credits from the workspace balance and needs a paid plan; pass styleImageUrl to steer the visual style.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "What the image should show. Be specific about subject, composition, and mood.",
        },
        styleImageUrl: {
          type: "string",
          description: "Public URL of a reference image to steer the visual style.",
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
