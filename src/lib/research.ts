// Web research for companies that aren't in the user's sheet: Gemini with Google
// Search grounding finds the company's website, LinkedIn page and the names/titles
// of HR or founders from public pages (LinkedIn profiles as indexed by Google,
// team pages, news). It never supplies guessed emails: emails come from
// Apollo/Hunter by name + domain, or are kept only when printed on a public page
// at the company's own domain (e.g. careers@company.com).
import { companyDomain, personaFor, type Persona, type Route } from "./dataset";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export interface ResearchPerson {
  name: string;
  title: string;
  persona: Persona;
  linkedinUrl: string | null;
  sourceUrl: string | null;
}

export interface ResearchResult {
  officialName: string;
  domain: string | null;
  linkedinUrl: string | null;
  description: string;
  hq: string;
  employees: string;
  people: ResearchPerson[];
  publicEmails: { email: string; sourceUrl: string | null }[];
  sources: string[];
}

const WHO: Record<Route, string> = {
  HR: "HR, talent acquisition, recruiters, campus/university hiring, people operations",
  FOUNDER: "founders, co-founders, CEO, CTO, heads/directors of engineering, engineering managers",
  MIXED: "founders/co-founders/CTO and HR/talent acquisition/recruiters",
};

export function researchPrompt(company: string, domainHint: string | null, focus: Route, want: number): string {
  return `Research the company "${company}"${domainHint ? ` (website: ${domainHint})` : ""}, focusing on its India operations if it has any.

Use Google Search. Find:
1. The official company name, website domain, LinkedIn company page URL, one-line description, HQ city, approximate employee count.
2. Up to ${want + 2} people who CURRENTLY work there in these roles: ${WHO[focus]}. Prefer people based in India. Search LinkedIn results (site:linkedin.com/in "${company}" recruiter OR "talent acquisition" OR founder), the company's team/about page, and recent news.
3. Hiring or careers email addresses that are printed on a public web page (for example careers@ or hr@ on the company's site or a job post).

Strict rules:
- Only include a person if a search result shows their name together with this company and their role. Skip anyone who appears to have left.
- Never guess or construct an email address. Only include emails you saw written on a page, with that page's URL.
- Only include LinkedIn URLs you actually saw (linkedin.com/in/... for people, linkedin.com/company/... for the company).
- If you are unsure, leave the field empty rather than guessing.

Reply with ONLY a JSON object, no prose, in this exact shape:
{"officialName":"","domain":"","linkedinUrl":"","description":"","hq":"","employees":"","people":[{"name":"","title":"","linkedinUrl":"","sourceUrl":""}],"publicEmails":[{"email":"","sourceUrl":""}]}`;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export async function geminiResearch(key: string, company: string, domainHint: string | null, focus: Route, want = 3): Promise<ResearchResult> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: researchPrompt(company, domainHint, focus, want) }] }],
      tools: [{ google_search: {} }],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message ?? "request failed"}`);
  if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason})`);
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const sources = (cand?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web?.title ?? c.web?.uri ?? "").filter(Boolean);
  return parseResearch(text, company, sources);
}

const LI_PERSON = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?$/i;
const LI_COMPANY = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[\w%-]+\/?$/i;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const url = (v: unknown) => {
  const s = str(v);
  return /^https?:\/\//i.test(s) ? s : null;
};

// Validates the model's JSON so only well-formed, on-domain data gets stored.
export function parseResearch(text: string, company: string, sources: string[] = []): ResearchResult {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Gemini returned no usable result");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini returned malformed JSON");
  }
  const officialName = str(raw.officialName) || company;
  const domainRaw = str(raw.domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const domain = domainRaw && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domainRaw) ? companyDomain(`https://${domainRaw}`) : null;
  const liCompany = url(raw.linkedinUrl);

  const seen = new Set<string>();
  const people: ResearchPerson[] = [];
  for (const p of Array.isArray(raw.people) ? (raw.people as Record<string, unknown>[]) : []) {
    const name = str(p.name).replace(/\s+/g, " ");
    const title = str(p.title);
    const words = name.split(" ");
    if (!name || !title || words.length < 2 || words.length > 5 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const li = url(p.linkedinUrl);
    people.push({
      name,
      title,
      persona: personaFor(title),
      linkedinUrl: li && LI_PERSON.test(li) ? li.replace(/\/$/, "") : null,
      sourceUrl: url(p.sourceUrl),
    });
  }

  const publicEmails = (Array.isArray(raw.publicEmails) ? (raw.publicEmails as Record<string, unknown>[]) : [])
    .map((e) => ({ email: str(e.email).toLowerCase(), sourceUrl: url(e.sourceUrl) }))
    // Only addresses at the company's own domain: a gmail.com or third-party address is too likely wrong.
    .filter((e) => EMAIL.test(e.email) && !!domain && (e.email.endsWith(`@${domain}`) || e.email.endsWith(`.${domain}`)));

  return {
    officialName,
    domain,
    linkedinUrl: liCompany && LI_COMPANY.test(liCompany) ? liCompany.replace(/\/$/, "") : null,
    description: str(raw.description).slice(0, 300),
    hq: str(raw.hq).slice(0, 80),
    employees: str(raw.employees).slice(0, 40),
    people,
    publicEmails,
    sources,
  };
}
