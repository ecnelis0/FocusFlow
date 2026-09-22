import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConceptForm } from "@/components/app/concept-form";
import { api } from "@/lib/api";
import type { Concept } from "@/lib/types";
import { makeSubject } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const saved = (subject: Concept["subject"] = "Algebra"): Concept => ({
  id: "c1",
  title: "Inverse trig needs a domain",
  body: null,
  subject,
  folder_id: null,
  parent_id: null,
  sequence: null,
  when_label: null,
  map_x: null,
  map_y: null,
  created_at: new Date().toISOString(),
  updated_at: null,
  question_count: 0,
  images: [],
});

describe("ConceptForm subject", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("saves the subject that was typed", async () => {
    const create = vi.spyOn(api, "createConcept").mockResolvedValue(saved());
    const user = userEvent.setup();

    renderWithQuery(<ConceptForm />);
    await user.type(screen.getByLabelText("The concept"), "Inverse trig needs a domain");
    await user.type(screen.getByLabelText("Subject"), "  Algebra ");
    await user.click(screen.getByRole("button", { name: "Add concept" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Algebra", title: "Inverse trig needs a domain" }),
      ),
    );
  });

  it("a subject is optional: a title alone is enough", async () => {
    const create = vi.spyOn(api, "createConcept").mockResolvedValue(saved(null));
    const user = userEvent.setup();

    renderWithQuery(<ConceptForm />);
    await user.type(screen.getByLabelText("The concept"), "Read the stem twice");

    expect(screen.getByRole("button", { name: "Add concept" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add concept" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ subject: null })),
    );
  });

  it("offers every subject you have set up, including empty ones", async () => {
    // The list comes from the subject rows, not from tallying what has been
    // logged. A course you created this morning and have not logged into yet is
    // exactly the one you are about to need offered.
    vi.spyOn(api, "listSubjects").mockResolvedValue([
      makeSubject({ id: "s1", name: "Biology", question_count: 2 }),
      makeSubject({ id: "s2", name: "Calculus", question_count: 0 }),
    ]);

    renderWithQuery(<ConceptForm />);

    await waitFor(() => {
      const options = [...document.querySelectorAll("#concept-subject-options option")];
      expect(options.map((option) => option.getAttribute("value"))).toEqual([
        "Biology",
        "Calculus",
      ]);
    });
  });

  it("an existing concept opens on the subject it already has", () => {
    renderWithQuery(<ConceptForm concept={saved("Chemistry")} />);

    expect(screen.getByLabelText("Subject")).toHaveValue("Chemistry");
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });
});
