import Link from "next/link";
import { Lock } from "lucide-react";
import { SignUpForm } from "@/components/sign-up-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSignupAvailable } from "@/lib/signup";

export const metadata = { title: "Sign up · Reels Manager" };

export default async function Page() {
  const available = await isSignupAvailable();

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {available ? <SignUpForm /> : <SignupClosed />}
      </div>
    </div>
  );
}

function SignupClosed() {
  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-secondary">
          <Lock className="size-4" />
        </div>
        <CardTitle className="text-2xl">Sign-up is closed</CardTitle>
        <CardDescription>
          This library is invite only. Ask an administrator to send you an
          invitation, then use the link in that email to set your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
