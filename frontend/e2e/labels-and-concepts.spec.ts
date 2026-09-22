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
  const stamp = Date.now() % 1000000;
  // Stamped, because the specs share one database: a bare "Algebra" group header
  // matches every one left behind by every previous run.
  const algebraSubject = `Algebra ${stamp}`;
  const biologySubject = `Biology ${stamp}`;
  const algebraConcept = `Algebra concept ${stamp}`;
  const biologyConcept = `Biology concept ${stamp}`;

  await writeConcept(page, algebraConcept, algebraSubject);
  await writeConcept(page, biologyConcept, biologySubject);

  await page.goto("/concepts");

  const algebra = page.getByRole("button", { name: new RegExp(`^${algebraSubject}`) });
  const biology = page.getByRole("button", { name: new RegExp(`^${biologySubject}`) });
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

  // And the question itself is untouched by all of that.
  await page.goto(url);
  await expect(page.getByRole("article")).toContainText(question);
});


