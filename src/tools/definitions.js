/**
 * Definitions and JSON Schemas for all MCP tools exposed by the PostMCP AI Server.
 */
const PLATFORMS = ["linkedin", "twitter", "facebook", "instagram", "threads", "bluesky"];

export const toolDefinitions = [
  {
    name: "get_user_info",
    description: "Retrieve details of the logged-in user including subscription plan, credit balance, and AI token count.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_connected_accounts",
    description:
      "List every connected social profile with the profileId needed to target it. Call this before creating a post so the post reaches the intended profile rather than every account on a platform.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_posts",
    description: "Retrieve a list of scheduled, published, and failed social media posts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_post",
    description:
      "Schedule or immediately publish a post to specific connected social profiles. Prefer targetAccounts so the post lands only on the profiles you name.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The text body / commentary of the post.",
        },
        targetAccounts: {
          type: "array",
          description:
            "The profiles to post to, each with platform and the profileId from get_connected_accounts. Only these profiles receive the post.",
          items: {
            type: "object",
            properties: {
              platform: { type: "string", enum: PLATFORMS },
              profileId: { type: "string" },
              userId: { type: "string" },
              username: { type: "string" },
            },
            required: ["platform"],
          },
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
          description: "Optional public URL of an image/video to attach.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "publish_post_now",
    description: "Broadcast an existing scheduled post immediately to its platforms.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The Database ObjectId of the post to publish.",
        },
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
      },
      required: ["id"],
    },
  },
  {
    name: "update_post",
    description: "Update the fields (content, target profiles, schedule date/time) of an existing post.",
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
          items: {
            type: "object",
            properties: {
              platform: { type: "string", enum: PLATFORMS },
              profileId: { type: "string" },
              username: { type: "string" },
            },
            required: ["platform"],
          },
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
        status: {
          type: "string",
          enum: ["scheduled", "draft", "failed"],
          description: "Reset status of the post.",
        },
      },
      required: ["id"],
    },
  },
];
