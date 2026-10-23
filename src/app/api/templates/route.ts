import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

const PERSONAS = ["FOUNDER", "HIRING_MANAGER", "HR", "FOLLOW_UP"];

export const GET = route(async (user) => prisma.template.findMany({ where: { userId: user.id }, orderBy: { persona: "asc" } }));

export const PUT = route(async (user, req) => {
  const t = (await req.json()) as {
    id?: string; name: string; persona: string; subject: string; body: string;
    attachTech?: boolean; attachNonTech?: boolean; autoResume?: boolean; useAI?: boolean;
  };
  if (!PERSONAS.includes(t.persona)) throw new HttpError(400, "Invalid persona");
  const data = {
    name: t.name, persona: t.persona, subject: t.subject, body: t.body,
    attachTech: !!t.attachTech, attachNonTech: !!t.attachNonTech, autoResume: t.autoResume ?? true, useAI: !!t.useAI,
  };
  if (t.id) {
    const r = await prisma.template.updateMany({ where: { id: t.id, userId: user.id }, data });
    if (!r.count) throw new HttpError(404, "Template not found");
    return prisma.template.findUnique({ where: { id: t.id } });
  }
  return prisma.template.create({ data: { ...data, userId: user.id } });
});

// Restore the starter templates (keeps your own).
export const POST = route(async (user) => {
  await prisma.template.createMany({ data: DEFAULT_TEMPLATES.map((t) => ({ ...t, name: `${t.name} (default)`, userId: user.id })) });
});

export const DELETE = route(async (user, req) => {
  const { id } = (await req.json()) as { id: string };
  await prisma.template.deleteMany({ where: { id, userId: user.id } });
});
