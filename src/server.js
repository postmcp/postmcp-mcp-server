import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { toolDefinitions, handleToolCall } from "./tools/index.js";

/**
 * Creates and initializes an MCP Server instance.
 *
 * @param {string|Function|null} apiKeyOrGetter - An API key string or a getter function returning the API key dynamically
 * @returns {Server} An initialized MCP Server instance
 */
export const createServer = (apiKeyOrGetter = null) => {
  const getApiKey = () => {
    if (typeof apiKeyOrGetter === "function") {
      return apiKeyOrGetter();
    }
    return apiKeyOrGetter;
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
      tools: toolDefinitions,
    };
  });

  // Register tool call execution request handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args, getApiKey);
  });

  return server;
};
