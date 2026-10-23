import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = route(async (user) => prisma.run.findMany({ where: { userId: user.id }, orderBy: { at: "desc" }, take: 50 }));
