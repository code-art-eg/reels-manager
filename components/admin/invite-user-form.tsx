"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
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

  const link = state.status === "success" ? state.inviteLink : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-medium">Add a team member</h2>
        <p className="text-sm text-muted-foreground">
          Creates the account and generates a one-time link they use to set their
          own password.
        </p>
      </div>

      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
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
          {pending ? "Adding…" : "Add member"}
        </Button>
      </form>

      {link && <InviteLink link={link} email={state.status === "success" ? state.inviteEmail : undefined} />}
    </div>
  );
}

function InviteLink({ link, email }: { link: string; email?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
      <p className="text-sm font-medium">
        Send this link to {email ?? "the new member"}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1.5 font-mono text-xs">
          {link}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        It lets them set a password once, then expires. Shown here because it is
        not emailed automatically unless custom SMTP is configured.
      </p>
    </div>
  );
}
