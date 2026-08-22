import { Suspense } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { InviteUserForm } from "@/components/admin/invite-user-form";
import { UserRowActions } from "@/components/admin/user-row-actions";

export const metadata = { title: "Users · Reels Manager" };

export default function AdminUsersPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="size-5" />
          Users
        </h1>
        <p className="text-sm text-muted-foreground">
          Admins manage the team. Members can add, tag, browse and delete clips.
        </p>
      </div>

      <Suspense fallback={<UsersSkeleton />}>
        <UsersPanel />
      </Suspense>
    </div>
  );
}

type UserRow = Profile & { last_sign_in_at: string | null };

async function UsersPanel() {
  const actor = await requireAdmin();

  if (!hasAdminCredentials()) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">User management is not configured</p>
          <p className="text-muted-foreground">
            Add <code className="font-mono">SUPABASE_SECRET_KEY</code> to
            <code className="ml-1 font-mono">.env.local</code> and restart the
            server to invite, promote or delete users.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true })
    .returns<Profile[]>();

  // Sign-in timestamps only exist on the auth records, which need the admin key.
  const admin = createAdminClient();
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const lastSignIn = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );

  const rows: UserRow[] = (profiles ?? []).map((profile) => ({
    ...profile,
    last_sign_in_at: lastSignIn.get(profile.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <InviteUserForm />

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">User</th>
              <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">
                Last sign in
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-middle">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {row.full_name?.trim() || row.email}
                      {row.id === actor.id && (
                        <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-secondary-foreground">
                          you
                        </span>
                      )}
                    </span>
                    {row.full_name?.trim() && (
                      <span className="text-xs text-muted-foreground">
                        {row.email}
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                  {row.last_sign_in_at
                    ? new Date(row.last_sign_in_at).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })
                    : "Never (invite pending)"}
                </td>
                <td className="px-4 py-3">
                  <UserRowActions
                    userId={row.id}
                    email={row.email}
                    role={row.role as AppRole}
                    isSelf={row.id === actor.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
