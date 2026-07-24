import express from "express";
import { extractApiKey, makeBackendRequest } from "../client.js";

const router = express.Router();

const getBaseUrl = (req) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
};

const generateOpenApiSchema = (baseUrl) => ({
  openapi: "3.0.1",
  info: {
    title: "PostMCP AI API for ChatGPT",
    version: "1.0.0",
    description: "Social media publishing and management tools for PostMCP AI."
  },
  servers: [{ url: baseUrl }],
  paths: {
    "/api/tools/get_user_info": {
      post: {
        summary: "Retrieve user profile, subscription plan, and credit balance",
        operationId: "get_user_info",
        responses: { 200: { description: "Successful response" } }
      }
    },
    "/api/tools/get_connected_accounts": {
      post: {
        summary: "List connected social media channels and profile handles",
        operationId: "get_connected_accounts",
        responses: { 200: { description: "Successful response" } }
      }
    },
    "/api/tools/list_posts": {
      post: {
        summary: "List all scheduled, draft, published, and failed posts",
        operationId: "list_posts",
        responses: { 200: { description: "Successful response" } }
      }
    },
    "/api/tools/create_post": {
      post: {
        summary: "Schedule or publish a social media post to target platforms",
        operationId: "create_post",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: { type: "string", description: "Text body of the post" },
                  platforms: { type: "array", items: { type: "string" }, description: "Target platforms (linkedin, twitter, facebook, instagram, threads, bluesky)" },
                  publishImmediately: { type: "boolean" },
                  scheduleDate: { type: "string", description: "YYYY-MM-DD" },
                  scheduleTime: { type: "string", description: "HH:MM" },
                  mediaUrl: { type: "string" }
                },
                required: ["content", "platforms"]
              }
            }
          }
        },
        responses: { 200: { description: "Successful response" } }
      }
    },
    "/api/tools/publish_post_now": {
      post: {
        summary: "Publish an existing scheduled post immediately",
        operationId: "publish_post_now",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { id: { type: "string", description: "Database ObjectId of post" } },
                required: ["id"]
              }
            }
          }
        },
        responses: { 200: { description: "Successful response" } }
      }
    },
    "/api/tools/delete_post": {
      post: {
        summary: "Delete a scheduled post",
        operationId: "delete_post",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { id: { type: "string", description: "Database ObjectId of post" } },
                required: ["id"]
              }
            }
          }
        },
        responses: { 200: { description: "Successful response" } }
      }
    },
    "/api/tools/update_post": {
      post: {
        summary: "Update an existing scheduled post",
        operationId: "update_post",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Database ObjectId of post" },
                  content: { type: "string" },
                  platforms: { type: "array", items: { type: "string" } },
                  scheduleDate: { type: "string" },
                  scheduleTime: { type: "string" },
                  status: { type: "string" }
                },
                required: ["id"]
              }
            }
          }
        },
        responses: { 200: { description: "Successful response" } }
      }
    }
  }
});

router.get("/openapi.json", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json(generateOpenApiSchema(baseUrl));
});

router.post("/api/tools/:name", express.json(), async (req, res) => {
  const { name } = req.params;
  const args = req.body || {};
  const apiKey = extractApiKey(req);
  console.error(`[PostMCP ChatGPT Action]: Executing tool '${name}'`);

  try {
    let resultData;
    switch (name) {
      case "get_user_info": {
        const data = await makeBackendRequest("/auth/user-data", "GET", null, apiKey);
        resultData = { name: data.name, email: data.email, plan: data.plan, credits: data.credits, aiToken: data.aiToken };
        break;
      }
      case "get_connected_accounts": {
        const data = await makeBackendRequest("/auth/user-data", "GET", null, apiKey);
        const connected = [];
        if (data.connectedAccounts) {
          for (const [platform, accounts] of Object.entries(data.connectedAccounts)) {
            if (Array.isArray(accounts)) {
              accounts.forEach((acc) => {
                if (acc.connected) {
                  connected.push({ platform, username: acc.username, name: acc.name, profileId: acc.profileId, isOrganization: acc.isOrganization || false });
                }
              });
            }
          }
        }
        resultData = connected;
        break;
      }
      case "list_posts": {
        const posts = await makeBackendRequest("/post/list", "GET", null, apiKey);
        resultData = posts.map((p) => ({ id: p._id, content: p.content, platforms: p.platforms, status: p.status, scheduleDate: p.scheduleDate, scheduleTime: p.scheduleTime, mediaUrl: p.mediaUrl, platformStatuses: p.platformStatuses, createdAt: p.createdAt }));
        break;
      }
      case "create_post": {
        const payload = { content: args.content, platforms: args.platforms, publishImmediately: args.publishImmediately ?? false, scheduleDate: args.scheduleDate || "", scheduleTime: args.scheduleTime || "", mediaUrl: args.mediaUrl || "" };
        resultData = await makeBackendRequest("/post/create", "POST", payload, apiKey);
        break;
      }
      case "publish_post_now": {
        resultData = await makeBackendRequest(`/post/${args.id}/publish-now`, "POST", null, apiKey);
        break;
      }
      case "delete_post": {
        resultData = await makeBackendRequest(`/post/${args.id}`, "DELETE", null, apiKey);
        break;
      }
      case "update_post": {
        const payload = {};
        if (args.content !== undefined) payload.content = args.content;
        if (args.platforms !== undefined) payload.platforms = args.platforms;
        if (args.scheduleDate !== undefined) payload.scheduleDate = args.scheduleDate;
        if (args.scheduleTime !== undefined) payload.scheduleTime = args.scheduleTime;
        if (args.status !== undefined) payload.status = args.status;
        resultData = await makeBackendRequest(`/post/${args.id}`, "PUT", payload, apiKey);
        break;
      }
      default:
        return res.status(400).json({ error: `Tool not found: ${name}` });
    }

    return res.json(resultData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
