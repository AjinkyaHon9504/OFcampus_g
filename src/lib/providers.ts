// Contact-data providers. Apollo finds the people (titles, LinkedIn, work email);
// Hunter is the fallback finder and the email verifier.
import { personaFor, type Persona } from "./dataset";

export interface FoundPerson {
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  persona: Persona;
  email: string | null;
  emailStatus: "verified" | "likely" | "unverified" | "none";
  linkedinUrl: string | null;
  phone: string | null;
  source: "apollo" | "hunter";
  confidence: number;
  providerId?: string;
}

// ---------------- Apollo ----------------

const APOLLO = "https://api.apollo.io/api/v1";

async function apollo<T>(key: string, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${APOLLO}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ProviderError("apollo", res.status, (await res.text()).slice(0, 300));
  return (await res.json()) as T;
}

export class ProviderError extends Error {
  constructor(public provider: string, public status: number, detail: string) {
    super(`${provider} ${status}: ${detail}`);
  }
}

interface ApolloOrg {
  id: string;
  name: string;
  primary_domain?: string | null;
  website_url?: string | null;
  estimated_num_employees?: number | null;
}

export async function apolloFindOrg(key: string, name: string, domain: string | null): Promise<ApolloOrg | null> {
  const body: Record<string, unknown> = { page: 1, per_page: 5 };
  if (domain) body.q_organization_domains_list = [domain];
  else {
    body.q_organization_name = name.replace(/\(.*?\)/g, "").split("/")[0].trim();
    body.organization_locations = ["India"];
  }
  const r = await apollo<{ organizations?: ApolloOrg[]; accounts?: ApolloOrg[] }>(key, "/mixed_companies/search", body);
  const orgs = [...(r.organizations ?? []), ...(r.accounts ?? [])];
  return orgs[0] ?? null;
}

interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  name?: string;
  title?: string;
  linkedin_url?: string | null;
  email?: string | null;
  email_status?: string | null;
  has_email?: boolean;
}

export async function apolloSearchPeople(key: string, orgId: string, titles: string[], seniorities: string[], perPage = 10): Promise<ApolloPerson[]> {
  const body = {
    organization_ids: [orgId],
    person_titles: titles,
    person_seniorities: seniorities,
    include_similar_titles: true,
    page: 1,
    per_page: perPage,
  };
  try {
    // Credit-free search (no emails); emails come from people/match below.
    const r = await apollo<{ people?: ApolloPerson[] }>(key, "/mixed_people/api_search", body);
    return r.people ?? [];
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 404 || e.status === 403)) {
      const r = await apollo<{ people?: ApolloPerson[]; contacts?: ApolloPerson[] }>(key, "/mixed_people/search", body);
      return [...(r.people ?? []), ...(r.contacts ?? [])];
    }
    throw e;
  }
}

// Reveals the work email for one person (costs Apollo credits).
// Match by Apollo id, LinkedIn URL, or first/last name + domain.
export async function apolloMatch(key: string, match: Record<string, string | null | undefined>): Promise<ApolloPerson | null> {
  const params = new URLSearchParams({ reveal_personal_emails: "false", reveal_phone_number: "false" });
  for (const [k, v] of Object.entries(match)) if (v) params.set(k, v);
  const r = await apollo<{ person?: ApolloPerson }>(key, `/people/match?${params}`, {});
  return r.person ?? null;
}

export function fromApollo(p: ApolloPerson): FoundPerson {
  const first = p.first_name ?? p.name?.split(" ")[0] ?? "";
  const last = p.last_name ?? "";
  const status = p.email_status === "verified" ? "verified" : p.email ? "likely" : "none";
  return {
    name: [first, last].filter(Boolean).join(" ") || p.name || "",
    firstName: first,
    lastName: last,
    title: p.title ?? "",
    persona: personaFor(p.title ?? ""),
    email: p.email && !p.email.includes("email_not_unlocked") ? p.email.toLowerCase() : null,
    emailStatus: status,
    linkedinUrl: p.linkedin_url ?? null,
    phone: null,
    source: "apollo",
    providerId: p.id,
    confidence: status === "verified" ? 95 : status === "likely" ? 75 : 30,
  };
}

// ---------------- Hunter ----------------

const HUNTER = "https://api.hunter.io/v2";

async function hunter<T>(key: string, path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${HUNTER}${path}?${new URLSearchParams({ ...params, api_key: key })}`);
  if (!res.ok) throw new ProviderError("hunter", res.status, (await res.text()).slice(0, 300));
  return ((await res.json()) as { data: T }).data;
}

interface HunterEmail {
  value: string;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  linkedin: string | null;
  phone_number: string | null;
  verification?: { status: string | null } | null;
}

export async function hunterDomainSearch(key: string, domain: string, department: "executive" | "hr" | "it" | "management"): Promise<FoundPerson[]> {
  const d = await hunter<{ emails: HunterEmail[]; organization?: string }>(key, "/domain-search", {
    domain,
    type: "personal",
    department,
    limit: "10",
  });
  return d.emails
    .filter((e) => e.first_name)
    .map((e) => ({
      name: [e.first_name, e.last_name].filter(Boolean).join(" "),
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      title: e.position ?? (department === "hr" ? "HR" : ""),
      persona: e.position ? personaFor(e.position) : department === "hr" ? "HR" : department === "executive" ? "FOUNDER" : "OTHER",
      email: e.value.toLowerCase(),
      emailStatus: e.verification?.status === "valid" ? "verified" : e.confidence >= 80 ? "likely" : "unverified",
      linkedinUrl: e.linkedin,
      phone: e.phone_number,
      source: "hunter",
      confidence: e.confidence,
    }));
}

export async function hunterFindEmail(key: string, domain: string, first: string, last: string) {
  if (!last) return null;
  const d = await hunter<{ email: string | null; score: number; linkedin_url?: string | null; position?: string | null }>(key, "/email-finder", {
    domain,
    first_name: first,
    last_name: last,
  });
  return d.email ? { email: d.email.toLowerCase(), score: d.score, linkedin: d.linkedin_url ?? null } : null;
}

export async function hunterVerify(key: string, email: string): Promise<"verified" | "likely" | "unverified"> {
  const d = await hunter<{ status: string; score: number }>(key, "/email-verifier", { email });
  if (d.status === "valid") return "verified";
  if (d.status === "accept_all" && d.score >= 70) return "likely";
  return "unverified";
}
