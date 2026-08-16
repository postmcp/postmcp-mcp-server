import { config } from "./config.js";

/**
 * Extracts the API key from request query parameters, custom headers, or Authorization headers.
 *
 * @param {import("express").Request} req - Express request object
 * @returns {string|null} The extracted API key or null if not found
 */
export const extractApiKey = (req) => {
  if (!req) return null;

  // Check query parameter variations
  const queryKey = req.query?.apikey || req.query?.apiKey || req.query?.api_key || req.query?.key;
  if (queryKey) return String(queryKey).trim();

  // Check custom header
  const headerKey = req.headers?.["x-api-key"];
  if (headerKey) return String(headerKey).trim();

  // Check Authorization header
  const authHeader = req.headers?.authorization;
  if (authHeader) {
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token && token !== "dummy_access_token") {
        return token;
      }
    } else if (authHeader !== "dummy_access_token") {
      return authHeader.trim();
    }
  }

  return null;
};

/**
 * Extracts the workspace (project) id a request wants to act on.
 *
 * An API key authenticates a person, not a workspace, and most people on a paid
 * plan have more than one. Without this the backend silently falls back to the
 * first workspace the caller owns, which is how a post meant for a client's
 * workspace ends up on the agency's own accounts.
 *
 * @param {import("express").Request} req - Express request object
 * @returns {string|null} The extracted workspace id or null if not specified
 */
export const extractProjectId = (req) => {
  if (!req) return null;

  const queryProject =
    req.query?.projectId || req.query?.project_id || req.query?.workspaceId || req.query?.workspace_id;
  if (queryProject) return String(queryProject).trim();

  const headerProject = req.headers?.["x-project-id"];
  if (headerProject) return String(headerProject).trim();

  return null;
};

/**
 * Retrieves the API configuration (API key and target API URL).
 *
 * @param {string|null} customApiKey - Optional custom API key override
 * @returns {{ apiKey: string, apiUrl: string }}
 */
export const getApiConfig = (customApiKey = null) => {
  const apiKey = customApiKey || process.env.POSTMCPAI_API_KEY;
  const apiUrl = config.apiUrl;

  if (!apiKey) {
    throw new Error(
      "Missing POSTMCPAI_API_KEY. Please provide your API key in the environment variable POSTMCPAI_API_KEY or connection URL query parameter (e.g. /mcp?apikey=YOUR_KEY)"
    );
  }

  return { apiKey, apiUrl };
};

/**
 * Makes an authenticated HTTP request to the PostMCP AI backend API.
 *
 * @param {string} path - Endpoint path (e.g. /auth/user-data)
 * @param {string} [method="GET"] - HTTP method
 * @param {object|null} [body=null] - Request body object
 * @param {string|null} [customApiKey=null] - Optional API key override
 * @param {string|null} [projectId=null] - Workspace to act on; omit for the caller's default
 * @returns {Promise<any>} Response JSON data
 */
export const makeBackendRequest = async (
  path,
  method = "GET",
  body = null,
  customApiKey = null,
  projectId = null
) => {
  const { apiKey, apiUrl } = getApiConfig(customApiKey);
  const url = `${apiUrl}${path}`;
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };

  // Every project-scoped backend route reads this header; sending it empty
  // would resolve to a workspace named "" rather than falling back, so it is
  // only attached when a workspace was actually chosen.
  const workspaceId = projectId || config.projectId;
  if (workspaceId) {
    options.headers["x-project-id"] = String(workspaceId);
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || `API Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`[PostMCP HTTP Error] Failed request to ${path}:`, error.message);
    throw error;
  }
};
