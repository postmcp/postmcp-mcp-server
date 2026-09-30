import { config } from '../config.js';
import { extractApiKey } from '../client.js';
import { digest } from './store.js';

export async function validateApiKey(apiKey) {
  if (typeof apiKey !== 'string' || !/^pmcp_sec_[A-Za-z0-9_-]{16,}$/.test(apiKey)) throw new Error('Invalid API key');
  const response = await fetch(`${config.apiUrl}/auth/user-data`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000), redirect: 'error',
  });
  // Consume the response without logging account data or credentials.
  await response.arrayBuffer();
  if (!response.ok) throw new Error('Invalid API key');
}

export function authenticateRequest(provider, validate = validateApiKey) {
  return async (req, res, next) => {
    try {
      const credential = extractApiKey(req);
      if (!credential) throw new Error('Missing credential');
      let apiKey = credential;
      if (credential.startsWith('pmcp_at_')) {
        // OAuth bearer credentials are only accepted in Authorization.
        if (!provider || req.headers.authorization !== `Bearer ${credential}` || Object.keys(req.query).some((key) => ['apikey', 'apiKey', 'api_key', 'key'].includes(key)) || req.headers['x-api-key']) throw new Error('Invalid OAuth transport');
        apiKey = (await provider.verifyAccessToken(credential)).extra.apiKey;
      }
      // Revalidation on every request makes key rotation revoke OAuth access
      // and prevents the server's environment key from authenticating guests.
      await validate(apiKey);
      req.postmcpAuth = { apiKey, principal: digest(apiKey) };
      next();
    } catch {
      const challenge = provider
        ? `Bearer resource_metadata="${provider.issuer}/.well-known/oauth-protected-resource/mcp", scope="mcp"`
        : 'Bearer realm="PostMCP AI"';
      res.set('WWW-Authenticate', challenge).status(401).json({ error: 'unauthorized', message: 'Connect your PostMCP account or supply a valid API key.' });
    }
  };
}
