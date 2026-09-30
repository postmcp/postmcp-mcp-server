import express from "express";
import { extractProjectId } from "../client.js";
import { toolDefinitions, handleToolCall } from "../tools/index.js";

const router = express.Router();

const getBaseUrl = (req) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
};

/**
 * The ChatGPT Actions surface is the MCP toolset, described in OpenAPI.
 *
 * Generating it from `toolDefinitions` rather than restating each tool means a
 * tool added to the MCP server cannot silently go missing here - which is how
 * the two surfaces drifted apart before.
 */
const generateOpenApiSchema = (baseUrl) => ({
  openapi: "3.0.1",
  info: {
    title: "PostMCP AI API for ChatGPT",
    version: "1.0.0",
    description: "Social media publishing, scheduling, and management tools for PostMCP AI.",
  },
  servers: [{ url: baseUrl }],
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
  security: [{ bearerAuth: [] }],
  paths: Object.fromEntries(
    toolDefinitions.map((tool) => [
      `/api/tools/${tool.name}`,
      {
        post: {
          summary: tool.description,
          operationId: tool.name,
          requestBody: {
            required: Array.isArray(tool.inputSchema?.required) && tool.inputSchema.required.length > 0,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: tool.inputSchema?.properties || {},
                  ...(tool.inputSchema?.required ? { required: tool.inputSchema.required } : {}),
                },
              },
            },
          },
          responses: { 200: { description: "Successful response" } },
        },
      },
    ])
  ),
});

router.get("/openapi.json", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json(generateOpenApiSchema(baseUrl));
});

router.post("/api/tools/:name", express.json(), async (req, res) => {
  const { name } = req.params;
  const args = req.body || {};
  const apiKey = req.postmcpAuth.apiKey;
  const projectId = extractProjectId(req);
  console.error(`[PostMCP ChatGPT Action]: Executing tool '${name}'`);

  const known = toolDefinitions.some((tool) => tool.name === name);
  if (!known) {
    return res.status(400).json({ error: `Tool not found: ${name}` });
  }

  // Same execution path as the MCP transport, so the two surfaces cannot
  // disagree about what a tool does.
  const result = await handleToolCall(name, args, apiKey, projectId);
  const text = result?.content?.[0]?.text ?? "";

  if (result?.isError) {
    // A failure can carry structure - multicall reports which call in the
    // batch failed - so it is handed back as JSON rather than as a string
    // holding JSON that the caller has to parse a second time.
    try {
      return res.status(500).json({ error: JSON.parse(text) });
    } catch (_) {
      return res.status(500).json({ error: text });
    }
  }

  try {
    return res.json(JSON.parse(text));
  } catch (_) {
    return res.json({ result: text });
  }
});

export default router;
