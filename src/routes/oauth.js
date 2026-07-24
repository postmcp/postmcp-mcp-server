import express from "express";
import { randomUUID } from "node:crypto";

const router = express.Router();

// In-memory store for issued auth codes -> PKCE challenges
const pendingAuthCodes = new Map();

const getBaseUrl = (req) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
};

const getProtectedResourceMetadata = (req) => {
  const baseUrl = getBaseUrl(req);
  return {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ["openid", "mcp"],
    bearer_methods_supported: ["header"],
  };
};

// NOTE: Claude.ai's OAuth client requires PKCE (RFC 7636) to be advertised.
const getOauthMetadata = (req) => {
  const baseUrl = getBaseUrl(req);
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    scopes_supported: ["openid", "mcp"],
    code_challenge_methods_supported: ["S256", "plain"],
    subject_types_supported: ["public"],
  };
};

router.use("/.well-known/oauth-protected-resource", (req, res) => {
  console.error("[PostMCP OAuth]: Protected resource metadata requested");
  res.json(getProtectedResourceMetadata(req));
});

router.use("/.well-known/oauth-authorization-server", (req, res) => {
  res.json(getOauthMetadata(req));
});

router.use("/.well-known/openid-configuration", (req, res) => {
  res.json(getOauthMetadata(req));
});

router.post("/oauth/register", express.json(), (req, res) => {
  console.error("[PostMCP OAuth]: Dynamic client registration received:", req.body);
  const redirectUris = req.body?.redirect_uris || ["https://claude.ai/api/mcp/auth_callback"];
  const now = Math.floor(Date.now() / 1000);

  res.status(201).json({
    client_id: "postmcp_dummy_client_id",
    client_secret: "postmcp_dummy_client_secret",
    client_id_issued_at: now,
    client_secret_expires_at: 0,
    client_name: req.body?.client_name || "Claude",
    redirect_uris: redirectUris,
    grant_types: req.body?.grant_types || ["authorization_code", "refresh_token"],
    response_types: req.body?.response_types || ["code"],
    token_endpoint_auth_method: req.body?.token_endpoint_auth_method || "client_secret_post",
    scope: req.body?.scope || "openid mcp",
  });
});

router.get("/oauth/authorize", (req, res) => {
  const redirectUri = req.query.redirect_uri || "https://claude.ai/api/mcp/auth_callback";
  const state = req.query.state || "";
  const codeChallenge = req.query.code_challenge || null;
  const codeChallengeMethod = req.query.code_challenge_method || null;

  const code = `dummy_auth_code_${randomUUID()}`;
  pendingAuthCodes.set(code, {
    codeChallenge,
    codeChallengeMethod,
    createdAt: Date.now(),
  });

  console.error(
    `[PostMCP OAuth]: Authorize request received (PKCE: ${codeChallengeMethod || "none"}). Auto-redirecting to:`,
    redirectUri
  );

  const targetUrl = new URL(redirectUri);
  targetUrl.searchParams.set("code", code);
  if (state) targetUrl.searchParams.set("state", state);
  res.redirect(targetUrl.toString());
});

router.post("/oauth/token", express.json(), express.urlencoded({ extended: true }), (req, res) => {
  const body = { ...req.query, ...req.body };
  console.error("[PostMCP OAuth]: Token exchange request received", {
    grant_type: body.grant_type,
    has_code_verifier: Boolean(body.code_verifier),
  });

  if (body.code) {
    pendingAuthCodes.delete(body.code);
  }

  res.json({
    access_token: "dummy_access_token",
    token_type: "Bearer",
    expires_in: 3600 * 24 * 365,
    refresh_token: "dummy_refresh_token",
    scope: "openid mcp",
  });
});

export default router;
