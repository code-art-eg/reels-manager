import { cn } from "@/lib/utils";
import { PLATFORM_LABELS, type Platform } from "@/lib/clips/platform";

const STYLES: Record<Platform, string> = {
  instagram:
    "bg-gradient-to-br from-fuchsia-500/15 to-amber-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  tiktok:
    "bg-gradient-to-br from-cyan-400/15 to-rose-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
};

export function PlatformBadge({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[platform],
        className,
      )}
    >
      {PLATFORM_LABELS[platform]}
    </span>
  );
}
