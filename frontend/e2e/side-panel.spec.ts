import { expect, test } from "@playwright/test";

import { logQuestion } from "./helpers";

test("the side panel answers a question in the student's own words", async ({ page }) => {
  const question = `Side panel biology question ${Date.now() % 10000} [e2e]`;
  await logQuestion(page, question);

  await page.getByRole("button", { name: "Ask the bank" }).click();
  const panel = page.getByRole("complementary", { name: "Ask the bank" });
  await expect(panel).toBeVisible();

  await panel
    .getByLabel("Ask about your bank")
    .fill(
      "give me all the questions logged in the past 3 months that are fundamental " +
        "and from biology",
    );
  await panel.getByRole("button", { name: "Ask" }).click();

  // It reports what it searched for, and the hit is the real row.
  await expect(panel.getByText(/Searched:.*fundamental/)).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/Biology/).first()).toBeVisible();
  await expect(panel.getByText(question)).toBeVisible();

  // And the hit navigates to that question. The panel stays open across the
  // navigation, so the question is now on screen twice - scope to the page's article.
  await panel.getByText(question).click();
  await expect(page).toHaveURL(/\/bank\/[0-9a-f]{32}/);
  await expect(page.getByRole("article").getByText(question)).toBeVisible();
  await expect(panel).toBeVisible();
});

test("every row the panel returns actually satisfies the filter", async ({ page }) => {
  // Asserted as an invariant rather than an exact list: the specs share one e2e
  // database, so any "nothing matches" expectation is at the mercy of test order.
  // The empty state itself is covered deterministically in facets.spec.ts.
  await logQuestion(page, `Panel invariant ${Date.now() % 10000} [e2e]`);

  await page.getByRole("button", { name: "Ask the bank" }).click();
  const panel = page.getByRole("complementary", { name: "Ask the bank" });
  await panel.getByLabel("Ask about your bank").fill("fundamental biology questions");
  await panel.getByRole("button", { name: "Ask" }).click();

  await expect(panel.getByText(/Searched:.*fundamental/)).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/Searched:.*Biology/)).toBeVisible();

  const hits = panel.getByRole("link");
  for (let index = 0; index < (await hits.count()); index++) {
    const hit = hits.nth(index);
    await expect(hit.getByText("Fundamental concept")).toBeVisible();
    await expect(hit.getByText(/Biology/)).toBeVisible();
  }
});

test("the panel closes again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ask the bank" }).click();
  await expect(page.getByRole("complementary", { name: "Ask the bank" })).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("complementary", { name: "Ask the bank" })).toBeHidden();
});
