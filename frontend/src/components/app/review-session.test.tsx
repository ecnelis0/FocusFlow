import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { ReviewSession } from "@/components/app/review-session";
import { makeDueReview } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

describe("ReviewSession", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("withholds the answer and the analysis until the student has answered", async () => {
    const due = makeDueReview();
    vi.spyOn(api, "dueReviews").mockResolvedValue([due]);

    renderWithQuery(<ReviewSession />);
    await screen.findByText(due.mistake.question_text);

    // The choices are on screen (that is the question); the verdict and the
    // debrief are not, and the button will not fire without an answer.
    expect(screen.queryByText("You put")).not.toBeInTheDocument();
    expect(screen.queryByText(due.mistake.why_wrong!)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
  });

  it("a wrong pick is marked by the server and sends the ladder back to the top", async () => {
    const due = makeDueReview();
    vi.spyOn(api, "dueReviews").mockResolvedValue([due]);
    const check = vi.spyOn(api, "answerReview").mockResolvedValue({
      review: { ...due.review, completed_at: new Date().toISOString(), outcome: "wrong" },
      ladder_restarted: true,
      next_due_at: new Date(Date.now() + 3600_000).toISOString(),
      correct: false,
      your_answer: "C",
      correct_answer: "5",
    });
    const user = userEvent.setup();

    renderWithQuery(<ReviewSession />);
    await screen.findByText(due.mistake.question_text);
    await user.click(screen.getByRole("radio", { name: /^C/ }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    await waitFor(() => expect(check).toHaveBeenCalledWith(due.review.id, "C"));
    expect(await screen.findByText("Not this time.")).toBeInTheDocument();
    expect(screen.getByText(/Back to the top of the ladder/)).toBeInTheDocument();
    // Only now does the debrief show.
    expect(screen.getByText(due.mistake.why_wrong!)).toBeInTheDocument();
  });

  it("a right answer is marked correct, then Next moves on", async () => {
    const due = makeDueReview();
    const dueReviews = vi.spyOn(api, "dueReviews").mockResolvedValue([due]);
    vi.spyOn(api, "answerReview").mockResolvedValue({
      review: { ...due.review, completed_at: new Date().toISOString(), outcome: "correct" },
      ladder_restarted: false,
      next_due_at: new Date(Date.now() + 86_400_000).toISOString(),
      correct: true,
      your_answer: "B",
      correct_answer: "5",
    });
    const user = userEvent.setup();

    renderWithQuery(<ReviewSession />);
    await screen.findByText(due.mistake.question_text);
    await user.click(screen.getByRole("radio", { name: /^B/ }));
    // The queue is refetched as soon as the verdict lands; by then it is empty.
    dueReviews.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByText("Correct.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next question|Done/ }));
    expect(await screen.findByText("Nothing is due.")).toBeInTheDocument();
  });

  it("a question without choices takes a typed answer", async () => {
    const due = makeDueReview();
    due.mistake.choices = null;
    vi.spyOn(api, "dueReviews").mockResolvedValue([due]);
    const check = vi.spyOn(api, "answerReview").mockResolvedValue({
      review: { ...due.review, completed_at: new Date().toISOString(), outcome: "correct" },
      ladder_restarted: false,
      next_due_at: null,
      correct: true,
      your_answer: "5",
      correct_answer: "5",
    });
    const user = userEvent.setup();

    renderWithQuery(<ReviewSession />);
    await screen.findByText(due.mistake.question_text);
    await user.type(screen.getByLabelText("Your answer"), "5");
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    await waitFor(() => expect(check).toHaveBeenCalledWith(due.review.id, "5"));
  });

  it("skipping still works without an answer", async () => {
    const due = makeDueReview();
    vi.spyOn(api, "dueReviews").mockResolvedValue([due]);
    const complete = vi.spyOn(api, "completeReview").mockResolvedValue({
      review: { ...due.review, completed_at: new Date().toISOString(), outcome: "skipped" },
      ladder_restarted: false,
      next_due_at: null,
    });
    const user = userEvent.setup();

    renderWithQuery(<ReviewSession />);
    await screen.findByText(due.mistake.question_text);
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(complete).toHaveBeenCalledWith(due.review.id, "skipped"));
  });

  it("says so when nothing is due, rather than showing an empty card", async () => {
    vi.spyOn(api, "dueReviews").mockResolvedValue([]);

    renderWithQuery(<ReviewSession />);

    expect(await screen.findByText("Nothing is due.")).toBeInTheDocument();
  });

  it("names which rung of the ladder this review is", async () => {
    const due = makeDueReview();
    vi.spyOn(api, "dueReviews").mockResolvedValue([due]);

    renderWithQuery(<ReviewSession />);

    expect(await screen.findByText(/1 hour review/)).toBeInTheDocument();
  });
});
