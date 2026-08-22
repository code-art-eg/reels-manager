// Integration check for adding a clip: runs the same modules the server action
// uses (parse -> resolve -> verify -> thumbnail) against a real URL, writes it
// through a signed-in user's RLS context, serves the thumbnail back over HTTP,
// then cleans up.
//
//   pnpm tsx scripts/check-add-flow.ts [url]
import { createClient } from "@supabase/supabase-js";
import { parseClipUrl, resolveClipUrl } from "../lib/clips/platform";
import { lookupClipMetadata } from "../lib/clips/oembed";
import { buildThumbnail } from "../lib/clips/thumbnail";
import { slugify } from "../lib/slug";

const TARGET =
  process.argv[2] ?? "https://www.tiktok.com/@scout2015/video/6718335390845095173";
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
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authError || !auth.session) {
    console.error(`sign-in failed for ${EMAIL}: ${authError?.message}`);
    process.exit(1);
  }
  const userId = auth.user!.id;

  // --- the pipeline the server action runs -------------------------------
  const parsed = parseClipUrl(TARGET);
  ok("URL is recognised", Boolean(parsed), parsed?.platform);
  if (!parsed) return;

  const resolved = await resolveClipUrl(parsed);
  ok("short links resolved", !resolved.isShortLink, resolved.canonicalUrl);

  const metadata = await lookupClipMetadata(resolved);
  ok("provider confirms the clip exists", Boolean(metadata.thumbnailUrl));

  const thumb = metadata.thumbnailUrl
    ? await buildThumbnail(metadata.thumbnailUrl)
    : null;
  ok(
    "thumbnail is small",
    Boolean(thumb && thumb.bytes.byteLength < 60_000),
    thumb ? `${(thumb.bytes.byteLength / 1024).toFixed(1)} KB` : "none",
  );
  ok(
    "thumbnail is a valid WebP",
    Boolean(
      thumb &&
        thumb.bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        thumb.bytes.subarray(8, 12).toString("ascii") === "WEBP",
    ),
  );

  // --- write it as the signed-in user -----------------------------------
  const insert = await supabase
    .from("clips")
    .insert({
      platform: resolved.platform,
      url: TARGET,
      canonical_url: resolved.canonicalUrl,
      external_id: resolved.externalId,
      title: metadata.title,
      author_name: metadata.authorName,
      notes: "added by check-add-flow",
      created_by: userId,
    })
    .select("id, ref_id, title, author_name")
    .single();
  ok("clip inserted", !insert.error, insert.error?.message);
  if (!insert.data) return;
  clipId = insert.data.id;
  ok("reference id assigned", /^PT-\d{4,}$/.test(insert.data.ref_id), insert.data.ref_id);
  ok("provider title stored", Boolean(insert.data.title), insert.data.title ?? "");

  // duplicate guard
  const dupe = await supabase.from("clips").insert({
    platform: resolved.platform,
    url: TARGET,
    canonical_url: resolved.canonicalUrl,
    external_id: resolved.externalId,
    created_by: userId,
  });
  ok(
    "same clip cannot be added twice",
    Boolean(dupe.error),
    dupe.error?.code ?? "no error!",
  );

  // tags
  const wanted = [
    { kind: "style", name: "Slow Motion" },
    { kind: "client", name: "TPC" },
  ].map((t) => ({ ...t, slug: slugify(t.name) }));
  await supabase.from("tags").upsert(wanted, {
    onConflict: "kind,slug",
    ignoreDuplicates: true,
  });
  const { data: tagRows } = await supabase
    .from("tags")
    .select("id, kind, slug")
    .in("slug", wanted.map((t) => t.slug));
  await supabase.from("clip_tags").upsert(
    (tagRows ?? []).map((t) => ({ clip_id: clipId, tag_id: t.id })),
    { onConflict: "clip_id,tag_id", ignoreDuplicates: true },
  );

  if (thumb) {
    const setThumb = await supabase.rpc("set_clip_thumbnail", {
      p_clip_id: clipId,
      p_bytes_base64: thumb.bytes.toString("base64"),
      p_mime: thumb.mime,
      p_width: thumb.width,
      p_height: thumb.height,
    });
    ok("thumbnail stored", !setThumb.error, setThumb.error?.message);
  }

  // --- read it back the way the UI does ---------------------------------
  const search = await supabase.rpc("search_clips", {
    p_search: "slow motion",
    p_tag_ids: null,
    p_platform: null,
    p_limit: 20,
    p_offset: 0,
    p_ref_id: null,
  });
  const items = (search.data as { items: { id: number; has_thumbnail: boolean }[] })
    ?.items ?? [];
  const mine = items.find((c) => c.id === clipId);
  ok("clip is findable by its tag text", Boolean(mine));
  ok("clip reports having a thumbnail", Boolean(mine?.has_thumbnail));

  // Serve the thumbnail over the real HTTP route, as a signed-in browser would.
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
    JSON.stringify(auth.session),
    "utf8",
  ).toString("base64url")}`;
  const res = await fetch(`${base}/api/clips/${clipId}/thumbnail`, {
    headers: { cookie },
  });
  const served = Buffer.from(await res.arrayBuffer());
  ok("thumbnail route returns 200", res.status === 200, `HTTP ${res.status}`);
  ok(
    "thumbnail route sets an image content-type",
    (res.headers.get("content-type") ?? "").startsWith("image/"),
    res.headers.get("content-type") ?? "none",
  );
  ok(
    "served bytes match what was stored",
    Boolean(thumb && served.equals(thumb.bytes)),
    `${served.byteLength} bytes`,
  );

  // The detail page should now render this clip.
  const page = await fetch(`${base}/clips/${insert.data.ref_id}`, {
    headers: { cookie },
  });
  const html = await page.text();
  ok("detail page renders the clip", page.status === 200, `HTTP ${page.status}`);
  ok("detail page shows the reference", html.includes(insert.data.ref_id));
  ok("detail page shows the applied tags", html.includes("Slow Motion"));
}

main()
  .catch((err) => {
    console.error("ERROR", err);
    failures++;
  })
  .finally(async () => {
    if (clipId) await admin.from("clips").delete().eq("id", clipId);
    await admin.from("tags").delete().in("slug", ["slow-motion", "tpc"]);
    // Keep the reference numbering tidy for the first real clip.
    console.log("\ncleaned up test clip and tags");
    console.log(failures === 0 ? "all add-flow checks passed" : `${failures} failed`);
    if (failures) process.exitCode = 1;
  });
