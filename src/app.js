import express from "express";
import cors from "cors";
import oauthRoutes from "./routes/oauth.js";
import openapiRoutes from "./routes/openapi.js";
import mcpHttpRoutes from "./routes/mcpHttp.js";
import healthRoutes from "./routes/health.js";

/**
 * Creates and configures the Express application with CORS, middlewares, and routes.
 *
 * @returns {import("express").Express} Configured Express application instance
 */
export const createExpressApp = () => {
  const app = express();

  app.set("trust proxy", true);

  app.use(
    cors({
      origin: true,
      exposedHeaders: ["Mcp-Session-Id"],
      allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "mcp-protocol-version"],
    })
  );

  // Request logger middleware for debugging client requests
  app.use((req, res, next) => {
    console.error(`[PostMCP HTTP Request]: ${req.method} ${req.url}`);
    next();
  });

  // Attach router modules
  app.use(oauthRoutes);
  app.use(openapiRoutes);
  app.use(mcpHttpRoutes);
  app.use(healthRoutes);

  return app;
};
