import { LoginForm } from "@/components/login-form";
import { isSignupAvailable } from "@/lib/signup";

export const metadata = { title: "Sign in · Reels Manager" };

export default async function Page() {
  // Only offer the sign-up route while the instance still needs its first user.
  const canSignUp = await isSignupAvailable();

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm canSignUp={canSignUp} />
      </div>
    </div>
  );
}
