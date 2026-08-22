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

/**
 * Instagram has no public oEmbed endpoint: scraping the page returns a
 * JavaScript shell with no image and HTTP 200 even for links that do not exist.
 * The official Meta oEmbed Read API is therefore the only way to both confirm
 * the reel exists and obtain a thumbnail.
 */
async function lookupInstagram(canonicalUrl: string): Promise<ClipMetadata> {
  const appId = process.env.META_APP_ID;
  const clientToken = process.env.META_CLIENT_TOKEN;

  if (!appId || !clientToken) {
    throw new ClipLookupError(
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
    throw new ClipLookupError(
      "This Meta app is not approved for Instagram oEmbed yet, so the reel " +
        "cannot be verified or thumbnailed. Submit the 'Meta oEmbed Read' " +
        "feature for App Review to enable it.",
      "needs_review",
    );
  }

  // 24 / 100 come back for URLs Instagram cannot resolve to a public post.
  if (status === 400 || status === 404 || code === 24 || code === 100) {
    throw new ClipLookupError(
      "Instagram could not find that reel. Check the link is public and correct.",
      "not_found",
    );
  }
  if (status === 429 || code === 4 || code === 32) {
    throw new ClipLookupError(
      "Instagram is rate limiting thumbnail lookups right now. Try again shortly.",
      "rate_limited",
    );
  }
  if (status === 401 || status === 403 || code === 190) {
    throw new ClipLookupError(
      `Instagram rejected the Meta app credentials: ${message}`,
      "not_configured",
    );
  }
  throw new ClipLookupError(`Instagram lookup failed: ${message}`);
}

const LOOKUPS: Record<Platform, (url: string) => Promise<ClipMetadata>> = {
  tiktok: lookupTikTok,
  instagram: lookupInstagram,
};

/** Confirms the clip exists and returns whatever metadata the provider offers. */
export function lookupClipMetadata(parsed: ParsedClipUrl): Promise<ClipMetadata> {
  return LOOKUPS[parsed.platform](parsed.canonicalUrl);
}
