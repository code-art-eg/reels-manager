// End-to-end check of the data layer as a real signed-in user: creates a
// throwaway account, exercises the RLS-protected tables and RPCs with that
// user's session, then cleans up.
//
//   pnpm tsx scripts/check-e2e.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;

if (!url || !publishable) throw new Error("Supabase URL/publishable key missing");
if (!secret) throw new Error("SUPABASE_SECRET_KEY missing");

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const email = `e2e+${stamp}@example.com`;
const password = `Pw-${stamp}-aZ!`;
let userId: string | null = null;
let clipId: number | null = null;
let memberId: string | null = null;

function ok(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  // 1. Create a confirmed user through the admin API.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Tester" },
  });
  ok("admin API creates a user", !created.error, created.error?.message);
  userId = created.data.user?.id ?? null;
  if (!userId) return;

  // 2. The signup trigger should have provisioned a profile.
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  ok("signup trigger created a profile", Boolean(profile), JSON.stringify(profile));
  ok(
    "profile captured full_name from metadata",
    profile?.full_name === "E2E Tester",
    String(profile?.full_name),
  );

  const { count: adminCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  console.log(`      (existing admins in project: ${adminCount})`);

  // 3. Sign in as that user — everything below runs under their RLS context.
  const user = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await user.auth.signInWithPassword({ email, password });
  ok("user can sign in", !signIn.error, signIn.error?.message);
  if (signIn.error) return;

  // 4. Insert a clip as the user (exercises the INSERT policy + ref sequence).
  const insert = await user
    .from("clips")
    .insert({
      platform: "tiktok",
      url: `https://www.tiktok.com/@e2e/video/${stamp}`,
      canonical_url: `https://www.tiktok.com/@e2e/video/${stamp}`,
      external_id: `e2e-${stamp}`,
      notes: "e2e cinematic drift test",
      created_by: userId,
    })
    .select("id, ref_id, search_text")
    .single();
  ok("member can insert a clip", !insert.error, insert.error?.message);
  clipId = insert.data?.id ?? null;
  ok(
    "clip got a PT-#### reference",
    /^PT-\d{4,}$/.test(insert.data?.ref_id ?? ""),
    insert.data?.ref_id,
  );

  if (!clipId) return;

  // 5. Tags: free-form create, then link.
  const tagInsert = await user
    .from("tags")
    .upsert(
      [
        { kind: "style", name: "Cinematic", slug: "cinematic" },
        { kind: "client", name: "TPC", slug: "tpc" },
      ],
      { onConflict: "kind,slug", ignoreDuplicates: true },
    );
  ok("member can create tags", !tagInsert.error, tagInsert.error?.message);

  const { data: tagRows } = await user
    .from("tags")
    .select("id, kind, slug")
    .in("slug", ["cinematic", "tpc"]);
  const tagIds = (tagRows ?? []).map((t) => t.id);
  ok("tags readable", tagIds.length === 2, `got ${tagIds.length}`);

  const link = await user
    .from("clip_tags")
    .upsert(
      tagIds.map((id) => ({ clip_id: clipId, tag_id: id })),
      { onConflict: "clip_id,tag_id", ignoreDuplicates: true },
    );
  ok("member can tag a clip", !link.error, link.error?.message);

  // 6. Thumbnail write/read through the base64 helpers.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de000000" +
      "0c4944415408d763f8ffff3f0005fe02fea735cf400000000049454e44ae426082",
    "hex",
  );
  const setThumb = await user.rpc("set_clip_thumbnail", {
    p_clip_id: clipId,
    p_bytes_base64: png.toString("base64"),
    p_mime: "image/webp",
    p_width: 400,
    p_height: 711,
  });
  ok("thumbnail write", !setThumb.error, setThumb.error?.message);

  const getThumb = await user.rpc("get_clip_thumbnail", { p_clip_id: clipId });
  const row = (getThumb.data as { bytes_base64: string }[] | null)?.[0];
  const returned = row ? Buffer.from(row.bytes_base64, "base64") : null;
  ok(
    "thumbnail roundtrips byte-exact",
    Boolean(returned && returned.equals(png)),
    returned ? `${returned.byteLength} of ${png.byteLength} bytes` : "no row",
  );
  ok(
    "base64 payload is not newline-wrapped",
    Boolean(row && !/[\r\n]/.test(row.bytes_base64)),
  );

  // 7. Search: by tag name, by notes, by ref id, and multi-tag AND.
  const bySearch = await user.rpc("search_clips", {
    p_search: "cinematic",
    p_tag_ids: null,
    p_platform: null,
    p_limit: 20,
    p_offset: 0,
    p_ref_id: null,
  });
  const found = (bySearch.data as { items: { id: number }[] })?.items ?? [];
  ok(
    "search finds the clip by tag/notes text",
    found.some((c) => c.id === clipId),
    `${found.length} hits`,
  );

  const byTags = await user.rpc("search_clips", {
    p_search: null,
    p_tag_ids: tagIds,
    p_platform: null,
    p_limit: 20,
    p_offset: 0,
    p_ref_id: null,
  });
  const andItems = (byTags.data as { items: { id: number }[] })?.items ?? [];
  ok(
    "multi-tag AND filter matches",
    andItems.some((c) => c.id === clipId),
    `${andItems.length} hits`,
  );

  const byRef = await user.rpc("search_clips", {
    p_search: null,
    p_tag_ids: null,
    p_platform: null,
    p_limit: 20,
    p_offset: 0,
    p_ref_id: insert.data!.ref_id.toLowerCase(),
  });
  const refItems = (byRef.data as { items: { ref_id: string }[] })?.items ?? [];
  ok(
    "exact ref lookup is case-insensitive",
    refItems.length === 1 && refItems[0].ref_id === insert.data!.ref_id,
    JSON.stringify(refItems.map((i) => i.ref_id)),
  );

  const facets = await user.rpc("tag_facets");
  ok(
    "tag_facets returns counts",
    Array.isArray(facets.data) && facets.data.length >= 2,
    `${(facets.data as unknown[])?.length} tags`,
  );

  // 8. Privilege escalation must be refused. This needs a genuine member: the
  //    first account in a fresh project is promoted to admin by the trigger, so
  //    a second user is created specifically for this check.
  const memberEmail = `e2e-member+${stamp}@example.com`;
  const memberPassword = `Pw-${stamp}-Mb!`;
  const memberCreated = await admin.auth.admin.createUser({
    email: memberEmail,
    password: memberPassword,
    email_confirm: true,
  });
  memberId = memberCreated.data.user?.id ?? null;
  ok("second user is created", Boolean(memberId), memberCreated.error?.message);

  if (memberId) {
    const { data: memberProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", memberId)
      .maybeSingle();
    ok(
      "second user defaults to member",
      memberProfile?.role === "member",
      `role is ${memberProfile?.role}`,
    );

    const memberClient = createClient(url, publishable, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const memberSignIn = await memberClient.auth.signInWithPassword({
      email: memberEmail,
      password: memberPassword,
    });
    ok("member can sign in", !memberSignIn.error, memberSignIn.error?.message);

    const escalate = await memberClient
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", memberId);
    const { data: after } = await admin
      .from("profiles")
      .select("role")
      .eq("id", memberId)
      .maybeSingle();
    ok(
      "member cannot promote themselves to admin",
      after?.role === "member",
      `role is now ${after?.role}; error: ${escalate.error?.message ?? "none"}`,
    );

    // A member must also not be able to change somebody else's role. Make the
    // first user an admin explicitly — whether the signup trigger promoted them
    // depends on whether the project already had an admin.
    await admin.from("profiles").update({ role: "admin" }).eq("id", userId);
    const demote = await memberClient
      .from("profiles")
      .update({ role: "member" })
      .eq("id", userId);
    const { data: adminAfter } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    ok(
      "member cannot demote an admin",
      adminAfter?.role === "admin",
      `target role is now ${adminAfter?.role}; error: ${demote.error?.message ?? "none"}`,
    );

    // ...nor read-modify-write somebody else's profile at all.
    const rename = await memberClient
      .from("profiles")
      .update({ full_name: "hijacked" })
      .eq("id", userId);
    const { data: renamed } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    ok(
      "member cannot edit another user's profile",
      renamed?.full_name !== "hijacked",
      `full_name is ${renamed?.full_name}; error: ${rename.error?.message ?? "none"}`,
    );
  }

  // 9. Anonymous access must see nothing.
  const anon = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: anonClips } = await anon.from("clips").select("id");
  ok(
    "anonymous users see no clips",
    (anonClips ?? []).length === 0,
    `${(anonClips ?? []).length} rows visible`,
  );

  // 10. Delete cascades tags + thumbnail.
  const del = await user.from("clips").delete().eq("id", clipId);
  ok("member can delete a clip", !del.error, del.error?.message);
  const { count: leftoverTags } = await admin
    .from("clip_tags")
    .select("clip_id", { count: "exact", head: true })
    .eq("clip_id", clipId);
  const { count: leftoverThumbs } = await admin
    .from("clip_thumbnails")
    .select("clip_id", { count: "exact", head: true })
    .eq("clip_id", clipId);
  ok(
    "delete cascades tags and thumbnail",
    (leftoverTags ?? 0) === 0 && (leftoverThumbs ?? 0) === 0,
    `tags=${leftoverTags} thumbs=${leftoverThumbs}`,
  );
}

main()
  .catch((err) => {
    console.error("ERROR", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (clipId) await admin.from("clips").delete().eq("id", clipId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (memberId) await admin.auth.admin.deleteUser(memberId);
    await admin.from("tags").delete().in("slug", ["cinematic", "tpc"]);
    console.log("\ncleaned up test user and fixtures");
  });
