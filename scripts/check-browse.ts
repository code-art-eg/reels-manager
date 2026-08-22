// Seeds enough clips to cross a page boundary, then checks paging, ordering,
// tag filtering and the grid/list toggle through the real pages. Cleans up after
// itself.
//
//   pnpm tsx scripts/check-browse.ts
import { createClient } from "@supabase/supabase-js";

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const EMAIL = process.env.UI_TEST_EMAIL ?? "uitest@example.com";
const PASSWORD = process.env.UI_TEST_PASSWORD ?? "UiTest-12345!";

const SEED = 25;
const MARK = "browsecheck";

let failures = 0;
function ok(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
    JSON.stringify(auth.session),
    "utf8",
  ).toString("base64url")}`;

  // Seed: every clip tagged "browsecheck", a third also tagged "shortlist".
  await admin.from("tags").upsert(
    [
      { kind: "style", name: MARK, slug: MARK },
      { kind: "client", name: "Shortlist", slug: "shortlist" },
    ],
    { onConflict: "kind,slug", ignoreDuplicates: true },
  );
  const { data: tags } = await admin
    .from("tags")
    .select("id, slug")
    .in("slug", [MARK, "shortlist"]);
  const markTag = tags!.find((t) => t.slug === MARK)!.id;
  const shortTag = tags!.find((t) => t.slug === "shortlist")!.id;

  const rows = Array.from({ length: SEED }, (_, i) => ({
    platform: i % 2 ? "instagram" : "tiktok",
    url: `https://example.test/${MARK}/${i}`,
    canonical_url: `https://example.test/${MARK}/${i}`,
    external_id: `${MARK}-${i}`,
    notes: `seeded clip ${i}`,
    created_by: auth.user!.id,
    // Ascending timestamps so the newest is the last one inserted.
    created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  const { data: inserted, error: seedError } = await admin
    .from("clips")
    .insert(rows)
    .select("id, ref_id, created_at");
  ok(`seeded ${SEED} clips`, !seedError && inserted?.length === SEED, seedError?.message);
  if (!inserted) return;

  await admin.from("clip_tags").insert(
    inserted.flatMap((c, i) => [
      { clip_id: c.id, tag_id: markTag },
      ...(i % 3 === 0 ? [{ clip_id: c.id, tag_id: shortTag }] : []),
    ]),
  );
  const shortlistCount = inserted.filter((_, i) => i % 3 === 0).length;

  const rpc = (args: Record<string, unknown>) =>
    supabase.rpc("search_clips", {
      p_search: null,
      p_tag_ids: null,
      p_platform: null,
      p_limit: 20,
      p_offset: 0,
      p_ref_id: null,
      ...args,
    });

  // --- paging -----------------------------------------------------------
  const p1 = await rpc({ p_tag_ids: [markTag] });
  const page1 = p1.data as { total: number; items: { ref_id: string }[] };
  ok("page 1 returns 20 items", page1.items.length === 20, `${page1.items.length}`);
  ok("total reflects every match", page1.total === SEED, `${page1.total}`);

  const p2 = await rpc({ p_tag_ids: [markTag], p_offset: 20 });
  const page2 = p2.data as { total: number; items: { ref_id: string }[] };
  ok("page 2 returns the remainder", page2.items.length === SEED - 20,
    `${page2.items.length}`);
  ok("total is stable across pages", page2.total === SEED, `${page2.total}`);

  const overlap = page1.items
    .map((i) => i.ref_id)
    .filter((r) => page2.items.some((i) => i.ref_id === r));
  ok("pages do not overlap", overlap.length === 0, overlap.join(","));

  // --- ordering ---------------------------------------------------------
  const newestSeeded = inserted[inserted.length - 1].ref_id;
  ok(
    "newest clip is first",
    page1.items[0]?.ref_id === newestSeeded,
    `${page1.items[0]?.ref_id} vs ${newestSeeded}`,
  );

  // --- filtering --------------------------------------------------------
  const both = await rpc({ p_tag_ids: [markTag, shortTag] });
  ok(
    "two tags narrow the results (AND)",
    (both.data as { total: number }).total === shortlistCount,
    `${(both.data as { total: number }).total} vs ${shortlistCount}`,
  );

  const platform = await rpc({ p_tag_ids: [markTag], p_platform: "tiktok" });
  ok(
    "platform filter applies",
    (platform.data as { total: number }).total === Math.ceil(SEED / 2),
    `${(platform.data as { total: number }).total}`,
  );

  const searched = await rpc({ p_search: "seeded clip 7" });
  ok(
    "search matches notes text",
    (searched.data as { total: number }).total === 1,
    `${(searched.data as { total: number }).total}`,
  );

  // --- pages render -----------------------------------------------------
  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`, { headers: { cookie } });
    const raw = await res.text();
    // React separates interpolated text with comment markers; drop them so
    // rendered sentences can be matched as written.
    return { status: res.status, html: raw.replaceAll("<!-- -->", "") };
  };

  const grid = await get(`/library?style=${MARK}`);
  ok("library page 1 renders", grid.status === 200, `HTTP ${grid.status}`);
  ok("pagination shows the range", grid.html.includes("of 25"), "expected 'of 25'");
  ok(
    "page 2 link is present",
    grid.html.includes(`page=2`),
  );

  const listed = await get(`/library?style=${MARK}&view=list&page=2`);
  ok("list view page 2 renders", listed.status === 200, `HTTP ${listed.status}`);
  ok(
    "page 2 shows the oldest clips",
    listed.html.includes(inserted[0].ref_id),
    `expected ${inserted[0].ref_id}`,
  );

  const unknownTag = await get(`/library?style=no-such-tag-here`);
  ok(
    "an unknown tag slug narrows to nothing rather than showing everything",
    unknownTag.html.includes("No clips match those filters"),
  );
}

main()
  .catch((err) => {
    console.error("ERROR", err);
    failures++;
  })
  .finally(async () => {
    await admin.from("clips").delete().like("external_id", `${MARK}-%`);
    await admin.from("tags").delete().in("slug", [MARK, "shortlist"]);
    console.log(failures === 0 ? "\nall browse checks passed" : `\n${failures} failed`);
    if (failures) process.exitCode = 1;
  });
