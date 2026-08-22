"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteUser, type AdminActionState } from "@/lib/admin/actions";

const initialState: AdminActionState = { status: "idle" };

export function InviteUserForm() {
  const [state, formAction, pending] = useActionState(inviteUser, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div>
        <h2 className="font-medium">Invite a team member</h2>
        <p className="text-sm text-muted-foreground">
          They receive an email link to set their own password.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@example.com"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input id="invite-name" name="fullName" placeholder="Jo Smith" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
        {pending ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}
