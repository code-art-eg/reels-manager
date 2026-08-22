// Verifies the Instagram path end to end: a real public reel is confirmed to
// exist, yields a thumbnail, and renders; a reel that does not exist is
// rejected rather than silently saved.
//
//   pnpm tsx scripts/check-instagram.ts [reelUrl]
import { createClient } from "@supabase/supabase-js";
import { parseClipUrl } from "@/lib/clips/platform";
import { ClipLookupError, lookupClipMetadata } from "@/lib/clips/oembed";
import { buildThumbnail } from "@/lib/clips/thumbnail";

const REAL =
  process.argv[2] ?? "https://www.instagram.com/reel/DbaV0XdMySK/";
const FAKE = "https://www.instagram.com/reel/ZZZZZZZZZZZ/";

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const EMAIL = process.env.UI_TEST_EMAIL ?? "uitest@example.com";
const PASSWORD = process.env.UI_TEST_PASSWORD ?? "UiTest-12345!";

let failures = 0;
function ok(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let clipId: number | null = null;

async function main() {
  const ref = new URL(url).hostname.split(".")[0];
  const supabase = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (!auth?.session) {
    console.error(`sign-in failed for ${EMAIL} — create it with scripts/create-user.ts`);
    process.exit(1);
  }

  // --- a reel that does not exist must be refused -------------------------
  const fake = parseClipUrl(FAKE)!;
  let fakeKind = "none";
  try {
    await lookupClipMetadata(fake);
  } catch (err) {
    fakeKind = err instanceof ClipLookupError ? err.kind : "other";
  }
  ok("a nonexistent reel is rejected", fakeKind === "not_found", fakeKind);

  // --- a real reel resolves ----------------------------------------------
  const parsed = parseClipUrl(REAL);
  ok("reel URL parses", parsed?.platform === "instagram", parsed?.canonicalUrl);
  if (!parsed) return;

  const meta = await lookupClipMetadata(parsed);
  ok("thumbnail URL found", Boolean(meta.thumbnailUrl));
  ok("author captured", Boolean(meta.authorName), meta.authorName ?? "none");
  ok("caption captured as title", Boolean(meta.title), meta.title?.slice(0, 50) ?? "none");

  const thumb = await buildThumbnail(meta.thumbnailUrl!);
  ok(
    "thumbnail is a small WebP",
    thumb.bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      thumb.bytes.byteLength < 60_000,
    `${(thumb.bytes.byteLength / 1024).toFixed(1)} KB`,
  );

  // --- stores and serves --------------------------------------------------
  const insert = await supabase
    .from("clips")
    .insert({
      platform: "instagram",
      url: REAL,
      canonical_url: parsed.canonicalUrl,
      // Suffixed so this never collides with the real library entry.
      external_id: `${parsed.externalId}-igcheck`,
      title: meta.title,
      author_name: meta.authorName,
      created_by: auth.user!.id,
    })
    .select("id, ref_id")
    .single();
  ok("clip saves", !insert.error, insert.error?.message);
  if (!insert.data) return;
  clipId = insert.data.id;

  const write = await supabase.rpc("set_clip_thumbnail", {
    p_clip_id: clipId,
    p_bytes_base64: thumb.bytes.toString("base64"),
    p_mime: thumb.mime,
    p_width: thumb.width,
    p_height: thumb.height,
  });
  ok("thumbnail stores", !write.error, write.error?.message);

  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
    JSON.stringify(auth.session),
    "utf8",
  ).toString("base64url")}`;
  const served = await fetch(`${base}/api/clips/${clipId}/thumbnail`, {
    headers: { cookie },
  });
  const bytes = Buffer.from(await served.arrayBuffer());
  ok("thumbnail route serves it", served.status === 200, `HTTP ${served.status}`);
  ok("served bytes match", bytes.equals(thumb.bytes), `${bytes.byteLength} bytes`);

  const page = await fetch(`${base}/clips/${insert.data.ref_id}`, {
    headers: { cookie },
  });
  const html = (await page.text()).replaceAll("<!-- -->", "");
  ok("detail page renders", page.status === 200, `HTTP ${page.status}`);
  ok(
    "detail page shows the thumbnail rather than a placeholder",
    html.includes(`/api/clips/${clipId}/thumbnail`),
  );
}

main()
  .catch((err) => {
    console.error("ERROR", err);
    failures++;
  })
  .finally(async () => {
    if (clipId) await admin.from("clips").delete().eq("id", clipId);
    console.log(failures === 0 ? "\nall Instagram checks passed" : `\n${failures} failed`);
    if (failures) process.exitCode = 1;
  });
