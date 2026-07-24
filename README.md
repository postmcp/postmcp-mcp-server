# PostMCP AI Model Context Protocol (MCP) Server

[![npm version](https://img.shields.io/npm/v/@postmcpai/server.svg?style=flat-square)](https://www.npmjs.com/package/@postmcpai/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg?style=flat-square)](https://modelcontextprotocol.io)

Official [PostMCP AI](https://postmcpai.com) Model Context Protocol (MCP) Server. Connect your social media publishing pipelines directly into AI assistants, desktop applications, IDE workflows, and web environments like **Claude Desktop**, **Claude.ai**, **Cursor**, and **ChatGPT Custom GPTs**.

Supported platforms include **LinkedIn**, **X (Twitter)**, **Facebook**, **Instagram**, **Threads**, and **Bluesky**.

---

## 🚀 Features & Capabilities

- 🤖 **7 Built-in Tools**: Retrieve user profiles, list connected accounts, view post queues, create/schedule posts, publish immediately, edit posts, and delete scheduled posts.
- ⚡ **Dual Transport Modes**: Native **Stdio mode** (for local desktop apps & IDEs) and **Streamable HTTP mode** (for web services, Claude.ai, and remote connectors).
- 🔑 **Flexible Authentication**: Auto-detects API key from environment variables (`POSTMCPAI_API_KEY`), URL query parameters (`?apikey=YOUR_KEY`), or HTTP authorization headers (`x-api-key`, `Bearer token`).
- 🤖 **ChatGPT Actions Compatible**: Includes built-in OpenAPI 3.0 specification generator (`/openapi.json`) and REST endpoints (`/api/tools/:name`) for ChatGPT Custom GPT integration.
- 🔒 **OAuth 2.0 & RFC 9728 Support**: Advertises PKCE authorization server metadata for seamless dynamic client registration with Claude.ai.

---

## 📁 Repository Architecture

```
mcp-server/
├── bin/
│   └── cli.js            # Executable CLI entry point (Stdio / HTTP mode runner)
├── src/
│   ├── config.js         # Centralized configuration & environment loader
│   ├── client.js         # Backend API client & API key extraction logic
│   ├── tools/
│   │   ├── definitions.js# MCP tool JSON schemas & parameter specifications
│   │   ├── handlers.js   # MCP tool execution handlers
│   │   └── index.js      # Tool definitions aggregator
│   ├── server.js         # MCP Server instance factory
│   ├── routes/
│   │   ├── oauth.js      # OAuth 2.0 & RFC 9728 discovery endpoints
│   │   ├── openapi.js    # OpenAPI 3.0 schema & ChatGPT REST endpoints
│   │   ├── mcpHttp.js    # MCP Streamable HTTP transport (/mcp)
│   │   └── health.js     # Health check & system metadata endpoints
│   ├── app.js            # Express application factory
│   └── index.js          # Main library entry point
├── index.js              # Executable wrapper script
├── package.json
└── README.md
```

---

## ⚙️ Environment Configuration

| Environment Variable | Description | Default Value |
| :--- | :--- | :--- |
| `POSTMCPAI_API_KEY` | **Required.** Your secret API key from the PostMCP AI dashboard. | `None` |
| `POSTMCPAI_API_URL` | The API root URL of your PostMCP AI backend service. | `http://localhost:5023` |
| `PORT` | Setting this launches the server in **Remote Streamable HTTP Mode**. | `None` (Defaults to Stdio Mode) |

---

## 🛠️ MCP Tools Reference

| Tool Name | Description | Required Parameters | Optional Parameters |
| :--- | :--- | :--- | :--- |
| `get_user_info` | Retrieve authenticated user profile, tier, credit balance, and AI tokens remaining. | None | None |
| `get_connected_accounts` | List active, synced social channels (LinkedIn, Twitter, Facebook, Instagram, Threads, Bluesky). | None | None |
| `list_posts` | Retrieve all scheduled, published, draft, and failed social media posts. | None | None |
| `create_post` | Draft, schedule, or immediately publish a post to target platforms. | `content`, `platforms` | `publishImmediately`, `scheduleDate`, `scheduleTime`, `mediaUrl` |
| `publish_post_now` | Broadcast an existing scheduled post immediately. | `id` | None |
| `delete_post` | Cancel and delete an existing scheduled post. | `id` | None |
| `update_post` | Update content, platforms, schedule date/time, or status of an existing post. | `id` | `content`, `platforms`, `scheduleDate`, `scheduleTime`, `status` |

---

## 💻 Client Integration Guides

### 1. Claude Desktop App (Stdio Mode)

Add the configuration below to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "postmcpai": {
      "command": "npx",
      "args": ["-y", "@postmcpai/server"],
      "env": {
        "POSTMCPAI_API_KEY": "pmcp_sec_your_secret_api_key_here",
        "POSTMCPAI_API_URL": "http://localhost:5023"
      }
    }
  }
}
```

---

### 2. Cursor IDE

1. Open **Cursor Settings** -> **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Fill in the details:
   - **Name**: `postmcpai`
   - **Type**: `command`
   - **Command**: `npx -y @postmcpai/server`
4. Under **Environment Variables**, add:
   - `POSTMCPAI_API_KEY` = `pmcp_sec_your_secret_api_key_here`
   - `POSTMCPAI_API_URL` = `http://localhost:5023`
5. Click **Save**.

---

### 3. Claude.ai & Remote Web Connectors (Streamable HTTP / SSE Mode)

Host this server on any cloud service (Render, Railway, Fly.io, Vercel) or tunnel your local machine using `ngrok`.

#### Launching in HTTP Mode:
```bash
export POSTMCPAI_API_KEY="pmcp_sec_your_secret_api_key_here"
export POSTMCPAI_API_URL="https://your-backend-domain.com"
export PORT=3000

npm run start:sse
```

#### Connecting to Claude.ai:
1. Provide your public MCP URL with your API key attached:
   `https://your-hosted-domain.com/mcp?apikey=pmcp_sec_your_secret_api_key_here`
2. Claude.ai will discover tool capabilities via `/mcp` and authenticate seamlessly.

---

### 4. ChatGPT Custom GPTs (REST Actions)

1. When configuring a **Custom GPT Action**, specify your server URL (e.g. `https://your-hosted-domain.com`).
2. Import the OpenAPI schema directly from:
   `https://your-hosted-domain.com/openapi.json`
3. Set Authentication to **API Key** (Header Name: `Authorization` or `x-api-key`).

---

### 5. Programmatic Node.js Library Usage

You can also use `@postmcpai/server` as a library in your own Node.js backends:

```js
import { createServer, createExpressApp, makeBackendRequest } from "@postmcpai/server";

// Create a standalone MCP Server instance
const mcpServer = createServer(() => process.env.POSTMCPAI_API_KEY);

// Or create an Express app with all remote routes attached
const app = createExpressApp();
app.listen(3000);
```

---

## 🧪 Local Testing & Development

```bash
# Clone the repository
git clone https://github.com/postmcpai/postmcp-mcp-server.git
cd postmcp-mcp-server

# Install dependencies
npm install

# Start in Stdio Mode
npm start

# Start in HTTP Mode with hot reload
npm run dev
```

---

## 📄 License

Distributed under the [MIT License](LICENSE). Copyright © 2026 PostMCP AI.
