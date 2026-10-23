import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { draftFor } from "@/lib/outreach";

export const maxDuration = 60;

export const POST = route(async (user, req) => {
  const { contactIds, ai = true } = (await req.json()) as { contactIds: string[]; ai?: boolean };
  const [settings, templates, contacts] = await Promise.all([
    prisma.settings.findUnique({ where: { userId: user.id } }),
    prisma.template.findMany({ where: { userId: user.id } }),
    prisma.contact.findMany({ where: { userId: user.id, id: { in: contactIds.slice(0, 25) } }, include: { company: true } }),
  ]);
  return Promise.all(
    contacts.map(async (c) => {
      try {
        const { attachments: _a, ...d } = await draftFor(user.id, c, settings, templates, ai);
        return { ...d, name: c.name, company: c.company.name };
      } catch (e) {
        return { contactId: c.id, name: c.name, company: c.company.name, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
});
