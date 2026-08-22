import { createClient } from "@/lib/supabase/server";

/**
 * True only while the instance has no accounts at all. Self-service sign-up
 * exists purely to create that first (admin) account; afterwards accounts come
 * from an admin invitation.
 *
 * Backed by a `security definer` function so an anonymous visitor can be told
 * whether to show the bootstrap form. The rule itself is enforced by the signup
 * trigger, not by this check.
 */
export async function isSignupAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("signup_available");

  // On error, assume closed: showing a form that cannot succeed is worse than
  // hiding one that could.
  if (error) return false;
  return data === true;
}
