import { expect, test, type Page } from "@playwright/test";

import { logQuestion } from "./helpers";

async function writeConcept(page: Page, title: string, subject?: string) {
  await page.goto("/concepts");
  await page.getByRole("button", { name: /Write (a|your first) concept/ }).first().click();
  await page.getByLabel("The concept").fill(title);
  if (subject) await page.getByLabel("Subject").fill(subject);
  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("concepts are grouped by subject", async ({ page }) => {
  const stamp = Date.now() % 100000;
  const algebraConcept = `Algebra concept ${stamp}`;
  const biologyConcept = `Biology concept ${stamp}`;

  await writeConcept(page, algebraConcept, "Algebra");
  await writeConcept(page, biologyConcept, "Biology");

  await page.goto("/concepts");

  const algebra = page.getByRole("button", { name: /^Algebra/ });
  const biology = page.getByRole("button", { name: /^Biology/ });
  await expect(algebra).toBeVisible();
  await expect(biology).toBeVisible();

  // Open by default, each holding its own concepts and not the other's.
  await expect(page.getByRole("link", { name: new RegExp(algebraConcept) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(biologyConcept) })).toBeVisible();

  // Collapsing one hides only its own.
  await algebra.click();
  await expect(page.getByRole("link", { name: new RegExp(algebraConcept) })).toBeHidden();
  await expect(page.getByRole("link", { name: new RegExp(biologyConcept) })).toBeVisible();

  await algebra.click();
  await expect(page.getByRole("link", { name: new RegExp(algebraConcept) })).toBeVisible();
});


test("labels can be added and removed from a question already in the bank", async ({
  page,
}) => {
  const stamp = Date.now() % 100000;
  const question = `Relabel me later ${stamp} [e2e]`;

  // Filed with no labels of its own beyond the one capture puts on.
  const url = await logQuestion(page, question);

  // The question page has its own label picker - this is what was missing.
  await expect(page.getByText("Your labels")).toBeVisible();
  await page.getByLabel("Add a label").fill(`invented ${stamp}`);
  await page.getByLabel("Add a label").press("Enter");
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();

  // It really saved.
  await page.reload();
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();

  // Removing one saves too.
  await page.getByRole("button", { name: `Remove label invented ${stamp}` }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Remove label invented ${stamp}` }),
  ).toBeHidden();

  // And relabelling has not locked the AI out of its own analysis.
  await page.goto(url);
  await page.getByRole("button", { name: "Re-run the AI" }).click();
  await expect(page.getByText("WHY YOU GOT IT WRONG")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();
});


