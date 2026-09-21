import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConceptsPage from "@/app/concepts/page";
import { Unreachable } from "@/components/app/unreachable";
import { api } from "@/lib/api";
import { renderWithQuery } from "@/test/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const down = () => new Error("Failed to fetch");

describe("Unreachable", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("says nothing has been lost, because that is the fear", () => {
    renderWithQuery(<Unreachable error={down()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/Can’t reach the app’s API/);
    expect(screen.getByRole("alert")).toHaveTextContent(/Nothing has been lost/);
    expect(screen.getByRole("alert")).toHaveTextContent(/Failed to fetch/);
  });

  it("offers a retry", async () => {
    const user = userEvent.setup();
    const { client } = renderWithQuery(<Unreachable />);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(invalidate).toHaveBeenCalled();
  });
});

describe("a failed load is never shown as an empty bank", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("the concepts list does not claim you have written none", async () => {
    // The rule this file exists for. Retargeted from the review session and the
    // category rail, both of which are gone; every surviving list surface still
    // has to branch on `isError` before it reaches its empty state.
    vi.spyOn(api, "listConcepts").mockRejectedValue(down());

    renderWithQuery(<ConceptsPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Can\u2019t reach/),
    );
    // The one message that would make a student believe their work was gone.
    expect(screen.queryByText("No concepts yet.")).not.toBeInTheDocument();
  });

  it("still shows the real empty state when the API answers with nothing", async () => {
    vi.spyOn(api, "listConcepts").mockResolvedValue([]);

    renderWithQuery(<ConceptsPage />);

    expect(await screen.findByText("No concepts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
