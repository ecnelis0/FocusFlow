import { expect, test, type Page } from "@playwright/test";

import { logQuestion, questionCard } from "./helpers";

/** Opening a concept, and finding a question to tag onto it.
 *
 *  Both of these used to reach the concept through the category rail in the side
 *  panel. The rail was built on `/stats` and went with the review half of the
 *  app; what it produced — a concept filter in the URL — is still here, and is
 *  what these now assert against.
 */

async function writeConcept(page: Page, title: string, body?: string) {
  await page.goto("/concepts");
  await page
    .getByRole("button", { name: /Write (a|your first) concept/ })
    .first()
    .click();
  await page.getByLabel("The concept").fill(title);
  if (body) await page.getByLabel("In your own words").fill(body);
  await page.getByLabel("Subject").fill("Algebra");
  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("filtering by a concept shows the concept itself, then its questions", async ({
  page,
}) => {
  const stamp = Date.now() % 1000000;
  const title = `Circumference gives the radius ${stamp}`;
  const body = `C = 2πr, so r = C / 2π. [${stamp}]`;
  const question = `Circle area question ${stamp} [e2e]`;

  await logQuestion(page, question, { answer: "36π" });
  await writeConcept(page, title, body);

  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  const conceptId = page.url().split("/").pop();

  await page.getByRole("button", { name: "Tag questions with this concept" }).click();
  await page.getByLabel("Search your questions").fill(question);
  await page.getByRole("button", { name: new RegExp(`Circle area question ${stamp}`) }).click();
  await expect(questionCard(page, question)).toHaveCount(1);

  await page.goto(`/bank?concept=${conceptId}`);

  const main = page.getByRole("main");
  // The concept, in the student's own words, above its questions. Matched as the
  // heading: the title also appears as the tag on the question's card, which is
  // correct and would otherwise make this ambiguous.
  await expect(main.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText(body)).toBeVisible();
  await expect(main.getByText(/1 question filed under this concept/)).toBeVisible();
  await expect(questionCard(page, question)).toHaveCount(1);
});

test("a concept opens its own page from the list", async ({ page }) => {
  const stamp = Date.now() % 1000000;
  const title = `Openable concept ${stamp}`;

  await writeConcept(page, title);

  await page.goto("/concepts");
  await page.getByText(title).click();

  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  await expect(page.getByRole("main").getByRole("heading", { name: title })).toBeVisible();
});

test("tagging finds a question by its answer, or by words in any order", async ({ page }) => {
  const stamp = Date.now() % 1000000;
  const title = `Search test concept ${stamp}`;
  const question = `A circle has a circumference of 12π. What is its area? ${stamp}`;

  await logQuestion(page, question, { answer: `36π ${stamp}` });
  await writeConcept(page, title);

  await page.getByText(title).click();
  await page.getByRole("button", { name: "Tag questions with this concept" }).click();
  const search = page.getByLabel("Search your questions");

  // By the answer, which is not in the question text at all.
  await search.fill(`36π ${stamp}`);
  await expect(page.getByRole("button", { name: new RegExp(`${stamp}`) })).toBeVisible();

  // And by words out of order: every word has to appear, not in this sequence.
  await search.fill(`area circumference ${stamp}`);
  await expect(page.getByRole("button", { name: new RegExp(`${stamp}`) })).toBeVisible();
});
