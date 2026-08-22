// Creates (or resets) a user directly, skipping the email round-trip. Handy for
// bootstrapping the very first admin, or for local testing.
//
//   pnpm tsx scripts/create-user.ts <email> <password> [admin|member]
//
// The first account in a fresh project is promoted to admin automatically by the
// signup trigger; pass a role explicitly to override.
import { createClient } from "@supabase/supabase-js";

const [email, password, role = ""] = process.argv.slice(2);

if (!email || !password) {
  console.error(
    "usage: tsx scripts/create-user.ts <email> <password> [admin|member]",
  );
  process.exit(1);
}
if (role && role !== "admin" && role !== "member") {
  console.error(`invalid role "${role}" — expected admin or member`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.local)",
  );
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Replace an existing account with the same address so the script is re-runnable.
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
    console.log(`removed existing account for ${email}`);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const userId = data.user!.id;
  if (role) {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (roleError) throw roleError;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email, role")
    .eq("id", userId)
    .maybeSingle();

  console.log(`created ${profile?.email} with role ${profile?.role}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
