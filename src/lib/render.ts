import type { Company, Contact, Settings } from "@prisma/client";

// Pure template helpers (safe to import in client components).

export const VARIABLES = [
  "firstName", "fullName", "title", "company", "category", "role", "roles", "aiLine",
  "myName", "myPhone", "myGithub", "myLinkedin", "myPortfolio", "college", "pitch",
] as const;

const ROLE_NAMES: Record<string, string> = {
  sde: "Software Engineering", swe: "Software Engineering", "sde intern": "Software Engineering", "swe intern": "Software Engineering",
  ai: "AI/ML Engineering", "ai/cv": "AI / Computer Vision", fde: "Forward Deployed Engineering", pm: "Product Management",
  apm: "Associate Product Manager", tpm: "Technical Program Management", "pm intern": "Product Management",
  consulting: "Consulting", "consulting intern": "Consulting", analyst: "Business Analyst", ba: "Business Analyst",
  growth: "Growth", content: "Content", ops: "Operations", data: "Data", "founding eng": "Founding Engineering",
  "eng intern": "Engineering", robotics: "Robotics", systems: "Systems Engineering",
};

export function roleName(roles: string): string {
  const first = roles.split(",")[0]?.trim().toLowerCase() ?? "";
  return ROLE_NAMES[first] ?? (first ? roles.split(",")[0].trim() : "Software Engineering");
}

export function defaultAiLine(company: Pick<Company, "name" | "category">): string {
  return company.category
    ? `I've been following what ${company.name} is building in ${company.category}, and it lines up closely with the projects I've been shipping.`
    : `I've been following what ${company.name} is building, and it lines up closely with the projects I've been shipping.`;
}

export type Vars = Record<(typeof VARIABLES)[number], string>;

type SenderFields = Pick<Settings, "senderName" | "phone" | "githubUrl" | "linkedinUrl" | "portfolioUrl" | "college" | "pitch">;

export function buildVars(
  contact: Pick<Contact, "name" | "firstName" | "title">,
  company: Pick<Company, "name" | "category" | "roles">,
  s: SenderFields | null,
  aiLine?: string | null,
): Vars {
  return {
    firstName: contact.firstName || contact.name.split(" ")[0] || "there",
    fullName: contact.name,
    title: contact.title,
    company: company.name.replace(/\s*\(.*?\)\s*/g, " ").trim(),
    category: company.category,
    role: roleName(company.roles),
    roles: company.roles,
    aiLine: aiLine || defaultAiLine(company),
    myName: s?.senderName ?? "",
    myPhone: s?.phone ?? "",
    myGithub: s?.githubUrl ?? "",
    myLinkedin: s?.linkedinUrl ?? "",
    myPortfolio: s?.portfolioUrl ?? "",
    college: s?.college ?? "",
    pitch: s?.pitch ?? "",
  };
}

export function render(tpl: string, vars: Vars): string {
  return tpl
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k in vars ? vars[k as keyof Vars] : ""))
    // drop lines that became empty labels, e.g. "Portfolio: " when unset
    .split("\n")
    .filter((line) => !/^[\w ]{2,20}:\s*$/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toHtml(text: string): string {
  const linked = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}
