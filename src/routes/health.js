import express from "express";
import { config } from "../config.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: config.name,
    version: config.version,
    transport: "streamable-http",
  });
});

router.get("/", (req, res) => {
  res.json({
    name: "PostMCP AI Remote MCP Server",
    status: "running",
    mcpEndpoint: "/mcp",
    docs: "https://postmcpai.com/docs",
  });
});

export default router;
