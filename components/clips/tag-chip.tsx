import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TagKind } from "@/lib/types";

const KIND_STYLES: Record<TagKind, string> = {
  style:
    "border-sky-500/30 bg-sky-500/10 text-sky-800 hover:bg-sky-500/20 dark:text-sky-200",
  client:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200",
};

const ACTIVE_STYLES: Record<TagKind, string> = {
  style: "border-sky-500 bg-sky-500 text-white hover:bg-sky-500/90 dark:text-white",
  client:
    "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-500/90 dark:text-white",
};

/** A clickable tag. Clicking filters the library by that tag. */
export function TagChip({
  kind,
  name,
  href,
  active = false,
  count,
  className,
}: {
  kind: TagKind;
  name: string;
  href: string;
  active?: boolean;
  count?: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active ? ACTIVE_STYLES[kind] : KIND_STYLES[kind],
        className,
      )}
    >
      <span className="truncate">{name}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "tabular-nums text-[10px]",
            active ? "text-white/80" : "opacity-60",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
