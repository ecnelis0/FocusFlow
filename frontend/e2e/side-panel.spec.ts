import { expect, test } from "@playwright/test";

import { logQuestion } from "./helpers";

test("the side panel answers a question in the student's own words", async ({ page }) => {
  const question = `Side panel biology question ${Date.now() % 10000} [e2e]`;
  await logQuestion(page, question, { subject: "Biology" });

  await page.getByRole("button", { name: "Ask the bank" }).click();
  const panel = page.getByRole("complementary", { name: "Ask the bank" });
  await expect(panel).toBeVisible();

  await panel
    .getByLabel("Ask about your bank")
    .fill("what have I put in from Biology in the past 3 months");
  await panel.getByRole("button", { name: "Ask" }).click();

  // It reports what it searched for, and the hit is the real row.
  await expect(panel.getByText(/Searched:.*Biology/)).toBeVisible({ timeout: 15_000 });
  const hit = panel.locator('a[href^="/bank/"]').filter({ hasText: question });
  await expect(hit).toHaveCount(1);

  // And the hit navigates to that question. The panel stays open across the
  // navigation, so the question is now on screen twice - scope to the page's article.
  await hit.click();
  await expect(page).toHaveURL(/\/bank\/[0-9a-f]{32}/);
  // toContainText, not getByText: the concept this capture produced quotes the
  // question in its own title, so the article holds the text twice.
  await expect(page.getByRole("article")).toContainText(question);
  await expect(panel).toBeVisible();
});

test("every row the panel returns actually satisfies the filter", async ({ page }) => {
  // Asserted as an invariant rather than an exact list: the specs share one e2e
  // database, so any "nothing matches" expectation is at the mercy of test order.
  // The empty state itself is covered deterministically in facets.spec.ts.
  await logQuestion(page, `Panel invariant ${Date.now() % 10000} [e2e]`, {
    subject: "Biology",
  });

  await page.getByRole("button", { name: "Ask the bank" }).click();
  const panel = page.getByRole("complementary", { name: "Ask the bank" });
  await panel.getByLabel("Ask about your bank").fill("my Biology questions");
  await panel.getByRole("button", { name: "Ask" }).click();

  await expect(panel.getByText(/Searched:.*Biology/)).toBeVisible({ timeout: 15_000 });

  const hits = panel.getByRole("link");
  for (let index = 0; index < (await hits.count()); index++) {
    const hit = hits.nth(index);
    // The one facet the filter actually carried. Urgency used to be the other.
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
