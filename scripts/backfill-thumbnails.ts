// Fills in thumbnails (and missing title/author) for clips saved before the
// provider lookup worked for their platform.
//
//   pnpm tsx scripts/backfill-thumbnails.ts [--dry-run]
//
// Safe to re-run: only clips with no thumbnail row are touched.
import { createClient } from "@supabase/supabase-js";
import { parseClipUrl } from "@/lib/clips/platform";
import { ClipLookupError, lookupClipMetadata } from "@/lib/clips/oembed";
import { buildThumbnail } from "@/lib/clips/thumbnail";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = {
  id: number;
  ref_id: string;
  canonical_url: string;
  title: string | null;
  author_name: string | null;
};

async function main() {
  const { data: clips, error } = await admin
    .from("clips")
    .select("id, ref_id, canonical_url, title, author_name, clip_thumbnails(clip_id)")
    .order("id");
  if (error) throw new Error(error.message);

  const missing = (clips ?? []).filter(
    (c) => !(c.clip_thumbnails as unknown[])?.length,
  ) as unknown as Row[];

  if (missing.length === 0) {
    console.log("every clip already has a thumbnail");
    return;
  }
  console.log(`${missing.length} clip(s) without a thumbnail\n`);

  let filled = 0;
  let failed = 0;

  for (const clip of missing) {
    const parsed = parseClipUrl(clip.canonical_url);
    if (!parsed) {
      console.log(`${clip.ref_id}  SKIP  unrecognised URL ${clip.canonical_url}`);
      failed++;
      continue;
    }

    try {
      const meta = await lookupClipMetadata(parsed);
      if (!meta.thumbnailUrl) {
        console.log(`${clip.ref_id}  SKIP  provider returned no thumbnail`);
        failed++;
        continue;
      }

      const thumb = await buildThumbnail(meta.thumbnailUrl);
      const size = `${(thumb.bytes.byteLength / 1024).toFixed(1)} KB`;

      if (dryRun) {
        console.log(`${clip.ref_id}  WOULD FILL  ${thumb.width}x${thumb.height} ${size}`);
        filled++;
        continue;
      }

      const { error: writeError } = await admin.rpc("set_clip_thumbnail", {
        p_clip_id: clip.id,
        p_bytes_base64: thumb.bytes.toString("base64"),
        p_mime: thumb.mime,
        p_width: thumb.width,
        p_height: thumb.height,
      });
      if (writeError) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(writeError.message);
      }

      // Fill metadata gaps too, without overwriting anything already set.
      const patch: Record<string, string> = {};
      if (!clip.title && meta.title) patch.title = meta.title;
      if (!clip.author_name && meta.authorName) patch.author_name = meta.authorName;
      if (Object.keys(patch).length) {
        await admin.from("clips").update(patch).eq("id", clip.id);
      }

      console.log(
        `${clip.ref_id}  FILLED  ${thumb.width}x${thumb.height} ${size}` +
          (Object.keys(patch).length ? ` (+${Object.keys(patch).join(", ")})` : ""),
      );
      filled++;
    } catch (err) {
      const reason =
        err instanceof ClipLookupError
          ? `[${err.kind}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.log(`${clip.ref_id}  FAIL  ${reason}`);
      failed++;
    }
  }

  console.log(
    `\n${dryRun ? "would fill" : "filled"} ${filled}, could not fill ${failed}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
