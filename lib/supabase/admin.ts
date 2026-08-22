import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client backed by the Supabase secret key. It bypasses RLS and can
 * reach the Auth admin endpoints, so it must never be imported into a component
 * that ships to the browser, and every caller must check the caller is an admin
 * first (see `requireAdmin` in lib/auth.ts).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set — user management needs it. Add it to .env.local.",
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const hasAdminCredentials = () => Boolean(process.env.SUPABASE_SECRET_KEY);
