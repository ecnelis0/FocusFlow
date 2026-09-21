import { expect, test, type Page } from "@playwright/test";

import { logQuestion } from "./helpers";

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
  const stamp = Date.now() % 100000;
  const title = `inverse trig ${stamp}`;

  await logQuestion(page, `Unrelated question ${stamp} [e2e]`);
  await writeConcept(page, title);

  await page.getByRole("button", { name: "Ask the bank" }).click();
  const panel = page.getByRole("complementary", { name: "Ask the bank" });
  await panel.getByRole("tab", { name: "Categories" }).click();
  await panel.getByRole("button", { name: "Expand Algebra" }).click();

  // The rail warns before you click it.
  const row = panel.getByRole("checkbox", { name: new RegExp(title) });
  await expect(row.getByText("nothing tagged")).toBeVisible();

  await row.click();
  await panel.getByRole("button", { name: "Show 1 filter" }).click();

  // And the bank names the concept instead of a generic "nothing matches".
  await expect(
    page.getByText(new RegExp(`Nothing is tagged with .${title}. yet`)),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Tag questions with it" })).toBeVisible();

  // That way out actually leads somewhere useful.
  await page.getByRole("link", { name: "Tag questions with it" }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  await expect(page.getByRole("button", { name: "Tag questions with this concept" })).toBeVisible();
});

test("questions with no concept are findable and taggable", async ({ page }) => {
  const stamp = Date.now() % 100000;
  const title = `Taggable concept ${stamp}`;
  const question = `Needs a concept ${stamp} [e2e]`;

  await logQuestion(page, question);
  await writeConcept(page, title);

  // The "no concept yet" filter is a link, not a dashboard nudge: the dashboard
  // that counted them is gone, but the filter it linked to still works.
  await page.goto("/bank?tagged=0");
  await expect(page.getByText("No concept yet")).toBeVisible();
  await expect(page.getByRole("main").getByText(question)).toBeVisible({ timeout: 10_000 });

  // Tag it, and it leaves the untagged view.
  await page.goto("/concepts");
  await page.getByText(title).click();
  await page.getByRole("button", { name: "Tag questions with this concept" }).click();
  await page.getByLabel("Search your questions").fill(question);
  await page.getByRole("button", { name: new RegExp(`Needs a concept ${stamp}`) }).click();
  await expect(page.getByRole("main").getByText(question)).toBeVisible();

  await page.goto("/bank?tagged=0");
  await expect(page.getByRole("main").getByText(question)).toBeHidden();
});
