import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { extractProjectId } from "../client.js";
import { createServer } from "../server.js";

export function createMcpHttpRouter({ oauthEnabled = false } = {}) {
  const router = express.Router();

  // Per-app sessions. Authentication and principal binding apply on every verb.
  const transports = new Map();
  router.use('/mcp', (req, res, next) => {
    const session = transports.get(req.headers['mcp-session-id']);
    if (session && session.principal !== req.postmcpAuth.principal) {
      return res.status(403).json({ error: 'Session belongs to a different credential' });
    }
    next();
  });

  router.post("/mcp", express.json(), async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const requestApiKey = req.postmcpAuth.apiKey;
    const requestProjectId = extractProjectId(req);
    let sessionObj;

    try {
      if (sessionId && transports.has(sessionId)) {
        // Reuse existing session
        sessionObj = transports.get(sessionId);
        if (requestApiKey && !sessionObj.apiKey) {
          sessionObj.apiKey = requestApiKey;
        }
        if (requestProjectId && !sessionObj.projectId) {
          sessionObj.projectId = requestProjectId;
        }
      } else if (!sessionId && req.body?.method === "initialize") {
        // Brand new session
        const sessionApiKey = requestApiKey;
        const sessionProjectId = requestProjectId;
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
          principal: req.postmcpAuth.principal,
          projectId: sessionProjectId,
        };

        transport.onclose = () => {
          if (transport.sessionId) {
            console.error(`[PostMCP MCP]: Session closed: ${transport.sessionId}`);
            transports.delete(transport.sessionId);
          }
        };

        const server = createServer(
          () => sessionObj.apiKey,
          () => sessionObj.projectId,
          { oauthEnabled }
        );
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
    const requestApiKey = req.postmcpAuth.apiKey;
    const requestProjectId = extractProjectId(req);

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const sessionObj = transports.get(sessionId);
    if (requestApiKey && !sessionObj.apiKey) {
      sessionObj.apiKey = requestApiKey;
    }
    if (requestProjectId && !sessionObj.projectId) {
      sessionObj.projectId = requestProjectId;
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

  return router;
}
