/**
 * Platform facts shared by the tool definitions and the local pre-flight check.
 *
 * These mirror the backend's own rules (see backend/controller/post.controller.js)
 * so a caller can be told a post will be rejected before it spends a credit on
 * finding out.
 */

export const PLATFORMS = ["linkedin", "twitter", "facebook", "instagram", "threads", "bluesky"];

/** Hard character ceiling each network enforces on post copy. */
export const CHARACTER_LIMITS = {
  twitter: 280,
  bluesky: 300,
  threads: 500,
  instagram: 2200,
  linkedin: 3000,
  facebook: 63206,
};

/** Networks that will not accept a post without an image or video attached. */
export const MEDIA_REQUIRED = ["instagram"];

/** Credits charged per profile delivered to. Mirrors CREDITS_PER_DELIVERY. */
export const CREDITS_PER_DELIVERY = { twitter: 5, default: 1 };

/** Flat surcharge, charged once, on a post whose copy contains a link. */
export const LINK_SURCHARGE_CREDITS = 50;

const LINK_PATTERN = /https?:\/\/[^\s]+/;

/**
 * Credit cost of one post, priced per delivery.
 *
 * @param {string} content
 * @param {Array<{platform: string}|string>} targets One entry per delivery.
 * @returns {number}
 */
export const calculatePostCredits = (content, targets) => {
  let cost = 0;

  if (Array.isArray(targets)) {
    targets.forEach((entry) => {
      const platform = (typeof entry === "string" ? entry : entry?.platform || "").toLowerCase();
      if (!platform) return;
      const isX = platform === "x" || platform === "twitter" || platform === "x/twitter";
      cost += isX ? CREDITS_PER_DELIVERY.twitter : CREDITS_PER_DELIVERY.default;
    });
  }

  if (LINK_PATTERN.test(content || "")) {
    cost += LINK_SURCHARGE_CREDITS;
  }

  return cost;
};

/** Whether the copy carries a link, which is what triggers the surcharge. */
export const containsLink = (content) => LINK_PATTERN.test(content || "");
