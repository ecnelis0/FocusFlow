import { expect, test, type Page } from "@playwright/test";

import { logQuestion, questionCard } from "./helpers";

async function writeConcept(page: Page, title: string) {
  await page.goto("/concepts");
  await page.getByRole("button", { name: /Write (a|your first) concept/ }).first().click();
  await page.getByLabel("The concept").fill(title);
  await page.getByLabel("Subject").fill("Algebra");
  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("a concept with nothing tagged says so, rather than looking broken", async ({
  page,
}) => {
  const stamp = Date.now() % 1000000;
  const title = `inverse trig ${stamp}`;

  await writeConcept(page, title);

  // Reached as a link, the way the rail used to build one. The rail is gone; the
  // filter it produced is still the thing being tested.
  await page.goto("/concepts");
  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  const conceptId = page.url().split("/").pop();

  await page.goto(`/bank?concept=${conceptId}`);

  // The bank names the concept instead of a generic "nothing matches".
  await expect(
    page.getByText(new RegExp(`Nothing is tagged with .${title}. yet`)),
  ).toBeVisible({ timeout: 15_000 });

  // And the way out leads somewhere useful.
  await page.getByRole("link", { name: "Open the concept" }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  await expect(
    page.getByRole("button", { name: "Tag questions with this concept" }),
  ).toBeVisible();
});

test("a question untagged from its concept is findable again, and re-taggable", async ({
  page,
}) => {
  const stamp = Date.now() % 1000000;
  const title = `Taggable concept ${stamp}`;
  const question = `Needs a concept ${stamp} [e2e]`;

  // Capture files every question under the concept its material produced, so
  // "no concept yet" is a state a question is put into, not one it starts in.
  await logQuestion(page, question);
  await page.getByRole("button", { name: /^Remove Source notes/ }).click();
  await expect(page.getByText("Not filed under any concept yet.")).toBeVisible();

  await writeConcept(page, title);

  await page.goto("/bank?tagged=0");
  await expect(page.getByText("No concept yet")).toBeVisible();
  await expect(questionCard(page, question)).toHaveCount(1, { timeout: 15_000 });

  // Tag it, and it leaves the untagged view.
  await page.goto("/concepts");
  await page.getByText(title).click();
  await page.getByRole("button", { name: "Tag questions with this concept" }).click();
  await page.getByLabel("Search your questions").fill(question);
  await page.getByRole("button", { name: new RegExp(`Needs a concept ${stamp}`) }).click();
  await expect(questionCard(page, question)).toHaveCount(1);

  await page.goto("/bank?tagged=0");
  await expect(questionCard(page, question)).toHaveCount(0, { timeout: 15_000 });
});
