import Link from "next/link";
import { TAG_KINDS, TAG_KIND_LABELS, type TagFacet } from "@/lib/types";
import {
  libraryHref,
  toggleTagHref,
  type LibraryParams,
} from "@/lib/clips/search-params";
import { TagChip } from "./tag-chip";

export function TagFilterRail({
  facets,
  params,
}: {
  facets: TagFacet[];
  params: LibraryParams;
}) {
  const hasFilters =
    params.style.length > 0 || params.client.length > 0 || Boolean(params.q);

  return (
    <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
      {TAG_KINDS.map((kind) => {
        const group = facets.filter((facet) => facet.kind === kind);
        const selected = params[kind];

        return (
          <section key={kind} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {TAG_KIND_LABELS[kind]}
            </h3>
            {group.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No {TAG_KIND_LABELS[kind].toLowerCase()} tags yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {group.map((facet) => (
                  <TagChip
                    key={facet.id}
                    kind={kind}
                    name={facet.name}
                    count={facet.clip_count}
                    active={selected.includes(facet.slug)}
                    href={toggleTagHref(params, kind, facet.slug)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {hasFilters && (
        <Link
          href={libraryHref(params, {
            q: "",
            style: [],
            client: [],
            page: 1,
          })}
          className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Clear filters
        </Link>
      )}
    </aside>
  );
}
