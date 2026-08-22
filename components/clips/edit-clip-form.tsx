"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateClip, type ActionState } from "@/lib/clips/actions";
import type { ClipListItem } from "@/lib/types";
import { TagInput } from "./tag-input";

const initialState: ActionState = { status: "idle" };

export function EditClipForm({
  clip,
  styleSuggestions,
  clientSuggestions,
}: {
  clip: ClipListItem;
  styleSuggestions: string[];
  clientSuggestions: string[];
}) {
  const [state, formAction, pending] = useActionState(updateClip, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="clipId" value={clip.id} />

      <TagInput
        name="styleTags"
        kind="style"
        label="Style tags"
        suggestions={styleSuggestions}
        defaultValue={clip.tags.filter((t) => t.kind === "style").map((t) => t.name)}
        placeholder="transition, cinematic, silly…"
      />

      <TagInput
        name="clientTags"
        kind="client"
        label="Clients"
        suggestions={clientSuggestions}
        defaultValue={clip.tags.filter((t) => t.kind === "client").map((t) => t.name)}
        placeholder="TPC, a real estate client…"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={clip.notes ?? ""}
          placeholder="Anything worth remembering about this clip (optional)"
        />
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
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
