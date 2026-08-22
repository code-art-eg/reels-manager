"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";

/** Result of an action invoked directly (not through useActionState). */
export type AdminResult =
  | { status: "error"; message: string }
  | { status: "success"; message: string };

/** Form-action state, which starts out empty. */
export type AdminActionState = { status: "idle" } | AdminResult;

function isRole(value: unknown): value is AppRole {
  return value === "admin" || value === "member";
}

/** Invites a new team member by email. They set their own password via the link. */
export async function inviteUser(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "member");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!isRole(role)) {
    return { status: "error", message: "Pick a valid role." };
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

  const redirectTo = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`
    : undefined;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo,
  });

  if (error) {
    return { status: "error", message: `Could not invite ${email}: ${error.message}` };
  }

  // The signup trigger creates the profile as a member; apply the chosen role.
  if (data.user && role !== "member") {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", data.user.id);
    if (roleError) {
      return {
        status: "error",
        message: `Invited ${email}, but could not set their role: ${roleError.message}`,
      };
    }
  }

  revalidatePath("/admin/users");
  return { status: "success", message: `Invitation sent to ${email}.` };
}

export async function setUserRole(
  userId: string,
  role: AppRole,
): Promise<AdminResult> {
  const actor = await requireAdmin();

  if (!isRole(role)) {
    return { status: "error", message: "Invalid role." };
  }
  if (userId === actor.id && role !== "admin") {
    return {
      status: "error",
      message: "You cannot remove your own admin access.",
    };
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

  // Refuse to demote the last remaining admin.
  if (role === "member") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return {
        status: "error",
        message: "There must be at least one admin.",
      };
    }
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) {
    return { status: "error", message: `Could not update role: ${error.message}` };
  }

  revalidatePath("/admin/users");
  return { status: "success", message: "Role updated." };
}

export async function deleteUser(userId: string): Promise<AdminResult> {
  const actor = await requireAdmin();

  if (userId === actor.id) {
    return { status: "error", message: "You cannot delete your own account." };
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

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: AppRole }>();

  if (target?.role === "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { status: "error", message: "There must be at least one admin." };
    }
  }

  // Clips keep their reference ids; created_by is nulled by the FK.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { status: "error", message: `Could not delete user: ${error.message}` };
  }

  revalidatePath("/admin/users");
  return { status: "success", message: "User deleted." };
}
