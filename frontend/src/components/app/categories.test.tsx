import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Categories } from "@/components/app/categories";
import { api } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { renderWithQuery } from "@/test/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const CONCEPTS = [
  {
    id: "c1",
    title: "Circumference gives the radius",
    body: null,
    subject: "Algebra",
    created_at: new Date().toISOString(),
    updated_at: null,
    question_count: 2,
    images: [],
  },
  {
    id: "c2",
    title: "inverse trig",
    body: null,
    subject: null,
    created_at: new Date().toISOString(),
    updated_at: null,
    question_count: 0,
    images: [],
  },
];

const STATS: Stats = {
  total_mistakes: 6,
  due_now: 1,
  untagged_questions: 2,
  reviews_completed: 0,
  by_error_type: [
    { key: "concept_gap", count: 3 },
    { key: "careless_arithmetic", count: 2 },
  ],
  by_concept: [{ key: "Circumference gives the radius", count: 2 }],
  by_urgency: [
    { key: "fundamental", count: 1 },
    { key: "very_important", count: 3 },
  ],
  by_subject: [
    { key: "Algebra", count: 4 },
    { key: "Biology", count: 2 },
  ],
  topics: [
    { subject: "Algebra", topic: "linear equations", count: 3 },
    { subject: "Algebra", topic: "circles", count: 1 },
    { subject: "Biology", topic: "cell division", count: 2 },
  ],
};

/** Expands Algebra, where its concepts live. */
async function openAlgebra(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Expand Algebra" }));
}

async function open() {
  vi.spyOn(api, "stats").mockResolvedValue(STATS);
  vi.spyOn(api, "listConcepts").mockResolvedValue(CONCEPTS);
  const user = userEvent.setup();
  renderWithQuery(<Categories />);
  await screen.findByText("How urgent");
  return user;
}

describe("Categories", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("keeps topics folded away until their subject is expanded", async () => {
    const user = await open();

    expect(screen.queryByText("linear equations")).not.toBeInTheDocument();
    expect(screen.queryByText("cell division")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Algebra" }));

    expect(screen.getByText("linear equations")).toBeInTheDocument();
    expect(screen.getByText("circles")).toBeInTheDocument();
    // Only that subject's topics - the other folder stays shut.
    expect(screen.queryByText("cell division")).not.toBeInTheDocument();
  });

  it("puts each topic under the subject it belongs to", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Expand Biology" }));

    expect(screen.getByText("cell division")).toBeInTheDocument();
    expect(screen.queryByText("linear equations")).not.toBeInTheDocument();
  });

  it("collapses again", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Expand Algebra" }));
    await user.click(screen.getByRole("button", { name: "Collapse Algebra" }));

    expect(screen.queryByText("circles")).not.toBeInTheDocument();
  });

  it("will not offer to expand a subject with no topics", async () => {
    vi.spyOn(api, "stats").mockResolvedValue({ ...STATS, topics: [] });
    renderWithQuery(<Categories />);
    await screen.findByText("How urgent");

    expect(screen.getByRole("button", { name: "Expand Algebra" })).toBeDisabled();
  });

  it("selects across facets at once and sends all four to the bank", async () => {
    const user = await open();

    await user.click(screen.getByRole("checkbox", { name: /Very important/ }));
    await user.click(screen.getByRole("checkbox", { name: /^Algebra/ }));
    await user.click(screen.getByRole("button", { name: "Expand Algebra" }));
    await user.click(screen.getByRole("checkbox", { name: /linear equations/ }));
    await user.click(screen.getByRole("checkbox", { name: /Concept gap/ }));

    await user.click(screen.getByRole("button", { name: "Show 4 filters" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(push.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/bank");
    expect(url.searchParams.getAll("urgency")).toEqual(["very_important"]);
    expect(url.searchParams.getAll("subject")).toEqual(["Algebra"]);
    expect(url.searchParams.getAll("topic")).toEqual(["linear equations"]);
    expect(url.searchParams.getAll("error_type")).toEqual(["concept_gap"]);
  });

  it("shows a selection as checked, and unchecks it again", async () => {
    const user = await open();
    const box = screen.getByRole("checkbox", { name: /Fundamental concept/ });

    expect(box).toHaveAttribute("aria-checked", "false");
    await user.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    await user.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("clears every selection at once", async () => {
    const user = await open();
    await user.click(screen.getByRole("checkbox", { name: /Very important/ }));
    await user.click(screen.getByRole("checkbox", { name: /Concept gap/ }));
    expect(screen.getByRole("button", { name: "Show 2 filters" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByRole("button", { name: "Show questions" })).toBeDisabled();
  });

  it("lists a subject that only a concept carries, so it has somewhere to appear", async () => {
    vi.spyOn(api, "stats").mockResolvedValue({ ...STATS, by_subject: [], topics: [] });
    vi.spyOn(api, "listConcepts").mockResolvedValue([
      { ...CONCEPTS[0], subject: "Chemistry" },
    ]);
    const user = userEvent.setup();
    renderWithQuery(<Categories />);

    const row = await screen.findByRole("checkbox", { name: /^Chemistry/ });
    expect(within(row).getByText("0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Chemistry" }));
    expect(
      screen.getByRole("checkbox", { name: /Circumference gives the radius/ }),
    ).toBeInTheDocument();
  });

  it("shows how many questions sit behind each row", async () => {
    const user = await open();
    const algebra = screen.getByRole("checkbox", { name: /^Algebra/ });
    expect(within(algebra).getByText("4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Algebra" }));
    const topic = screen.getByRole("checkbox", { name: /linear equations/ });
    expect(within(topic).getByText("3")).toBeInTheDocument();
  });
});


describe("Categories concepts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("warns that a concept has nothing tagged, rather than letting you find out by clicking", async () => {
    const user = await open();

    // This one has no subject, so it sits in its own group.
    const empty = await screen.findByRole("checkbox", { name: /inverse trig/ });
    expect(within(empty).getByText("nothing tagged")).toBeInTheDocument();

    await openAlgebra(user);
    const full = screen.getByRole("checkbox", { name: /Circumference gives the radius/ });
    expect(within(full).queryByText("nothing tagged")).not.toBeInTheDocument();
  });

  it("offers the questions filed under no concept at all", async () => {
    const user = await open();

    await user.click(await screen.findByRole("checkbox", { name: /No concept yet/ }));
    await user.click(screen.getByRole("button", { name: "Show 1 filter" }));

    const url = new URL(push.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("tagged")).toBe("0");
  });

  it("filters by a concept id, not by its title", async () => {
    const user = await open();
    await openAlgebra(user);

    await user.click(
      screen.getByRole("checkbox", { name: /Circumference gives the radius/ }),
    );
    await user.click(screen.getByRole("button", { name: "Show 1 filter" }));

    const url = new URL(push.mock.calls[0][0], "http://x");
    expect(url.searchParams.getAll("concept")).toEqual(["c1"]);
  });
});


describe("Categories concept links", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("offers a way to open the concept itself, not only to filter by it", async () => {
    const user = await open();
    await openAlgebra(user);

    const link = await screen.findByRole("link", {
      name: "Open Circumference gives the radius",
    });
    expect(link).toHaveAttribute("href", "/concepts/c1");
  });

  it("keeps a subject's concepts folded away until the subject is opened", async () => {
    const user = await open();

    expect(
      screen.queryByRole("checkbox", { name: /Circumference gives the radius/ }),
    ).not.toBeInTheDocument();

    await openAlgebra(user);

    expect(
      screen.getByRole("checkbox", { name: /Circumference gives the radius/ }),
    ).toBeInTheDocument();
    // Labelled, so a concept is not mistaken for a topic.
    expect(screen.getByText("Concepts")).toBeInTheDocument();
  });

  it("keeps that link out of the checkbox rather than nested inside it", async () => {
    const user = await open();
    await openAlgebra(user);

    const box = await screen.findByRole("checkbox", {
      name: /Circumference gives the radius/,
    });
    // A link inside a role="checkbox" button is invalid HTML and unreachable by
    // keyboard; it has to be a sibling.
    expect(within(box).queryByRole("link")).not.toBeInTheDocument();
  });
});
