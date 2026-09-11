/**
 * Platform facts shared by the tool definitions and the local pre-flight check.
 *
 * These mirror the backend's own rules (see backend/controller/post.controller.js)
 * so a caller can be told a post will be rejected before it spends a credit on
 * finding out.
 */

export const PLATFORMS = ["linkedin", "twitter", "facebook", "instagram", "threads", "bluesky", "youtube"];

/**
 * Hard character ceiling each network enforces on post copy.
 *
 * YouTube's is the description limit. Its other limit - 100 characters on the
 * title - is not a ceiling on the copy, because the title is taken from the
 * first line and truncated rather than rejected; `TITLE_FROM_FIRST_LINE` is
 * what tells a caller that first line matters more than the rest.
 */
export const CHARACTER_LIMITS = {
  twitter: 280,
  bluesky: 300,
  threads: 500,
  instagram: 2200,
  linkedin: 3000,
  youtube: 5000,
  facebook: 63206,
};

/** Networks that will not accept a post without an image or video attached. */
export const MEDIA_REQUIRED = ["instagram", "youtube"];

/** Networks that need the media to be a video specifically, not an image. */
export const VIDEO_REQUIRED = ["youtube"];

/**
 * What each network will accept as video. Every platform here takes video now,
 * but on wildly different terms - Bluesky stops at 60 seconds where LinkedIn
 * runs to 30 minutes - and the same clip cross-posted everywhere is rejected by
 * whichever network has the tightest limit. Duration cannot be checked without
 * decoding the file, so these are reported to the caller rather than enforced.
 */
export const VIDEO_LIMITS = {
  twitter: { maxSeconds: 140, maxMB: 512, note: "up to 2m20s and 512MB" },
  linkedin: { maxSeconds: 1800, maxMB: 200, note: "up to 30 minutes and 200MB" },
  facebook: { maxSeconds: 14400, maxMB: 10240, note: "up to 4 hours" },
  instagram: { maxSeconds: 900, maxMB: 1024, note: "Reels, up to 15 minutes" },
  threads: { maxSeconds: 300, maxMB: 1024, note: "up to 5 minutes" },
  bluesky: { maxSeconds: 60, maxMB: 50, note: "up to 60 seconds and 50MB" },
  youtube: { maxSeconds: 180, maxMB: 256, note: "Shorts: vertical, up to 3 minutes and 256MB" },
};

/** Networks whose title is taken from the first line of the copy. */
export const TITLE_FROM_FIRST_LINE = { youtube: 100 };

const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|avi|mpe?g|wmv|flv|3gpp?)(\?.*)?$/i;

/** Whether a media URL points at something a video-only network will take. */
export const isVideoUrl = (mediaUrl) => VIDEO_PATTERN.test(String(mediaUrl || ""));

/** Credits charged per profile delivered to. Mirrors CREDITS_PER_DELIVERY. */
export const CREDITS_PER_DELIVERY = { twitter: 5, default: 1 };

/** Flat surcharge, charged once, on a post whose copy contains a link. */
export const LINK_SURCHARGE_CREDITS = 50;

/**
 * Credits charged per get_post_analytics call. Charged per call, whether the
 * numbers come fresh from the networks or from the stored snapshot; the
 * figures carried on list_posts and the workspace summary are free.
 */
export const ANALYTICS_CREDITS_PER_CALL = 1;

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
