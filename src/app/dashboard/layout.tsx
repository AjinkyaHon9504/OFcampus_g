import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");
  return (
    <Providers>
      <div className="min-h-screen md:flex">
        <Nav email={session.user?.email ?? ""} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </Providers>
  );
}
