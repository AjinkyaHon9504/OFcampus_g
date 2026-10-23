import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "./db";
import { seedDefaults } from "./templates";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { scope: GMAIL_SCOPES, access_type: "offline", prompt: "consent" } },
    }),
  ],
  pages: { signIn: "/" },
  events: {
    // Every new login gets its own settings + starter templates.
    async createUser({ user }) {
      await seedDefaults(user.id, user.name ?? "");
    },
    // prompt=consent returns a fresh refresh token on each sign-in; keep it.
    async signIn({ account }) {
      if (account?.provider !== "google" || !account.refresh_token) return;
      await prisma.account.updateMany({
        where: { provider: "google", providerAccountId: account.providerAccountId },
        data: {
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          scope: account.scope,
        },
      });
    },
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) (session.user as { id?: string }).id = user.id;
      return session;
    },
  },
};

export async function requireUser(): Promise<{ id: string; email: string; name: string }> {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; email?: string | null; name?: string | null } | undefined;
  if (!u?.id) throw new HttpError(401, "Not signed in");
  return { id: u.id, email: u.email ?? "", name: u.name ?? "" };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
