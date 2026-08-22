import Image from "next/image";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/clips/platform";

/**
 * Thumbnail with a graceful placeholder. Images come from our own authenticated
 * route and are already tiny, so Next's optimiser is skipped.
 */
export function ClipThumb({
  clipId,
  refId,
  platform,
  hasThumbnail,
  className,
  sizes = "(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw",
}: {
  clipId: number;
  refId: string;
  platform: Platform;
  hasThumbnail: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted",
        className,
      )}
    >
      {hasThumbnail ? (
        <Image
          src={`/api/clips/${clipId}/thumbnail`}
          alt={`Thumbnail for ${refId}`}
          fill
          unoptimized
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground",
            platform === "instagram"
              ? "bg-gradient-to-br from-fuchsia-500/10 via-rose-500/10 to-amber-500/10"
              : "bg-gradient-to-br from-cyan-400/10 via-sky-500/10 to-rose-500/10",
          )}
        >
          <Film className="size-6 opacity-60" />
          <span className="text-[11px] font-medium tracking-wide">{refId}</span>
        </div>
      )}
    </div>
  );
}
