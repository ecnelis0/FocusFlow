import { expect, test, type Page } from "@playwright/test";

import { logQuestion } from "./helpers";

/** Concepts written by hand, and questions tagged onto them.
 *
 *  Two things changed under these tests. A question can only arrive through
 *  Study now, so it is never untagged to begin with — capture files it under the
 *  concept its own material produced. And `/bank` opens on what you have put in
 *  rather than on a list of questions, so a spec that wants to see a question
 *  has to search for one.
 */

async function writeConcept(page: Page, title: string, subject = "Algebra") {
  await page.goto("/concepts");
  await page
    .getByRole("button", { name: /Write (a|your first) concept/ })
    .first()
    .click();
  await page.getByLabel("The concept").fill(title);
  await page.getByLabel("Subject").fill(subject);
  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

/** The question's own card in the bank, found by searching for it.
 *
 *  Scoped to the cards that link into the bank: the concept a capture produced
 *  quotes the material back in its body, so matching the text anywhere on the
 *  page finds the concept as well as the question.
 */
function questionCard(page: Page, question: string) {
  return page.locator('a[href^="/bank/"]').filter({ hasText: question });
}

test("a concept is written once, then a question is tagged onto it afterwards", async ({
  page,
}) => {
  const stamp = Date.now() % 1000000;
  const title = `Circumference gives the radius first ${stamp}`;
  const question = `Concept tagging question ${stamp} [e2e]`;

  await writeConcept(page, title);

  // The question arrives already filed under the concept its material produced.
  const questionUrl = await logQuestion(page, question);
  await expect(page.getByRole("link", { name: /^Source notes/ })).toBeVisible();

  // Adding the hand-written concept alongside it.
  await page.getByRole("button", { name: "Tag with a concept" }).click();
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // The concept now collects that question, from its own page.
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  await expect(page.locator('a[href^="/bank/"]').filter({ hasText: question })).toHaveCount(1);

  // And the tag survives a reload of the question.
  await page.goto(questionUrl);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("a concept filters the bank, and untagging removes only the tag", async ({ page }) => {
  const stamp = Date.now() % 1000000;
  const title = `Filterable concept ${stamp}`;
  const tagged = `Alpha question ${stamp} [e2e]`;
  const untagged = `Omega question ${stamp} [e2e]`;

  await writeConcept(page, title);

  await logQuestion(page, untagged);
  await logQuestion(page, tagged);
  await page.getByRole("button", { name: "Tag with a concept" }).click();
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // The concept is a filter in the URL, which is what the rail used to build.
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  const conceptId = page.url().split("/").pop();

  await page.goto(`/bank?concept=${conceptId}`);
  await expect(questionCard(page, tagged)).toHaveCount(1, { timeout: 15_000 });
  await expect(questionCard(page, untagged)).toHaveCount(0);

  // Untagging from the concept page leaves the question itself alone.
  await page.goto(`/concepts/${conceptId}`);
  await page.getByRole("button", { name: "Untag" }).click();
  await expect(page.getByText("Nothing tagged yet.")).toBeVisible();

  await page.goto(`/bank?q=${encodeURIComponent(tagged)}`);
  await expect(questionCard(page, tagged)).toHaveCount(1, { timeout: 15_000 });
});

test("deleting a concept keeps the questions", async ({ page }) => {
  const stamp = Date.now() % 1000000;
  const title = `Disposable concept ${stamp}`;
  const question = `Survives deletion ${stamp} [e2e]`;

  await writeConcept(page, title);

  await logQuestion(page, question);
  await page.getByRole("button", { name: "Tag with a concept" }).click();
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.getByRole("link", { name: title }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete this concept" }).click();
  await expect(page).toHaveURL(/\/concepts$/);
  await expect(page.getByText(title)).toBeHidden();

  // Losing a concept must not lose what was filed under it.
  await page.goto(`/bank?q=${encodeURIComponent(question)}`);
  await expect(questionCard(page, question)).toHaveCount(1, { timeout: 15_000 });
});

test("questions can be tagged from the concept's own page, and show up there", async ({
  page,
}) => {
  const stamp = Date.now() % 1000000;
  const title = `Tag from concept ${stamp}`;
  const question = `Tagged from the concept side ${stamp} [e2e]`;

  await logQuestion(page, question);
  await writeConcept(page, title);

  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);

  // Tag from here, rather than having to go and find the question.
  await expect(page.getByText("Nothing tagged yet.")).toBeVisible();
  await page.getByRole("button", { name: "Tag questions with this concept" }).click();
  await page.getByLabel("Search your questions").fill(`Tagged from the concept side ${stamp}`);
  await page
    .getByRole("button", { name: new RegExp(`Tagged from the concept side ${stamp}`) })
    .click();

  // It appears at the bottom of the concept immediately.
  await expect(page.getByText("Nothing tagged yet.")).toBeHidden();
  await expect(page.locator('a[href^="/bank/"]').filter({ hasText: question })).toHaveCount(1);

  // And the question's card in the bank now names the concept.
  await page.goto(`/bank?q=${encodeURIComponent(question)}`);
  await expect(questionCard(page, question).getByText(title)).toBeVisible({ timeout: 15_000 });
});
