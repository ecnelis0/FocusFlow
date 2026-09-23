import { expect, test, type Page } from "@playwright/test";

import { expandMaterial, logQuestion, questionCard } from "./helpers";

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

  // A folder you just made is empty, which is correct and reads like something
  // broken. It has to say what putting something in looks like.
  await page.getByRole("button", { name: `Open ${unitThree}` }).click();
  await expect(page.getByText("Nothing put in here yet.")).toBeVisible();

  // The filter is in the URL, so it survives a reload and is a link you can share.
  const url = page.url();
  expect(url).toContain("folder=");
  await page.reload();
  await expect(page.getByText("Nothing put in here yet.")).toBeVisible();
});

test("a question filed into a folder appears there and nowhere else", async ({ page }) => {
  const subject = stamped("Calculus");
  const folder = stamped("Related rates");
  const other = stamped("Limits");
  const question = `A ladder slides down a wall ${Date.now() % 1000000} [e2e]`;

  await addSubject(page, subject);
  await addFolder(page, subject, folder);
  await addFolder(page, subject, other);

  // Put it in through Study, then file it from its own page.
  await logQuestion(page, question);

  await page.getByLabel("Folder").selectOption({ label: folder });
  await expect(page.getByText(`Filed in ${folder}`)).toBeVisible();

  // The folder it went into lists the material, which opens to the question.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(subject) }).click();
  await page.getByRole("button", { name: `Open ${folder}` }).click();
  await expect(questionCard(page, question)).toHaveCount(1, { timeout: 15_000 });

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

  await logQuestion(page, question);
  await page.getByLabel("Folder").selectOption({ label: folder });
  await expect(page.getByText(`Filed in ${folder}`)).toBeVisible();

  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(subject) }).click();
  // Two steps: the × arms, and the armed button names what is about to go.
  await page.getByRole("button", { name: `Remove ${folder}` }).click();
  await page.getByRole("button", { name: `Confirm removing ${folder}` }).click();

  // Losing where something was filed is bad. Losing the question is unthinkable.
  await expect(page.getByRole("button", { name: `Open ${folder}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Not in a folder" })).toBeVisible();
  await page.getByRole("button", { name: "Open Not in a folder" }).click();
  await expect(questionCard(page, question)).toHaveCount(1, { timeout: 15_000 });
});

// Pasted text with no question in it, so this covers the concepts half only; the
// file-upload spec below is the one that proves questions take the folder too.
test("pasted notes land in the folder chosen before the reading", async ({
  page,
}) => {
  const subject = stamped("Chemistry");
  const folder = stamped("Stoichiometry");
  const idea = `Limiting reagent ${Date.now() % 1000000}`;

  await addSubject(page, subject);
  await addFolder(page, subject, folder);

  // The folder is chosen up front, before the material is read — so it steers the
  // reading as well as deciding where the result goes.
  await page.goto("/");
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

test("a folder can be made on the study page, and the material files straight into it", async ({
  page,
}) => {
  // The flow this app is for: material in hand, no folder for it yet. Leaving to
  // make one on The bank used to cost whatever had already been typed here.
  const subject = stamped("Physics");
  const folder = stamped("Kinematics");
  const idea = `Terminal velocity ${Date.now() % 1000000}`;

  await page.goto("/");
  await page
    .getByPlaceholder("Integration by parts")
    .fill(
      `${idea}. A falling body stops speeding up when drag matches weight. ` +
        `Heavier means faster at the limit, not sooner to it.`,
    );

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Subject for the folder").fill(subject);
  await page.getByLabel("Folder name").fill(folder);
  await page.getByRole("button", { name: "Create folder" }).click();

  // Made, chosen, and the form is still holding the notes that were typed first.
  await expect(page.getByLabel("File it into")).toHaveValue(/.+/);
  await expect(page.getByPlaceholder("Integration by parts")).toHaveValue(
    new RegExp(idea),
  );

  await page.getByRole("button", { name: "Scan for concepts" }).click();
  await expect(page.getByRole("button", { name: /Approve/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /Approve/ }).click();
  await expect(page.getByText(/Filed \d+ concept/)).toBeVisible({ timeout: 20_000 });

  // The subject was created along with the folder, and holds what was filed.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  const card = page.getByRole("button", { name: `Open ${folder}` });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("0 concepts");
});

test("a file uploaded into a chosen folder lands there, concepts and questions alike", async ({
  page,
}) => {
  // The headline flow: pick a folder that already exists, hand over a file, and
  // have both halves of what comes out of it filed in that one place.
  const subject = stamped("Biology");
  const folder = stamped("Unit 1: Cells");
  const stamp = Date.now() % 1000000;
  const osmosis = `Osmosis ${stamp}`;
  const diffusion = `Diffusion ${stamp}`;
  const asked = `Which way does water move in osmosis ${stamp}?`;

  await addSubject(page, subject);
  await addFolder(page, subject, folder);

  await page.goto("/");
  await page.getByLabel("Choose a file of notes").setInputFiles({
    name: "biology-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      `${osmosis}: water moves toward the higher solute concentration.\n` +
        `${asked} Answer: Toward the higher solute concentration.\n\n` +
        `${diffusion}: particles spread from high to low concentration.\n` +
        `What drives diffusion ${stamp}? Answer: The concentration gradient.\n`,
    ),
  });
  await expect(page.getByText("biology-notes.txt")).toBeVisible();

  await page.getByLabel("File it into").selectOption({ label: folder });
  await page.getByRole("button", { name: "Scan for concepts" }).click();

  // Both halves are proposed: the concepts to read, and the questions to answer later.
  await expect(page.getByRole("heading", { name: osmosis })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: diffusion })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Practice questions" }),
  ).toBeVisible();
  // exact: "Question" is a substring of the "Keep question 1" checkbox beside it.
  await expect(page.getByLabel("Question", { exact: true }).first()).toHaveValue(
    new RegExp(asked),
  );

  await page
    .getByRole("button", { name: "Approve and log 2 concepts and 2 questions" })
    .click();
  await expect(page.getByText(/Filed 2 concepts and 2 questions/)).toBeVisible({
    timeout: 20_000,
  });

  // The folder's own counts are the proof, not the toast that said it worked.
  await page.goto("/bank");
  await page.getByRole("tab", { name: new RegExp(`^${subject} `) }).click();
  const card = page.getByRole("button", { name: `Open ${folder}` });
  await expect(card).toContainText("2 questions");
  await expect(card).toContainText("2 concepts");

  // And opening the folder, then the material, shows the question it produced.
  await card.click();
  await expect(page).toHaveURL(/folder=/);
  await expandMaterial(page);
  await expect(questionCard(page, asked)).toHaveCount(1, { timeout: 15_000 });
});
