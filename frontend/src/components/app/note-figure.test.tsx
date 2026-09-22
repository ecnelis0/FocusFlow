import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoteFigureBlock } from "@/components/app/note-figure";
import type { NoteFigure } from "@/lib/types";

function figure(overrides: Partial<NoteFigure> = {}): NoteFigure {
  return {
    kind: "timeline",
    title: "The road to war",
    steps: [],
    centre: null,
    parts: [],
    columns: [],
    rows: [],
    ...overrides,
  };
}

describe("NoteFigureBlock", () => {
  it("draws a timeline in the order it was given", () => {
    render(
      <NoteFigureBlock
        figure={figure({
          steps: [
            { label: "1763", text: "The Proclamation Line" },
            { label: "1765", text: "The Stamp Act" },
          ],
        })}
      />,
    );

    const entries = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(entries[0]).toContain("1763");
    expect(entries[1]).toContain("1765");
  });

  it("numbers a process, so the steps read as steps rather than as a list", () => {
    render(
      <NoteFigureBlock
        figure={figure({
          kind: "process",
          steps: [
            { label: "Stimulus", text: "Arrives through a sense" },
            { label: "Transduction", text: "Becomes a neural signal" },
          ],
        })}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("fills a missing cell rather than shifting the row along", () => {
    // A short row must not silently slide its cells under the wrong columns.
    render(
      <NoteFigureBlock
        figure={figure({
          kind: "compare",
          columns: ["Diffusion", "Active transport"],
          rows: [{ label: "Energy", cells: ["None"] }],
        })}
      />,
    );

    const cells = screen.getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["None", "—"]);
  });

  describe("refuses to draw what is not a figure", () => {
    // A one-entry timeline is a sentence, and the frame around it is what makes
    // it look like a mistake. The points beside it already say the same thing.
    it("a timeline with one entry", () => {
      const { container } = render(
        <NoteFigureBlock figure={figure({ steps: [{ label: "1763", text: "Alone" }] })} />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("a comparison with one column", () => {
      const { container } = render(
        <NoteFigureBlock
          figure={figure({
            kind: "compare",
            columns: ["Only one"],
            rows: [{ label: "Energy", cells: ["None"] }],
          })}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("a thing pulled apart into one piece", () => {
      const { container } = render(
        <NoteFigureBlock
          figure={figure({ kind: "parts", centre: "Neuron", parts: [{ name: "Axon", text: "…" }] })}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("a kind this file has never heard of", () => {
      // The backend's vocabulary can grow before this one does; drawing nothing
      // is the honest answer, and the section's points stand on their own.
      const { container } = render(
        <NoteFigureBlock figure={figure({ kind: "sankey" as NoteFigure["kind"] })} />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});
