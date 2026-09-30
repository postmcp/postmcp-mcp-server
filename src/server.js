import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { toolDefinitions, handleToolCall } from "./tools/index.js";

/**
 * Creates and initializes an MCP Server instance.
 *
 * @param {string|Function|null} apiKeyOrGetter - An API key string or a getter function returning the API key dynamically
 * @param {string|Function|null} projectIdOrGetter - Default workspace id, or a getter returning it. A tool call naming its own workspaceId overrides this.
 * @returns {Server} An initialized MCP Server instance
 */
export const createServer = (apiKeyOrGetter = null, projectIdOrGetter = null, { oauthEnabled = false } = {}) => {
  const getApiKey = () => {
    if (typeof apiKeyOrGetter === "function") {
      return apiKeyOrGetter();
    }
    return apiKeyOrGetter;
  };

  const getProjectId = () => {
    if (typeof projectIdOrGetter === "function") {
      return projectIdOrGetter();
    }
    return projectIdOrGetter;
  };

  const server = new Server(
    {
      name: config.name,
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list request handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions.map((tool) => ({
        ...tool,
        ...(oauthEnabled ? { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }], _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }] } } : {}),
        annotations: {
          readOnlyHint: ['get_user_info', 'list_workspaces', 'get_connected_accounts', 'get_account_health', 'list_posts', 'get_post', 'preflight_post'].includes(tool.name),
          destructiveHint: ['update_post', 'delete_post', 'multicall'].includes(tool.name),
          openWorldHint: true,
        },
      })),
    };
  });

  // Register tool call execution request handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args, getApiKey, getProjectId);
  });

  return server;
};
