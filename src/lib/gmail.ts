// Minimal Gmail REST client using the signed-in user's Google OAuth tokens.
import crypto from "node:crypto";
import { prisma } from "./db";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function accessTokenFor(userId: string): Promise<string> {
  const acct = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!acct) throw new Error("No Google account linked. Sign in with Google again.");
  const fresh = acct.access_token && acct.expires_at && acct.expires_at * 1000 > Date.now() + 60_000;
  if (fresh) return acct.access_token!;
  if (!acct.refresh_token) throw new Error("Gmail access expired and no refresh token. Sign out and sign in again.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: acct.refresh_token,
    }),
  });
  const tok = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !tok.access_token) throw new Error(`Google token refresh failed: ${tok.error ?? res.status}. Sign in again.`);
  await prisma.account.update({
    where: { id: acct.id },
    data: { access_token: tok.access_token, expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600) },
  });
  return tok.access_token;
}

async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Gmail ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export interface MailAttachment {
  filename: string;
  mime: string;
  data: Buffer;
}

export interface OutgoingMail {
  from: string; // "Name <me@gmail.com>"
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
  inReplyTo?: string | null; // Message-ID header of the mail we're following up on
}

function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function b64lines(buf: Buffer): string {
  return buf.toString("base64").replace(/.{76}/g, "$&\r\n");
}

export function buildMime(mail: OutgoingMail, messageId: string): string {
  const mixed = `mix_${crypto.randomBytes(8).toString("hex")}`;
  const alt = `alt_${crypto.randomBytes(8).toString("hex")}`;
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`] : []),
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];
  const parts = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64lines(Buffer.from(mail.text, "utf8")),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64lines(Buffer.from(mail.html, "utf8")),
    `--${alt}--`,
  ];
  for (const a of mail.attachments ?? []) {
    parts.push(
      `--${mixed}`,
      `Content-Type: ${a.mime}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64lines(a.data),
    );
  }
  parts.push(`--${mixed}--`, "");
  return [...headers, "", ...parts].join("\r\n");
}

export async function sendMail(token: string, mail: OutgoingMail, threadId?: string | null) {
  const domain = mail.from.match(/@([^>\s]+)/)?.[1] ?? "mail.local";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const raw = Buffer.from(buildMime(mail, messageId)).toString("base64url");
  const sent = await gmail<{ id: string; threadId: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
  return { ...sent, messageId };
}

interface GmailHeader {
  name: string;
  value: string;
}
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  labelIds?: string[];
  payload: { headers: GmailHeader[] };
}

export async function getThread(token: string, threadId: string) {
  return gmail<{ id: string; messages: GmailMessage[] }>(
    token,
    `/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
  );
}

export async function listMessages(token: string, q: string, max = 50) {
  const r = await gmail<{ messages?: { id: string; threadId: string }[] }>(token, `/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  return r.messages ?? [];
}

export async function getMessage(token: string, id: string) {
  return gmail<GmailMessage>(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=X-Failed-Recipients`);
}

export function header(m: GmailMessage, name: string): string {
  return m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function emailOf(fromHeader: string): string {
  return (fromHeader.match(/<([^>]+)>/)?.[1] ?? fromHeader).trim().toLowerCase();
}
