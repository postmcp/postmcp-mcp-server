import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { extractApiKey } from "../client.js";
import { createServer } from "../server.js";

const router = express.Router();

// One transport + server pair per session, keyed by Mcp-Session-Id
const transports = new Map();

router.post("/mcp", express.json(), async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const requestApiKey = extractApiKey(req);
  let sessionObj;

  try {
    if (sessionId && transports.has(sessionId)) {
      // Reuse existing session
      sessionObj = transports.get(sessionId);
      if (requestApiKey && !sessionObj.apiKey) {
        sessionObj.apiKey = requestApiKey;
      }
    } else if (!sessionId && req.body?.method === "initialize") {
      // Brand new session
      const sessionApiKey = requestApiKey;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          console.error(`[PostMCP MCP]: Session initialized: ${newSessionId}${sessionApiKey ? ' with custom query/header API key' : ''}`);
          transports.set(newSessionId, sessionObj);
        },
      });

      sessionObj = {
        transport,
        apiKey: sessionApiKey,
      };

      transport.onclose = () => {
        if (transport.sessionId) {
          console.error(`[PostMCP MCP]: Session closed: ${transport.sessionId}`);
          transports.delete(transport.sessionId);
        }
      };

      const server = createServer(() => sessionObj.apiKey);
      await server.connect(transport);
    } else {
      console.error(`[PostMCP MCP]: Rejected request. sessionId=${sessionId} method=${req.body?.method}`);
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: req.body?.id ?? null,
      });
      return;
    }

    await sessionObj.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[PostMCP MCP Error]:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error.message },
        id: req.body?.id ?? null,
      });
    }
  }
});

router.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const requestApiKey = extractApiKey(req);

  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const sessionObj = transports.get(sessionId);
  if (requestApiKey && !sessionObj.apiKey) {
    sessionObj.apiKey = requestApiKey;
  }

  await sessionObj.transport.handleRequest(req, res);
});

router.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const sessionObj = transports.get(sessionId);
  await sessionObj.transport.handleRequest(req, res);
});

export default router;
