# PostMCP AI Model Context Protocol (MCP) Server

[![npm version](https://img.shields.io/npm/v/@postmcpai/server.svg?style=flat-square)](https://www.npmjs.com/package/@postmcpai/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg?style=flat-square)](https://modelcontextprotocol.io)

Official [PostMCP AI](https://postmcpai.com) Model Context Protocol (MCP) Server. Connect your social media publishing pipelines directly into AI assistants, desktop applications, IDE workflows, and web environments like **Claude Desktop**, **Claude.ai**, **Cursor**, and **ChatGPT Custom GPTs**.

Supported platforms include **LinkedIn**, **X (Twitter)**, **Facebook**, **Instagram**, **Threads**, and **Bluesky**.

---

## 🚀 Features & Capabilities

- 🤖 **15 Built-in Tools**: Workspaces, connected accounts and their token health, brand kits, the post queue, pre-flight checks, create/schedule/reschedule/publish/retry/delete, and image generation.
- ⚡ **Dual Transport Modes**: Native **Stdio mode** (for local desktop apps & IDEs) and **Streamable HTTP mode** (for web services, Claude.ai, and remote connectors).
- 🔑 **Flexible Authentication**: Auto-detects API key from environment variables (`POSTMCPAI_API_KEY`), URL query parameters (`?apikey=YOUR_KEY`), or HTTP authorization headers (`x-api-key`, `Bearer token`).
- 🗂️ **Multi-Workspace Aware**: The API key carries its own workspace, so a bare key is enough. To act on another one, every tool takes an optional `workspaceId`, also settable per connection (`?projectId=...`, `x-project-id`) or per process (`POSTMCPAI_PROJECT_ID`).
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
│   ├── client.js         # Backend API client, API key & workspace extraction
│   ├── platforms.js      # Platform limits, credit pricing & post cost helper
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
| `POSTMCPAI_PROJECT_ID` | Optional. Overrides the workspace the API key is bound to. Overridden in turn by a call's `workspaceId`. | The workspace the API key was issued from |
| `PORT` | Setting this launches the server in **Remote Streamable HTTP Mode**. | `None` (Defaults to Stdio Mode) |

---

## 🛠️ MCP Tools Reference

Every tool below also accepts an optional `workspaceId` (from `list_workspaces`) to act on a specific workspace.

### Reading

| Tool Name | Description | Required | Optional |
| :--- | :--- | :--- | :--- |
| `get_user_info` | Authenticated user: plan, credit balance, AI tokens, active workspace and role. | — | `workspaceId` |
| `list_workspaces` | Every workspace the user belongs to, with ids, roles, and connected platforms. | — | — |
| `get_connected_accounts` | Connected social profiles with the `profileId` needed to target them. | — | `workspaceId` |
| `get_account_health` | Connections whose token expired or is close to it and need reconnecting. | — | `workspaceId` |
| `list_brandings` | Brand kits: tone, audience, keywords, style images. | — | `workspaceId` |
| `list_posts` | Post queue, newest first, with per-profile delivery status, pagination and counts. | — | `status`, `page`, `limit`, `all` |
| `get_post` | One post in full: which profiles received it, live URLs, and per-profile errors. | `id` | — |

### Writing

| Tool Name | Description | Required | Optional |
| :--- | :--- | :--- | :--- |
| `preflight_post` | Dry run: character limits, unconnected profiles, missing media, credit cost. Publishes nothing. | `content` | `targetAccounts`, `platforms`, `mediaUrl` |
| `create_post` | Draft, schedule, or immediately publish a post to named profiles. Each profile becomes its own post with its own id. | `content` | `targetAccounts`, `variants`, `platforms`, `publishImmediately`, `scheduleDate`, `scheduleTime`, `timezone`, `mediaUrl` |
| `publish_post_now` | Publish an existing post immediately; also retries a failed post, skipping delivered profiles. | `id` | — |
| `update_post` | Update content, target profiles, schedule, media, or status. | `id` | `content`, `targetAccounts`, `platforms`, `scheduleDate`, `scheduleTime`, `timezone`, `mediaUrl`, `status` |
| `reschedule_post` | Move a post to a new slot, keeping copy and targets. Re-arms failed and draft posts. | `id`, `scheduleDate`, `scheduleTime` | `timezone` |
| `reset_stuck_post` | Release a post stuck mid-publish so it can be retried. Delivered profiles keep their state. | `id` | `force` |
| `delete_post` | Cancel and delete a scheduled or failed post. | `id` | — |
| `generate_image` | Generate a post image and return its hosted URL for `mediaUrl`. Spends AI tokens. | `prompt` | `brandingId`, `styleImageUrl` |

### Batching

| Tool Name | Description | Required | Optional |
| :--- | :--- | :--- | :--- |
| `multicall` | Run up to 20 of the tools above in one request, in order. Tool names are validated before anything executes, so a typo cannot leave half a batch written. Cannot nest. | `calls` | `stopOnError`, `workspaceId` |

```json
{
  "calls": [
    { "id": "img", "tool": "generate_image", "arguments": { "prompt": "launch banner" } },
    {
      "tool": "create_post",
      "arguments": {
        "content": "We shipped it 🚀",
        "targetAccounts": [
          { "platform": "linkedin", "profileId": "lin_7741903" },
          { "platform": "twitter", "profileId": "tw_1293847", "content": "We shipped it 🚀" }
        ],
        "scheduleDate": "2026-09-01",
        "scheduleTime": "10:00",
        "timezone": "Asia/Kolkata"
      }
    }
  ],
  "stopOnError": true
}
```

The reply carries one entry per call — `{ id, tool, ok, result }` or `{ id, tool, ok: false, error }` — plus counts and, when a failure stopped the batch, the calls that were skipped.

### Notes for clients

- **Target profiles, not platforms.** `targetAccounts` sends only to the profiles named; `platforms` fans out to every connected profile on each platform.
- **One post per profile.** `create_post` stores a separate post per targeted profile, so each can be edited, retried or cancelled on its own. Give per-profile copy through `targetAccounts[].content` or the `variants` map.
- **Always pass `timezone`** when a wall-clock time matters. The backend defaults to UTC, so a 9:00 IST post scheduled without a zone goes out at 14:30 IST.
- **Credits** are charged per profile delivered to (X/Twitter costs 5, others 1), plus a one-off 50-credit surcharge when the copy contains a link. `preflight_post` reports this before you commit.

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
3. That URL is all you need: the key is bound to the workspace it was issued from, so tools act on that workspace without being told. To point the same key at a *different* workspace, append `&projectId=YOUR_WORKSPACE_ID` (or send an `x-project-id` header); individual tool calls can still override either with `workspaceId`.

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
