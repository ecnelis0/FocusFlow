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
  { text, folder }: { text: string; folder?: string },
) {
  await page.goto("/");
  await page.getByLabel("Notes to file").fill(text);
  if (folder) await page.getByLabel("File it into").selectOption({ label: folder });
  await page.getByRole("button", { name: "Scan for concepts" }).click();
  await page.getByRole("button", { name: /^Approve and log/ }).click();
  await expect(page.getByText(/^Filed /)).toBeVisible({ timeout: 20_000 });
}

/** A subject and a folder inside it, made on the bank. */
export async function addFolder(page: Page, subject: string, folder: string) {
  await page.goto("/bank");
  await page.getByRole("button", { name: "+ Subject" }).click();
  await page.getByLabel("New subject").fill(subject);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("tab", { name: new RegExp(subject) })).toBeVisible();

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
  { folder, answer = "2" }: { folder?: string; answer?: string } = {},
) {
  await addMaterial(page, {
    text: `Notes behind ${question}\n${question} Answer: ${answer}`,
    folder,
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
