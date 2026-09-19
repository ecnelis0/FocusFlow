import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FolderPicker } from "@/components/app/folder-picker";
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
    concept_count: 0,
    question_count: 0,
    ...overrides,
  };
}

const APUSH = makeSubject({ id: "s1", name: "APUSH", folders: [folder()] });
const EMPTY = makeSubject({ id: "s2", name: "Calculus", folders: [] });

describe("FolderPicker", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("offers existing folders grouped under their subject", async () => {
    vi.spyOn(api, "listSubjects").mockResolvedValue([APUSH, EMPTY]);
    renderWithQuery(<FolderPicker value={null} onChange={vi.fn()} />);

    const select = await screen.findByLabelText("File it into");
    await waitFor(() => expect(select).toBeEnabled());
    expect(
      screen.getByRole("option", { name: "Unit 3: Revolution" }),
    ).toBeInTheDocument();
    // A subject with no folders in it has nothing to offer, so it is not a group.
    expect(screen.queryByRole("group", { name: "Calculus" })).not.toBeInTheDocument();
  });

  it("makes a folder in an existing subject and files into it, without leaving", async () => {
    // The whole point: discovering at approval time that the folder does not
    // exist used to mean leaving the page and losing what had been typed.
    vi.spyOn(api, "listSubjects").mockResolvedValue([APUSH]);
    const created = folder({ id: "f9", name: "Unit 4: Constitution" });
    const createSubject = vi.spyOn(api, "createSubject");
    vi.spyOn(api, "createFolder").mockResolvedValue({
      ...APUSH,
      folders: [...APUSH.folders, created],
    });
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(<FolderPicker value={null} onChange={onChange} />);
    await screen.findByLabelText("File it into");
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Subject for the folder"), "APUSH");
    await user.type(screen.getByLabelText("Folder name"), "Unit 4: Constitution");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("f9"));
    expect(api.createFolder).toHaveBeenCalledWith("s1", "Unit 4: Constitution");
    // A subject that already exists is reused, not duplicated.
    expect(createSubject).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();
  });

  it("a subject that does not exist yet is made first", async () => {
    vi.spyOn(api, "listSubjects").mockResolvedValue([APUSH]);
    const biology: Subject = makeSubject({ id: "s7", name: "Biology", folders: [] });
    const created = folder({ id: "f7", subject_id: "s7", name: "Cells" });
    vi.spyOn(api, "createSubject").mockResolvedValue(biology);
    vi.spyOn(api, "createFolder").mockResolvedValue({ ...biology, folders: [created] });
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(<FolderPicker value={null} onChange={onChange} />);
    await screen.findByLabelText("File it into");
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Subject for the folder"), "Biology");
    await user.type(screen.getByLabelText("Folder name"), "Cells");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("f7"));
    expect(api.createSubject).toHaveBeenCalledWith("Biology");
    expect(api.createFolder).toHaveBeenCalledWith("s7", "Cells");
  });

  it("matches an existing subject whatever the case, rather than making a second one", async () => {
    vi.spyOn(api, "listSubjects").mockResolvedValue([APUSH]);
    const createSubject = vi.spyOn(api, "createSubject");
    vi.spyOn(api, "createFolder").mockResolvedValue({
      ...APUSH,
      folders: [folder({ id: "f8", name: "Unit 5" })],
    });
    const user = userEvent.setup();

    renderWithQuery(<FolderPicker value={null} onChange={vi.fn()} />);
    await screen.findByLabelText("File it into");
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Subject for the folder"), "apush");
    await user.type(screen.getByLabelText("Folder name"), "Unit 5");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => expect(api.createFolder).toHaveBeenCalledWith("s1", "Unit 5"));
    expect(createSubject).not.toHaveBeenCalled();
  });

  it("says where to start when there is nothing to pick, instead of a dead control", async () => {
    vi.spyOn(api, "listSubjects").mockResolvedValue([]);
    renderWithQuery(<FolderPicker value={null} onChange={vi.fn()} />);

    expect(await screen.findByText(/Make the first one here/)).toBeInTheDocument();
    expect(screen.getByLabelText("File it into")).toBeDisabled();
    // Disabled to pick from, but never a dead end: making one is right there.
    expect(screen.getByRole("button", { name: "New folder" })).toBeEnabled();
  });

  it("will not create half a folder", async () => {
    vi.spyOn(api, "listSubjects").mockResolvedValue([APUSH]);
    const user = userEvent.setup();

    renderWithQuery(<FolderPicker value={null} onChange={vi.fn()} />);
    await screen.findByLabelText("File it into");
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Subject for the folder"), "APUSH");

    expect(screen.getByRole("button", { name: "Create folder" })).toBeDisabled();
  });
});
