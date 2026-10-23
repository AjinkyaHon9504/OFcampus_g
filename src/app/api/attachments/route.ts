import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const GET = route(async (user) =>
  prisma.attachment.findMany({ where: { userId: user.id }, select: { id: true, kind: true, filename: true, mime: true, createdAt: true } }),
);

export const POST = route(async (user, req) => {
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "OTHER");
  if (!(file instanceof File)) throw new HttpError(400, "No file");
  if (file.size > 4 * 1024 * 1024) throw new HttpError(400, "Max 4 MB per attachment");
  if (!["TECH_RESUME", "NONTECH_RESUME", "OTHER"].includes(kind)) throw new HttpError(400, "Bad kind");
  // One tech + one non-tech resume per user: replace the old one.
  if (kind !== "OTHER") await prisma.attachment.deleteMany({ where: { userId: user.id, kind } });
  const a = await prisma.attachment.create({
    data: { userId: user.id, kind, filename: file.name, mime: file.type || "application/pdf", data: Buffer.from(await file.arrayBuffer()) },
  });
  return { id: a.id };
});

export const DELETE = route(async (user, req) => {
  const { id } = (await req.json()) as { id: string };
  await prisma.attachment.deleteMany({ where: { id, userId: user.id } });
});
