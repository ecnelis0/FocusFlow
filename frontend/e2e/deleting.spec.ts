import { expect, test } from "@playwright/test";

import { addFolder, addMaterial, logQuestion, questionCard, stamped } from "./helpers";

/** Everything the student made, they can unmake.
 *
 *  The rule underneath all of these is the one the rest of the app files under:
 *  losing where something was filed is bad, losing the question is unthinkable.
 *  So each of these asserts twice — that the thing went, and that what it held
 *  did not go with it.
 */

async function confirmRemove(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await page.getByRole("button", { name: `Confirm removing ${name}` }).click();
}

test("a concept can be removed from the list, and its questions stay", async ({ page }) => {
  const subject = stamped("Algebra");
  const question = `Kept after the concept goes ${Date.now() % 1000000}`;

  await addMaterial(page, {
    subject,
    text: `Solving linear equations ${Date.now() % 1000000}: isolate before dividing.\n${question}? Answer: 5`,
  });

  await page.goto("/concepts");
  const concept = page.getByRole("heading", { level: 3 }).filter({ hasText: "Solving linear" });
  await expect(concept).toHaveCount(1, { timeout: 15_000 });
  const title = (await concept.innerText()).trim();

  await confirmRemove(page, title);
  await expect(page.getByRole("heading", { level: 3 }).filter({ hasText: title })).toHaveCount(0);

  // The question it held is still in the bank.
  await page.goto(`/bank?q=${encodeURIComponent(question)}`);
  await expect(questionCard(page, question)).toHaveCount(1, { timeout: 15_000 });
});

test("a folder can be removed, and what was in it stays in the subject", async ({ page }) => {
  const subject = stamped("Calculus");
  const folder = stamped("Related rates");

  await addFolder(page, subject, folder);
  await addMaterial(page, { folder, text: `A ladder slides ${Date.now() % 1000000}: differentiate both sides.` });

  await page.goto(`/bank?subject=${encodeURIComponent(subject)}`);
  await confirmRemove(page, folder);

  await expect(page.getByRole("button", { name: `Open ${folder}` })).toHaveCount(0);
  // The subject still holds what the folder did.
  await expect(page.getByRole("button", { name: "Open Not in a folder" })).toBeVisible({
    timeout: 15_000,
  });
});

test("a subject can be removed, and its questions stay in the bank", async ({ page }) => {
  const subject = stamped("Geology");
  const question = `Kept after the subject goes ${Date.now() % 1000000}`;

  await logQuestion(page, question, { subject });

  await page.goto("/bank");
  await expect(page.getByRole("tab", { name: new RegExp(`^${subject} `) })).toBeVisible({
    timeout: 15_000,
  });
  await confirmRemove(page, subject);
  await expect(page.getByRole("tab", { name: new RegExp(`^${subject} `) })).toHaveCount(0);

  await page.goto(`/bank?q=${encodeURIComponent(question)}`);
  await expect(questionCard(page, question)).toHaveCount(1, { timeout: 15_000 });
});

test("a material can be removed, and the concepts it produced stay", async ({ page }) => {
  const subject = stamped("Astronomy");
  const concept = `Parallax ${Date.now() % 1000000}`;

  await addMaterial(page, { subject, text: `${concept}: nearby stars shift against the far ones.` });

  await page.goto(`/bank?subject=${encodeURIComponent(subject)}`);
  const card = page.getByRole("button", { name: /^Expand / });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  const title = (await card.getAttribute("aria-label"))!.replace(/^Expand /, "");

  await confirmRemove(page, title);
  await expect(page.getByRole("button", { name: `Expand ${title}` })).toHaveCount(0);

  // The concept it produced is still there.
  await page.goto("/concepts");
  await expect(
    page.locator('a[href^="/concepts/"]').filter({ hasText: concept }),
  ).toHaveCount(1, { timeout: 15_000 });
});

test("a label can be removed from the whole bank, and the questions stay", async ({
  page,
}) => {
  const label = `throwaway ${Date.now() % 1000000}`;
  const carrying = `Carries the label ${Date.now() % 1000000}`;
  const other = `Somewhere else entirely ${Date.now() % 1000000}`;

  // Two questions, because the picker offers the labels this question does *not*
  // already carry — and a label no question carries does not exist to delete.
  const carryingUrl = await logQuestion(page, carrying);
  await page.getByLabel("Add a label").fill(label);
  await page.getByLabel("Add a label").press("Enter");
  await expect(page.getByRole("button", { name: `Remove label ${label}` })).toBeVisible();

  await logQuestion(page, other);
  const offered = page.getByRole("button", { name: new RegExp(`^${label}`) });
  await expect(offered).toBeVisible({ timeout: 15_000 });

  await confirmRemove(page, `the label ${label}`);
  await expect(offered).toHaveCount(0, { timeout: 15_000 });

  // Off the question that carried it, and that question is otherwise untouched.
  await page.goto(carryingUrl);
  await expect(page.getByRole("article")).toContainText(carrying);
  await expect(page.getByRole("button", { name: `Remove label ${label}` })).toHaveCount(0);
});
