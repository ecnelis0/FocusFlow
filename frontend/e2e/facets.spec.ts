import { expect, test } from "@playwright/test";

import { addFolder, addMaterial, expandMaterial, logQuestion, stamped } from "./helpers";

/** The bank's filters, on the facets that still exist.
 *
 *  This file used to drive urgency and error-type checkboxes in a category rail.
 *  All three are gone with the review half of the app, so what is left to narrow
 *  by is the subject, the folder, the concept and the text — which is also all
 *  the student can actually set. */

test("a filtered bank is a link, and each filter can be peeled off", async ({ page }) => {
  const subject = stamped("Algebra");
  const folder = stamped("Linear equations");
  const question = `Peelable ${Date.now() % 1000000}?`;

  await addFolder(page, subject, folder);
  await logQuestion(page, question, { folder });

  // Straight to a multi-facet URL: the filters are in the address, not in memory.
  await page.goto(`/bank?subject=${encodeURIComponent(subject)}&q=${encodeURIComponent(question)}`);
  await expect(page.getByRole("main").getByText(question)).toBeVisible({ timeout: 15_000 });

  // Removing a filter widens the result rather than resetting everything. Named,
  // not "the first one": the pills render in a fixed order that is not this
  // test's business, and when that order last changed this quietly began peeling
  // off a different filter than it meant to.
  await page.getByRole("button", { name: `Remove filter ${subject}` }).click();
  await expect(page).not.toHaveURL(/subject=/);
  await expect(page.getByRole("main").getByText(question)).toBeVisible();

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/bank$/);
});

test("a combination that matches nothing explains why", async ({ page }) => {
  await page.goto("/bank?subject=Algebra&subject=Biology&topic=nothing-has-this-topic");

  await expect(page.getByText("Nothing matches all of those.")).toBeVisible({
    timeout: 15_000,
  });
});

test("a folder narrows the bank to what was put into it", async ({ page }) => {
  const subject = stamped("Chemistry");
  const wanted = stamped("Unit 2: Bonding");
  const other = stamped("Unit 3: Rates");
  const inWanted = `Ionic bonding note ${Date.now() % 1000000}`;
  const inOther = `Reaction rate note ${Date.now() % 1000000}`;

  await addFolder(page, subject, wanted);
  await addFolder(page, subject, other);
  await addMaterial(page, { text: `${inWanted}: metals give electrons away.`, folder: wanted });
  await addMaterial(page, { text: `${inOther}: temperature speeds things up.`, folder: other });

  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  await page.getByRole("button", { name: `Open ${wanted}` }).click();

  await expect(page).toHaveURL(/folder=/);

  // The folder lists what was put into it; the concepts are inside the material.
  // Matched by their link, because the concept's title and its body both carry
  // the text and the summary above quotes it a third time.
  await expandMaterial(page);
  const concepts = page.locator('a[href^="/concepts/"]');
  await expect(concepts.filter({ hasText: inWanted })).toHaveCount(1, { timeout: 15_000 });
  await expect(concepts.filter({ hasText: inOther })).toHaveCount(0);
});
