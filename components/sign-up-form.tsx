"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFirstAdmin, type BootstrapState } from "@/lib/bootstrap";

const initialState: BootstrapState = { status: "idle" };

/**
 * Bootstrap-only form, rendered when the instance has no accounts. Creation goes
 * through a server action using the secret key, so it works even with
 * self-service sign-up disabled in Supabase Auth; the browser then signs in with
 * the credentials just set.
 */
export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [state, formAction, pending] = useActionState(
    createFirstAdmin,
    initialState,
  );
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;

    let cancelled = false;
    (async () => {
      setSigningIn(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: state.email,
        password,
      });
      if (cancelled) return;
      if (error) {
        setSignInError(
          `Your admin account was created, but signing in failed: ${error.message}`,
        );
        setSigningIn(false);
        return;
      }
      router.push("/library");
    })();

    return () => {
      cancelled = true;
    };
    // `password` is intentionally not a dependency: it is only read once, at the
    // moment the account is confirmed created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const busy = pending || signingIn;
  const error = state.status === "error" ? state.message : signInError;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create the first account</CardTitle>
          <CardDescription>
            This library has no users yet. The account you create now becomes the
            administrator and can add the rest of the team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="full-name">Name</Label>
                <Input
                  id="full-name"
                  name="fullName"
                  placeholder="Jo Smith"
                  autoComplete="name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeat-password">Repeat password</Label>
                <Input
                  id="repeat-password"
                  name="repeatPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {pending
                  ? "Creating the account…"
                  : signingIn
                    ? "Signing you in…"
                    : "Create admin account"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
