import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FolderGrid } from "@/components/app/folder-grid";
import { api } from "@/lib/api";
import type { Folder, Subject } from "@/lib/types";
import { makeSubject } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "f1",
    subject_id: "s1",
    name: "Unit 3: Revolution",
    position: 1,
    created_at: new Date().toISOString(),
    instructions: null,
    digest: null,
    digest_written_at: null,
    concept_count: 0,
    question_count: 0,
    ...overrides,
  };
}

const SUBJECT: Subject = makeSubject({
  folders: [
    folder({ id: "f1", name: "Unit 3: Revolution", question_count: 4, concept_count: 2 }),
    folder({ id: "f2", name: "Unit 4: Constitution", question_count: 1, concept_count: 0 }),
  ],
  question_count: 7,
  concept_count: 3,
  unfiled_question_count: 2,
  unfiled_concept_count: 1,
});

const noop = () => {};

describe("FolderGrid", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("names each folder explicitly, rather than letting its counts into the name", () => {
    // Left to the DOM the open button is called "Unit 3: Revolution 4 questions ·
    // 2 concepts" — unreadable aloud, and one substring match from "Remove Unit
    // 3: Revolution" beside it.
    renderWithQuery(
      <FolderGrid
        subject={SUBJECT}
        selected={null}
        unfiledSelected={false}
        onSelect={noop}
        onSelectUnfiled={noop}
      />,
    );

    expect(screen.getByRole("button", { name: "Open Unit 3: Revolution" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Unit 3: Revolution" })).toBeInTheDocument();
  });

  it("shows both halves of what a folder holds, not one number that could be either", () => {
    renderWithQuery(
      <FolderGrid
        subject={SUBJECT}
        selected={null}
        unfiledSelected={false}
        onSelect={noop}
        onSelectUnfiled={noop}
      />,
    );

    expect(screen.getByText("4 questions · 2 concepts")).toBeInTheDocument();
    expect(screen.getByText("1 question · 0 concepts")).toBeInTheDocument();
  });

  it("offers the unfiled card only when something is actually loose", () => {
    const { unmount } = renderWithQuery(
      <FolderGrid
        subject={SUBJECT}
        selected={null}
        unfiledSelected={false}
        onSelect={noop}
        onSelectUnfiled={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Open Not in a folder" })).toBeInTheDocument();
    unmount();

    // A tidy subject must not carry a permanent "Unfiled (0)" reminder of a job
    // that is already done.
    renderWithQuery(
      <FolderGrid
        subject={{ ...SUBJECT, unfiled_question_count: 0, unfiled_concept_count: 0 }}
        selected={null}
        unfiledSelected={false}
        onSelect={noop}
        onSelectUnfiled={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: "Open Not in a folder" })).toBeNull();
  });

  it("opening the folder that is already open closes it", async () => {
    // Otherwise the only way back to the whole subject is the pill row, and a
    // card that does nothing when pressed reads as broken.
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(
      <FolderGrid
        subject={SUBJECT}
        selected="f1"
        unfiledSelected={false}
        onSelect={onSelect}
        onSelectUnfiled={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open Unit 3: Revolution" }));
    expect(onSelect).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: "Open Unit 4: Constitution" }));
    expect(onSelect).toHaveBeenCalledWith("f2");
  });

  it("adding a folder selects it, so the screen goes where the student just looked", async () => {
    const created = vi.spyOn(api, "createFolder").mockResolvedValue({
      ...SUBJECT,
      folders: [...SUBJECT.folders, folder({ id: "f3", name: "Unit 5: Civil War" })],
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(
      <FolderGrid
        subject={SUBJECT}
        selected={null}
        unfiledSelected={false}
        onSelect={onSelect}
        onSelectUnfiled={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: `+ Folder in ${SUBJECT.name}` }));
    await user.type(screen.getByLabelText("New folder"), "Unit 5: Civil War");
    await user.click(screen.getByRole("button", { name: "Add folder" }));

    await waitFor(() => expect(created).toHaveBeenCalledWith("s1", "Unit 5: Civil War"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("f3"));
  });
});
