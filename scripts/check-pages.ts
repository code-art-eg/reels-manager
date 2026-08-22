// Renders the authenticated pages over HTTP and asserts the important bits are
// present. Signs in through the Supabase API, then rebuilds the cookie that
// @supabase/ssr would have set so plain fetches are treated as that user.
//
//   pnpm tsx scripts/check-pages.ts [baseUrl]
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const EMAIL = process.env.UI_TEST_EMAIL ?? "uitest@example.com";
const PASSWORD = process.env.UI_TEST_PASSWORD ?? "UiTest-12345!";

let failures = 0;
function ok(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

/**
 * @supabase/ssr serialises the session as `base64-<base64url(JSON)>` and splits
 * it across `sb-<ref>-auth-token.<n>` cookies when it exceeds ~3180 bytes.
 */
function sessionCookies(ref: string, session: unknown): string {
  const encoded =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const CHUNK = 3180;

  if (encoded.length <= CHUNK) return `${name}=${encoded}`;

  const parts: string[] = [];
  for (let i = 0, n = 0; i < encoded.length; i += CHUNK, n++) {
    parts.push(`${name}.${n}=${encoded.slice(i, i + CHUNK)}`);
  }
  return parts.join("; ");
}

async function main() {
  const ref = new URL(url).hostname.split(".")[0];
  const supabase = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) {
    console.error(
      `could not sign in as ${EMAIL}: ${error?.message}\n` +
        "create it first: pnpm tsx scripts/create-user.ts " +
        `${EMAIL} '${PASSWORD}' admin`,
    );
    process.exit(1);
  }

  const cookie = sessionCookies(ref, data.session);

  async function get(path: string) {
    const res = await fetch(`${base}${path}`, {
      headers: { cookie },
      redirect: "manual",
    });
    const body = res.status < 400 ? await res.text() : "";
    return { status: res.status, body, location: res.headers.get("location") };
  }

  const library = await get("/library");
  ok("/library renders for a signed-in user", library.status === 200,
    `HTTP ${library.status}${library.location ? ` -> ${library.location}` : ""}`);
  ok("library shows the heading", library.body.includes("Library"));
  ok(
    "library shows the tag rail",
    library.body.includes("Style") && library.body.includes("Client"),
  );
  ok("library shows the search box", library.body.includes("Search ID, URL"));
  ok(
    "library shows the empty state when there are no clips",
    library.body.includes("The library is empty") ||
      library.body.includes("PT-"),
  );
  ok(
    "nav exposes the admin Users link to an admin",
    library.body.includes("/admin/users"),
  );

  const add = await get("/library/new");
  ok("/library/new renders", add.status === 200, `HTTP ${add.status}`);
  ok("add form has the URL field", add.body.includes("Clip URL"));
  ok(
    "add form has both tag inputs",
    add.body.includes("Style tags") && add.body.includes("Clients"),
  );
  ok("add form has notes", add.body.includes("Notes"));

  const admin = await get("/admin/users");
  ok("/admin/users renders for an admin", admin.status === 200, `HTTP ${admin.status}`);
  ok("admin page lists the add-member form", admin.body.includes("Add a team member"));
  ok("admin page lists the test user", admin.body.includes(EMAIL));
  ok(
    "admin page is not showing the misconfiguration warning",
    !admin.body.includes("User management is not configured"),
  );

  const grid = await get("/library?view=list&q=zzzznope");
  ok("search with no matches renders the empty state", grid.status === 200 &&
    grid.body.includes("No clips match those filters"), `HTTP ${grid.status}`);

  const missing = await get("/clips/PT-9999");
  ok("unknown clip ref returns 404", missing.status === 404, `HTTP ${missing.status}`);
  const missingBody =
    missing.body ||
    (await fetch(`${base}/clips/PT-9999`, { headers: { cookie } }).then((r) =>
      r.text(),
    ));
  ok(
    "unknown clip ref shows the not-found page",
    /could not be found|404/i.test(missingBody),
  );

  const thumb = await fetch(`${base}/api/clips/999999/thumbnail`, {
    headers: { cookie },
    redirect: "manual",
  });
  ok("missing thumbnail returns 404", thumb.status === 404, `HTTP ${thumb.status}`);

  const anonThumb = await fetch(`${base}/api/clips/1/thumbnail`, {
    redirect: "manual",
  });
  ok(
    "thumbnail route rejects anonymous callers",
    anonThumb.status === 401 || anonThumb.status === 307,
    `HTTP ${anonThumb.status}`,
  );

  console.log(failures === 0 ? "\nall page checks passed" : `\n${failures} failed`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
