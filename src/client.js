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
 * @returns {Promise<any>} Response JSON data
 */
export const makeBackendRequest = async (path, method = "GET", body = null, customApiKey = null) => {
  const { apiKey, apiUrl } = getApiConfig(customApiKey);
  const url = `${apiUrl}${path}`;
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };

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
