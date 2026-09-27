import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Full path: create → join → blind submission → simultaneous reveal →
 * deterministic results → compromise explanation → blind vote → outcome.
 * Plus the zero-feasible path and the closed-roster path.
 */

async function newPerson(browser: Browser, contextOptions: Parameters<Browser["newContext"]>[0]) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { context, page };
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function createDecision(page: Page, name: string, size: number, organizer: string) {
  await page.goto("/");
  await page.getByLabel("What are you deciding?").fill(name);
  await page.getByRole("radiogroup", { name: "Group size" }).getByRole("radio", { name: String(size), exact: true }).click();
  await page.getByLabel("Your name").fill(organizer);
  await page.getByRole("button", { name: "Create decision" }).click();
  await page.waitForURL(/\/d\/[0-9a-f-]{36}/);
  await expect(page.getByText("Share this link with the group")).toBeVisible();
  return page.url().split("?")[0];
}

async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Submit my private response" })).toBeVisible();
}

async function setType(page: Page, type: string, choice: "Prefer" | "Fine" | "Rather not" | "Never") {
  await page.getByRole("radiogroup", { name: type }).getByRole("radio", { name: choice, exact: true }).click();
}

async function addDates(page: Page, start: string, end: string) {
  await page.getByRole("button", { name: "+ Add dates" }).click();
  const idx = (await page.getByLabel(/Date option \d+ start/).count());
  await page.getByLabel(`Date option ${idx} start`).fill(start);
  await page.getByLabel(`Date option ${idx} end`).fill(end);
}

async function setBudget(page: Page, ideal: string, max: string) {
  await page.getByLabel("Ideal budget per person in rupees").fill(ideal);
  await page.getByLabel("Maximum budget per person in rupees").fill(max);
}

async function submit(page: Page) {
  // A focused textarea keeps the emulated mobile viewport pinned to it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole("button", { name: /Submit my private response|Save my updated response/ }).click();
}

const PRIVACY_FORBIDDEN = [/\d+\s*(of|\/)\s*\d+\s*(have|submitted|answered|voted)/i, /waiting for [A-Z]/, /has submitted/i];

test("full decision path with blind submission and blind voting", async ({ browser }, info) => {
  const opts = info.project.use;
  const riya = await newPerson(browser, opts);
  const sid = await newPerson(browser, opts);
  const aisha = await newPerson(browser, opts);

  const url = await createDecision(riya.page, "December long weekend", 3, "Riya");
  await expectNoHorizontalScroll(riya.page);

  // Pre-reveal: the form shows categories only — no destinations or costs.
  await expect(riya.page.getByText("Goa")).toHaveCount(0);
  await expect(riya.page.getByText("₹18,000")).toHaveCount(0);

  await addDates(riya.page, "2026-12-10", "2026-12-13");
  await addDates(riya.page, "2027-01-20", "2027-01-24");
  await expectNoHorizontalScroll(riya.page);
  await setBudget(riya.page, "15000", "25000");
  await setType(riya.page, "Beach", "Prefer");
  await setType(riya.page, "Hills & plantations", "Prefer");
  await riya.page.getByRole("button", { name: /Water sports: no preference/ }).click();
  await riya.page.getByLabel(/Anything else/).fill("riya-private-note-123");
  await submit(riya.page);
  await expect(riya.page.getByText("Your response is private until everyone submits.")).toBeVisible();
  for (const re of PRIVACY_FORBIDDEN) await expect(riya.page.getByText(re)).toHaveCount(0);

  await join(sid.page, url, "Siddharth");
  await expectNoHorizontalScroll(sid.page);
  // Sid sees nothing of Riya's response.
  await expect(sid.page.getByText("riya-private-note-123")).toHaveCount(0);
  await expect(sid.page.getByText("15000")).toHaveCount(0);
  await addDates(sid.page, "2026-12-11", "2026-12-14");
  await setBudget(sid.page, "10000", "20000");
  await setType(sid.page, "Hills & plantations", "Prefer");
  await setType(sid.page, "High mountains", "Never");
  await submit(sid.page);
  await expect(sid.page.getByText("Your response is private until everyone submits.")).toBeVisible();

  // Aisha submits only her name (Insufficient Input) — this triggers reveal.
  await join(aisha.page, url, "Aisha");
  await submit(aisha.page);
  await expect(aisha.page.getByRole("heading", { name: "What are our best viable options?" })).toBeVisible();
  await expectNoHorizontalScroll(aisha.page);

  // Everyone else sees the reveal (poll) — simultaneous from the server's view.
  await expect(riya.page.getByRole("heading", { name: "What are our best viable options?" })).toBeVisible({ timeout: 20_000 });
  await expect(sid.page.getByRole("heading", { name: "What are our best viable options?" })).toBeVisible({ timeout: 20_000 });

  // Results: matrix, categorical budgets only, insufficient input visible.
  await expect(aisha.page.getByRole("heading", { name: "How does each option work for each person?" })).toBeVisible();
  await expect(aisha.page.getByRole("table")).toContainText("Siddharth");
  await expect(aisha.page.getByRole("table")).toContainText("Not enough input");
  const body = await aisha.page.locator("body").innerText();
  expect(body).not.toContain("25,000");
  expect(body).not.toContain("20,000");
  expect(body).not.toContain("riya-private-note-123");
  expect(body).not.toMatch(/\d+\s*\/\s*(100|10)\b|\d+%\s*fit|\bscore[sd]?\s*[:=]?\s*\d/i);
  await expect(aisha.page.getByText(/Explanation unavailable right now|Summaries are written by AI/)).toBeVisible({ timeout: 25_000 });

  // Spiti (high mountains) is Sid's dealbreaker → never among the options.
  await expect(aisha.page.getByRole("heading", { name: "Spiti Valley" })).toHaveCount(0);

  // Blind voting: first option for everyone.
  const firstOption = aisha.page.locator('input[name="vote"]').first();
  for (const p of [riya.page, sid.page]) {
    await p.reload();
    await p.locator('input[name="vote"]').first().check();
    await p.getByRole("button", { name: "Cast my vote" }).click();
    await expect(p.getByText("Your vote is recorded.")).toBeVisible();
    for (const re of PRIVACY_FORBIDDEN) await expect(p.getByText(re)).toHaveCount(0);
  }
  await firstOption.check();
  await aisha.page.getByRole("button", { name: "Cast my vote" }).click();

  await expect(aisha.page.getByText("Final group decision")).toBeVisible();
  await expect(aisha.page.getByText("No tie-break was required.")).toBeVisible();
  await expect(aisha.page.getByText(/was selected 3/)).toBeVisible();
  await riya.page.reload();
  await expect(riya.page.getByText("Final group decision")).toBeVisible();
  await expect(riya.page.getByRole("button", { name: "Edit my response" })).toHaveCount(0);

  // Late visitor: roster frozen.
  const late = await newPerson(browser, opts);
  await late.page.goto(url);
  await expect(late.page.getByText("This decision is closed to new people")).toBeVisible();

  for (const p of [riya, sid, aisha, late]) await p.context.close();
});

test("zero feasible options → sensitivity, voting disabled, edit unlocks voting", async ({ browser }, info) => {
  const opts = info.project.use;
  const a = await newPerson(browser, opts);
  const b = await newPerson(browser, opts);
  const c = await newPerson(browser, opts);
  const url = await createDecision(a.page, "Impossible trip", 3, "Ana");

  // Ana rules out everything except beaches; Ben rules out beaches.
  for (const t of ["Hills & plantations", "High mountains", "Heritage & palaces", "Backwaters", "Wildlife & jungle", "River & adventure"]) {
    await setType(a.page, t, "Never");
  }
  await submit(a.page);
  await join(b.page, url, "Ben");
  await setType(b.page, "Beach", "Never");
  await submit(b.page);
  await join(c.page, url, "Cai");
  await submit(c.page);

  await expect(c.page.getByText("No option currently works for everyone without changing at least one hard constraint.")).toBeVisible();
  await expect(c.page.getByText("Here are the smallest changes that would unlock additional options")).toBeVisible();
  await expect(c.page.getByText("Infeasible as submitted").first()).toBeVisible();
  await expect(c.page.getByText(/Relaxing one participant's destination-type dealbreaker/).first()).toBeVisible();
  await expect(c.page.getByText("Voting is not open yet")).toBeVisible();
  await expectNoHorizontalScroll(c.page);

  // Ben sees a private, exact lever about himself.
  await b.page.reload();
  await expect(b.page.getByText("Just for you")).toBeVisible({ timeout: 20_000 });

  // Ben relaxes his dealbreaker → beaches become feasible → voting opens.
  await b.page.getByRole("button", { name: "Edit my response" }).click();
  await expect(b.page.getByText("Editing after results are out")).toBeVisible();
  await setType(b.page, "Beach", "Rather not");
  await submit(b.page);
  await expect(b.page.getByRole("button", { name: "Cast my vote" })).toBeVisible();

  await c.page.reload();
  await expect(c.page.getByText(/Ben’s response was updated/)).toBeVisible();
  await expect(c.page.getByRole("button", { name: "Cast my vote" })).toBeVisible();

  for (const p of [a, b, c]) await p.context.close();
});

test("invalid and unknown decision links have calm states", async ({ page }) => {
  await page.goto("/d/not-a-real-id");
  await expect(page.getByText("This link doesn't look right")).toBeVisible();
  await page.goto("/d/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("We couldn't find this decision")).toBeVisible();
});

test("organizer closes voting when someone can't vote", async ({ browser }, info) => {
  const opts = info.project.use;
  const a = await newPerson(browser, opts);
  const b = await newPerson(browser, opts);
  const c = await newPerson(browser, opts);
  const url = await createDecision(a.page, "Ghost seat trip", 3, "Ola");
  await setType(a.page, "Hills & plantations", "Prefer");
  await submit(a.page);
  await join(b.page, url, "Ben");
  await setType(b.page, "Hills & plantations", "Prefer");
  await submit(b.page);
  await join(c.page, url, "Cy");
  await submit(c.page);
  await expect(c.page.getByRole("heading", { name: "Final vote" })).toBeVisible();
  // Cy "loses access" and never votes.
  await c.context.close();

  await a.page.reload();
  await a.page.locator('input[name="vote"]').first().check();
  await a.page.getByRole("button", { name: "Cast my vote" }).click();
  await expect(a.page.getByText("Your vote is recorded.")).toBeVisible();

  // Only the organizer sees the control; non-organizers never do.
  await b.page.reload();
  await expect(b.page.getByRole("button", { name: "Close voting now" })).toHaveCount(0);

  // 1 of 3 voted → refused without revealing counts.
  await a.page.getByRole("button", { name: "Close voting now" }).click();
  await a.page.getByRole("button", { name: "Yes, close voting now" }).click();
  await expect(a.page.getByText(/Not enough people have voted yet/)).toBeVisible();

  await b.page.locator('input[name="vote"]').first().check();
  await b.page.getByRole("button", { name: "Cast my vote" }).click();
  await expect(b.page.getByText("Your vote is recorded.")).toBeVisible();

  await a.page.reload();
  await a.page.getByRole("button", { name: "Close voting now" }).click();
  await a.page.getByRole("button", { name: "Yes, close voting now" }).click();
  await expect(a.page.getByText("Final group decision")).toBeVisible();
  await expect(a.page.getByText(/The organizer closed voting early: 2 of 3 people voted/)).toBeVisible();

  await b.page.reload();
  await expect(b.page.getByText(/closed voting early/)).toBeVisible();
  for (const p of [a, b]) await p.context.close();
});
