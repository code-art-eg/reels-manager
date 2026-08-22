import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { ClipListItem } from "@/lib/types";
import { toggleTagHref, type LibraryParams } from "@/lib/clips/search-params";
import { cn } from "@/lib/utils";
import { ClipThumb } from "./clip-thumb";
import { PlatformBadge } from "./platform-badge";
import { TagChip } from "./tag-chip";
import { DeleteClipButton } from "./delete-clip-button";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ClipTags({
  clip,
  params,
  className,
}: {
  clip: ClipListItem;
  params: LibraryParams;
  className?: string;
}) {
  if (clip.tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {clip.tags.map((tag) => (
        <TagChip
          key={tag.id}
          kind={tag.kind}
          name={tag.name}
          href={toggleTagHref(params, tag.kind, tag.slug)}
          active={params[tag.kind].includes(tag.slug)}
        />
      ))}
    </div>
  );
}

function ClipCard({
  clip,
  params,
}: {
  clip: ClipListItem;
  params: LibraryParams;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <Link
        href={`/clips/${clip.ref_id}`}
        className="relative aspect-[9/16] w-full"
        aria-label={`Open ${clip.ref_id}`}
      >
        <ClipThumb
          clipId={clip.id}
          refId={clip.ref_id}
          platform={clip.platform}
          hasThumbnail={clip.has_thumbnail}
          className="h-full w-full"
        />
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/clips/${clip.ref_id}`}
            className="font-mono text-sm font-semibold tracking-tight hover:underline"
          >
            {clip.ref_id}
          </Link>
          <PlatformBadge platform={clip.platform} />
        </div>

        {clip.title && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {clip.title}
          </p>
        )}

        <ClipTags clip={clip} params={params} />

        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <a
            href={clip.canonical_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
          <div className="flex items-center gap-1">
            {clip.notes && (
              <FileText
                className="size-3.5 text-muted-foreground"
                aria-label="Has notes"
              />
            )}
            <DeleteClipButton
              clipId={clip.id}
              refId={clip.ref_id}
              className="size-7"
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function ClipRow({
  clip,
  params,
}: {
  clip: ClipListItem;
  params: LibraryParams;
}) {
  return (
    <article className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm sm:gap-4">
      <Link
        href={`/clips/${clip.ref_id}`}
        className="relative h-24 w-16 shrink-0 sm:h-28 sm:w-[74px]"
        aria-label={`Open ${clip.ref_id}`}
      >
        <ClipThumb
          clipId={clip.id}
          refId={clip.ref_id}
          platform={clip.platform}
          hasThumbnail={clip.has_thumbnail}
          className="h-full w-full rounded-lg"
          sizes="80px"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/clips/${clip.ref_id}`}
            className="font-mono text-sm font-semibold hover:underline"
          >
            {clip.ref_id}
          </Link>
          <PlatformBadge platform={clip.platform} />
          <span className="text-xs text-muted-foreground">
            {formatDate(clip.created_at)}
          </span>
          {clip.created_by_email && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              · {clip.created_by_name || clip.created_by_email}
            </span>
          )}
        </div>

        {(clip.title || clip.author_name) && (
          <p className="truncate text-xs text-muted-foreground">
            {[clip.title, clip.author_name].filter(Boolean).join(" · ")}
          </p>
        )}

        <a
          href={clip.canonical_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{clip.canonical_url}</span>
        </a>

        {clip.notes && (
          <p className="line-clamp-2 text-xs text-foreground/80">{clip.notes}</p>
        )}

        <ClipTags clip={clip} params={params} />
      </div>

      <DeleteClipButton
        clipId={clip.id}
        refId={clip.ref_id}
        className="shrink-0"
      />
    </article>
  );
}

export function ClipResults({
  clips,
  params,
}: {
  clips: ClipListItem[];
  params: LibraryParams;
}) {
  if (params.view === "list") {
    return (
      <div className="flex flex-col gap-2.5">
        {clips.map((clip) => (
          <ClipRow key={clip.id} clip={clip} params={params} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} params={params} />
      ))}
    </div>
  );
}
