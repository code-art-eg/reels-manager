import { PLATFORMS, type Platform } from "./platform";
import type { ViewMode } from "@/lib/types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type LibraryParams = {
  q: string;
  style: string[];
  client: string[];
  platform: Platform | null;
  view: ViewMode;
  page: number;
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function slugList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function parseLibraryParams(sp: RawSearchParams): LibraryParams {
  const platform = first(sp.platform) as Platform;
  const page = Number.parseInt(first(sp.page), 10);

  return {
    q: first(sp.q).slice(0, 200),
    style: slugList(sp.style),
    client: slugList(sp.client),
    platform: PLATFORMS.includes(platform) ? platform : null,
    view: first(sp.view) === "list" ? "list" : "grid",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/**
 * Builds a /library URL from the current params plus overrides. Anything at its
 * default is omitted so links stay readable.
 */
export function libraryHref(
  current: LibraryParams,
  overrides: Partial<LibraryParams> = {},
): string {
  const next = { ...current, ...overrides };
  const sp = new URLSearchParams();

  if (next.q.trim()) sp.set("q", next.q.trim());
  if (next.style.length) sp.set("style", next.style.join(","));
  if (next.client.length) sp.set("client", next.client.join(","));
  if (next.platform) sp.set("platform", next.platform);
  if (next.view === "list") sp.set("view", "list");
  if (next.page > 1) sp.set("page", String(next.page));

  const qs = sp.toString();
  return qs ? `/library?${qs}` : "/library";
}

/** Toggles one tag slug on/off and resets to page 1. */
export function toggleTagHref(
  current: LibraryParams,
  kind: "style" | "client",
  slug: string,
): string {
  const selected = current[kind];
  const next = selected.includes(slug)
    ? selected.filter((s) => s !== slug)
    : [...selected, slug];
  return libraryHref(current, { [kind]: next, page: 1 } as Partial<LibraryParams>);
}
