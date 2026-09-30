import express from "express";
import cors from "cors";
import { createOAuthRouter, oauthFromEnvironment } from "./routes/oauth.js";
import { authenticateRequest, validateApiKey } from "./auth/request.js";
import openapiRoutes from "./routes/openapi.js";
import { createMcpHttpRouter } from "./routes/mcpHttp.js";
import healthRoutes from "./routes/health.js";

/**
 * Creates and configures the Express application with CORS, middlewares, and routes.
 *
 * @returns {import("express").Express} Configured Express application instance
 */
export const createExpressApp = ({ oauth = oauthFromEnvironment(), validateKey = validateApiKey } = {}) => {
  const app = express();

  // Configure the known proxy hop count; never trust arbitrary forwarded IPs.
  app.set("trust proxy", Number(process.env.POSTMCPAI_TRUST_PROXY_HOPS || 0));

  app.use(
    cors({
      origin: true,
      exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Mcp-Session-Id",
        "mcp-protocol-version",
        // Both are read off the request by extractApiKey / extractProjectId, so
        // a browser client that sends them must be allowed to.
        "x-api-key",
        "x-project-id",
      ],
    })
  );

  // Request logger middleware for debugging client requests
  app.use((req, res, next) => {
    console.error(`[PostMCP HTTP Request]: ${req.method} ${req.path}`);
    next();
  });

  // Attach router modules
  app.use(createOAuthRouter(oauth));
  app.use(["/mcp", "/api/tools"], authenticateRequest(oauth, validateKey));
  app.use(openapiRoutes);
  app.use(createMcpHttpRouter({ oauthEnabled: Boolean(oauth) }));
  app.use(healthRoutes);

  app.use((error, _req, res, _next) => {
    console.error("[PostMCP HTTP Error]", error.name);
    if (!res.headersSent) res.status(500).json({ error: "server_error" });
  });
  app.locals.oauth = oauth;
  return app;
};
