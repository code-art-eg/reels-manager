// Verifies that an Instagram reel is still usable while Meta oEmbed is
// unavailable: it saves, carries a reference id, and renders with the
// placeholder tile instead of a thumbnail.
//
//   pnpm tsx scripts/check-instagram-fallback.ts
import { createClient } from "@supabase/supabase-js";
import { parseClipUrl } from "../lib/clips/platform";
import { ClipLookupError, lookupClipMetadata } from "../lib/clips/oembed";

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
    console.error("sign-in failed");
    process.exit(1);
  }

  const target = "https://www.instagram.com/reel/CqQmvEBI9wI/";
  const parsed = parseClipUrl(target);
  ok("instagram URL parses", parsed?.platform === "instagram", parsed?.canonicalUrl);

  // Mirror the action: a provider that is unavailable to us degrades instead of
  // failing the save.
  let degraded = false;
  try {
    await lookupClipMetadata(parsed!);
  } catch (err) {
    degraded =
      err instanceof ClipLookupError &&
      (err.kind === "needs_review" || err.kind === "not_configured");
    ok(
      "unavailable provider is classified as a setup problem, not a bad link",
      degraded,
      err instanceof ClipLookupError ? err.kind : String(err),
    );
  }

  const insert = await supabase
    .from("clips")
    .insert({
      platform: "instagram",
      url: target,
      canonical_url: parsed!.canonicalUrl,
      external_id: parsed!.externalId,
      notes: "instagram fallback check",
      created_by: auth.user!.id,
    })
    .select("id, ref_id")
    .single();
  ok("instagram clip still saves", !insert.error, insert.error?.message);
  if (!insert.data) return;
  clipId = insert.data.id;

  const search = await supabase.rpc("search_clips", {
    p_search: null,
    p_tag_ids: null,
    p_platform: "instagram",
    p_limit: 20,
    p_offset: 0,
    p_ref_id: insert.data.ref_id,
  });
  const item = (search.data as { items: { has_thumbnail: boolean }[] })?.items?.[0];
  ok("clip is listed", Boolean(item));
  ok("clip has no thumbnail (placeholder will render)", item?.has_thumbnail === false);

  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
    JSON.stringify(auth.session),
    "utf8",
  ).toString("base64url")}`;
  const page = await fetch(`${base}/clips/${insert.data.ref_id}`, {
    headers: { cookie },
  });
  const html = await page.text();
  ok("detail page renders", page.status === 200, `HTTP ${page.status}`);
  ok(
    "placeholder shows the reference id instead of an image",
    html.includes(insert.data.ref_id) &&
      !html.includes(`/api/clips/${clipId}/thumbnail`),
  );
  // React splits interpolated text into separate nodes, so match the outbound
  // link itself rather than the rendered sentence.
  ok(
    "page links out to the reel on Instagram",
    html.includes(`href="${parsed!.canonicalUrl}"`) && html.includes("Instagram"),
  );
}

main()
  .catch((err) => {
    console.error("ERROR", err);
    failures++;
  })
  .finally(async () => {
    if (clipId) await admin.from("clips").delete().eq("id", clipId);
    console.log(failures === 0 ? "\nall fallback checks passed" : `\n${failures} failed`);
    if (failures) process.exitCode = 1;
  });
