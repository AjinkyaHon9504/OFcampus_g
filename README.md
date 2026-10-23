# OffCampus Outreach

An outreach pipeline for off-campus internship hunting. Each person signs in with their own Google account and gets their own workspace.

1. **Import** a company sheet (CSV, e.g. `India_Company_Dataset_Jan2027.csv`).
2. **Classify** each company:
   - **Founder route**: YC, early-stage, soonicorn, or 50 people or fewer.
   - **HR route**: unicorns, MNCs, listed companies.
   - **Mixed**: everything in between.

   Each company is also marked tech or non-tech, which decides the resume, and given a priority score.
3. **Find 2–3 contacts per company** with Apollo, with Hunter as a fallback and email verifier:
   - Founder route: founders, co-founders, CTO and engineering heads.
   - HR route: HR and talent acquisition, plus one engineering manager.

   People already named in your sheet are looked up directly. When the provider returns the same person (LinkedIn slug or name match), they're marked **LinkedIn ✓ cross-checked**.
4. **Templates**: each user writes their own template for each type of contact (founder, hiring manager, HR, follow-up). Claude can optionally write one opening line tailored to each company, using your sheet's notes and hiring signal.
5. **Today page**: pick who to mail, preview and edit every mail, then send it from your own Gmail with the right resume attached. Or queue them for the **daily 9:00 AM IST run**.
6. **Reply tracking**: replies and bounces are read from the Gmail threads. Anyone silent for N days moves to **Follow-ups due**, and follow-ups go out in the same thread.
7. **Find contact**: type any company name, even one not in your list. If you've added a Gemini key, companies outside your list are first researched on the web with Gemini + Google Search: website, LinkedIn page, the names and titles of HR or founders from public pages (indexed LinkedIn profiles, team pages, news), and any careers email printed on the company's own site. Apollo/Hunter then find and verify emails for those people. Gemini is never trusted for emails: anything not on the company's domain is dropped, and web-found people are labelled "found by web search" with a source link. Pick *HR / recruiters*, *Founders & hiring managers*, or *Both*. You get their names, titles, emails and LinkedIn, and can mail or queue them right there. Repeat lookups reuse saved contacts, so no credits are spent; **Search again** fetches fresh results. On the Companies page, select rows and click **Find HR** to pull HR contacts for those companies in bulk.
8. **Exports**: contacts and companies download as CSV from the dashboard at any time.

## Stack

- Next.js 15 (App Router) with Tailwind
- Postgres via Prisma
- NextAuth with Google OAuth (Gmail send and read scopes)
- Vercel Cron for the daily trigger

No n8n is needed. The cron job, queue, and reply sync are built in, so there's one less service to host.

## Why Apollo (and Hunter)

| Need | Choice | Why |
|---|---|---|
| Find founders / HR at a company by title | **Apollo** | Largest India coverage for startup and mid-size titles. People search is credit-free, and you pay credits only to reveal emails for the 2–3 people you actually pick. |
| Gaps + verification | **Hunter** | Domain search by department (exec/HR) and an email verifier. This keeps bounces low, which protects your Gmail reputation. |
| Companies not in your list | **Gemini** + Google Search | Finds the website, LinkedIn page and public names/titles. It doesn't scrape LinkedIn; it reads what Google has indexed. Optional. |
| LinkedIn cross-check | Provider data | Apollo returns each person's LinkedIn URL, which is matched against the LinkedIn links and names already in your sheet. Scraping LinkedIn directly breaks its Terms of Service and gets accounts banned, so this app doesn't do it. |

Both providers are optional, but at least one key is needed to find emails. Each user saves their own keys in **Settings**. Keys are encrypted at rest with AES-256-GCM.

## Deploy (Vercel + Neon, ~15 min)

1. **Database**: create a free Postgres on [Neon](https://neon.tech) (or Supabase / Vercel Postgres) and copy the connection string.
2. **Google OAuth**: in [Google Cloud Console](https://console.cloud.google.com):
   - Create a project and enable the **Gmail API**.
   - Set up the **OAuth consent screen** (External). Add the scopes `gmail.send` and `gmail.readonly`.
   - **Credentials → OAuth client ID → Web application.** Set the authorized redirect URI to `https://<your-app>.vercel.app/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local development).
   - While the app is in **Testing**, add every person who will use it under *Test users* (up to 100). To let anyone sign in, you'd need Google's verification, because `gmail.readonly` is a restricted scope.
3. **Vercel**: import this repo and set these environment variables (see `.env.example`):
   ```
   DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
   ENCRYPTION_KEY (openssl rand -hex 32), CRON_SECRET (any random string)
   ```
   Optional server-wide fallback keys: `APOLLO_API_KEY`, `HUNTER_API_KEY`, `ANTHROPIC_API_KEY`.
4. Create the tables once: `DATABASE_URL=... npx prisma db push`.
5. Deploy. `vercel.json` schedules `/api/cron/daily` at 03:30 UTC (9:00 AM IST).

## Local dev

```bash
cp .env.example .env   # fill it in
npm install
npx prisma db push
npm run dev
npm test               # unit tests for parsing, routing, templates, MIME
```

Build the contact sheet from a dataset without the app:

```bash
npm run extract -- path/to/India_Company_Dataset.csv data
# -> data/companies_classified.csv, data/contacts.csv
```

## Sending safely

- Keep the daily limit at about 20–40. New Gmail accounts that send a lot of cold mail get throttled.
- Only send to `verified` or `likely` emails. Bounces are detected and marked automatically.
- Every mail is previewed before it's sent, unless you queue it for the daily run.
