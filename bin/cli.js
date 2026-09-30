#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "../src/config.js";
import { createServer } from "../src/server.js";
import { createExpressApp } from "../src/app.js";

// Safety: Redirect any console.log output to console.error so JSON-RPC stdio transport is preserved
console.log = (...args) => {
  console.error("[PostMCP Debug]:", ...args);
};

const main = async () => {
  const PORT = config.defaultPort;

  if (PORT) {
    // Remote Streamable HTTP Mode (for web clients, Claude.ai, etc.)
    const app = createExpressApp();

    if (app.locals.oauth) await app.locals.oauth.store.collection();
    app.listen(PORT, () => {
      console.error(`[PostMCP Server]: Remote MCP Server listening on port ${PORT}`);
      console.error(`[PostMCP Server]: MCP Endpoint: http://localhost:${PORT}/mcp`);
      console.error(`[PostMCP Server]: Ready for remote web clients (Claude.ai / Custom Connectors).`);
    });
  } else {
    // Local Stdio Mode (for local CLI, Claude Desktop, Cursor)
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("PostMCP AI Server successfully initialized and connected to stdio transport");
  }
};

main().catch((error) => {
  console.error("[PostMCP Fatal Error]:", error);
  process.exit(1);
});
