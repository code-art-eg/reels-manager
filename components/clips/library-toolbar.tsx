"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { libraryHref, type LibraryParams } from "@/lib/clips/search-params";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/clips/platform";

/**
 * Search box, platform filter and grid/list switch. All state lives in the URL
 * so any view can be shared or bookmarked.
 */
export function LibraryToolbar({ params }: { params: LibraryParams }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(params.q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in step when navigation changes the query (back button, chips).
  useEffect(() => setTerm(params.q), [params.q]);

  function push(href: string) {
    startTransition(() => router.push(href));
  }

  function onTermChange(value: string) {
    setTerm(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      push(libraryHref(params, { q: value, page: 1 }));
    }, 300);
  }

  function submitNow(event: React.FormEvent) {
    event.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    push(libraryHref(params, { q: term, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form onSubmit={submitNow} className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          placeholder="Search ID, URL, tags or notes…"
          aria-label="Search clips"
          className="pl-9 pr-9"
        />
        {pending ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          term && (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                if (debounce.current) clearTimeout(debounce.current);
                push(libraryHref(params, { q: "", page: 1 }));
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )
        )}
      </form>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border p-0.5">
          <FilterPill
            active={params.platform === null}
            onClick={() => push(libraryHref(params, { platform: null, page: 1 }))}
          >
            All
          </FilterPill>
          {PLATFORMS.map((platform) => (
            <FilterPill
              key={platform}
              active={params.platform === platform}
              onClick={() =>
                push(libraryHref(params, { platform, page: 1 }))
              }
            >
              {PLATFORM_LABELS[platform]}
            </FilterPill>
          ))}
        </div>

        <div className="flex items-center rounded-md border p-0.5">
          <Button
            type="button"
            variant={params.view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label="Grid view"
            aria-pressed={params.view === "grid"}
            onClick={() => push(libraryHref(params, { view: "grid" }))}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            variant={params.view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label="List view"
            aria-pressed={params.view === "list"}
            onClick={() => push(libraryHref(params, { view: "list" }))}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
