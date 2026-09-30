# PostMCP AI plugin

The package connects to `https://mcp.postmcpai.com/mcp` and provides a workflow
skill for account onboarding, post creation, scheduling and analytics. Social
accounts are linked in the PostMCP dashboard; the plugin then uses those profiles.
The package contains no API keys and does not run the server itself.

## Hosted connection (ChatGPT or Codex OAuth)

**Deploy the OAuth server changes described in OAUTH.md before connecting this
release.** Installing or uploading the ZIP does not deploy the server.

Install the plugin and choose Connect. On PostMCP's consent page, enter your own
PostMCP API key from the dashboard and approve the listed permissions. The client
receives separate, expiring OAuth tokens. The API key remains encrypted on the
PostMCP server. This is API-key-based account authorization, not Google/social
login inside the plugin. Each customer connects their own account and keeps the
same backend role/workspace restrictions.

Try “Show my connected accounts,” then “Prepare a LinkedIn post.” Schedule or
publish only after reviewing the intended content, profiles and time.

## API-key access (compatible local clients)

API keys remain supported through bearer headers, `x-api-key`, legacy query
parameters, and the existing stdio server. Prefer headers to URLs.

For a direct Codex connection, set `POSTMCPAI_API_KEY` in the environment of the
Codex process, then add:

```toml
[mcp_servers.postmcpai]
url = "https://mcp.postmcpai.com/mcp"
bearer_token_env_var = "POSTMCPAI_API_KEY"
```

Do not store the key in this file or the archive. A terminal export reaches only
processes launched from that environment; a desktop app launched separately may
not inherit it. The plugin's bundled remote connection uses OAuth by default.
Choose that connection OR the direct API-key configuration to avoid duplicate
sets of tools. Direct MCP configuration alone does not install the workflow skill.

The existing stdio command remains `npx -y @postmcpai/server`, with each user's
`POSTMCPAI_API_KEY` in that process's environment. The new server source must be
published separately before npm clients can receive this release.

## Build and verify

From the server repository: `npm ci`, `npm test`, `npm run package:plugin`.
The archive is written to `dist/postmcpai-1.1.0.zip`. The packager uses an explicit
allowlist and excludes server code, dependencies, environment files and keys.

Official references, checked September 30, 2026:

- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth)
- [Plugin package format](https://developers.openai.com/plugins/build/plugins)
- [Codex MCP authentication](https://developers.openai.com/codex/mcp)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization)

ChatGPT's hosted MCP connection needs OAuth for customer-specific access; an
API-key-only Custom GPT Action is a different integration, and a shared Action
key does not give each customer their own PostMCP connection.
