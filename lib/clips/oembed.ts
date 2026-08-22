import type { ParsedClipUrl, Platform } from "./platform";

export type ClipMetadata = {
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
};

/** Thrown when a clip URL cannot be confirmed to exist / be public. */
export class ClipLookupError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "not_found"
      | "rate_limited"
      | "not_configured"
      | "needs_review"
      | "unavailable" = "unavailable",
  ) {
    super(message);
    this.name = "ClipLookupError";
  }
}

const TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Always hit the provider: existence is what we are checking.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * TikTok exposes a public, key-less oEmbed endpoint. A 400 means the video does
 * not exist (or is private), which doubles as our existence check.
 */
async function lookupTikTok(canonicalUrl: string): Promise<ClipMetadata> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;

  // TikTok throttles this endpoint per source IP and recovers quickly, so a
  // couple of short retries turn most 429s into a successful save.
  let status = 0;
  let body: unknown = null;
  for (const delayMs of [0, 1500, 4000]) {
    if (delayMs) await sleep(delayMs);
    ({ status, body } = await getJson(endpoint));
    if (status !== 429) break;
  }

  if (status === 429) {
    throw new ClipLookupError(
      "TikTok is rate limiting thumbnail lookups right now. Try again in a minute.",
      "rate_limited",
    );
  }
  if (status === 400 || status === 404) {
    throw new ClipLookupError(
      "TikTok could not find that video. Check the link is public and correct.",
      "not_found",
    );
  }
  if (status !== 200 || !body || typeof body !== "object") {
    throw new ClipLookupError(
      `TikTok returned an unexpected response (HTTP ${status}).`,
    );
  }

  const data = body as Record<string, unknown>;
  return {
    title: str(data.title),
    authorName: str(data.author_name),
    thumbnailUrl: str(data.thumbnail_url),
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?64;/g, "@")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type ScrapeResult =
  | { status: "found"; metadata: ClipMetadata }
  | { status: "missing" }
  | { status: "error" };

/**
 * Reads the thumbnail out of Instagram's embed page.
 *
 * Instagram's normal reel page is a JavaScript shell with no image, and it
 * answers HTTP 200 even for reels that do not exist. The *embed* page behaves
 * differently: for a simple (non-browser) user agent it is server rendered and
 * contains an `EmbeddedMediaImage` tag. A reel that does not exist renders the
 * same page without that tag, which makes this an existence check too.
 */
async function scrapeInstagramEmbed(canonicalUrl: string): Promise<ScrapeResult> {
  const shortcode = canonicalUrl.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1];
  if (!shortcode) return { status: "error" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(
      `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
      {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          // A browser UA gets the client-rendered shell; a plain one gets the
          // server-rendered embed that actually carries the image.
          "user-agent": "curl/8.5.0",
          accept: "text/html",
        },
      },
    );
    if (!res.ok) return { status: "error" };
    html = await res.text();
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }

  const tag = html.match(/class="EmbeddedMediaImage"[^>]*>/)?.[0];
  if (!tag) return { status: "missing" };

  const src = tag.match(/src="([^"]+)"/)?.[1];
  if (!src) return { status: "missing" };

  // alt reads "Instagram post shared by @handle", where the @ arrives as the
  // HTML entity &#064; — so decode before matching.
  const handle = decodeEntities(tag).match(
    /alt="[^"]*?@([A-Za-z0-9._]+)/,
  )?.[1];

  let caption = html
    .match(/class="Caption"[^>]*>([\s\S]{0,800}?)<\/div>/)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  caption = caption ? decodeEntities(caption) : undefined;

  // The rendered caption is prefixed with the poster's handle; drop it so the
  // title reads as the caption alone.
  if (caption && handle && caption.toLowerCase().startsWith(handle.toLowerCase())) {
    caption = caption.slice(handle.length).trim();
  }

  return {
    status: "found",
    metadata: {
      title: caption ? caption.slice(0, 300) : null,
      authorName: handle ? `@${handle}` : null,
      thumbnailUrl: decodeEntities(src),
    },
  };
}

/**
 * Prefers Meta's official oEmbed endpoint, which requires the app to be approved
 * for "oEmbed Read" via App Review. Until (or unless) that approval exists,
 * falls back to reading Instagram's own embed page.
 */
async function lookupInstagram(canonicalUrl: string): Promise<ClipMetadata> {
  const apiError = await tryMetaOEmbed(canonicalUrl);
  if (!(apiError instanceof ClipLookupError)) return apiError;

  const scraped = await scrapeInstagramEmbed(canonicalUrl);
  if (scraped.status === "found") return scraped.metadata;
  if (scraped.status === "missing") {
    throw new ClipLookupError(
      "Instagram could not find that reel. Check the link is public and correct.",
      "not_found",
    );
  }
  // The embed page was unreachable, so report whatever the API said.
  throw apiError;
}

/** Returns metadata on success, or the ClipLookupError describing the failure. */
async function tryMetaOEmbed(
  canonicalUrl: string,
): Promise<ClipMetadata | ClipLookupError> {
  const appId = process.env.META_APP_ID;
  const clientToken = process.env.META_CLIENT_TOKEN;

  if (!appId || !clientToken) {
    return new ClipLookupError(
      "Instagram lookups need META_APP_ID and META_CLIENT_TOKEN to be set.",
      "not_configured",
    );
  }

  const params = new URLSearchParams({
    url: canonicalUrl,
    access_token: `${appId}|${clientToken}`,
    fields: "thumbnail_url,author_name,title",
    omitscript: "true",
  });
  const endpoint = `https://graph.facebook.com/v21.0/instagram_oembed?${params}`;
  const { status, body } = await getJson(endpoint);
  const data = (body ?? {}) as Record<string, unknown>;

  if (status === 200) {
    return {
      title: str(data.title),
      authorName: str(data.author_name),
      thumbnailUrl: str(data.thumbnail_url),
    };
  }

  const error = (data.error ?? {}) as Record<string, unknown>;
  const message = str(error.message) ?? `HTTP ${status}`;
  const code = typeof error.code === "number" ? error.code : null;

  // Code 10 means the app itself is not cleared to call the endpoint. Meta gates
  // "oEmbed Read" behind App Review, so this is a setup state rather than a
  // problem with the pasted link — check it before the generic 400 handling.
  if (code === 10) {
    return new ClipLookupError(
      "This Meta app is not approved for Instagram oEmbed ('oEmbed Read' needs " +
        "App Review), so the official API cannot be used.",
      "needs_review",
    );
  }

  // 24 / 100 come back for URLs Instagram cannot resolve to a public post.
  if (status === 400 || status === 404 || code === 24 || code === 100) {
    return new ClipLookupError(
      "Instagram could not find that reel. Check the link is public and correct.",
      "not_found",
    );
  }
  if (status === 429 || code === 4 || code === 32) {
    return new ClipLookupError(
      "Instagram is rate limiting thumbnail lookups right now. Try again shortly.",
      "rate_limited",
    );
  }
  if (status === 401 || status === 403 || code === 190) {
    return new ClipLookupError(
      `Instagram rejected the Meta app credentials: ${message}`,
      "not_configured",
    );
  }
  return new ClipLookupError(`Instagram lookup failed: ${message}`);
}

const LOOKUPS: Record<Platform, (url: string) => Promise<ClipMetadata>> = {
  tiktok: lookupTikTok,
  instagram: lookupInstagram,
};

/** Confirms the clip exists and returns whatever metadata the provider offers. */
export function lookupClipMetadata(parsed: ParsedClipUrl): Promise<ClipMetadata> {
  return LOOKUPS[parsed.platform](parsed.canonicalUrl);
}
