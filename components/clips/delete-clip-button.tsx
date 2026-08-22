"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { deleteClip } from "@/lib/clips/actions";
import { cn } from "@/lib/utils";

export function DeleteClipButton({
  clipId,
  refId,
  redirectTo,
  className,
  variant = "ghost",
  withLabel = false,
}: {
  clipId: number;
  refId: string;
  /** When set, navigate here after a successful delete (e.g. from a detail page). */
  redirectTo?: string;
  className?: string;
  variant?: "ghost" | "outline" | "destructive";
  withLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteClip(clipId);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(`${refId} deleted.`);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={withLabel ? "sm" : "icon"}
        onClick={() => setOpen(true)}
        aria-label={`Delete ${refId}`}
        className={cn(
          "text-muted-foreground hover:text-destructive",
          withLabel && "text-destructive hover:text-destructive",
          className,
        )}
      >
        <Trash2 className="size-4" />
        {withLabel && <span>Delete</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {refId}?</DialogTitle>
            <DialogDescription>
              This permanently removes the clip, its tags and its thumbnail from
              the shared library. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
