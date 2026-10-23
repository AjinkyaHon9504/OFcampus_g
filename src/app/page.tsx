import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignIn } from "@/components/sign-in";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">O</div>
        <h1 className="text-2xl font-semibold">OffCampus Outreach</h1>
        <p className="mt-2 text-sm text-slate-500">
          Import your company list, find founders and HR contacts, send personalised mails with your resume from your own Gmail, and track every reply.
        </p>
        <SignIn />
        <p className="mt-4 text-xs text-slate-400">
          We ask for Gmail send + read access so mails go from your account and replies show up here. Your data is visible only to you.
        </p>
      </div>
    </main>
  );
}
