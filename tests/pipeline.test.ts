import assert from "node:assert/strict";
import { test } from "node:test";
import { companyDomain, parsePeople, parseRow, routeFor, teamSizeOf, trackFor } from "../src/lib/dataset";
import { pickTargets, samePerson } from "../src/lib/enrich";
import { buildMime } from "../src/lib/gmail";
import type { FoundPerson } from "../src/lib/providers";
import { buildVars, render } from "../src/lib/render";
import { kindFor, templateFor } from "../src/lib/outreach";

test("parses named people, titles and LinkedIn from the sheet", () => {
  const p = parsePeople("Saksham Aggarwal (CEO) linkedin.com/in/sakshamagg27; Ishan Sharma (CTO) linkedin.com/in/ishandeveloper");
  assert.deepEqual(p.map((x) => [x.name, x.title, x.persona, x.linkedinUrl]), [
    ["Saksham Aggarwal", "CEO", "FOUNDER", "https://www.linkedin.com/in/sakshamagg27"],
    ["Ishan Sharma", "CTO", "FOUNDER", "https://www.linkedin.com/in/ishandeveloper"],
  ]);
  assert.deepEqual(parsePeople("Founders Sanket, Manish").map((x) => x.name), ["Sanket", "Manish"]);
  assert.deepEqual(parsePeople("CTO Kushaagra Goyal").map((x) => [x.name, x.title]), [["Kushaagra Goyal", "CTO"]]);
  assert.deepEqual(parsePeople("Founder: Virani").map((x) => x.name), ["Virani"]);
  for (const generic of ["Careers page", "Founders / HR via LinkedIn", "Founders on YC page", "IIT-Delhi alumni founders", "Founders (ex-Microsoft Research)", "Apply via listing"]) {
    assert.deepEqual(parsePeople(generic), [], generic);
  }
});

test("classifies route, track, team size and domain", () => {
  assert.equal(teamSizeOf("YC W26; 8 people"), 8);
  assert.equal(teamSizeOf("~$5M (General Catalyst); 63 staff"), 63);
  assert.equal(routeFor("YC startup (W26)", "Current sheet", 8), "FOUNDER");
  assert.equal(routeFor("YC startup (W19)", "YC India", 100), "MIXED");
  assert.equal(routeFor("Unicorn", "Unicorn", null), "HR");
  assert.equal(routeFor("Soonicorn", "Current sheet", null), "FOUNDER");
  assert.equal(routeFor("Growth startup", "Current sheet", null), "MIXED");
  assert.equal(trackFor("SDE, AI"), "TECH");
  assert.equal(trackFor("PM, Growth"), "NONTECH");
  assert.equal(trackFor("Consulting intern"), "NONTECH");
  assert.equal(companyDomain("https://www.ycombinator.com/companies/cardboard"), null);
  assert.equal(companyDomain("https://careers.jio.com", "Jio Platforms"), "jio.com");
  assert.equal(companyDomain("https://startuptalky.com/x", "Arivihan"), null);
  assert.equal(companyDomain("https://esparkinfo.com/blog", "Wednesday Solutions"), null);
  assert.equal(companyDomain("https://www.tcs.com", "Tata Consultancy Services (TCS)"), "tcs.com");
  assert.equal(companyDomain("https://amazon.jobs/en", "Amazon"), "amazon.com");
  assert.equal(companyDomain("https://www.airtel.in/careers"), "airtel.in");
  const r = parseRow({ Company: "Cardboard", Type: "YC startup (W26)", "Stage / funding": "YC W26; 8 people", "Roles to target": "SDE, Founding eng", "Who to contact": "Saksham Aggarwal (CEO)" });
  assert.equal(r?.company.route, "FOUNDER");
  assert.equal(r?.people.length, 1);
});

const person = (name: string, persona: FoundPerson["persona"], email: string | null = null, confidence = 50): FoundPerson => ({
  name, firstName: name.split(" ")[0], lastName: name.split(" ")[1] ?? "", title: "", persona, email,
  emailStatus: email ? "likely" : "none", linkedinUrl: null, phone: null, source: "apollo", confidence,
});

test("picks founders for startups, HR for large companies, both for mixed", () => {
  const pool = [person("A Hr", "HR", "a@x.com"), person("B Founder", "FOUNDER"), person("C Cto", "FOUNDER", "c@x.com"), person("D Em", "HIRING_MANAGER", "d@x.com"), person("E Ops", "OTHER", "e@x.com")];
  assert.deepEqual(pickTargets("FOUNDER", pool).map((p) => p.name), ["C Cto", "B Founder", "D Em"]);
  assert.deepEqual(pickTargets("HR", pool).map((p) => p.name), ["A Hr", "D Em", "C Cto"]);
  const mixed = pickTargets("MIXED", pool);
  assert.ok(mixed.some((p) => p.persona === "HR") && mixed.some((p) => p.persona === "FOUNDER"));
  assert.ok(!pickTargets("HR", pool).some((p) => p.persona === "OTHER"));
});

test("cross-verifies sheet people against provider results", () => {
  assert.ok(samePerson({ name: "Saksham", linkedinUrl: null }, { name: "Saksham Aggarwal" }));
  assert.ok(samePerson({ name: "X", linkedinUrl: "https://linkedin.com/in/ishandeveloper" }, { name: "Ishan S", linkedinUrl: "https://www.linkedin.com/in/ishandeveloper/" }));
  assert.ok(!samePerson({ name: "Rahul Jain", linkedinUrl: "https://linkedin.com/in/a" }, { name: "Rahul Jain", linkedinUrl: "https://linkedin.com/in/b" }));
  assert.ok(!samePerson({ name: "Rahul Jain" }, { name: "Rahul Verma" }));
});

test("renders templates and drops empty labelled lines", () => {
  const vars = buildVars({ name: "Saksham Aggarwal", firstName: "Saksham", title: "CEO" }, { name: "Dolphin AI (Eloelo)", category: "AI video", roles: "SDE, AI" },
    { senderName: "Ajinkya", phone: "+91 99", githubUrl: "https://github.com/a", linkedinUrl: "", portfolioUrl: "", college: "Thapar", pitch: "I build video pipelines." });
  const out = render("Hi {{firstName}},\n\n{{role}} at {{company}}\nLinkedIn: {{myLinkedin}}\nGitHub: {{myGithub}}", vars);
  assert.equal(out, "Hi Saksham,\n\nSoftware Engineering at Dolphin AI\nGitHub: https://github.com/a");
});

test("chooses the template by persona and follow-up state", () => {
  const t = (persona: string) => ({ persona, name: persona }) as never;
  const all = [t("FOUNDER"), t("HR"), t("FOLLOW_UP")];
  assert.equal(templateFor(all, { persona: "HIRING_MANAGER" }, { route: "HR" }, "INITIAL")?.name, "FOUNDER");
  assert.equal(templateFor(all, { persona: "OTHER" }, { route: "HR" }, "INITIAL")?.name, "HR");
  assert.equal(templateFor(all, { persona: "HR" }, { route: "FOUNDER" }, "FOLLOW_UP")?.name, "FOLLOW_UP");
  assert.equal(kindFor({ threadId: null }), "INITIAL");
  assert.equal(kindFor({ threadId: "t1" }), "FOLLOW_UP");
});

test("builds a threaded MIME mail with attachment", () => {
  const mime = buildMime(
    { from: "Me <me@gmail.com>", to: "x@y.com", subject: "Re: Intern — Jan", text: "hi", html: "<p>hi</p>", inReplyTo: "<abc@gmail.com>", attachments: [{ filename: "resume.pdf", mime: "application/pdf", data: Buffer.from("%PDF") }] },
    "<id@gmail.com>",
  );
  assert.match(mime, /^From: Me <me@gmail.com>\r\n/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /In-Reply-To: <abc@gmail.com>/);
  assert.match(mime, /Content-Disposition: attachment; filename="resume.pdf"/);
  assert.ok(mime.includes(Buffer.from("%PDF").toString("base64")));
});
