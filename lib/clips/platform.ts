export const PLATFORMS = ["instagram", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

export type ParsedClipUrl = {
  platform: Platform;
  /** Normalised URL we store and hand to the oEmbed providers. */
  canonicalUrl: string;
  /** Native post/video id, when the URL exposes one. Used to de-duplicate. */
  externalId: string | null;
  /** True when the input was a share/short link that must be redirected first. */
  isShortLink: boolean;
};

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

/** Instagram shortcodes are base64-ish and at least 5 characters long. */
const IG_SHORTCODE = /^[A-Za-z0-9_-]{5,}$/;
const TIKTOK_VIDEO_ID = /^\d{6,}$/;

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept bare "instagram.com/reel/..." pastes.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hostOf(url: URL) {
  return url.hostname.toLowerCase();
}

export function detectPlatform(input: string): Platform | null {
  const url = toUrl(input);
  if (!url) return null;
  const host = hostOf(url);
  if (INSTAGRAM_HOSTS.has(host)) return "instagram";
  if (TIKTOK_HOSTS.has(host)) return "tiktok";
  return null;
}

function parseInstagram(url: URL): ParsedClipUrl | null {
  const segments = url.pathname.split("/").filter(Boolean);

  // Share links (/share/..., /share/reel/...) only resolve via a redirect.
  if (segments[0] === "share") {
    return {
      platform: "instagram",
      canonicalUrl: url.toString(),
      externalId: null,
      isShortLink: true,
    };
  }

  // Match /reel/<code>, /reels/<code>, /p/<code>, /tv/<code> at any depth so
  // profile-prefixed URLs (/<user>/reel/<code>) work too.
  const kinds = new Set(["reel", "reels", "p", "tv"]);
  for (let i = 0; i < segments.length - 1; i++) {
    if (kinds.has(segments[i].toLowerCase())) {
      const code = segments[i + 1];
      if (IG_SHORTCODE.test(code)) {
        return {
          platform: "instagram",
          canonicalUrl: `https://www.instagram.com/reel/${code}/`,
          externalId: code,
          isShortLink: false,
        };
      }
    }
  }
  return null;
}

function parseTikTok(url: URL): ParsedClipUrl | null {
  const host = hostOf(url);
  const segments = url.pathname.split("/").filter(Boolean);

  // vm./vt. hosts and /t/<code> are short links needing a redirect.
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return {
      platform: "tiktok",
      canonicalUrl: url.toString(),
      externalId: null,
      isShortLink: true,
    };
  }
  if (segments[0] === "t" && segments[1]) {
    return {
      platform: "tiktok",
      canonicalUrl: url.toString(),
      externalId: null,
      isShortLink: true,
    };
  }

  // /@user/video/<id> and /@user/photo/<id>
  const idx = segments.findIndex(
    (s) => s.toLowerCase() === "video" || s.toLowerCase() === "photo",
  );
  if (idx > 0 && segments[idx + 1]) {
    const id = segments[idx + 1].split("?")[0];
    const user = segments[idx - 1];
    if (TIKTOK_VIDEO_ID.test(id) && user.startsWith("@")) {
      return {
        platform: "tiktok",
        canonicalUrl: `https://www.tiktok.com/${user}/video/${id}`,
        externalId: id,
        isShortLink: false,
      };
    }
  }
  return null;
}

/**
 * Parses a pasted Instagram/TikTok link. Returns null when the URL is not a
 * recognisable clip link on a supported platform.
 */
export function parseClipUrl(input: string): ParsedClipUrl | null {
  const url = toUrl(input);
  if (!url) return null;
  const host = hostOf(url);
  if (INSTAGRAM_HOSTS.has(host)) return parseInstagram(url);
  if (TIKTOK_HOSTS.has(host)) return parseTikTok(url);
  return null;
}

/**
 * Follows a short/share link to its destination and re-parses it. Falls back to
 * the original parse result when the redirect cannot be resolved.
 */
export async function resolveClipUrl(
  parsed: ParsedClipUrl,
  signal?: AbortSignal,
): Promise<ParsedClipUrl> {
  if (!parsed.isShortLink) return parsed;

  try {
    const res = await fetch(parsed.canonicalUrl, {
      redirect: "follow",
      signal,
      headers: {
        // Short-link hosts return the redirect only for browser-ish clients.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    const resolved = parseClipUrl(res.url);
    if (resolved && !resolved.isShortLink) return resolved;
  } catch {
    // Network failure: fall through and let the caller surface a clear error.
  }
  return parsed;
}
