import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getClipByRef, getTagFacets } from "@/lib/clips/queries";
import { Separator } from "@/components/ui/separator";
import { ClipThumb } from "@/components/clips/clip-thumb";
import { PlatformBadge } from "@/components/clips/platform-badge";
import { EditClipForm } from "@/components/clips/edit-clip-form";
import { DeleteClipButton } from "@/components/clips/delete-clip-button";

export const metadata = { title: "Clip · Reels Manager" };


export default async function ClipPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href="/library"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to library
      </Link>

      {/* Resolved inline (not in a Suspense boundary) so an unknown reference
          answers with a real 404 status instead of a streamed error. */}
      <ClipDetail params={params} />
    </div>
  );
}

async function ClipDetail({ params }: { params: Promise<{ ref: string }> }) {
  await requireProfile();

  const { ref } = await params;
  const refId = decodeURIComponent(ref).toUpperCase();
  const clip = await getClipByRef(refId);
  if (!clip) notFound();

  const facets = await getTagFacets();
  const added = new Date(clip.created_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
      <div className="flex flex-col gap-3">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-xl border">
          <ClipThumb
            clipId={clip.id}
            refId={clip.ref_id}
            platform={clip.platform}
            hasThumbnail={clip.has_thumbnail}
            className="h-full w-full"
            sizes="220px"
          />
        </div>
        <a
          href={clip.canonical_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <ExternalLink className="size-3.5" />
          Open on {clip.platform === "instagram" ? "Instagram" : "TikTok"}
        </a>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {clip.ref_id}
            </h1>
            <PlatformBadge platform={clip.platform} />
            <DeleteClipButton
              clipId={clip.id}
              refId={clip.ref_id}
              redirectTo="/library"
              variant="outline"
              withLabel
              className="ml-auto"
            />
          </div>

          {clip.title && <p className="text-sm">{clip.title}</p>}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {clip.author_name && (
              <>
                <dt>Creator</dt>
                <dd className="truncate text-foreground/80">{clip.author_name}</dd>
              </>
            )}
            <dt>Added</dt>
            <dd className="text-foreground/80">
              {added}
              {clip.created_by_email &&
                ` by ${clip.created_by_name || clip.created_by_email}`}
            </dd>
            <dt>Source</dt>
            <dd className="min-w-0">
              <a
                href={clip.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-foreground/80 hover:underline"
              >
                {clip.url}
              </a>
            </dd>
          </dl>
        </div>

        <Separator />

        <EditClipForm
          clip={clip}
          styleSuggestions={facets
            .filter((f) => f.kind === "style")
            .map((f) => f.name)}
          clientSuggestions={facets
            .filter((f) => f.kind === "client")
            .map((f) => f.name)}
        />
      </div>
    </div>
  );
}
