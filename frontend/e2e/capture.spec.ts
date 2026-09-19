import { expect, test } from "@playwright/test";

test("scanned notes are proposed for review, edited, then filed on approval", async ({
  page,
}) => {
  const stamp = Date.now() % 100000;
  const first = `Osmosis ${stamp}: water moves toward the higher solute concentration.`;
  const second = `Diffusion ${stamp}: particles spread from high to low concentration.`;

  await page.goto("/");
  await page.getByLabel("Notes to file").fill(`${first}\n\n${second}`);
  await page.getByLabel("Subject").fill("Biology");
  await page.getByRole("button", { name: "Scan for concepts" }).click();

  // Every concept comes back as a heading and a description you can read —
  // not as a page of form fields — and nothing is filed yet.
  await expect(page.getByRole("heading", { name: "Check before filing" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: `Osmosis ${stamp}` })).toBeVisible();
  await expect(
    page.getByText("water moves toward the higher solute concentration"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: `Diffusion ${stamp}` })).toBeVisible();
  await expect(
    page.getByText("particles spread from high to low concentration"),
  ).toBeVisible();
  await expect(page.locator("#draft-title-0")).toBeHidden();

  // Correcting the model is behind Edit, and closing it shows the new wording.
  await page.getByRole("button", { name: "Edit concept 1" }).click();
  const title = page.locator("#draft-title-0");
  await expect(title).toHaveValue(`Osmosis ${stamp}`);
  await title.fill(`Osmosis ${stamp}, my wording`);
  await page.getByRole("button", { name: "Stop editing concept 1" }).click();
  await expect(
    page.getByRole("heading", { name: `Osmosis ${stamp}, my wording` }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "Keep concept 2" }).uncheck();
  await page.getByRole("button", { name: "Approve and log 1 concept" }).click();

  await expect(page.getByRole("heading", { name: "What was filed" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("link", { name: new RegExp(`Osmosis ${stamp}, my wording`) })).toBeVisible();
  await expect(page.getByText("new", { exact: true })).toHaveCount(1);

  // The struck-out one never reached the bank.
  await page.goto("/concepts");
  await expect(page.getByText(`Osmosis ${stamp}, my wording`)).toBeVisible();
  await expect(page.getByText(new RegExp(`Diffusion ${stamp}`))).toBeHidden();
});

test("the same concept again is offered as a merge the student can accept", async ({ page }) => {
  const stamp = Date.now() % 100000;

  await page.goto("/");
  await page.getByLabel("Notes to file").fill(`Photosynthesis ${stamp}: light becomes glucose.`);
  await page.getByRole("button", { name: "Scan for concepts" }).click();
  await page.getByRole("button", { name: "Approve and log 1 concept" }).click();
  await expect(page.getByRole("heading", { name: "What was filed" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel("Notes to file").fill(`Photosynthesis ${stamp}: and it needs chlorophyll.`);
  await page.getByRole("button", { name: "Scan for concepts" }).click();
  const merge = page.getByRole("checkbox", { name: /Add to existing/ });
  await expect(merge).toBeChecked({ timeout: 15_000 });
  await page.getByRole("button", { name: "Approve and log 1 concept" }).click();
  await expect(page.getByText("added to existing")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: new RegExp(`Photosynthesis ${stamp}`) }).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  await expect(page.getByText("needs chlorophyll")).toBeVisible();
});

test("a text file dropped on the page is read as notes", async ({ page }) => {
  const stamp = Date.now() % 100000;

  await page.goto("/");
  await page.getByLabel("Choose a file of notes").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Mitosis ${stamp}: one cell becomes two identical cells.`),
  });
  await expect(page.getByText("notes.txt")).toBeVisible();
  await page.getByRole("button", { name: "Scan for concepts" }).click();

  await expect(page.getByRole("heading", { name: `Mitosis ${stamp}` })).toBeVisible({
    timeout: 15_000,
  });
});
