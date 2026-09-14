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

/**
 * How many pieces of media one post may carry on each network, and whether a
 * set of several may include video. Mirrors the backend's MEDIA_SET_LIMITS.
 *
 * Two or more items publish as a carousel on Instagram and Threads, a
 * multi-photo post on Facebook and LinkedIn, and a gallery of up to four on X
 * and Bluesky. Only the two Meta carousels mix video into the set; everywhere
 * else a video goes out on its own. YouTube takes one file, full stop.
 */
export const MEDIA_SET_LIMITS = {
  instagram: { max: 10, mixedVideo: true, note: "carousel of 2-10 photos or videos" },
  threads: { max: 20, mixedVideo: true, note: "carousel of 2-20 photos or videos" },
  facebook: { max: 10, mixedVideo: false, note: "up to 10 photos in one post" },
  linkedin: { max: 20, mixedVideo: false, note: "up to 20 images in one post" },
  twitter: { max: 4, mixedVideo: false, note: "up to 4 images, or one video" },
  bluesky: { max: 4, mixedVideo: false, note: "up to 4 images, or one video" },
  youtube: { max: 1, mixedVideo: false, note: "one video per upload" },
};

/** The most items any network takes in one post. */
export const MAX_MEDIA_ITEMS = Math.max(...Object.values(MEDIA_SET_LIMITS).map((limit) => limit.max));

/**
 * The ordered set of media a call is attaching: `mediaUrls` when it says
 * anything, else `mediaUrl` as a one-item set. Blanks and repeats dropped.
 *
 * @param {{mediaUrls?: unknown, mediaUrl?: unknown}} input
 * @returns {string[]}
 */
export const mediaSetOf = ({ mediaUrls, mediaUrl } = {}) => {
  const fromSet = Array.isArray(mediaUrls)
    ? mediaUrls.filter((url) => typeof url === "string" && url.trim()).map((url) => url.trim())
    : [];
  const list = fromSet.length ? fromSet : typeof mediaUrl === "string" && mediaUrl.trim() ? [mediaUrl.trim()] : [];
  return [...new Set(list)];
};

/**
 * Why a network would refuse this set of media, or '' if it would take it.
 * Mirrors the backend's check so preflight says what create_post will say.
 *
 * @param {string} platform
 * @param {string[]} mediaUrls
 */
export const mediaSetProblem = (platform, mediaUrls = []) => {
  const urls = (Array.isArray(mediaUrls) ? mediaUrls : []).filter(Boolean);
  if (urls.length <= 1) return "";

  const limit = MEDIA_SET_LIMITS[platform];
  if (!limit) return "";

  if (limit.max <= 1) {
    return `${platform} takes ${limit.note}; this post attaches ${urls.length} files.`;
  }
  if (urls.length > limit.max) {
    return `${platform} takes ${limit.note}; this post attaches ${urls.length}. Remove ${urls.length - limit.max}.`;
  }
  if (!limit.mixedVideo && urls.some((url) => isVideoUrl(url))) {
    return `${platform} takes ${limit.note} - it will not mix video into a set of several. Attach one video on its own, or images only.`;
  }
  return "";
};

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
