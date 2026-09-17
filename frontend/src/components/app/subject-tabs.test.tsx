import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubjectTabs } from "@/components/app/subject-tabs";
import { api } from "@/lib/api";
import { makeSubject } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const SUBJECTS = [
  makeSubject({ id: "s1", name: "APUSH", question_count: 6 }),
  // The one that matters: a course set up this morning with nothing in it yet.
  makeSubject({ id: "s2", name: "Calculus", question_count: 0 }),
];

describe("SubjectTabs", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("gives a tab to a subject with nothing logged into it", () => {
    renderWithQuery(
      <SubjectTabs subjects={SUBJECTS} selected={null} onSelect={vi.fn()} total={6} />,
    );

    expect(screen.getByRole("tab", { name: /Calculus/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "true");
  });

  it("marks exactly one tab as selected", () => {
    renderWithQuery(
      <SubjectTabs subjects={SUBJECTS} selected="APUSH" onSelect={vi.fn()} total={6} />,
    );

    expect(screen.getByRole("tab", { name: /APUSH/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /Calculus/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("a new subject is created and opened, not just added to the strip", async () => {
    // Making a course and then having to find it is two steps where one will do —
    // and the reason you made it is that you are about to put something in it.
    const create = vi
      .spyOn(api, "createSubject")
      .mockResolvedValue(makeSubject({ id: "s3", name: "Chemistry" }));
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(
      <SubjectTabs subjects={SUBJECTS} selected={null} onSelect={onSelect} total={6} />,
    );

    await user.click(screen.getByRole("button", { name: "+ Subject" }));
    await user.type(screen.getByLabelText("New subject"), "  Chemistry ");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // Trimmed on the way out: "  Chemistry " and "Chemistry" are one course, and
    // two tabs for one course is what the hierarchy exists to prevent.
    await waitFor(() => expect(create).toHaveBeenCalledWith("Chemistry"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("Chemistry"));
  });

  it("a blank name cannot be submitted", async () => {
    const create = vi.spyOn(api, "createSubject");
    const user = userEvent.setup();

    renderWithQuery(
      <SubjectTabs subjects={SUBJECTS} selected={null} onSelect={vi.fn()} total={6} />,
    );

    await user.click(screen.getByRole("button", { name: "+ Subject" }));
    await user.type(screen.getByLabelText("New subject"), "   ");

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });
});
