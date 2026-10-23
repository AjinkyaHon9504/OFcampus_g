// Optional: Claude writes the one personalised opening line ({{aiLine}}) for a
// contact. Everything else in the mail stays your own template text.
import Anthropic from "@anthropic-ai/sdk";
import type { Company, Contact, Settings } from "@prisma/client";
import { decrypt } from "./crypto";

const SYSTEM = `You write the single opening line of a cold internship email from a student to someone at a company.
Rules:
- One or two sentences, max 45 words, plain text, no greeting, no sign-off.
- Be specific to the company: reference what it builds, a recent launch, funding or hiring signal, and connect it to the sender's own work when there is a genuine link.
- The research notes are the sender's private notes: use the facts, never quote them, never mention that you have notes.
- Never invent facts that are not in the input. No flattery, no exclamation marks, no buzzwords.
- Tone: founders/CTOs get peer-to-peer and direct; HR gets polite and professional.`;

export async function aiOpeningLine(settings: Settings | null, company: Company, contact: Contact): Promise<string | null> {
  const apiKey = decrypt(settings?.claudeKeyEnc) ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const input = {
    recipient: { name: contact.name, title: contact.title, persona: contact.persona },
    company: {
      name: company.name, category: company.category, type: company.type, stage: company.stage,
      hiring_signal: company.hiringSignal, roles_wanted: company.roles, research_notes: company.notes,
    },
    sender: { pitch: settings?.pitch ?? "", github: settings?.githubUrl ?? "" },
  };
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: { type: "object", properties: { line: { type: "string" } }, required: ["line"], additionalProperties: false },
      },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (res.stop_reason === "refusal") return null;
  for (const block of res.content) {
    if (block.type === "text") {
      try {
        return (JSON.parse(block.text) as { line: string }).line.trim() || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
