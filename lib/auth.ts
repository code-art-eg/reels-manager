import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in user together with their application role. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // The signup trigger creates the row; fall back to a member view if the read
  // races that insert so the UI still renders.
  return (
    data ?? {
      id: user.id,
      email: user.email ?? "",
      full_name: null,
      role: "member",
      created_at: user.created_at ?? new Date().toISOString(),
    }
  );
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/library");
  return profile;
}

export function displayName(profile: {
  full_name?: string | null;
  email?: string | null;
}) {
  return profile.full_name?.trim() || profile.email || "Unknown";
}
