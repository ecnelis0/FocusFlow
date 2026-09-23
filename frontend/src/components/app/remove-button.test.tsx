import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RemoveButton } from "@/components/app/remove-button";

describe("RemoveButton", () => {
  it("does not remove on the first click", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<RemoveButton name="Unit 3" onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove Unit 3" }));

    expect(onRemove).not.toHaveBeenCalled();
    // And the question names the thing, so a list of six is not six identical
    // "Are you sure?" prompts.
    expect(
      screen.getByRole("button", { name: "Confirm removing Unit 3" }),
    ).toBeInTheDocument();
  });

  it("removes on the second", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<RemoveButton name="Unit 3" onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove Unit 3" }));
    await user.click(screen.getByRole("button", { name: "Confirm removing Unit 3" }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("says what survives, because that is the thing being asked about", async () => {
    const user = userEvent.setup();
    render(<RemoveButton name="Unit 3" keeps="its questions stay" onRemove={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Remove Unit 3" }));
    expect(screen.getByText("its questions stay")).toBeInTheDocument();
  });

  it("disarms itself rather than lying in wait under the cursor", () => {
    // An armed delete left on screen is how the next click removes something
    // nobody meant to touch. Driven with `fireEvent`, not `userEvent`: the
    // latter has timers of its own and deadlocks against a faked clock.
    vi.useFakeTimers();
    try {
      const onRemove = vi.fn();
      render(<RemoveButton name="Unit 3" onRemove={onRemove} />);

      fireEvent.click(screen.getByRole("button", { name: "Remove Unit 3" }));
      expect(
        screen.getByRole("button", { name: "Confirm removing Unit 3" }),
      ).toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(5_500));

      expect(
        screen.queryByRole("button", { name: "Confirm removing Unit 3" }),
      ).not.toBeInTheDocument();
      expect(onRemove).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disarms on Escape", () => {
    render(<RemoveButton name="Unit 3" onRemove={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Unit 3" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Confirm removing Unit 3" }), {
      key: "Escape",
    });

    expect(
      screen.queryByRole("button", { name: "Confirm removing Unit 3" }),
    ).not.toBeInTheDocument();
  });
});
