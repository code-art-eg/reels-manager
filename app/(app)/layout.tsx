import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <Suspense
        fallback={
          <div className="h-16 w-full border-b">
            <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
        }
      >
        <AppNav />
      </Suspense>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
