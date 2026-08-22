// Manual smoke test for the URL parsing + oEmbed + thumbnail pipeline.
//   pnpm tsx scripts/check-lookup.ts <url> [...urls]
import { parseClipUrl, resolveClipUrl } from "../lib/clips/platform";
import { ClipLookupError, lookupClipMetadata } from "../lib/clips/oembed";
import { buildThumbnail } from "../lib/clips/thumbnail";

async function inspect(input: string) {
  console.log(`\n=== ${input}`);
  const parsed = parseClipUrl(input);
  if (!parsed) {
    console.log("  parse: NOT a supported Instagram/TikTok clip URL");
    return;
  }
  const resolved = await resolveClipUrl(parsed);
  console.log("  platform:", resolved.platform);
  console.log("  canonical:", resolved.canonicalUrl);
  console.log("  externalId:", resolved.externalId);

  try {
    const meta = await lookupClipMetadata(resolved);
    console.log("  title:", meta.title);
    console.log("  author:", meta.authorName);
    console.log("  thumbUrl:", meta.thumbnailUrl?.slice(0, 70));

    if (meta.thumbnailUrl) {
      const thumb = await buildThumbnail(meta.thumbnailUrl);
      console.log(
        `  thumbnail: ${thumb.width}x${thumb.height} ${thumb.mime} ` +
          `${(thumb.bytes.byteLength / 1024).toFixed(1)} KB`,
      );
    }
  } catch (err) {
    if (err instanceof ClipLookupError) {
      console.log(`  lookup FAILED [${err.kind}]: ${err.message}`);
    } else {
      console.log("  lookup ERROR:", err);
    }
  }
}

async function main() {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error("usage: tsx scripts/check-lookup.ts <url> [...]");
    process.exit(1);
  }
  for (const input of urls) {
    await inspect(input);
  }
}

main();
