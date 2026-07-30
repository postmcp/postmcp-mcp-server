import { makeBackendRequest } from "../client.js";

/**
 * Handles execution of an MCP tool call by name and arguments.
 *
 * @param {string} name - Name of the tool to execute
 * @param {object} args - Arguments passed to the tool
 * @param {Function} getApiKey - Function returning the API key to use for backend calls
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>}
 */
export const handleToolCall = async (name, args, getApiKey) => {
  const callBackend = (path, method = "GET", body = null) => {
    const apiKey = typeof getApiKey === "function" ? getApiKey() : getApiKey;
    return makeBackendRequest(path, method, body, apiKey);
  };

  try {
    switch (name) {
      case "get_user_info": {
        const data = await callBackend("/auth/user-data");
        const userInfo = {
          name: data.name,
          email: data.email,
          plan: data.plan,
          credits: data.credits,
          aiToken: data.aiToken,
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(userInfo, null, 2),
            },
          ],
        };
      }

      case "get_connected_accounts": {
        const data = await callBackend("/auth/user-data");
        const connected = [];
        if (data.connectedAccounts) {
          for (const [platform, accounts] of Object.entries(data.connectedAccounts)) {
            if (Array.isArray(accounts)) {
              accounts.forEach((acc) => {
                if (acc.connected) {
                  connected.push({
                    platform,
                    username: acc.username,
                    name: acc.name,
                    profileId: acc.profileId,
                    isOrganization: acc.isOrganization || false,
                  });
                }
              });
            }
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(connected, null, 2),
            },
          ],
        };
      }

      case "list_posts": {
        const posts = await callBackend("/post/list");
        const list = posts.map((p) => ({
          id: p._id,
          content: p.content,
          platforms: p.platforms,
          status: p.status,
          scheduleDate: p.scheduleDate,
          scheduleTime: p.scheduleTime,
          mediaUrl: p.mediaUrl,
          platformStatuses: p.platformStatuses,
          createdAt: p.createdAt,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(list, null, 2),
            },
          ],
        };
      }

      case "create_post": {
        const payload = {
          content: args.content,
          platforms: args.platforms,
          targetAccounts: args.targetAccounts,
          publishImmediately: args.publishImmediately ?? false,
          scheduleDate: args.scheduleDate || "",
          scheduleTime: args.scheduleTime || "",
          mediaUrl: args.mediaUrl || "",
          imageData: args.imageData || null,
        };
        const result = await callBackend("/post/create", "POST", payload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "publish_post_now": {
        const result = await callBackend(`/post/${args.id}/publish-now`, "POST");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "delete_post": {
        const result = await callBackend(`/post/${args.id}`, "DELETE");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "update_post": {
        const payload = {};
        if (args.content !== undefined) payload.content = args.content;
        if (args.platforms !== undefined) payload.platforms = args.platforms;
        if (args.scheduleDate !== undefined) payload.scheduleDate = args.scheduleDate;
        if (args.scheduleTime !== undefined) payload.scheduleTime = args.scheduleTime;
        if (args.status !== undefined) payload.status = args.status;

        const result = await callBackend(`/post/${args.id}`, "PUT", payload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool '${name}': ${error.message}`,
        },
      ],
    };
  }
};
