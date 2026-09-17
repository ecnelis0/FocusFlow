import { expect, test, type Page } from "@playwright/test";

/** The specs share one database and run in a single worker, so nothing here may
 *  assume the bank lacks something — every name is stamped, and every assertion
 *  is about the thing this test made. */
const stamped = (name: string) => `${name} ${Date.now() % 1000000}`;

async function addSubject(page: Page, name: string) {
  await page.goto("/bank");
  await page.getByRole("button", { name: "+ Subject" }).click();
  await page.getByLabel("New subject").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("tab", { name: new RegExp(name) })).toBeVisible();
}

async function addFolder(page: Page, subject: string, folder: string) {
  await page.getByRole("button", { name: `+ Folder in ${subject}` }).click();
  await page.getByLabel("New folder").fill(folder);
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByRole("button", { name: `Open ${folder}` })).toBeVisible();
}

test("a subject tab exists before anything is logged into it, and holds folders", async ({
  page,
}) => {
  const subject = stamped("APUSH");
  const unitThree = stamped("Unit 3: Revolution");
  const unitFour = stamped("Unit 4: Constitution");

  await addSubject(page, subject);

  // The whole point of subjects being rows: an empty course still gets a tab.
  const tab = page.getByRole("tab", { name: new RegExp(subject) });
  await expect(tab).toHaveAttribute("aria-selected", "true");

  await addFolder(page, subject, unitThree);
  await addFolder(page, subject, unitFour);

  await expect(page.getByRole("button", { name: `Open ${unitThree}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Open ${unitFour}` })).toBeVisible();

  // A folder you just made is empty, which is correct and reads like a broken
  // filter. It has to say which folder, not "nothing matches".
  await page.getByRole("button", { name: `Open ${unitThree}` }).click();
  await expect(page.getByText(`Nothing is in “${unitThree}” yet.`)).toBeVisible();

  // The filter is in the URL, so it survives a reload and is a link you can share.
  const url = page.url();
  expect(url).toContain("folder=");
  await page.reload();
  await expect(page.getByText(`Nothing is in “${unitThree}” yet.`)).toBeVisible();
});

test("a question filed into a folder appears there and nowhere else", async ({ page }) => {
  const subject = stamped("Calculus");
  const folder = stamped("Related rates");
  const other = stamped("Limits");
  const question = `A ladder slides down a wall ${Date.now() % 1000000} [e2e]`;

  await addSubject(page, subject);
  await addFolder(page, subject, folder);
  await addFolder(page, subject, other);

  // Log the question, then file it into the folder from its own page.
  await page.goto("/log");
  await page.getByLabel("The question").fill(question);
  await page.getByLabel("You put").fill("2 m/s");
  await page.getByLabel("The answer was").fill("3 m/s");
  await page.getByRole("button", { name: "Just log it" }).click();
  await expect(page).toHaveURL(/\/bank\/[0-9a-f]{32}/);

  await page.getByLabel("Folder").selectOption({ label: folder });
  await expect(page.getByText(`Filed in ${folder}`)).toBeVisible();

  // The folder it went into shows it.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(subject) }).click();
  await page.getByRole("button", { name: `Open ${folder}` }).click();
  await expect(page.getByText(question)).toBeVisible();

  // The sibling folder does not. Asserted as an invariant about this question,
  // not as "the folder is empty" — another spec may put something in it.
  await page.getByRole("button", { name: `Open ${other}` }).click();
  await expect(page.getByText(question)).toHaveCount(0);
});

test("deleting a folder keeps the question, in the subject, unfiled", async ({ page }) => {
  const subject = stamped("Biology");
  const folder = stamped("Cell respiration");
  const question = `Which organelle ${Date.now() % 1000000} [e2e]`;

  await addSubject(page, subject);
  await addFolder(page, subject, folder);

  await page.goto("/log");
  await page.getByLabel("The question").fill(question);
  await page.getByLabel("You put").fill("Chloroplast");
  await page.getByLabel("The answer was").fill("Mitochondrion");
  await page.getByRole("button", { name: "Just log it" }).click();
  await page.getByLabel("Folder").selectOption({ label: folder });
  await expect(page.getByText(`Filed in ${folder}`)).toBeVisible();

  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(subject) }).click();
  await page.getByRole("button", { name: `Remove ${folder}` }).click();

  // Losing where something was filed is bad. Losing the question is unthinkable.
  await expect(page.getByRole("button", { name: `Open ${folder}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Not in a folder" })).toBeVisible();
  await page.getByRole("button", { name: "Open Not in a folder" }).click();
  await expect(page.getByText(question)).toBeVisible();
});

test("notes scanned into a chosen folder land in it, concepts and questions alike", async ({
  page,
}) => {
  const subject = stamped("Chemistry");
  const folder = stamped("Stoichiometry");
  const idea = `Limiting reagent ${Date.now() % 1000000}`;

  await addSubject(page, subject);
  await addFolder(page, subject, folder);

  // The folder is chosen up front, before the material is read — so it steers the
  // reading as well as deciding where the result goes.
  await page.goto("/capture");
  await page.getByPlaceholder("Integration by parts").fill(
    `${idea}. The reactant that runs out first caps how much product you can make. ` +
      `Work in moles, never in grams, or the ratio is wrong before you start.`,
  );
  await page.getByLabel("File it into").selectOption({ label: folder });
  await page.getByRole("button", { name: "Scan for concepts" }).click();

  await expect(page.getByRole("button", { name: /Approve/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Approve/ }).click();
  await expect(page.getByText(/Filed \d+ concept/)).toBeVisible({ timeout: 20_000 });

  // The folder now holds what the scan produced — and the count proves it rather
  // than a toast that says the request succeeded.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  const card = page.getByRole("button", { name: `Open ${folder}` });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("0 concepts");
});
