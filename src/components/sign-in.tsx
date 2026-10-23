"use client";
import { signIn } from "next-auth/react";

export function SignIn() {
  return (
    <button className="btn-primary mt-6 w-full py-2.5" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
      Continue with Google
    </button>
  );
}
