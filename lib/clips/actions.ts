"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { TAG_KINDS, type TagKind } from "@/lib/types";
import { slugify } from "@/lib/slug";
import { parseClipUrl, resolveClipUrl } from "./platform";
import {
  ClipLookupError,
  lookupClipMetadata,
  type ClipMetadata,
} from "./oembed";
import { buildThumbnail } from "./thumbnail";

/** Result of an action invoked directly (not through useActionState). */
export type ClipResult =
  | { status: "error"; message: string }
  | { status: "success"; message: string; refId?: string };

/** Form-action state, which starts out empty. */
export type ActionState = { status: "idle" } | ClipResult;

type TagInput = { kind: TagKind; names: string[] };

function parseTagNames(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  // The client sends a JSON array; fall back to comma separation for no-JS use.
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    /* not JSON, treat as CSV below */
  }
  return raw.split(",");
}

function normaliseTags(names: string[]) {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    if (!seen.has(slug)) seen.set(slug, name);
  }
  return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
}

/**
 * Ensures every supplied tag exists and returns their ids. Uses
 * `ignoreDuplicates` so the insert needs only the INSERT policy — an
 * ON CONFLICT DO UPDATE would demand the admin-only UPDATE policy.
 */
async function ensureTagIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inputs: TagInput[],
): Promise<number[]> {
  const wanted = inputs.flatMap(({ kind, names }) =>
    normaliseTags(names).map(({ slug, name }) => ({ kind, name, slug })),
  );
  if (wanted.length === 0) return [];

  const { error: insertError } = await supabase
    .from("tags")
    .upsert(wanted, { onConflict: "kind,slug", ignoreDuplicates: true });
  if (insertError) {
    throw new Error(`Could not save tags: ${insertError.message}`);
  }

  const { data, error } = await supabase
    .from("tags")
    .select("id, kind, slug")
    .in(
      "slug",
      wanted.map((t) => t.slug),
    );
  if (error) throw new Error(`Could not read tags back: ${error.message}`);

  const byKey = new Map(
    (data ?? []).map((row) => [`${row.kind}:${row.slug}`, row.id as number]),
  );
  return wanted
    .map((t) => byKey.get(`${t.kind}:${t.slug}`))
    .filter((id): id is number => typeof id === "number");
}

function collectTagInputs(formData: FormData): TagInput[] {
  return TAG_KINDS.map((kind) => ({
    kind,
    names: parseTagNames(formData.get(`${kind}Tags`)),
  }));
}

export async function addClip(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const rawUrl = String(formData.get("url") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!rawUrl) {
    return { status: "error", message: "Paste an Instagram Reel or TikTok link." };
  }

  const parsed = parseClipUrl(rawUrl);
  if (!parsed) {
    return {
      status: "error",
      message:
        "That does not look like an Instagram Reel or TikTok link. " +
        "Expected something like instagram.com/reel/… or tiktok.com/@user/video/….",
    };
  }

  const resolved = await resolveClipUrl(parsed);
  if (resolved.isShortLink) {
    return {
      status: "error",
      message:
        "Could not follow that short link. Open it in a browser and paste the full URL.",
    };
  }

  // Confirms the clip really exists (and is public) before we store anything.
  let metadata: ClipMetadata = {
    title: null,
    authorName: null,
    thumbnailUrl: null,
  };
  let warning: string | null = null;

  try {
    metadata = await lookupClipMetadata(resolved);
  } catch (err) {
    if (!(err instanceof ClipLookupError)) {
      return {
        status: "error",
        message: "Could not reach the platform to verify that link. Try again.",
      };
    }
    // When the provider itself is unavailable to us (no credentials, or Meta
    // App Review still pending) the link cannot be checked at all. Refusing
    // would make the platform unusable, so save it and say plainly that it is
    // unverified and has no thumbnail.
    if (err.kind === "not_configured" || err.kind === "needs_review") {
      warning = err.message;
    } else {
      return { status: "error", message: err.message };
    }
  }

  if (resolved.externalId) {
    const { data: existing } = await supabase
      .from("clips")
      .select("ref_id")
      .eq("platform", resolved.platform)
      .eq("external_id", resolved.externalId)
      .maybeSingle<{ ref_id: string }>();
    if (existing) {
      return {
        status: "error",
        message: `That clip is already in the library as ${existing.ref_id}.`,
      };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("clips")
    .insert({
      platform: resolved.platform,
      url: rawUrl,
      canonical_url: resolved.canonicalUrl,
      external_id: resolved.externalId,
      title: metadata.title,
      author_name: metadata.authorName,
      notes,
      created_by: profile.id,
    })
    .select("id, ref_id")
    .single<{ id: number; ref_id: string }>();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      return { status: "error", message: "That clip is already in the library." };
    }
    return {
      status: "error",
      message: `Could not save the clip: ${insertError?.message ?? "unknown error"}`,
    };
  }

  try {
    const tagIds = await ensureTagIds(supabase, collectTagInputs(formData));
    if (tagIds.length) {
      const { error } = await supabase
        .from("clip_tags")
        .upsert(
          tagIds.map((tagId) => ({ clip_id: inserted.id, tag_id: tagId })),
          { onConflict: "clip_id,tag_id", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    // The clip is saved; surface tagging trouble without losing it.
    return {
      status: "error",
      message: `Saved as ${inserted.ref_id}, but tags failed: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  // A missing thumbnail should never block adding a clip.
  if (metadata.thumbnailUrl) {
    try {
      const thumb = await buildThumbnail(metadata.thumbnailUrl);
      await supabase.rpc("set_clip_thumbnail", {
        p_clip_id: inserted.id,
        p_bytes_base64: thumb.bytes.toString("base64"),
        p_mime: thumb.mime,
        p_width: thumb.width,
        p_height: thumb.height,
      });
    } catch {
      /* leave the clip thumbnail-less; the UI shows a platform placeholder */
    }
  }

  revalidatePath("/library");
  return {
    status: "success",
    message: warning
      ? `Added ${inserted.ref_id}, but it could not be verified. ${warning}`
      : `Added ${inserted.ref_id}.`,
    refId: inserted.ref_id,
  };
}

export async function updateClip(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireProfile();
  const supabase = await createClient();

  const clipId = Number(formData.get("clipId"));
  if (!Number.isInteger(clipId)) {
    return { status: "error", message: "Missing clip reference." };
  }
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { error: updateError } = await supabase
    .from("clips")
    .update({ notes })
    .eq("id", clipId);
  if (updateError) {
    return { status: "error", message: `Could not save notes: ${updateError.message}` };
  }

  try {
    const tagIds = await ensureTagIds(supabase, collectTagInputs(formData));

    // Replace the tag set: drop the ones no longer selected, add the rest.
    const remove = supabase.from("clip_tags").delete().eq("clip_id", clipId);
    const { error: deleteError } = tagIds.length
      ? await remove.not("tag_id", "in", `(${tagIds.join(",")})`)
      : await remove;
    if (deleteError) throw new Error(deleteError.message);

    if (tagIds.length) {
      const { error } = await supabase
        .from("clip_tags")
        .upsert(
          tagIds.map((tagId) => ({ clip_id: clipId, tag_id: tagId })),
          { onConflict: "clip_id,tag_id", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    return {
      status: "error",
      message: `Could not save tags: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  revalidatePath("/library");
  return { status: "success", message: "Changes saved." };
}

export async function deleteClip(clipId: number): Promise<ClipResult> {
  await requireProfile();
  const supabase = await createClient();

  // clip_tags and clip_thumbnails cascade from the clips row.
  const { error } = await supabase.from("clips").delete().eq("id", clipId);
  if (error) {
    return { status: "error", message: `Could not delete clip: ${error.message}` };
  }

  revalidatePath("/library");
  return { status: "success", message: "Clip deleted." };
}
