import Link from "next/link";
import { Film, Plus, Users } from "lucide-react";
import { getCurrentProfile, displayName } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LogoutButton } from "@/components/logout-button";
import { NavLink } from "@/components/nav-link";

export async function AppNav() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/library"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Film className="size-4" />
          </span>
          <span className="hidden sm:inline">Reels Manager</span>
        </Link>

        <nav className="ml-2 flex items-center gap-1">
          <NavLink href="/library">Library</NavLink>
          {profile?.role === "admin" && (
            <NavLink href="/admin/users">
              <Users className="mr-1.5 size-3.5" />
              Users
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/library/new">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add clip</span>
            </Link>
          </Button>
          <ThemeSwitcher />
          {profile && (
            <div className="flex items-center gap-2">
              <span
                className="hidden max-w-[14ch] truncate text-sm text-muted-foreground lg:inline"
                title={`${displayName(profile)} · ${profile.role}`}
              >
                {displayName(profile)}
              </span>
              <LogoutButton />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
