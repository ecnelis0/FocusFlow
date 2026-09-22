import { expect, type Page } from "@playwright/test";

/** The specs share one database and run in a single worker, so nothing here may
 *  assume the bank lacks something. Every name a spec makes is stamped. */
export const stamped = (name: string) => `${name} ${Date.now() % 1000000}`;

/** Put material through Study and file it, returning what it produced.
 *
 *  There is no "log a question" form any more — capture is the only way anything
 *  reaches the bank, so every spec that needs a question in it has to go through
 *  here. The offline extractor makes the first paragraph the branch and hangs
 *  the rest beneath it, and turns any line containing `?` into a practice
 *  question whose answer is whatever follows `Answer:` on that line.
 */
export async function addMaterial(
  page: Page,
  { text, folder, subject }: { text: string; folder?: string; subject?: string },
) {
  await page.goto("/");
  await page.getByLabel("Notes to file").fill(text);
  if (folder) await page.getByLabel("File it into").selectOption({ label: folder });
  // The free-text steer, which the form only offers while no folder is chosen —
  // a folder already carries its subject, and the folder wins on the server.
  else if (subject) await page.getByLabel("Subject").fill(subject);
  await page.getByRole("button", { name: "Scan for concepts" }).click();
  await page.getByRole("button", { name: /^Approve and log/ }).click();
  await expect(page.getByText(/^Filed /)).toBeVisible({ timeout: 20_000 });
}

/** A subject, created if it is not there yet, and left open on the bank. */
export async function openSubject(page: Page, subject: string) {
  await page.goto("/bank");

  // Waited for, not counted. `count()` does not retry, and the strip renders its
  // "All" tab from an empty list before the subjects arrive — so asking straight
  // after the navigation always answers "none", and this went down the create
  // path for a subject that already existed: a 409, no open tab, and no
  // "+ Folder" button for the caller to click.
  const tab = page.getByRole("tab", { name: new RegExp(subject) });
  try {
    await tab.waitFor({ timeout: 3_000 });
    await tab.click();
  } catch {
    await page.getByRole("button", { name: "+ Subject" }).click();
    await page.getByLabel("New subject").fill(subject);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: `+ Folder in ${subject}` })).toBeVisible({
    timeout: 15_000,
  });
}

/** A folder inside a subject, making the subject first if it does not exist.
 *
 *  Idempotent on the subject, because a spec that wants two folders in one
 *  course calls this twice — and creating the subject a second time is a 409
 *  that left the strip with no open tab and no "+ Folder" button to click. */
export async function addFolder(page: Page, subject: string, folder: string) {
  await openSubject(page, subject);
  await page.getByRole("button", { name: `+ Folder in ${subject}` }).click();
  await page.getByLabel("New folder").fill(folder);
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByRole("button", { name: `Open ${folder}` })).toBeVisible();
}

/** A question in the bank, left open at its own page.
 *
 *  What the old log form did, done the only way that is left. The offline
 *  extractor needs two lines: the first becomes the concept, and the second —
 *  because it contains a `?` — becomes the practice question, with its answer
 *  taken from whatever follows `Answer:`.
 */
export async function logQuestion(
  page: Page,
  question: string,
  { folder, subject, answer = "2" }: { folder?: string; subject?: string; answer?: string } = {},
) {
  // Two rules of the offline extractor decide this text.
  //
  // The `?` is what makes a line a question rather than more prose, and most
  // specs name their question without one — without it this filed a concept and
  // no question at all.
  //
  // And the *first* line must contain neither the question nor a `?` of its own.
  // It used to read "Notes behind <question>", which for a question that already
  // ended in one produced a second question out of the concept line, and every
  // "exactly one card" assertion then found two.
  const asked = question.includes("?") ? question : `${question}?`;
  const token = Math.random().toString(36).slice(2, 8);
  await addMaterial(page, {
    text: `Source notes ${token}.\n${asked} Answer: ${answer}`,
    folder,
    subject,
  });

  await page.goto(`/bank?q=${encodeURIComponent(question)}`);
  const card = page.locator('a[href^="/bank/"]').filter({ hasText: question });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await card.click();
  await expect(page).toHaveURL(/\/bank\/[0-9a-f]{32}/);
  // The question's own URL, so a spec can come back to it and prove something
  // was stored rather than merely rendered once.
  return page.url();
}

/** Open a material in a folder listing, revealing what came out of it.
 *
 *  A folder lists what you put in, not a pooled heap of questions, so a spec
 *  that wants to see a question has to open the material that produced it. */
export async function expandMaterial(page: Page, title?: string) {
  const control = title
    ? page.getByRole("button", { name: `Expand ${title}` })
    : page.getByRole("button", { name: /^Expand / }).first();
  await expect(control).toBeVisible({ timeout: 15_000 });
  await control.click();
}

/** A question's card, wherever one is listed.
 *
 *  Scoped to the links that go into the bank: a material's summary and its
 *  concept bodies quote the material back, so matching the text anywhere on the
 *  page finds those too. */
export function questionCard(page: Page, question: string) {
  return page.locator('a[href^="/bank/"]').filter({ hasText: question });
}
