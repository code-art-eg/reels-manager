import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getTagFacets } from "@/lib/clips/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { AddClipForm } from "@/components/clips/add-clip-form";

export const metadata = { title: "Add clip · Reels Manager" };

export default function NewClipPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/library"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add a clip</h1>
        <p className="text-sm text-muted-foreground">
          Paste a link and we&apos;ll verify it, assign a reference ID and store a
          thumbnail.
        </p>
      </div>

      <Suspense fallback={<FormSkeleton />}>
        <FormWithSuggestions />
      </Suspense>
    </div>
  );
}

async function FormWithSuggestions() {
  await requireProfile();
  const facets = await getTagFacets();

  return (
    <AddClipForm
      styleSuggestions={facets
        .filter((f) => f.kind === "style")
        .map((f) => f.name)}
      clientSuggestions={facets
        .filter((f) => f.kind === "client")
        .map((f) => f.name)}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-28" />
    </div>
  );
}
