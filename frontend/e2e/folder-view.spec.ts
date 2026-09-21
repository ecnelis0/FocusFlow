import { expect, test } from "@playwright/test";

const stamped = (name: string) => `${name} ${Date.now() % 1000000}`;

test("a folder's own page holds its concepts and its questions together", async ({
  page,
}) => {
  const subject = stamped("Physics");
  const folder = stamped("Unit 4: Waves");
  const branch = stamped("Wave behaviour");
  const detail = stamped("Refraction bends light");
  const asked = `What happens to a wave entering glass ${Date.now() % 1000000}?`;

  await page.goto("/bank");
  await page.getByRole("button", { name: "+ Subject" }).click();
  await page.getByLabel("New subject").fill(subject);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: `+ Folder in ${subject}` }).click();
  await page.getByLabel("New folder").fill(folder);
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByRole("button", { name: `Open ${folder}` })).toBeVisible();

  await page.goto("/");
  await page
    .getByLabel("Notes to file")
    .fill(
      `${branch}: waves carry energy without carrying matter.\n\n` +
        `${detail}: it slows down, so it turns toward the normal. ${asked} Answer: It slows and bends toward the normal.`,
    );
  await page.getByLabel("File it into").selectOption({ label: folder });
  await page.getByRole("button", { name: "Scan for concepts" }).click();
  await page.getByRole("button", { name: /^Approve and log/ }).click();
  await expect(page.getByText(/^Filed /)).toBeVisible({ timeout: 20_000 });

  // Reached from the folder card, without having to know a URL.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  await page.getByRole("link", { name: `View everything in ${folder}` }).click();
  await expect(page).toHaveURL(/\/folders\/[0-9a-f]{32}/);

  // Both halves on the one page: the concepts as a tree, and the questions.
  await expect(page.getByRole("heading", { name: folder })).toBeVisible();
  // By href, not by name: a question card names its concept as a tag, so
  // matching a link by the concept's title finds the question too.
  const conceptLinks = page.locator('a[href^="/concepts/"]');
  await expect(conceptLinks.filter({ hasText: branch })).toHaveCount(1);
  await expect(conceptLinks.filter({ hasText: detail })).toHaveCount(1);
  // Scoped to the question cards, which link into the bank. Matching the text
  // anywhere in main passed while the questions request was 422-ing, because the
  // concept's own body preview quotes the same line back.
  const questionCards = page.locator('a[href^="/bank/"]');
  await expect(questionCards).toHaveCount(1, { timeout: 10_000 });
  await expect(questionCards.first()).toContainText(asked);

  // A concept opens from here.
  await conceptLinks.filter({ hasText: branch }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
});

test("a folder that is gone says so, rather than looking broken", async ({ page }) => {
  await page.goto("/folders/00000000000000000000000000000000");
  await expect(page.getByText("No such folder.")).toBeVisible({ timeout: 15_000 });
});

test("a folder's concepts read in the order the material ran, not alphabetically", async ({
  page,
}) => {
  const subject = stamped("Chronology");
  const folder = stamped("Timeline");
  const stamp = Date.now() % 1000000;
  // Deliberately anti-alphabetical: sorted by title this is Alpha, Mid, Zulu.
  const branch = `Zulu the whole story ${stamp}`;
  const first = `Mid came first ${stamp}`;
  const second = `Alpha came second ${stamp}`;

  await page.goto("/bank");
  await page.getByRole("button", { name: "+ Subject" }).click();
  await page.getByLabel("New subject").fill(subject);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: `+ Folder in ${subject}` }).click();
  await page.getByLabel("New folder").fill(folder);
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByRole("button", { name: `Open ${folder}` })).toBeVisible();

  await page.goto("/");
  await page
    .getByLabel("Notes to file")
    .fill(`${branch}: the arc of it.\n\n${first}: it happened first.\n\n${second}: then this.`);
  await page.getByLabel("File it into").selectOption({ label: folder });
  await page.getByRole("button", { name: "Scan for concepts" }).click();
  await page.getByRole("button", { name: /^Approve and log/ }).click();
  await expect(page.getByText(/^Filed /)).toBeVisible({ timeout: 20_000 });

  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  await page.getByRole("link", { name: `View everything in ${folder}` }).click();

  // The page's own order, read off the DOM rather than asserted one at a time.
  // Waited for first: `allInnerTexts` does not retry, so reading it straight
  // after the navigation returns [] while the concepts query is still in flight
  // — and an empty list makes every "is it in order" check vacuously true.
  const conceptLinks = page.locator('a[href^="/concepts/"]');
  await expect(conceptLinks).toHaveCount(3, { timeout: 15_000 });

  const titles = await conceptLinks.allInnerTexts();
  const seen = titles.map((text) => text.split("\n")[0]);
  const positionOf = (needle: string) => seen.findIndex((line) => line.includes(needle));

  expect(positionOf(branch)).toBe(0);
  expect(positionOf(first)).toBeLessThan(positionOf(second));
});
