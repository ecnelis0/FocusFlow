import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureForm } from "@/components/app/capture-form";
import { api } from "@/lib/api";
import {
  approveCapture,
  captureNotes,
  discardCapture,
  type CaptureProposal,
  type CaptureResult,
} from "@/lib/capture";
import { renderWithQuery } from "@/test/render";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

// ESM namespace exports cannot be spied on; replace the functions the form calls.
vi.mock("@/lib/capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capture")>()),
  captureNotes: vi.fn(),
  approveCapture: vi.fn(),
  discardCapture: vi.fn(),
}));

const send = vi.mocked(captureNotes);
const approve = vi.mocked(approveCapture);
const discard = vi.mocked(discardCapture);

const proposal: CaptureProposal = {
  kind: "pdf",
  extractor: "stub",
  transcript: null,
  summary: "Found 2 concepts in your notes.",
  image_filename: null,
  questions: [
    {
      question_text: "d/dx of sin(3x)?",
      choices: null,
      correct_answer: "3cos(3x)",
      concept_title: "Chain rule",
      where: "page 2",
    },
  ],
  concepts: [
    {
      title: "Integration by parts",
      body: "Pick u to be the thing that gets simpler.",
      subject: "Calculus",
      parent_title: null,
      order: 1,
      when: "1763",
      motif: null,
      card: null,
      where: "page 1",
      existing_id: null,
      existing_title: null,
    },
    {
      title: "Chain rule",
      body: "Outside, keep the inside, times the inside's derivative.",
      subject: null,
      parent_title: "Integration by parts",
      order: 2,
      when: null,      motif: null,
      card: null,
      where: "page 2",
      existing_id: "c2",
      existing_title: "Chain rule",
    },
  ],
};

const filed: CaptureResult = {
  questions: [],
  changes: [
    {
      action: "created",
      concept: {
        id: "c1",
        title: "IBP: u gets simpler",
        body: "Pick u to be the thing that gets simpler.",
        subject: "Calculus",
        folder_id: null,
        parent_id: null,
        sequence: null,
        when_label: null,
        motif: null,
        card: null,
        map_x: null,
        map_y: null,
        created_at: new Date().toISOString(),
        updated_at: null,
        question_count: 0,
        images: [],
      },
    },
  ],
};

async function scan(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Notes to file"), "some notes");
  await user.click(screen.getByRole("button", { name: "Scan for concepts" }));
  await screen.findByText("Check before filing");
}

describe("CaptureForm", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    send.mockReset();
    approve.mockReset();
    discard.mockReset();
    vi.spyOn(api, "listConcepts").mockResolvedValue([]);
  });

  it("keeps what was typed when the page is left and come back to", async () => {
    // Pasting a link and then glancing at the bank used to throw the link away,
    // which is the one thing a page you paste into must not do.
    const user = userEvent.setup();
    const { unmount } = renderWithQuery(<CaptureForm />);

    await user.type(screen.getByLabelText("YouTube link"), "https://youtu.be/abc12345678");
    await user.type(screen.getByLabelText("Subject"), "Biology");
    unmount();

    renderWithQuery(<CaptureForm />);
    expect(screen.getByLabelText("YouTube link")).toHaveValue(
      "https://youtu.be/abc12345678",
    );
    expect(screen.getByLabelText("Subject")).toHaveValue("Biology");
  });

  it("forgets the draft once there is nothing left in it", async () => {
    // Otherwise an emptied form comes back full the next time it is opened.
    const user = userEvent.setup();
    const first = renderWithQuery(<CaptureForm />);
    await user.type(screen.getByLabelText("Notes to file"), "something");
    await user.clear(screen.getByLabelText("Notes to file"));
    first.unmount();

    renderWithQuery(<CaptureForm />);
    expect(screen.getByLabelText("Notes to file")).toHaveValue("");
  });

  it("is disabled until there is something to send", () => {
    renderWithQuery(<CaptureForm />);
    expect(
      screen.getByRole("button", { name: "Scan for concepts" }),
    ).toBeDisabled();
  });

  it("shows every concept with its description for review, and files nothing yet", async () => {
    send.mockResolvedValue(proposal);
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await user.type(
      screen.getByLabelText("Notes to file"),
      "Chain rule: outside times inside",
    );
    await user.type(screen.getByLabelText("Subject"), "Calculus");
    await user.click(screen.getByRole("button", { name: "Scan for concepts" }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Chain rule: outside times inside",
          subject: "Calculus",
        }),
      ),
    );
    await screen.findByText("Check before filing");

    // Read as prose, not as a page of form fields: the description is the point.
    expect(
      screen.getByRole("heading", { name: "Integration by parts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pick u to be the thing that gets simpler."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Chain rule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Outside, keep the inside, times the inside's derivative.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("page 1")).toBeInTheDocument();
    // Nothing is editable until asked for.
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    // The model's match is shown as a choice, ticked by default.
    expect(
      screen.getByRole("checkbox", { name: /Add to existing/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /^Approve and log 2 concepts/ }),
    ).toBeEnabled();
    expect(approve).not.toHaveBeenCalled();
  });

  it("files what was kept, as edited", async () => {
    send.mockResolvedValue(proposal);
    approve.mockResolvedValue(filed);
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    await user.click(screen.getByRole("button", { name: "Edit concept 1" }));
    const title = screen.getByLabelText("Concept", {
      selector: "#draft-title-0",
    });
    await user.clear(title);
    await user.type(title, "IBP: u gets simpler");
    // Strike the second one out, and refuse the merge on it too.
    await user.click(screen.getByRole("checkbox", { name: "Keep concept 2" }));
    await user.click(
      screen.getByRole("button", { name: /^Approve and log 1 concept/ }),
    );

    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          concepts: [
            {
              title: "IBP: u gets simpler",
              body: "Pick u to be the thing that gets simpler.",
              subject: "Calculus",
              parent_title: null,
              // The reading's order goes back untouched. Dropping it here would
              // file a map with no sequence while the proposal plainly had one.
              order: 1,
              when: "1763",
              existing_id: null,
            },
          ],
          image_filename: null,
        }),
      ),
    );
    expect(
      await screen.findByRole("link", { name: /IBP: u gets simpler/ }),
    ).toHaveAttribute("href", "/concepts/c1");
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.queryByText("Check before filing")).not.toBeInTheDocument();
  });

  it("a concept opens for editing on request, and closes back to the new wording", async () => {
    send.mockResolvedValue(proposal);
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    await user.click(screen.getByRole("button", { name: "Edit concept 1" }));
    const body = screen.getByLabelText("Description", {
      selector: "#draft-body-0",
    });
    await user.clear(body);
    await user.type(body, "My own wording.");
    await user.click(
      screen.getByRole("button", { name: "Stop editing concept 1" }),
    );

    // Back to prose, showing what was just written rather than the model's line.
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    expect(screen.getByText("My own wording.")).toBeInTheDocument();
    expect(
      screen.queryByText("Pick u to be the thing that gets simpler."),
    ).not.toBeInTheDocument();
    // The other concept was never opened, and is untouched.
    expect(
      screen.getByRole("button", { name: "Edit concept 2" }),
    ).toBeInTheDocument();
  });

  it("the merge choice is visible without opening the editor", async () => {
    // Where a concept lands is a decision to see while reading, not a field to
    // go looking for.
    send.mockResolvedValue(proposal);
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    expect(screen.queryByLabelText("Concept")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Add to existing/ }),
    ).toBeChecked();
  });

  it("sends the concept each detail hangs under, so the map survives filing", async () => {
    // Dropped here, the tree is lost: the server resolves parents by title from
    // what it is sent, and a proposal that forgets them files a flat bank.
    send.mockResolvedValue(proposal);
    approve.mockResolvedValue({ changes: [], questions: [] });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);
    await user.click(screen.getByRole("button", { name: /^Approve and log/ }));

    await waitFor(() => expect(approve).toHaveBeenCalled());
    const sent = approve.mock.calls[0][0].concepts;
    expect(sent.map((c) => [c.title, c.parent_title])).toEqual([
      ["Integration by parts", null],
      ["Chain rule", "Integration by parts"],
    ]);
  });

  it("lists a detail directly under its branch, whatever order the model sent", async () => {
    // A detail three cards away from the concept it belongs to hides the one
    // thing this pass is for.
    send.mockResolvedValue({
      ...proposal,
      concepts: [proposal.concepts[1], proposal.concepts[0]],
    });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Integration by parts", "Chain rule", "Practice questions"]);
  });

  it("unticking the merge files a new concept instead", async () => {
    send.mockResolvedValue(proposal);
    approve.mockResolvedValue({ changes: [], questions: [] });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);
    await user.click(screen.getByRole("checkbox", { name: /Add to existing/ }));
    await user.click(
      screen.getByRole("button", { name: /^Approve and log 2 concepts/ }),
    );

    await waitFor(() => expect(approve).toHaveBeenCalled());
    const sent = approve.mock.calls[0][0];
    expect(sent.concepts[1]).toMatchObject({
      title: "Chain rule",
      existing_id: null,
    });
  });

  it("practice questions are listed under their concept, editable, and filed on approval", async () => {
    send.mockResolvedValue(proposal);
    approve.mockResolvedValue({ changes: [], questions: [] });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    expect(screen.getByText("Practice questions")).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue("d/dx of sin(3x)?");
    expect(screen.getByLabelText("Under concept")).toHaveValue("Chain rule");
    expect(
      screen.getByRole("button", {
        name: "Approve and log 2 concepts and 1 question",
      }),
    ).toBeEnabled();

    const answer = screen.getByLabelText("Answer");
    await user.clear(answer);
    await user.type(answer, "3 cos(3x)");
    await user.selectOptions(
      screen.getByLabelText("Under concept"),
      "Integration by parts",
    );
    await user.click(screen.getByRole("button", { name: /Approve and log/ }));

    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][0].questions).toEqual([
      {
        question_text: "d/dx of sin(3x)?",
        choices: null,
        correct_answer: "3 cos(3x)",
        concept_titles: ["Integration by parts"],
        origin: "material",
      },
    ]);
  });

  it("an unticked question is not filed", async () => {
    send.mockResolvedValue(proposal);
    approve.mockResolvedValue({ changes: [], questions: [] });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);
    await user.click(screen.getByRole("checkbox", { name: "Keep question 1" }));
    expect(
      screen.getByRole("button", { name: "Approve and log 2 concepts" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Approve and log 2 concepts" }),
    );

    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][0].questions).toEqual([]);
  });

  it("discarding throws the proposal and its stored picture away", async () => {
    send.mockResolvedValue({
      ...proposal,
      kind: "image",
      image_filename: "abc.png",
    });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(discard).toHaveBeenCalledWith("abc.png");
    expect(screen.queryByText("Check before filing")).not.toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
  });

  it("offers the transcript of a recording behind a toggle", async () => {
    send.mockResolvedValue({
      ...proposal,
      kind: "audio",
      transcript: "Mitochondria make ATP.",
    });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    const toggle = screen.getByRole("button", { name: "Show transcript" });
    expect(
      screen.queryByText("Mitochondria make ATP."),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText("Mitochondria make ATP.")).toBeInTheDocument();
  });

  it("says when nothing was worth filing rather than showing an empty list", async () => {
    send.mockResolvedValue({
      ...proposal,
      summary: "A shopping list.",
      concepts: [],
      questions: [],
    });
    const user = userEvent.setup();

    renderWithQuery(<CaptureForm />);
    await scan(user);

    expect(
      screen.getByText(/Nothing in there looked like a concept/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve and log 0 concepts" }),
    ).toBeDisabled();
  });
});
