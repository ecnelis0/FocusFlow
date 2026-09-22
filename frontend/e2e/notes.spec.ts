import { expect, test } from "@playwright/test";

import { addFolder, addMaterial, stamped } from "./helpers";

/** The revision page written from one material.
 *
 *  Offline the writer reshapes what it was given rather than judging what
 *  matters — it cannot — so these assert the shape of the page and the rules
 *  around writing it, not the quality of the prose.
 */

test("a material is written up once, kept, and offered as notes afterwards", async ({
  page,
}) => {
  const subject = stamped("Biology");
  const folder = stamped("Unit 1: Cells");

  await addFolder(page, subject, folder);
  await addMaterial(page, {
    folder,
    text:
      "Diffusion: particles move from high concentration to low, and no ATP is spent.\n\n" +
      "Osmosis: water crosses a membrane toward the side with more solute.\n\n" +
      "Active transport: against the gradient, using a carrier protein and ATP.",
  });

  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  await page.getByRole("button", { name: `Open ${folder}` }).click();

  // Before anything is written, the card offers to write rather than to read.
  const write = page.getByRole("link", { name: /^Write notes from / });
  await expect(write).toHaveCount(1, { timeout: 15_000 });
  await write.click();
  await expect(page).toHaveURL(/\/materials\/[0-9a-f]{32}\/notes/);

  await expect(page.getByText("No notes written from this yet.")).toBeVisible();
  await page.getByRole("button", { name: "Write the notes" }).click();

  // A page with a title, a sentence, and sections you can read.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();

  // Kept: coming back reads them rather than writing a second, different page.
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Write the notes" })).toHaveCount(0);

  // And the card now offers to read them.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  await page.getByRole("button", { name: `Open ${folder}` }).click();
  await expect(page.getByRole("link", { name: /^Read the notes on / })).toHaveCount(1, {
    timeout: 15_000,
  });
});

test("writing them again replaces the page, rather than adding a second", async ({
  page,
}) => {
  const subject = stamped("Chemistry");
  await addMaterial(page, {
    subject,
    text:
      "Ionic bonding: a metal gives electrons to a non-metal.\n\n" +
      "Covalent bonding: two non-metals share a pair.\n\n" +
      "Metallic bonding: a lattice of ions in a sea of electrons.",
  });

  // Straight to the subject rather than clicking the strip: the tab list renders
  // before the subjects arrive, so a click there races the load.
  await page.goto(`/bank?subject=${encodeURIComponent(subject)}`);
  const write = page.getByRole("link", { name: /^Write notes from / }).first();
  await expect(write).toBeVisible({ timeout: 15_000 });
  await write.click();
  await page.getByRole("button", { name: "Write the notes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });

  const before = await page.getByRole("heading", { level: 2 }).count();
  expect(before).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Write them again" }).click();

  // One page, rewritten - not two pages stacked up.
  await expect
    .poll(async () => page.getByRole("heading", { level: 1 }).count(), { timeout: 60_000 })
    .toBe(1);
  expect(await page.getByRole("heading", { level: 2 }).count()).toBe(before);
});
