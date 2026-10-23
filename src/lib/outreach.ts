import type { Company, Contact, Settings, Template } from "@prisma/client";
import { prisma } from "./db";
import { aiOpeningLine } from "./ai";
import { accessTokenFor, emailOf, getThread, header, sendMail, type MailAttachment } from "./gmail";
import { buildVars, render, toHtml } from "./templates";

export type Kind = "INITIAL" | "FOLLOW_UP";

export interface Draft {
  contactId: string;
  to: string;
  kind: Kind;
  subject: string;
  text: string;
  html: string;
  attachmentNames: string[];
  templateName: string;
}

export function templateFor(templates: Template[], contact: Pick<Contact, "persona">, company: Pick<Company, "route">, kind: Kind): Template | undefined {
  const by = (p: string) => templates.find((t) => t.persona === p);
  if (kind === "FOLLOW_UP") return by("FOLLOW_UP");
  if (contact.persona === "HR") return by("HR");
  if (contact.persona === "HIRING_MANAGER") return by("HIRING_MANAGER") ?? by("FOUNDER");
  if (contact.persona === "FOUNDER") return by("FOUNDER");
  return company.route === "HR" ? by("HR") : by("FOUNDER");
}

// Anyone we've already mailed (thread exists) gets a follow-up, even when re-queued.
export function kindFor(contact: Pick<Contact, "threadId">): Kind {
  return contact.threadId ? "FOLLOW_UP" : "INITIAL";
}

async function attachmentsFor(userId: string, tpl: Template, company: Company): Promise<MailAttachment[]> {
  const files = await prisma.attachment.findMany({ where: { userId } });
  const tech = files.find((f) => f.kind === "TECH_RESUME");
  const nontech = files.find((f) => f.kind === "NONTECH_RESUME");
  let chosen = [] as typeof files;
  if (tpl.autoResume) {
    const primary = company.track === "NONTECH" ? nontech ?? tech : tech ?? nontech;
    chosen = primary ? [primary] : [];
  } else {
    if (tpl.attachTech && tech) chosen.push(tech);
    if (tpl.attachNonTech && nontech) chosen.push(nontech);
  }
  chosen.push(...files.filter((f) => f.kind === "OTHER"));
  return chosen.map((f) => ({ filename: f.filename, mime: f.mime, data: Buffer.from(f.data) }));
}

export async function draftFor(userId: string, contact: Contact & { company: Company }, settings: Settings | null, templates: Template[], withAI = true): Promise<Draft & { attachments: MailAttachment[] }> {
  if (!contact.email) throw new Error(`${contact.name} has no email`);
  const kind = kindFor(contact);
  const tpl = templateFor(templates, contact, contact.company, kind);
  if (!tpl) throw new Error(`No ${kind === "FOLLOW_UP" ? "FOLLOW_UP" : contact.persona} template — create one on the Templates page`);
  const aiLine = withAI && tpl.useAI && kind === "INITIAL" ? await aiOpeningLine(settings, contact.company, contact).catch(() => null) : null;
  const vars = buildVars(contact, contact.company, settings, aiLine);
  let subject = render(tpl.subject, vars);
  if (kind === "FOLLOW_UP") {
    const last = await prisma.message.findFirst({ where: { contactId: contact.id, direction: "OUT" }, orderBy: { at: "asc" } });
    if (last?.subject) subject = last.subject.startsWith("Re:") ? last.subject : `Re: ${last.subject}`;
  }
  const text = render(tpl.body, vars);
  const attachments = await attachmentsFor(userId, tpl, contact.company);
  return {
    contactId: contact.id, to: contact.email, kind, subject, text, html: toHtml(text),
    attachments, attachmentNames: attachments.map((a) => a.filename), templateName: tpl.name,
  };
}

export async function sentToday(userId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return prisma.message.count({ where: { userId, direction: "OUT", at: { gte: start } } });
}

const SENDABLE = ["NEW", "QUEUED", "SENT", "FOLLOW_UP_DUE"];

export interface SendOutcome {
  contactId: string;
  name: string;
  ok: boolean;
  error?: string;
}

// overrides: subject/body edited by the user in the preview dialog.
export async function sendTo(userId: string, contactIds: string[], overrides: Record<string, { subject?: string; text?: string }> = {}): Promise<SendOutcome[]> {
  const [user, settings, templates] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.settings.findUnique({ where: { userId } }),
    prisma.template.findMany({ where: { userId } }),
  ]);
  const token = await accessTokenFor(userId);
  const limit = settings?.dailyLimit ?? 25;
  let budget = limit - (await sentToday(userId));
  const out: SendOutcome[] = [];
  const contacts = await prisma.contact.findMany({ where: { userId, id: { in: contactIds } }, include: { company: true } });

  for (const c of contacts) {
    if (budget <= 0) {
      out.push({ contactId: c.id, name: c.name, ok: false, error: `Daily limit of ${limit} reached` });
      continue;
    }
    if (!SENDABLE.includes(c.status)) {
      out.push({ contactId: c.id, name: c.name, ok: false, error: `Status is ${c.status}` });
      continue;
    }
    if (kindFor(c) === "FOLLOW_UP" && c.followUps >= (settings?.maxFollowUps ?? 2)) {
      out.push({ contactId: c.id, name: c.name, ok: false, error: "Max follow-ups reached" });
      continue;
    }
    try {
      const d = await draftFor(userId, c, settings, templates);
      const o = overrides[c.id];
      const subject = o?.subject ?? d.subject;
      const text = o?.text ?? d.text;
      const from = settings?.senderName ? `${settings.senderName} <${user.email}>` : user.email!;
      const followUp = d.kind === "FOLLOW_UP";
      const sent = await sendMail(
        token,
        { from, to: d.to, subject, text, html: toHtml(text), attachments: d.attachments, inReplyTo: followUp ? c.lastMessageId : null },
        followUp ? c.threadId : null,
      );
      await prisma.$transaction([
        prisma.message.create({
          data: { userId, contactId: c.id, direction: "OUT", kind: d.kind, gmailId: sent.id, threadId: sent.threadId, subject, snippet: text.slice(0, 280) },
        }),
        prisma.contact.update({
          where: { id: c.id },
          data: {
            status: "SENT", threadId: sent.threadId, lastMessageId: sent.messageId, lastContactedAt: new Date(),
            followUps: followUp ? { increment: 1 } : undefined,
          },
        }),
        prisma.company.update({ where: { id: c.companyId }, data: { status: "Contacted" } }),
      ]);
      budget--;
      out.push({ contactId: c.id, name: c.name, ok: true });
    } catch (e) {
      out.push({ contactId: c.id, name: c.name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

const BOUNCE_FROM = /(mailer-daemon|postmaster)@/i;

// Reads each open thread: a message from anyone but us = reply; from the mailer daemon = bounce.
export async function syncReplies(userId: string) {
  const [user, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.settings.findUnique({ where: { userId } }),
  ]);
  const me = (user.email ?? "").toLowerCase();
  const token = await accessTokenFor(userId);
  const open = await prisma.contact.findMany({ where: { userId, threadId: { not: null }, status: { in: ["SENT", "FOLLOW_UP_DUE", "QUEUED"] } } });
  let replies = 0;
  let bounces = 0;
  for (const c of open) {
    const thread = await getThread(token, c.threadId!).catch(() => null);
    if (!thread) continue;
    for (const m of thread.messages) {
      const from = emailOf(header(m, "From"));
      if (from === me) continue;
      const bounced = BOUNCE_FROM.test(from);
      const exists = await prisma.message.findUnique({ where: { gmailId: m.id } });
      if (!exists) {
        await prisma.message.create({
          data: {
            userId, contactId: c.id, direction: "IN", kind: "REPLY", gmailId: m.id, threadId: m.threadId,
            subject: header(m, "Subject"), snippet: m.snippet, at: new Date(Number(m.internalDate)),
          },
        });
      }
      await prisma.contact.update({
        where: { id: c.id },
        data: bounced
          ? { status: "BOUNCED", emailStatus: "unverified" }
          : { status: "REPLIED", repliedAt: new Date(Number(m.internalDate)), replySnippet: m.snippet },
      });
      if (!bounced) await prisma.company.update({ where: { id: c.companyId }, data: { status: "Replied" } });
      bounced ? bounces++ : replies++;
      break;
    }
  }
  // Anyone silent for followUpDays gets flagged for a follow-up.
  const cutoff = new Date(Date.now() - (settings?.followUpDays ?? 4) * 86_400_000);
  const due = await prisma.contact.updateMany({
    where: { userId, status: "SENT", lastContactedAt: { lt: cutoff }, followUps: { lt: settings?.maxFollowUps ?? 2 } },
    data: { status: "FOLLOW_UP_DUE" },
  });
  return { checked: open.length, replies, bounces, followUpsDue: due.count };
}

export async function runDaily(userId: string) {
  const sync = await syncReplies(userId);
  const settings = await prisma.settings.findUnique({ where: { userId } });
  let sent: SendOutcome[] = [];
  if (settings?.autoSendQueue) {
    const queued = await prisma.contact.findMany({
      where: { userId, status: "QUEUED", email: { not: null } },
      include: { company: true },
      orderBy: [{ company: { priority: "desc" } }],
      take: settings.dailyLimit,
    });
    sent = await sendTo(userId, queued.map((q) => q.id));
  }
  const summary = `sync: ${sync.replies} replies, ${sync.bounces} bounces, ${sync.followUpsDue} follow-ups due; queue: sent ${sent.filter((s) => s.ok).length}/${sent.length}`;
  await prisma.run.create({ data: { userId, kind: "CRON", summary } });
  return { sync, sent, summary };
}
