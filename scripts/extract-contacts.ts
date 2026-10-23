// Usage: npx tsx scripts/extract-contacts.ts <dataset.csv> [outDir]
// Writes companies_classified.csv (route/track/priority/domain per company) and
// contacts.csv (named people from the sheet + one "needs enrichment" row per
// company with nobody named yet). Emails are left blank: they come from Apollo/Hunter.
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { parseRow, targetTitles } from "../src/lib/dataset";

const [input, outDir = "data"] = process.argv.slice(2);
if (!input) {
  console.error("usage: tsx scripts/extract-contacts.ts <dataset.csv> [outDir]");
  process.exit(1);
}

const rows = Papa.parse<Record<string, string>>(fs.readFileSync(input, "utf8"), { header: true, skipEmptyLines: true }).data;
const companies = [];
const contacts = [];
for (const row of rows) {
  const parsed = parseRow(row);
  if (!parsed) continue;
  const { company: c, people } = parsed;
  companies.push({
    priority: c.priority, company: c.name, route: c.route, resume: c.track, team_size: c.teamSize ?? "",
    domain: c.domain ?? "", type: c.type, group: c.group, stage: c.stage, roles: c.roles, fit_for: c.fitFor,
    hiring_signal: c.hiringSignal, base: c.base, source: c.sourceUrl,
  });
  const base = { priority: c.priority, company: c.name, route: c.route, resume: c.track, domain: c.domain ?? "", fit_for: c.fitFor };
  for (const p of people) {
    contacts.push({ ...base, name: p.name, title: p.title, persona: p.persona, email: "", email_status: "needs_enrichment", linkedin: p.linkedinUrl ?? "", source: "dataset", look_for: "" });
  }
  if (people.length < 2) {
    contacts.push({ ...base, name: "", title: "", persona: c.route === "HR" ? "HR" : "FOUNDER", email: "", email_status: "needs_enrichment", linkedin: "", source: "to_enrich", look_for: targetTitles(c.route).titles.slice(0, 5).join(" | ") });
  }
}
const byPriority = (a: { priority: number }, b: { priority: number }) => b.priority - a.priority;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "companies_classified.csv"), Papa.unparse(companies.sort(byPriority)));
fs.writeFileSync(path.join(outDir, "contacts.csv"), Papa.unparse(contacts.sort(byPriority)));
const named = contacts.filter((c) => c.name).length;
console.log(`${companies.length} companies, ${named} named people, ${contacts.length - named} companies still need enrichment`);
console.log(`routes: ${JSON.stringify(companies.reduce((m: Record<string, number>, c) => ({ ...m, [c.route]: (m[c.route] ?? 0) + 1 }), {}))}`);
