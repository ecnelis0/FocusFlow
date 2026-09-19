import { expect, test } from "@playwright/test";

const stamped = (name: string) => `${name} ${Date.now() % 1000000}`;

test("concepts filed from one capture are drawn as a map, and open when clicked", async ({
  page,
}) => {
  // The offline extractor makes the first paragraph the branch and hangs the
  // second off it, which is the shape the real one is asked for.
  const subject = stamped("Revolutions");
  const branch = stamped("The American Revolution");
  const detail = stamped("The Battle of Yorktown");

  await page.goto("/bank");
  await page.getByRole("button", { name: "+ Subject" }).click();
  await page.getByLabel("New subject").fill(subject);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("tab", { name: new RegExp(subject) })).toBeVisible();

  await page.goto("/");
  await page
    .getByLabel("Notes to file")
    .fill(
      `${branch}: the colonies broke from Britain between 1765 and 1783.\n\n` +
        `${detail}: Cornwallis surrendered in 1781, ending the major fighting.`,
    );
  await page.getByLabel("Subject").fill(subject);
  await page.getByRole("button", { name: "Scan for concepts" }).click();

  // The proposal already shows which concept hangs under which.
  await expect(page.getByRole("heading", { name: branch })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`under ${branch}`)).toBeVisible();

  await page.getByRole("button", { name: "Approve and log 2 concepts" }).click();
  await expect(page.getByText(/Filed 2 concepts/)).toBeVisible({ timeout: 20_000 });

  await page.goto(`/map?subject=${encodeURIComponent(subject)}`);

  // Both concepts drawn, and the line between them is the point of the screen.
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.getByText(branch)).toBeVisible();
  await expect(page.getByText(detail)).toBeVisible();

  // Clicking a concept opens it, so the map is a way into the bank.
  await page.getByText(branch).click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);
  await expect(page.getByRole("heading", { name: branch })).toBeVisible();
});

test("a map with nothing in it says so, and says what to do", async ({ page }) => {
  // Never an empty canvas for a scope with no concepts: "nothing connects to
  // anything" and "we could not load it" must not look the same.
  const subject = stamped("Empty");

  await page.goto("/bank");
  await page.getByRole("button", { name: "+ Subject" }).click();
  await page.getByLabel("New subject").fill(subject);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.goto(`/map?subject=${encodeURIComponent(subject)}`);
  await expect(page.getByText(`Nothing is mapped in “${subject}” yet.`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
});
