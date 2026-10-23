// Turns rows of the company sheet (India_Company_Dataset format) into structured
// companies + any named people already present in the "Who to contact" column.
// Pure functions only: shared by the CSV import API and scripts/extract-contacts.ts.

export type Route = "FOUNDER" | "HR" | "MIXED";
export type Track = "TECH" | "NONTECH";
export type Persona = "FOUNDER" | "HIRING_MANAGER" | "HR" | "OTHER";

export interface ParsedCompany {
  rowNo: string;
  name: string;
  group: string;
  category: string;
  type: string;
  base: string;
  stage: string;
  hiringSignal: string;
  internInfo: string;
  roles: string;
  fitFor: string;
  notes: string;
  whoToContact: string;
  sourceUrl: string;
  domain: string | null;
  seenOn: string;
  teamSize: number | null;
  route: Route;
  track: Track;
  priority: number;
  status: string;
}

export interface ParsedPerson {
  name: string;
  firstName: string;
  title: string;
  persona: Persona;
  linkedinUrl: string | null;
}

type Row = Record<string, string | undefined>;

// Column aliases so slightly different sheets still import.
const COLS: Record<keyof Omit<ParsedCompany, "domain" | "teamSize" | "route" | "track" | "priority">, string[]> = {
  rowNo: ["#", "no", "sr"],
  name: ["company", "company name", "name"],
  group: ["group"],
  category: ["category", "industry"],
  type: ["type", "company type"],
  base: ["india base", "location", "city"],
  stage: ["stage / funding", "stage", "funding"],
  hiringSignal: ["hiring signal (what was seen)", "hiring signal"],
  internInfo: ["intern info"],
  roles: ["roles to target", "roles"],
  fitFor: ["fit for"],
  notes: ["why fit / notes", "notes"],
  whoToContact: ["who to contact", "contact"],
  sourceUrl: ["website / source link", "website", "source", "url"],
  seenOn: ["seen on", "date"],
  status: ["status"],
};

function pick(row: Row, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const k = keys.find((key) => key.replace(/^﻿/, "").trim().toLowerCase() === alias);
    if (k && row[k] != null) return String(row[k]).trim();
  }
  return "";
}

// News sites, job boards and aggregators: their host is not the company's domain.
const NON_COMPANY_HOSTS = [
  "ycombinator.com", "linkedin.com", "entrackr.com", "inc42.com", "techcrunch.com", "yourstory.com",
  "digit.in", "newsbytesapp.com", "thejobcompany.co.in", "hiredoor.in", "substack.com", "myinternships.in",
  "extern.com", "tracxn.com", "cbinsights.com", "siliconindia.com", "topstartups.io", "medium.com",
  "economictimes.indiatimes.com", "indiatimes.com", "livemint.com", "moneycontrol.com", "wellfound.com",
  "crunchbase.com", "glassdoor.com", "glassdoor.co.in", "naukri.com", "foundit.in", "instahyre.com",
  "internshala.com", "unstop.com", "github.com", "google.com", "forbesindia.com", "business-standard.com",
  "thehindubusinessline.com", "vccircle.com", "the-ken.com", "x.com", "twitter.com", "youtube.com",
  "startuptalky.com", "indianweb2.com", "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "workable.com",
];

const GENERIC_WORDS = new Set(["ai", "the", "app", "labs", "tech", "technologies", "technology", "india", "group", "inc", "pvt", "ltd", "and", "platforms", "solutions"]);

// The source link's host only counts as the company's domain when it looks like
// the company (blog/news hosts like startuptalky.com are rejected). Unknown -> null,
// and Apollo resolves the domain from the company name instead.
export function companyDomain(url: string, companyName = ""): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (NON_COMPANY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  host = host.replace(/^(www|careers|jobs|job|hiring)\./, "").replace(/\.jobs$/, ".com");
  if (!companyName) return host;
  const label = host.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
  const words = companyName.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !GENERIC_WORDS.has(w));
  const joined = words.join("");
  const initials = words.length > 1 ? words.map((w) => w[0]).join("") : "";
  const match = words.some((w) => w.length >= 3 && label.includes(w)) || (label.length >= 3 && joined.includes(label)) || (!!initials && label === initials);
  return match ? host : null;
}

export function teamSizeOf(text: string): number | null {
  const m = text.match(/~?\s*(\d{1,6})\s*\+?\s*(people|staff|employees|member)/i);
  return m ? Number(m[1]) : null;
}

const EARLY_TYPES = /\b(yc|early|soonicorn|seed|pre-seed|early-growth)\b/i;
const LARGE_TYPES = /\b(unicorn|mnc|large|listed|big tech|it services|reliance)\b/i;

export function routeFor(type: string, group: string, teamSize: number | null): Route {
  const t = `${type} ${group}`;
  if (teamSize != null) {
    if (teamSize <= 50) return "FOUNDER";
    if (teamSize <= 150 && !LARGE_TYPES.test(t)) return "MIXED";
    return "HR";
  }
  if (LARGE_TYPES.test(t) && !/soonicorn/i.test(t)) return "HR";
  if (EARLY_TYPES.test(t) || /ai startup/i.test(t)) return "FOUNDER";
  return "MIXED";
}

const NONTECH_ROLE = /^(pm|apm|tpm|product|consult|analyst|ba\b|business|growth|content|ops|operations|trainee|marketing|sales|partnership|hr|finance|strategy|video)/i;

export function trackFor(roles: string): Track {
  const first = roles.split(/[,/]/)[0]?.trim() ?? "";
  return NONTECH_ROLE.test(first) ? "NONTECH" : "TECH";
}

export function priorityFor(c: Pick<ParsedCompany, "hiringSignal" | "stage" | "internInfo" | "route" | "whoToContact">, namedPeople: number): number {
  let p = 50;
  const signal = c.hiringSignal.toLowerCase();
  if (/(hiring|opening|jobs|intern|listing|launch)/.test(signal) && !/not seen/.test(signal)) p += 20;
  if (/(series|seed|raise|raised|round)/i.test(c.stage) && /202[5-7]/.test(c.stage)) p += 15;
  if (/intern (listed|posted)|new grads ok|swe intern/i.test(c.internInfo)) p += 10;
  if (c.route === "FOUNDER") p += 5;
  if (namedPeople > 0) p += 10;
  return Math.min(100, p);
}

export function personaFor(title: string): Persona {
  const t = title.toLowerCase();
  if (/(founder|\bceo\b|\bcto\b|\bcoo\b|\bcpo\b|owner|chief|president|managing director)/.test(t)) return "FOUNDER";
  if (/(\bhr\b|human resource|talent|recruit|people (ops|operations|partner|team)|hiring|campus|acquisition)/.test(t)) return "HR";
  if (/(engineering manager|head|director|\bvp\b|vice president|lead|manager|principal)/.test(t)) return "HIRING_MANAGER";
  return "OTHER";
}

const NOT_A_NAME = /(page|listing|linkedin|careers?|founders?\b|\bhr\b|via|apply|team|website|yc\b|alumni|ex-|microsoft|jobs|research|check)/i;

function splitOutsideParens(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// "Saksham Aggarwal (CEO) linkedin.com/in/x; CTO Kushaagra Goyal; Founders Sanket, Manish"
export function parsePeople(who: string): ParsedPerson[] {
  const people: ParsedPerson[] = [];
  for (const group of splitOutsideParens(who, ";")) {
    // "Founders Sanket, Manish" / "Founder: Virani" -> shared title prefix
    let sharedTitle = "";
    let rest = group;
    const prefix = rest.match(/^(co-?founders?|founders?|ceo|cto|coo|cpo|hr)\s*:?\s+(?=[A-Z])/i);
    if (prefix) {
      sharedTitle = prefix[1].replace(/s$/i, "");
      sharedTitle = sharedTitle.length <= 3 ? sharedTitle.toUpperCase() : sharedTitle[0].toUpperCase() + sharedTitle.slice(1).toLowerCase();
      rest = rest.slice(prefix[0].length);
    }
    for (let chunk of splitOutsideParens(rest, ",")) {
      let linkedinUrl: string | null = null;
      const li = chunk.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i);
      if (li) {
        linkedinUrl = li[0].startsWith("http") ? li[0] : `https://www.${li[0].replace(/^[a-z]{2,3}\./i, "")}`;
        chunk = chunk.replace(li[0], "");
      }
      let title = sharedTitle;
      const paren = chunk.match(/\(([^)]+)\)/);
      if (paren) {
        title = paren[1].trim();
        chunk = chunk.replace(paren[0], "");
      }
      const name = chunk.replace(/\s+/g, " ").trim();
      const words = name.split(" ");
      if (!name || NOT_A_NAME.test(name) || words.length > 4 || !words.every((w) => /^[A-Z][a-zA-Z.'-]*$/.test(w))) continue;
      people.push({ name, firstName: words[0], title, persona: title ? personaFor(title) : "FOUNDER", linkedinUrl });
    }
  }
  return people;
}

export function parseRow(row: Row): { company: ParsedCompany; people: ParsedPerson[] } | null {
  const base = Object.fromEntries(Object.entries(COLS).map(([k, aliases]) => [k, pick(row, aliases)])) as Record<keyof typeof COLS, string>;
  if (!base.name) return null;
  const teamSize = teamSizeOf(`${base.stage} ${base.notes} ${base.hiringSignal}`);
  const route = routeFor(base.type, base.group, teamSize);
  const people = parsePeople(base.whoToContact);
  const company: ParsedCompany = {
    ...base,
    status: base.status || "Not started",
    domain: companyDomain(base.sourceUrl, base.name),
    teamSize,
    route,
    track: trackFor(base.roles),
    priority: 0,
  };
  company.priority = priorityFor(company, people.length);
  return { company, people };
}

// Which titles to look for at a company, given its route.
export function targetTitles(route: Route): { titles: string[]; seniorities: string[] } {
  const founder = ["founder", "co-founder", "ceo", "cto", "chief technology officer", "head of engineering", "engineering manager"];
  const hr = ["hr", "human resources", "talent acquisition", "recruiter", "technical recruiter", "campus recruiter", "hr business partner", "people operations"];
  const mgr = ["engineering manager", "head of engineering", "director of engineering", "hiring manager"];
  if (route === "FOUNDER") return { titles: founder, seniorities: ["founder", "owner", "c_suite", "head", "director"] };
  if (route === "HR") return { titles: [...hr, ...mgr], seniorities: ["manager", "senior", "head", "director", "entry"] };
  return { titles: [...founder, ...hr], seniorities: ["founder", "c_suite", "head", "manager", "senior"] };
}
