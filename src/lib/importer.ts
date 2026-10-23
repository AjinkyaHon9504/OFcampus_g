import Papa from "papaparse";
import { prisma } from "./db";
import { parseRow } from "./dataset";

export async function importCsv(userId: string, csv: string) {
  const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
  let companies = 0;
  let people = 0;
  for (const row of rows) {
    const parsed = parseRow(row);
    if (!parsed) continue;
    const { company: c, people: named } = parsed;
    // Re-imports refresh sheet fields but keep the user's own edits to domain/status.
    const saved = await prisma.company.upsert({
      where: { userId_name: { userId, name: c.name } },
      create: { userId, ...c },
      update: { ...c, domain: undefined, status: undefined },
    });
    if (!saved.domain && c.domain) await prisma.company.update({ where: { id: saved.id }, data: { domain: c.domain } });
    companies++;
    for (const p of named) {
      await prisma.contact.upsert({
        where: { companyId_name: { companyId: saved.id, name: p.name } },
        create: { userId, companyId: saved.id, name: p.name, firstName: p.firstName, title: p.title, persona: p.persona, linkedinUrl: p.linkedinUrl, source: "csv" },
        update: {},
      });
      people++;
    }
  }
  await prisma.run.create({ data: { userId, kind: "IMPORT", summary: `Imported ${companies} companies, ${people} named people` } });
  return { companies, people };
}
