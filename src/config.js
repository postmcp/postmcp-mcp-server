import dotenv from "dotenv";

dotenv.config();

export const config = {
  name: "postmcpai-server",
  version: "1.0.0",
  defaultApiUrl: "http://localhost:5023",
  get apiUrl() {
    return process.env.POSTMCPAI_API_URL || process.env.POSTMCP_API_URL || this.defaultApiUrl;
  },
  get defaultPort() {
    if (process.env.PORT) return parseInt(process.env.PORT, 10);
    if (process.argv.includes("--sse")) return 3000;
    return null;
  },
};
