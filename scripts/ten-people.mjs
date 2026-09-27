// Usage: npm run build && npx next start -p 3100, then: mkdir -p scratch/shots && node scripts/ten-people.mjs
// 10-persona exploratory run against the exact deployed commit (local stack).
// Each persona = its own browser context (own anonymous identity, device, habits).
import { chromium, devices } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const SHOTS = process.env.SHOTS ?? "scratch/shots";
const log = [];
const note = (who, what, detail = "") => {
  const line = `[${who}] ${what}${detail ? " — " + detail : ""}`;
  log.push(line);
  console.log(line);
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function persona(name, device, extra = {}) {
  const context = await browser.newContext({ ...devices[device], ...extra });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  page.on("response", (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  return { name, device, context, page, errors };
}
async function shot(p, label) {
  await p.page.screenshot({ path: `${SHOTS}/${p.name.split(" ")[0].toLowerCase()}-${label}.png`, fullPage: true });
}
async function overflow(p) {
  return p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function settle(p) {
  await p.page.waitForFunction(() => !document.body.innerText.includes("Loading"), null, { timeout: 20000 }).catch(() => {});
}
async function results(p) {
  await p.page.getByRole("heading", { name: "What are our best viable options?" }).waitFor({ timeout: 20000 });
  await settle(p);
}
async function bodyText(p) {
  return p.page.locator("body").innerText();
}
async function blur(p) {
  await p.page.evaluate(() => document.activeElement?.blur());
}
async function setType(p, type, choice) {
  await p.page.getByRole("radiogroup", { name: type }).getByRole("radio", { name: choice, exact: true }).click();
}
async function addDates(p, start, end) {
  await p.page.getByRole("button", { name: "+ Add dates" }).click();
  const n = await p.page.getByLabel(/Date option \d+ start/).count();
  await p.page.getByLabel(`Date option ${n} start`).fill(start);
  await p.page.getByLabel(`Date option ${n} end`).fill(end);
}
async function typeBudget(p, ideal, max, slow = 0) {
  const i = p.page.getByLabel("Ideal budget per person in rupees");
  const m = p.page.getByLabel("Maximum budget per person in rupees");
  await i.fill("");
  await m.fill("");
  await i.pressSequentially(ideal, { delay: slow });
  await m.pressSequentially(max, { delay: slow });
  return [await i.inputValue(), await m.inputValue()];
}
async function submitForm(p) {
  await blur(p);
  await p.page.getByRole("button", { name: /Submit my private response|Save my updated response/ }).click();
}
async function join(p, url, typedName, { slow = 0 } = {}) {
  await p.page.goto(url);
  const field = p.page.getByLabel("Your name");
  await field.waitFor({ timeout: 15000 });
  await field.pressSequentially(typedName, { delay: slow });
  await p.page.getByRole("button", { name: "Continue" }).click();
  await p.page.getByRole("button", { name: "Submit my private response" }).waitFor({ timeout: 15000 });
}
const PROGRESS_LEAK = /\b\d+\s*(of|\/)\s*\d+\b.*(submitted|answered|voted|joined)|[Ww]aiting for [A-Z]|\b[A-Z][a-z]+ (has|have) (submitted|answered|voted)|already voted/;

// ---------------------------------------------------------------------------
const riya = await persona("Riya", "Desktop Chrome");
const sid = await persona("Siddharth", "Pixel 7");
const karan = await persona("Karan", "iPhone SE");
const aisha = await persona("Aisha", "iPad (gen 7)");
const preethi = await persona("Preethi", "Galaxy S9+");
const arjun = await persona("Arjun", "Pixel 5");
const meera = await persona("Meera", "Desktop Chrome", { colorScheme: "dark" });
const dev = await persona("Dev", "Desktop Firefox".includes("Firefox") ? "Desktop Chrome" : "Desktop Chrome");
const zoya = await persona("Zoya", "iPhone SE", { viewport: { width: 320, height: 568 } });
const kabir = await persona("Kabir", "Moto G4");
const everyone = [riya, sid, karan, aisha, preethi, arjun, meera, dev, zoya, kabir];

// === 1. Riya (organizer, desktop, careful, types slowly) ===================
await riya.page.goto(BASE);
await riya.page.getByLabel("What are you deciding?").pressSequentially("Dec long weekend 🌊 — where to?", { delay: 20 });
await riya.page.getByRole("button", { name: "Create decision" }).click();
note("Riya", "clicked Create with no size/name", (await riya.page.getByRole("alert").allInnerTexts()).join(" | "));
await riya.page.getByRole("radiogroup", { name: "Group size" }).getByRole("radio", { name: "6", exact: true }).click();
await riya.page.getByLabel("Your name").pressSequentially("Riya", { delay: 30 });
await riya.page.getByLabel("Travel year (optional)").selectOption("2026");
await riya.page.getByRole("button", { name: "Create decision" }).click();
await riya.page.waitForURL(/\/d\//);
const url = riya.page.url().split("?")[0];
note("Riya", "created decision (size 6)", url);
await shot(riya, "01-created");
const preText = await bodyText(riya);
note("Riya", "pre-reveal page mentions destinations?", /Goa|Coorg|Hampi|₹18,000/.test(preText) ? "YES (bug)" : "no — good");
await addDates(riya, "2026-12-10", "2026-12-13");
note("Riya", "budget typed", JSON.stringify(await typeBudget(riya, "15000", "25000", 25)));
await setType(riya, "Beach", "Prefer");
await setType(riya, "Hills & plantations", "Prefer");
await setType(riya, "Wildlife & jungle", "Rather not");
await riya.page.getByRole("button", { name: /Water sports: no preference/ }).click();
await riya.page.getByRole("button", { name: /Nightlife: no preference/ }).click();
await riya.page.getByLabel(/Anything else/).fill("Would love a beach but flexible!! RIYA-SECRET-NOTE");
await submitForm(riya);
await riya.page.getByText("Your response is private until everyone submits.").waitFor();
note("Riya", "submitted; waiting page leaks progress?", PROGRESS_LEAK.test(await bodyText(riya)) ? "YES (bug)" : "no");

// === 2. Siddharth (Pixel, terse, typed budgets with commas & ₹) ============
await join(sid, url, "sid");
await addDates(sid, "2026-12-11", "2026-12-14");
note("Siddharth", "typed '₹8,000' / '12,000'", JSON.stringify(await typeBudget(sid, "₹8,000", "12,000")));
await setType(sid, "Heritage & palaces", "Prefer");
await setType(sid, "High mountains", "Never");
await sid.page.getByRole("button", { name: /Trekking & hikes: no preference/ }).click();
await submitForm(sid);
await sid.page.getByText("Your response is private until everyone submits.").waitFor();
note("Siddharth", "cannot see Riya's answers?", /RIYA-SECRET-NOTE|25000|25,000/.test(await bodyText(sid)) ? "LEAK" : "correct, nothing visible");

// === 3. Karan (iPhone SE, sloppy: spaces in name, '15k' budgets) ===========
await join(karan, url, "  karan  ");
await typeBudget(karan, "15", "20");
await submitForm(karan);
note("Karan", "typo: typed '15' / '20' (meant thousands)", (await karan.page.getByRole("alert").allInnerTexts()).join(" | ") || "accepted silently (bug)");
note("Karan", "then typed '15k' / '20k'", JSON.stringify(await typeBudget(karan, "15k", "20k")) + " → " + ((await karan.page.getByText(/Saved as/).allInnerTexts())[0] ?? "(no preview)"));
await setType(karan, "Beach", "Prefer");
await setType(karan, "River & adventure", "Prefer");
await karan.page.getByRole("button", { name: /Nightlife: no preference/ }).click();
await karan.page.getByRole("button", { name: /River rafting: no preference/ }).click();
await submitForm(karan);
await karan.page.getByText("Your response is private until everyone submits.").waitFor();
note("Karan", "submitted", `overflow=${await overflow(karan)}px`);

// === 4. Aisha (iPad, submits only her name; goes offline once) ============
await join(aisha, url, "Aisha");
await aisha.context.setOffline(true);
await submitForm(aisha);
await aisha.page.waitForTimeout(1500);
note("Aisha", "submit while offline", (await aisha.page.getByRole("alert").allInnerTexts()).join(" | ") || "(no message shown)");
await shot(aisha, "04-offline");
await aisha.context.setOffline(false);
await submitForm(aisha);
await aisha.page.getByText("Your response is private until everyone submits.").waitFor();
note("Aisha", "back online, retried, submitted name-only response");

// === 5. Preethi (Galaxy, indecisive: invalid inputs, refresh mid-form, many edits)
await join(preethi, url, "Preethi");
await addDates(preethi, "2026-12-12", "2026-12-10");
await submitForm(preethi);
note("Preethi", "end-before-start dates", (await preethi.page.getByRole("alert").allInnerTexts()).join(" | "));
await preethi.page.getByRole("button", { name: /Remove date option 1/ }).click();
await typeBudget(preethi, "12000", "");
await submitForm(preethi);
note("Preethi", "only ideal budget", (await preethi.page.getByRole("alert").allInnerTexts()).join(" | "));
await typeBudget(preethi, "30000", "18000");
await submitForm(preethi);
note("Preethi", "ideal > max", (await preethi.page.getByRole("alert").allInnerTexts()).join(" | "));
await setType(preethi, "Hills & plantations", "Prefer");
await preethi.page.reload();
await preethi.page.getByRole("button", { name: "Submit my private response" }).waitFor();
const keptAfterReload = await preethi.page.getByLabel("Ideal budget per person in rupees").inputValue();
note("Preethi", "refreshed mid-form; unsaved input kept?", keptAfterReload ? `kept ("${keptAfterReload}") + notice: ${(await preethi.page.getByText("We kept your unsaved answers").count()) ? "shown" : "missing"}` : "LOST (all half-filled answers gone)");
await preethi.page.getByRole("button", { name: "Discard them" }).click().catch(() => {});
await addDates(preethi, "2026-12-10", "2026-12-12");
await addDates(preethi, "2027-01-20", "2027-01-24");
await addDates(preethi, "2027-02-14", "2027-02-16");
await typeBudget(preethi, "12000", "18000");
await setType(preethi, "Hills & plantations", "Prefer");
await setType(preethi, "Heritage & palaces", "Prefer");
await setType(preethi, "Beach", "Rather not");
await submitForm(preethi);
await preethi.page.getByText(/private until everyone submits/).waitFor();
for (let i = 0; i < 2; i++) {
  await preethi.page.getByRole("button", { name: "Edit my response" }).click();
  await setType(preethi, "Backwaters", i === 0 ? "Prefer" : "Fine");
  await submitForm(preethi);
  await preethi.page.getByText(/private until everyone submits/).waitFor();
}
note("Preethi", "3 saved versions", (await preethi.page.getByText(/saved \d+ versions/).allInnerTexts()).join(" "));

// === Organizer raises the size (more friends want in) =======================
await riya.page.reload();
await riya.page.getByLabel("New group size").selectOption("8");
await riya.page.getByRole("button", { name: "Save" }).click();
note("Riya", "raised size 6 → 8", (await riya.page.getByRole("status").allInnerTexts()).filter((t) => /Group size/.test(t)).join(" "));
const decrease = await riya.page.getByLabel("New group size").locator("option").allInnerTexts();
note("Riya", "size options now offered", decrease.join(", "));

// === 6. Arjun (Pixel 5): submits, then loses his session (cleared data) ====
await join(arjun, url, "Arjun");
await typeBudget(arjun, "20000", "30000");
await setType(arjun, "River & adventure", "Prefer");
await setType(arjun, "High mountains", "Prefer");
await submitForm(arjun);
await arjun.page.getByText(/private until everyone submits/).waitFor();
await arjun.context.clearCookies();
await arjun.page.evaluate(() => localStorage.clear());
await arjun.page.reload();
await settle(arjun);
const arjunAfterClear = await bodyText(arjun);
note("Arjun", "cleared browser data, reopened link", /Your name/.test(arjunAfterClear) ? "treated as a NEW visitor (join form again)" : arjunAfterClear.slice(0, 120));
await join(arjun, url, "Arjun");
await typeBudget(arjun, "20000", "30000");
await setType(arjun, "River & adventure", "Prefer");
note("Arjun", "joined again as a second 'Arjun' — occupies a second seat");

// === 7. Meera (dark mode desktop, very long emoji name, huge note, Never beach)
await meera.page.goto(url);
const longName = "Meera 🌴 Krishnamurthy-Venkataraman of Chennai";
await meera.page.getByLabel("Your name").fill(longName);
const storedName = await meera.page.getByLabel("Your name").inputValue();
note("Meera", `typed ${longName.length}-char name`, `field kept ${storedName.length} chars: "${storedName}"`);
await meera.page.getByRole("button", { name: "Continue" }).click();
await meera.page.getByRole("button", { name: "Submit my private response" }).waitFor();
await setType(meera, "Beach", "Never");
await setType(meera, "Backwaters", "Prefer");
await meera.page.getByRole("button", { name: /Nightlife: no preference/ }).click();
await meera.page.getByRole("button", { name: /Nightlife: would love/ }).click();
await meera.page.getByRole("button", { name: /Boating & houseboats: no preference/ }).click();
await meera.page.getByLabel(/Anything else/).fill("I get seasick easily and hate crowds. ".repeat(30));
await submitForm(meera);
note("Meera", "pasted ~1100-char note", (await meera.page.getByRole("alert").allInnerTexts()).join(" | ") || "accepted");
await meera.page.getByLabel(/Anything else/).fill("No beaches please, quiet places.");
await shot(meera, "07-darkmode-form");

// === Simultaneous final submissions: Arjun(2) + Meera fill the 8th seat ====
await Promise.all([submitForm(arjun), submitForm(meera)]);
await meera.page.getByRole("heading", { name: "What are our best viable options?" }).waitFor({ timeout: 20000 }).catch(() => {});
note("System", "8 of 8 seats submitted (incl. Arjun's lost-session ghost) → reveal?", (await meera.page.getByRole("heading", { name: "What are our best viable options?" }).count()) ? "revealed" : "NOT revealed");

// === 8. Dev (desktop, keyboard only, duplicate name 'Riya') tries to join ===
await dev.page.goto(url);
await settle(dev);
const devText = await bodyText(dev);
note("Dev", "opened link after roster filled", devText.includes("closed to new people") ? "closed (results already out)" : devText.includes("roster is already full") ? "roster full" : devText.slice(0, 100));

// === 9. Zoya (320px phone) and 10. Kabir (Moto G4, pastes bad links) =======
await zoya.page.goto(url);
await settle(zoya);
note("Zoya", "late joiner on 320px screen", ((await bodyText(zoya)).match(/closed to new people|roster is already full/) || ["?"])[0] + `, overflow=${await overflow(zoya)}px`);
for (const bad of [url.slice(0, -4), url + "x", BASE + "/d/", BASE + "/d/%20"]) {
  await kabir.page.goto(bad);
  await settle(kabir);
  const t = await bodyText(kabir);
  note("Kabir", `opened mangled link …${bad.slice(-12)}`, (t.match(/doesn't look right|couldn't find|doesn’t exist|closed|full/) || [t.slice(0, 60)])[0]);
}

// === Results as seen by each member =========================================
const members = [riya, sid, karan, aisha, preethi, meera, arjun];
for (const p of members) {
  await p.page.reload();
  await p.page.getByRole("heading", { name: "What are our best viable options?" }).waitFor({ timeout: 20000 });
}
await settle(riya);
const res = await bodyText(riya);
note("Riya", "results headline", res.match(/No option currently works[^\n]*|Only \d option[^\n]*|The top options[^\n]*/)?.[0] ?? "?");
await shot(riya, "10-results");
for (const p of members) {
  const t = await bodyText(p);
  const leaks = [["Riya's max 25,000", /25,000/], ["Riya's note", /RIYA-SECRET-NOTE/], ["Arjun's 30,000", /30,000/], ["Arjun's 20,000", /20,000/], ["Meera's note", /seasick/]].filter(([, re]) => re.test(t)).map(([n]) => n);
  note(p.name, "privacy check on results page", leaks.length ? "LEAK: " + leaks.join(", ") : "no private values visible");
  note(p.name, "horizontal overflow", `${await overflow(p)}px`);
}
const karanView = await bodyText(karan);
const justForYou = karanView.match(/Just for you[\s\S]*?Only you see these details/)?.[0]?.replace(/\s+/g, " ");
note("Karan", "private 'Just for you' box", justForYou ?? "(none)");
note("Karan", "sees 'Voting is not open yet'?", /Voting is not open yet/.test(karanView) ? "yes" : "no");
await shot(karan, "11-karan-results");

// === Karan changes his mind after reveal (tighter budget) ===================
await karan.page.getByRole("button", { name: "Edit my response" }).click();
note("Karan", "edit form prefilled budget", JSON.stringify([await karan.page.getByLabel("Ideal budget per person in rupees").inputValue(), await karan.page.getByLabel("Maximum budget per person in rupees").inputValue()]));
await typeBudget(karan, "10k", "14k");
await submitForm(karan);
await karan.page.getByRole("heading", { name: "What are our best viable options?" }).waitFor();
await riya.page.reload();
await results(riya);
const afterFix = await bodyText(riya);
note("Riya", "after Karan's post-reveal edit", (afterFix.match(/karan’s response was updated[^\n]*/i) || ["no activity line"])[0] + " | " + (afterFix.match(/No option currently works[^\n]*|Only \d option[^\n]*|The top options[^\n]*/)?.[0] ?? "?"));
await shot(riya, "12-after-karan-fix");

// === Voting ==================================================================
const voters = [riya, sid, karan, aisha, preethi, meera, arjun];
await riya.page.getByRole("heading", { name: "Final vote" }).waitFor();
const firstOptionNames = await riya.page.locator('input[name="vote"]').evaluateAll((els) => els.map((e) => e.closest("label")?.innerText.trim()));
note("System", "vote choices offered", firstOptionNames.join(" / ") || "(voting closed)");
if (firstOptionNames.length) {
  for (const [i, p] of voters.entries()) {
    await p.page.reload();
    await results(p);
    const radios = p.page.locator('input[name="vote"]');
    await radios.nth(i % (await radios.count())).check();
    await p.page.getByRole("button", { name: /Cast my vote/ }).click();
    await p.page.getByText("Your vote is recorded.").waitFor();
    if (PROGRESS_LEAK.test(await bodyText(p))) note(p.name, "vote page leaks progress", "BUG");
  }
  // Siddharth changes his mind
  await sid.page.reload();
  await results(sid);
  await sid.page.locator('input[name="vote"]').nth(2 % (await sid.page.locator('input[name="vote"]').count())).check();
  await sid.page.getByRole("button", { name: "Change my vote" }).click().catch(() => {});
  note("Siddharth", "changed vote before the end");
  await riya.page.reload();
  await results(riya);
  const decided = await riya.page.getByText("Final group decision").count();
  note("System", "all 7 reachable people voted — decision finalised?", decided ? "yes" : "NO — the lost-session 'Arjun' seat can never vote, so the decision is stuck in voting");
  await shot(riya, "13-voting-stuck");
}

// === Decision B: tie → no decision (Dev organises, Zoya, Kabir, Aisha) ======
await dev.page.goto(BASE);
await dev.page.getByLabel("What are you deciding?").focus();
await dev.page.keyboard.type("Board game weekend? (tie test)");
await dev.page.keyboard.press("Tab"); // → size group
await dev.page.keyboard.press("ArrowRight"); // 3 → 4
const chosenSize = await dev.page.locator('input[name="group-size"]:checked').inputValue().catch(() => "none");
note("Dev", "chose group size using only the keyboard", chosenSize);
await dev.page.getByLabel("Your name").fill("Riya");
await dev.page.getByRole("radiogroup", { name: "Group size" }).getByRole("radio", { name: "4", exact: true }).click();
await dev.page.getByRole("button", { name: "Create decision" }).click();
await dev.page.waitForURL(/\/d\//);
const urlB = dev.page.url().split("?")[0];
const same = async (p) => {
  await typeBudget(p, "15000", "20000");
  await setType(p, "Hills & plantations", "Prefer");
  await submitForm(p);
};
await same(dev);
await join(zoya, urlB, "Zoya");
note("Zoya", "form on 320px", `overflow=${await overflow(zoya)}px`);
await shot(zoya, "14-320px-form");
await same(zoya);
await join(kabir, urlB, "Kabir");
await same(kabir);
await join(aisha, urlB, "Aisha K");
await same(aisha);
for (const p of [dev, zoya, kabir, aisha]) {
  await p.page.goto(urlB);
  await p.page.getByRole("heading", { name: "What are our best viable options?" }).waitFor({ timeout: 20000 });
}
const tieChoices = await dev.page.locator('input[name="vote"]').count();
for (const [i, p] of [dev, zoya, kabir, aisha].entries()) {
  await p.page.reload();
  await results(p);
  await p.page.locator('input[name="vote"]').nth(i < 2 ? 0 : 1).check();
  await p.page.getByRole("button", { name: /Cast my vote/ }).click();
  await p.page.getByText(/Your vote is recorded|Final group decision/).first().waitFor();
}
await dev.page.reload();
await results(dev);
const outB = await bodyText(dev);
note("Dev", `tie test (${tieChoices} choices, 2–2 vote)`, (outB.match(/No decision — final vote remained tied\.|[A-Z][^\n]* was selected[^\n]*/) || ["?"])[0]);
note("Dev", "duplicate name 'Riya' shown as", (outB.match(/Riya, [^\n]*people/) || ["?"])[0]);
await shot(dev, "15-tie-outcome");

// === Decision C: a clean 3-person decision that books a plan =================
await preethi.page.goto(BASE);
await preethi.page.getByLabel("What are you deciding?").fill("Girls' trip Jan");
await preethi.page.getByRole("radiogroup", { name: "Group size" }).getByRole("radio", { name: "3", exact: true }).click();
await preethi.page.getByLabel("Your name").fill("Preethi");
await preethi.page.getByRole("button", { name: "Create decision" }).click();
await preethi.page.waitForURL(/\/d\//);
const urlC = preethi.page.url().split("?")[0];
await addDates(preethi, "2027-01-20", "2027-01-23");
await typeBudget(preethi, "12000", "16000");
await setType(preethi, "Heritage & palaces", "Prefer");
await submitForm(preethi);
await join(meera, urlC, "Meera");
await addDates(meera, "2027-01-19", "2027-01-24");
await setType(meera, "Heritage & palaces", "Prefer");
await setType(meera, "Beach", "Never");
await submitForm(meera);
await join(sid, urlC, "Sid");
await typeBudget(sid, "9000", "13000");
await setType(sid, "Heritage & palaces", "Prefer");
await setType(sid, "Hills & plantations", "Prefer");
await submitForm(sid);
for (const p of [preethi, meera, sid]) {
  await p.page.goto(urlC);
  await p.page.getByRole("heading", { name: "What are our best viable options?" }).waitFor({ timeout: 20000 });
}
const topC = await preethi.page.locator("h3").allInnerTexts();
note("Preethi", "Decision C top options", topC.slice(0, 3).join(" / "));
await preethi.page.getByRole("link", { name: /See how it fits each person/ }).first().click();
await preethi.page.getByText(/How .* fits each person/).waitFor();
note("Preethi", "option detail page", (await preethi.page.locator("h2").first().innerText()));
await shot(preethi, "16-option-detail");
await preethi.page.goBack();
for (const [i, p] of [preethi, meera, sid].entries()) {
  await p.page.reload();
  await results(p);
  await p.page.locator('input[name="vote"]').nth(i === 2 ? 1 : 0).check();
  await p.page.getByRole("button", { name: /Cast my vote/ }).click();
  await p.page.getByText(/Your vote is recorded|Final group decision/).first().waitFor();
}
await meera.page.reload();
await results(meera);
const outC = await bodyText(meera);
note("Meera", "Decision C outcome", (outC.match(/Final group decision\n+([^\n]+)/)?.[1] ?? "?") + " — " + (outC.match(/[A-Z][^\n]* was selected[^\n]*/)?.[0] ?? ""));
note("Meera", "engine vs group line", outC.match(/Engine recommendation[^\n]*/)?.[0] ?? "?");
await shot(meera, "17-outcome-dark");
await meera.page.goto(urlC);
await results(meera);
note("Meera", "can still edit after decided?", (await meera.page.getByRole("button", { name: "Edit my response" }).count()) ? "YES (bug)" : "no — frozen");

// === Console / server errors ===================================================
for (const p of everyone) note(p.name, "console/server errors", p.errors.length ? [...new Set(p.errors)].slice(0, 4).join(" || ") : "none");

writeFileSync(`${SHOTS}/ten-people-log.txt`, log.join("\n") + "\n");
await browser.close();
