import { expect, test, type Page } from "@playwright/test";

async function writeConcept(page: Page, title: string, subject?: string) {
  await page.goto("/concepts");
  await page.getByRole("button", { name: /Write (a|your first) concept/ }).first().click();
  await page.getByLabel("The concept").fill(title);
  if (subject) await page.getByLabel("Subject").fill(subject);
  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("a question can be labelled and filed under a concept while logging", async ({
  page,
}) => {
  const stamp = Date.now() % 100000;
  const concept = `Isolate before dividing ${stamp}`;
  const question = `Labelled at log time ${stamp} [e2e]`;

  await writeConcept(page, concept, "Algebra");

  await page.goto("/log");
  await page.getByLabel("The question").fill(question);
  await page.getByLabel("You put").fill("7");
  await page.getByLabel("The answer was").fill("5");

  // A label of my own, typed and entered.
  await page.getByLabel("Add a label").fill(`sloppy ${stamp}`);
  await page.getByLabel("Add a label").press("Enter");
  // Enter must add the label, not submit the form.
  await expect(page).toHaveURL(/\/log$/);
  // And one of the offered ones.
  await page.getByRole("button", { name: /by mistake/ }).click();

  await page.getByRole("button", { name: new RegExp(concept) }).click();
  await page.getByRole("button", { name: "Just log it" }).click();
  await expect(page).toHaveURL(/\/bank\/[0-9a-f]{32}/);

  // Both labels and the concept are on the saved question.
  await expect(page.getByRole("link", { name: concept })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: concept })).toBeVisible();

  // The label is now offered back to the next question.
  await page.goto("/log");
  await expect(page.getByRole("button", { name: new RegExp(`sloppy ${stamp}`) })).toBeVisible({
    timeout: 10_000,
  });
});

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

  // Logged with no labels at all.
  await page.goto("/log");
  await page.getByLabel("The question").fill(question);
  await page.getByLabel("You put").fill("1");
  await page.getByLabel("The answer was").fill("2");
  await page.getByRole("button", { name: "Log it and ask the AI" }).click();
  await expect(page).toHaveURL(/\/bank\/[0-9a-f]{32}/);
  const url = page.url();

  // The question page has its own label picker - this is what was missing.
  await expect(page.getByText("Your labels")).toBeVisible();
  await page.getByLabel("Add a label").fill(`invented ${stamp}`);
  await page.getByLabel("Add a label").press("Enter");
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();

  // One of the offered ones too.
  await page.getByRole("button", { name: /^by mistake/ }).click();
  await expect(page.getByRole("button", { name: "Remove label by mistake" })).toBeVisible();

  // It really saved.
  await page.reload();
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();

  // Removing one saves too.
  await page.getByRole("button", { name: "Remove label by mistake" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove label by mistake" })).toBeHidden();
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();

  // And relabelling has not locked the AI out of its own analysis.
  await page.goto(url);
  await page.getByRole("button", { name: "Re-run the AI" }).click();
  await expect(page.getByText("WHY YOU GOT IT WRONG")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: `Remove label invented ${stamp}` })).toBeVisible();
});


test("a subject in the rail expands to its own concepts and topics", async ({ page }) => {
  const stamp = Date.now() % 100000;
  const algebraConcept = `Rail algebra concept ${stamp}`;
  const biologyConcept = `Rail biology concept ${stamp}`;

  await writeConcept(page, algebraConcept, "Algebra");
  await writeConcept(page, biologyConcept, "Biology");

  await page.goto("/bank");
  await page.getByRole("button", { name: "Ask the bank" }).click();
  const panel = page.getByRole("complementary", { name: "Ask the bank" });
  await panel.getByRole("tab", { name: "Categories" }).click();

  // Folded away until the subject is opened.
  await expect(panel.getByText(algebraConcept)).toBeHidden();

  await panel.getByRole("button", { name: "Expand Algebra" }).click();
  await expect(panel.getByText(algebraConcept)).toBeVisible();
  // And only that subject's - the other stays shut.
  await expect(panel.getByText(biologyConcept)).toBeHidden();

  await panel.getByRole("button", { name: "Expand Biology" }).click();
  await expect(panel.getByText(biologyConcept)).toBeVisible();

  // Selecting one still filters the bank by that concept.
  await panel.getByRole("checkbox", { name: new RegExp(algebraConcept) }).click();
  await panel.getByRole("button", { name: "Show 1 filter" }).click();
  await expect(page).toHaveURL(/concept=/);
});
