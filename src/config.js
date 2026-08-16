import dotenv from "dotenv";

dotenv.config();

export const config = {
  name: "postmcpai-server",
  version: "1.0.0",
  defaultApiUrl: "http://localhost:5023",
  get apiUrl() {
    return process.env.POSTMCPAI_API_URL || process.env.POSTMCP_API_URL || this.defaultApiUrl;
  },
  // Default workspace for every call, for stdio clients that only pass env.
  // A per-call workspaceId argument still wins over this.
  get projectId() {
    return process.env.POSTMCPAI_PROJECT_ID || process.env.POSTMCP_PROJECT_ID || null;
  },
  get defaultPort() {
    if (process.env.PORT) return parseInt(process.env.PORT, 10);
    if (process.argv.includes("--sse")) return 3000;
    return null;
  },
};
