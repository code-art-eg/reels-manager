"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addClip, type ActionState } from "@/lib/clips/actions";
import { detectPlatform, PLATFORM_LABELS } from "@/lib/clips/platform";
import { TagInput } from "./tag-input";
import { PlatformBadge } from "./platform-badge";

const initialState: ActionState = { status: "idle" };

export function AddClipForm({
  styleSuggestions,
  clientSuggestions,
}: {
  styleSuggestions: string[];
  clientSuggestions: string[];
}) {
  const [state, formAction, pending] = useActionState(addClip, initialState);
  const [url, setUrl] = useState("");
  const router = useRouter();

  // Live feedback while typing, before the server verifies the link exists.
  const platform = useMemo(() => detectPlatform(url), [url]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.push(state.refId ? `/clips/${state.refId}` : "/library");
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="url">Clip URL</Label>
        <div className="relative">
          <Input
            id="url"
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/… or https://www.tiktok.com/@user/video/…"
            autoComplete="off"
            autoFocus
            required
            className="pr-24"
          />
          {platform && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <PlatformBadge platform={platform} />
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {platform
            ? `Detected ${PLATFORM_LABELS[platform]}. We'll verify the clip exists and grab a thumbnail on save.`
            : "Paste an Instagram Reel or TikTok link — the platform is detected automatically."}
        </p>
      </div>

      <TagInput
        name="styleTags"
        kind="style"
        label="Style tags"
        suggestions={styleSuggestions}
        placeholder="transition, cinematic, silly…"
      />

      <TagInput
        name="clientTags"
        kind="client"
        label="Clients"
        suggestions={clientSuggestions}
        placeholder="TPC, a real estate client…"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
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

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "Verifying link…" : "Save clip"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/library")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
