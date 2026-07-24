/**
 * Definitions and JSON Schemas for all MCP tools exposed by the PostMCP AI Server.
 */
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
    description: "List all active, connected social media channels and their associated profile usernames.",
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
    description: "Schedule or publish immediately a post to one or more social media platforms.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The text body / commentary of the post.",
        },
        platforms: {
          type: "array",
          description: "Target platforms for the post.",
          items: {
            type: "string",
            enum: ["linkedin", "twitter", "facebook", "instagram", "threads", "bluesky"],
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
        mediaUrl: {
          type: "string",
          description: "Optional public URL of an image/video to attach.",
        },
      },
      required: ["content", "platforms"],
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
    description: "Update the fields (content, platforms, schedule date/time) of an existing post.",
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
        platforms: {
          type: "array",
          description: "Updated platforms for publication.",
          items: {
            type: "string",
            enum: ["linkedin", "twitter", "facebook", "instagram", "threads", "bluesky"],
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
