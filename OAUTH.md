# Deploy OAuth while preserving API-key clients

This release replaces the legacy dummy OAuth endpoints with the MCP SDK's
OAuth handlers plus a PostMCP account provider. OAuth clients obtain separate
opaque tokens; API-key clients keep their existing authentication. Users grant
access by entering their PostMCP API key on the PostMCP browser consent page.
The integration does not require a new social login provider.

## Required production configuration

Deploy this repository's server, using `npm ci` and `npm start`, with:

```dotenv
PORT=3000
POSTMCPAI_OAUTH_ISSUER=https://mcp.postmcpai.com
POSTMCPAI_OAUTH_MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/postmcp_oauth
POSTMCPAI_OAUTH_ENCRYPTION_KEY=REPLACE_WITH_64_RANDOM_HEX_CHARACTERS
# Set this to the exact number of trusted reverse-proxy hops for your host.
POSTMCPAI_TRUST_PROXY_HOPS=1
```

Set actual secrets in your host's secret manager. Generate a 32-byte encryption
key with `openssl rand -hex 32`. Use a restricted MongoDB database user and TLS.
Keep the same encryption key across replicas and restarts. Replacing it makes
existing encrypted grants and client registrations unreadable: plan a controlled
reconnection migration instead of silently rotating it. MongoDB holds encrypted
payloads, hashed token lookup keys, atomic redemption flags and TTL indexes.
Database availability is checked before HTTP startup when OAuth is enabled.

Leave `POSTMCPAI_API_KEY` unset on a shared remote server. It is only a stdio
credential now; remote requests must supply their own key or OAuth token.
Without all three OAuth settings, OAuth is either disabled (all unset) or startup
fails (partial configuration). The server never advertises dummy OAuth.

The existing MCP HTTP transport has in-memory sessions. Run one instance, or
configure session affinity for `/mcp`; OAuth data can be shared across replicas,
but transport sessions cannot. A server restart requires clients to reconnect.
Apply your ingress limits in addition to the SDK's per-process endpoint limits
when running multiple replicas. Do not enable request-body logging or full
query-string logging at the reverse proxy: legacy API-key URLs contain secrets.

## Discovery and client registration

- MCP endpoint and audience: `https://mcp.postmcpai.com/mcp`
- Authorization server metadata: `/.well-known/oauth-authorization-server`
- Resource metadata: `/.well-known/oauth-protected-resource/mcp` (root alias too)
- Endpoints: `/oauth/authorize`, `/oauth/register`, `/oauth/token`, `/oauth/revoke`
- Grant types: authorization code with S256 PKCE; rotating refresh tokens
- Scope: `mcp` (all existing tools within the user's backend permissions)
- Client authentication: public (`none`) or `client_secret_post`
- Registration: DCR; CIMD and `private_key_jwt` are not advertised or implemented

Default callbacks allow the documented ChatGPT stable and connection-specific
paths and HTTP loopback callbacks for native MCP clients. Other clients require
`POSTMCPAI_OAUTH_REDIRECT_ORIGINS` as comma-separated, trusted HTTPS origins.
Registration stores exact redirect URIs; authorization matches them, with only
the native loopback port exception defined by the SDK. Do not add arbitrary
third-party origins. Registered clients do not expire automatically.

## Security behavior

- Five-minute single-use codes, tied to client, redirect, audience and PKCE.
- Ten-minute browser consent requests bound to a secure HttpOnly cookie, with
  same-origin POST validation, explicit Allow/Cancel, escaping and no framing.
- One-hour access tokens and rotating refresh tokens, within a 30-day grant.
  Reusing a refresh token revokes its entire grant. Client-authenticated token
  revocation invalidates all access and refresh tokens for the same grant.
- API keys and client secrets use AES-256-GCM at rest; tokens are indexed by hash.
- Every MCP and REST tool request revalidates the underlying key with PostMCP,
  so key rotation invalidates existing OAuth access. Tokens never cross into
  backend API authentication; the server resolves them to the encrypted key.
- HTTP sessions bind to the underlying API key and recheck credentials on POST,
  GET and DELETE. An unauthenticated request never falls back to a shared key.
- Logs omit query strings, request bodies and credentials.

The broad `mcp` scope intentionally includes publishing, deletion and credit
spending; consent lists these actions. Finer scopes can be added later only with
matching tool-level enforcement. Social network sign-in still takes place in
PostMCP's dashboard, and the backend continues to enforce workspace membership.

## Verification and rollout

Run `npm test` (includes SDK HTTP clients and an isolated real MongoDB test when
`mongod` is installed), then `npm run package:plugin`. No test posts to real social
accounts. Tests use generated test credentials and an isolated database.

After deploying, verify metadata now advertises only S256 (no `plain`), and that
an unauthenticated `/mcp` call returns 401 with the resource metadata challenge.
Install the private plugin, choose Connect, authorize your own account, then run
`get_user_info`, `get_connected_accounts`, and stored analytics. Check scheduling
with a reviewed test post only when explicitly approved. Finally verify an
existing API-key client still works. Saving the plugin ZIP does not deploy code
or complete this live connection test.

The supplied hosted endpoint was inspected on September 30, 2026: it still
advertised the previous placeholder OAuth metadata. This source release requires
server deployment before the new OAuth connection can work there.

## Research

- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/codex/mcp
- https://modelcontextprotocol.io/specification/latest/basic/authorization

The installed MCP SDK supplies protocol parsing, client authentication, PKCE
verification, redirect matching and endpoint rate limits. The application layer
supplies explicit consent, persistent grants, encrypted credentials, resource
binding and revocation. ChatGPT supports this DCR OAuth flow; it cannot present
a different custom API key for each customer through a hosted MCP plugin.
