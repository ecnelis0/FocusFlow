import { expect, test } from "@playwright/test";

import { addFolder, addMaterial, stamped } from "./helpers";

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

test("a concept opened from the map offers the way back to it", async ({ page }) => {
  // Arriving from the map and being offered only "Concepts" means going the long
  // way round to the picture you were just looking at.
  const subject = stamped("Cartography");
  const branch = `Projections ${Date.now() % 1000000}`;

  await addFolder(page, subject, stamped("Unit 1"));
  await addMaterial(page, {
    text: `${branch}: every flat map of a round world lies somewhere.`,
    subject,
  });

  await page.goto(`/map?subject=${encodeURIComponent(subject)}`);
  const card = page.locator(".react-flow__node").filter({ hasText: branch });
  await expect(card).toHaveCount(1, { timeout: 20_000 });
  await card.click();
  await expect(page).toHaveURL(/\/concepts\/[0-9a-f]{32}/);

  await page.getByRole("link", { name: "← The map" }).click();
  await expect(page).toHaveURL(/\/map\?subject=/);
  await expect(page.locator(".react-flow__node").filter({ hasText: branch })).toHaveCount(1, {
    timeout: 20_000,
  });
});

test("a card can be renamed on the map, and dragged somewhere it stays", async ({ page }) => {
  const subject = stamped("Geography");
  const original = `Plate boundaries ${Date.now() % 1000000}`;
  const renamed = `${original}, my wording`;

  await addMaterial(page, { text: `${original}: three kinds, and each makes its own landforms.`, subject });

  await page.goto(`/map?subject=${encodeURIComponent(subject)}`);
  const card = page.locator(".react-flow__node").filter({ hasText: original });
  await expect(card).toHaveCount(1, { timeout: 20_000 });

  // Renaming has a control of its own: the card already answers to a click and
  // a drag, and React Flow's drag handler eats a double-click.
  await card.getByRole("button", { name: `Rename ${original}` }).click();
  // At page level, not inside `card`: that locator matches on text content, and
  // the moment the title becomes an input the node no longer contains the text
  // it was found by.
  const editor = page.getByRole("textbox", { name: `Rename ${original}` });
  await editor.fill(renamed);
  await editor.press("Enter");

  // It is the concept that was renamed, not just the card.
  await page.reload();
  await expect(
    page.locator(".react-flow__node").filter({ hasText: renamed }),
  ).toHaveCount(1, { timeout: 20_000 });

  // Let the map finish fitting before measuring. React Flow animates the fit,
  // and a box read mid-animation puts the press on empty canvas — which pans the
  // view instead of dragging the card, and nothing is ever saved.
  const moved = page.locator(".react-flow__node").filter({ hasText: renamed });
  await moved.hover();
  await page.waitForTimeout(1_000);

  const box = (await moved.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // Past the drag threshold first, then the rest of the way.
  await page.mouse.move(cx + 40, cy + 30, { steps: 6 });
  await page.mouse.move(cx + 150, cy + 110, { steps: 12 });
  await page.mouse.up();

  // Saved, not just moved. Asserted against the stored position rather than the
  // card's screen coordinates: the map re-fits to the whole graph on every
  // render, so where a card lands on screen depends on every other card and is
  // not what "the drag was remembered" means.
  await expect
    .poll(
      async () => {
        const response = await page.request.get("http://127.0.0.1:8001/concepts");
        const concepts = (await response.json()) as {
          title: string;
          map_x: number | null;
          map_y: number | null;
        }[];
        const moved = concepts.find((concept) => concept.title === renamed);
        return moved ? moved.map_x !== null && moved.map_y !== null : false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});
