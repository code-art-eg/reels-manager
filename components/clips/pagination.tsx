import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "@/lib/types";
import { libraryHref, type LibraryParams } from "@/lib/clips/search-params";
import { cn } from "@/lib/utils";

export function Pagination({
  total,
  params,
}: {
  total: number;
  params: LibraryParams;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pageCount <= 1) return null;

  const page = Math.min(params.page, pageCount);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col-reverse items-center justify-between gap-3 border-t pt-4 sm:flex-row"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {first}–{last} of {total}
      </p>

      <div className="flex items-center gap-1">
        <PageLink
          href={libraryHref(params, { page: page - 1 })}
          disabled={page <= 1}
          label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </PageLink>

        {pageWindow(page, pageCount).map((entry, index) =>
          entry === "gap" ? (
            <span
              key={`gap-${index}`}
              className="px-1.5 text-xs text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Link
              key={entry}
              href={libraryHref(params, { page: entry })}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors",
                entry === page
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {entry}
            </Link>
          ),
        )}

        <PageLink
          href={libraryHref(params, { page: page + 1 })}
          disabled={page >= pageCount}
          label="Next page"
        >
          <ChevronRight className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors";
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={cn(base, "cursor-not-allowed text-muted-foreground/40")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(base, "text-muted-foreground hover:bg-secondary hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

/** Compact page list: 1 … 4 5 6 … 20 */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}
