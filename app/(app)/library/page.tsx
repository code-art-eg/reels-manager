import { Suspense } from "react";
import Link from "next/link";
import { FilmIcon, Plus, SearchX } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getTagFacets, searchClips } from "@/lib/clips/queries";
import {
  parseLibraryParams,
  type RawSearchParams,
} from "@/lib/clips/search-params";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LibraryToolbar } from "@/components/clips/library-toolbar";
import { TagFilterRail } from "@/components/clips/tag-filter-rail";
import { ClipResults } from "@/components/clips/clip-results";
import { Pagination } from "@/components/clips/pagination";

export const metadata = { title: "Library · Reels Manager" };

export default function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Every clip the team has saved, newest first.
          </p>
        </div>
        <Button asChild size="sm" className="sm:hidden">
          <Link href="/library/new">
            <Plus className="size-4" />
            Add clip
          </Link>
        </Button>
      </div>

      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryBrowser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LibraryBrowser({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireProfile();

  const params = parseLibraryParams(await searchParams);
  const facets = await getTagFacets();

  // The URL carries readable slugs; the search RPC filters on tag ids.
  const selectedSlugs = new Set([
    ...params.style.map((s) => `style:${s}`),
    ...params.client.map((s) => `client:${s}`),
  ]);
  const tagIds = facets
    .filter((facet) => selectedSlugs.has(`${facet.kind}:${facet.slug}`))
    .map((facet) => facet.id);

  // A slug in the URL that matches no tag would otherwise be silently dropped,
  // widening the result set instead of narrowing it.
  const unknownSlugs = selectedSlugs.size !== tagIds.length;

  const { items, total } = unknownSlugs
    ? { items: [], total: 0 }
    : await searchClips({
        search: params.q,
        tagIds,
        platform: params.platform,
        page: params.page,
      });

  const filtered = Boolean(params.q) || tagIds.length > 0 || unknownSlugs;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <TagFilterRail facets={facets} params={params} />

      <div className="flex min-w-0 flex-col gap-4">
        <LibraryToolbar params={params} />

        {items.length === 0 ? (
          <EmptyState hasQuery={filtered} />
        ) : (
          <>
            <ClipResults clips={items} params={params} />
            <Pagination total={total} params={params} />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      {hasQuery ? (
        <>
          <SearchX className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No clips match those filters</p>
            <p className="text-sm text-muted-foreground">
              Try a different search term or clear a tag.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/library">Clear filters</Link>
          </Button>
        </>
      ) : (
        <>
          <FilmIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">The library is empty</p>
            <p className="text-sm text-muted-foreground">
              Paste an Instagram Reel or TikTok link to add the first clip.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/library/new">
              <Plus className="size-4" />
              Add clip
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-16" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
