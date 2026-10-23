import { prisma } from "./db";

export { VARIABLES, roleName, defaultAiLine, buildVars, render, toHtml, type Vars } from "./render";

const SIGNATURE = `Best,
{{myName}}
{{college}}
Phone: {{myPhone}}
GitHub: {{myGithub}}
LinkedIn: {{myLinkedin}}
Portfolio: {{myPortfolio}}`;

export const DEFAULT_TEMPLATES = [
  {
    name: "Founder / Co-founder",
    persona: "FOUNDER",
    useAI: true,
    subject: "{{role}} intern for {{company}} — 6 months from Jan 2027",
    body: `Hi {{firstName}},

{{aiLine}}

I'm {{myName}}, {{college}}. {{pitch}}

I'd love to work with you at {{company}} as a full-time {{role}} intern for 6 months starting January 2027. Happy to start with a small paid or unpaid trial task so you can judge the work directly.

My resume is attached and my code is on GitHub. Would a 15-minute call this week work?

${SIGNATURE}`,
  },
  {
    name: "Hiring / Engineering manager",
    persona: "HIRING_MANAGER",
    useAI: true,
    subject: "{{role}} intern (Jan 2027, 6 months) — can I help your team at {{company}}?",
    body: `Hi {{firstName}},

{{aiLine}}

I'm {{myName}}, {{college}}. {{pitch}}

I'm looking for a 6-month {{role}} internship from January 2027 and would love to contribute to your team at {{company}}. If there's an open intern slot, or a problem your team wants a quick prototype for, I'd be glad to take it on.

Resume attached. Could you point me to the right process, or spare 10 minutes for a quick chat?

${SIGNATURE}`,
  },
  {
    name: "HR / Talent acquisition",
    persona: "HR",
    useAI: false,
    subject: "Application: {{role}} Intern (6 months, Jan 2027) — {{myName}}",
    body: `Dear {{firstName}},

I hope you're doing well. I'm {{myName}} from {{college}}, and I'm writing to apply for a 6-month {{role}} internship at {{company}} starting January 2027.

{{pitch}}

{{aiLine}}

I've attached my resume for your review. I'd be grateful if you could consider my profile for any current or upcoming intern openings, or forward it to the relevant hiring manager.

Thank you for your time.

${SIGNATURE}`,
  },
  {
    name: "Follow-up",
    persona: "FOLLOW_UP",
    useAI: false,
    subject: "Re: {{role}} intern for {{company}}",
    body: `Hi {{firstName}},

Just following up on my note below about a 6-month {{role}} internship at {{company}} from January 2027. I know inboxes get busy — if there's someone else I should reach out to, a pointer would really help.

Resume attached again for convenience.

Thanks,
{{myName}}
{{myPhone}}`,
  },
];

export async function seedDefaults(userId: string, name: string) {
  await prisma.settings.upsert({ where: { userId }, create: { userId, senderName: name }, update: {} });
  if ((await prisma.template.count({ where: { userId } })) === 0) {
    await prisma.template.createMany({ data: DEFAULT_TEMPLATES.map((t) => ({ ...t, userId })) });
  }
}
