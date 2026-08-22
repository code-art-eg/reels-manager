"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteUser, setUserRole } from "@/lib/admin/actions";
import type { AppRole } from "@/lib/types";

export function UserRowActions({
  userId,
  email,
  role,
  isSelf,
}: {
  userId: string;
  email: string;
  role: AppRole;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function changeRole(next: AppRole) {
    if (next === role) return;
    startTransition(async () => {
      const result = await setUserRole(userId, next);
      if (result.status === "error") toast.error(result.message);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={role}
        disabled={pending || isSelf}
        onChange={(e) => changeRole(e.target.value as AppRole)}
        aria-label={`Role for ${email}`}
        title={isSelf ? "You cannot change your own role" : undefined}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>

      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        disabled={pending || isSelf}
        title={isSelf ? "You cannot delete your own account" : `Delete ${email}`}
        aria-label={`Delete ${email}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {email}?</DialogTitle>
            <DialogDescription>
              This permanently deletes their account and sign-in access. Clips
              they added stay in the shared library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
