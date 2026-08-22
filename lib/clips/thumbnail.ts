import sharp from "sharp";

export type Thumbnail = {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
};

/**
 * Reels are portrait, so bounding the long edge keeps 9:16 art crisp on a card
 * while landing around 15-25 KB per row in Postgres.
 */
const MAX_WIDTH = 400;
const MAX_HEIGHT = 720;
const WEBP_QUALITY = 72;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Downloads a provider thumbnail and re-encodes it as a small WebP. */
export async function buildThumbnail(sourceUrl: string): Promise<Thumbnail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let source: Buffer;
  try {
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        // CDN edges are picky about a missing UA.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      throw new Error(`thumbnail download failed with HTTP ${res.status}`);
    }

    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_SOURCE_BYTES) {
      throw new Error("thumbnail source is unexpectedly large");
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) {
      throw new Error("thumbnail source is unexpectedly large");
    }
    source = buffer;
  } finally {
    clearTimeout(timer);
  }

  const pipeline = sharp(source, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    mime: "image/webp",
    width: info.width,
    height: info.height,
  };
}
