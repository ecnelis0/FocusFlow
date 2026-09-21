import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MistakeCard } from "@/components/app/mistake-card";
import { makeMistake } from "@/test/fixtures";

describe("MistakeCard", () => {
  it("shows where the question is filed, and what it asks", () => {
    render(<MistakeCard mistake={makeMistake()} />);

    // One metadata line: subject · topic, so match within it.
    expect(screen.getByText(/Algebra/)).toBeInTheDocument();
    expect(screen.getByText(/linear equations/)).toBeInTheDocument();
    expect(screen.getByText(/If 3x \+ 7 = 22/)).toBeInTheDocument();
  });

  it("leaves the subject out of the metadata line when there is none", () => {
    render(<MistakeCard mistake={makeMistake({ subject: null })} />);

    expect(screen.getByText("linear equations")).toBeInTheDocument();
    expect(screen.queryByText(/Algebra/)).not.toBeInTheDocument();
  });

  it("shows the answer on the card rather than behind a reveal", () => {
    // Nothing tests you any more, so hiding it only costs a click on the way to
    // reading it.
    render(<MistakeCard mistake={makeMistake()} />);

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("names every concept the question is filed under", () => {
    render(
      <MistakeCard
        mistake={makeMistake({
          concepts: [
            { id: "c1", title: "Solve before you pick" },
            { id: "c2", title: "Isolate the variable" },
          ],
        })}
      />,
    );

    expect(screen.getByText("Solve before you pick")).toBeInTheDocument();
    expect(screen.getByText("Isolate the variable")).toBeInTheDocument();
  });
});
