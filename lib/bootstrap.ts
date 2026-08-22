"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type BootstrapState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; email: string };

/**
 * Creates the very first account and makes it the admin.
 *
 * Goes through the admin API rather than the public sign-up endpoint, so it
 * keeps working with "Allow new users to sign up" disabled in Supabase Auth —
 * which is what actually keeps the instance invite-only.
 *
 * The guard is the point: this is an unauthenticated action, so it must refuse
 * outright once any account exists.
 */
export async function createFirstAdmin(
  _prev: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeatPassword") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { status: "error", message: "Use a password of at least 8 characters." };
  }
  if (password !== repeat) {
    return { status: "error", message: "Passwords do not match." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Admin client unavailable.",
    };
  }

  // Hard gate: refuse if the instance already has any account.
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (listError) {
    return {
      status: "error",
      message: `Could not check whether this instance is empty: ${listError.message}`,
    };
  }
  if ((existing?.users ?? []).length > 0) {
    return {
      status: "error",
      message:
        "This library already has accounts, so sign-up is closed. Ask an " +
        "administrator to add you.",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
    app_metadata: { created_by_admin: true },
  });
  if (error) {
    return { status: "error", message: `Could not create the account: ${error.message}` };
  }

  // The trigger makes the first account an admin; make it explicit in case the
  // instance was in an odd state (e.g. auth users without profiles).
  if (data.user) {
    await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  }

  return { status: "success", email };
}
