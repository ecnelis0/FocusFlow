import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COATS, Cat, POSES, catFor } from "@/components/app/cat";
import { Empty } from "@/components/app/empty";

/** Pulls every absolute coordinate out of a path: `M x y` and `C x y x y x y`.
 *
 *  Relative commands (`q`, `v`, `h`) are deliberately ignored — they are all
 *  short strokes on the face and the paws, and resolving them needs a real path
 *  parser. The shapes that have historically left the box are the body, the
 *  ears and the tail, and every one of those is drawn in absolute terms.
 *
 *  Control points count as being inside the box even though the curve itself
 *  passes inside them. That makes this stricter than it strictly needs to be,
 *  which is the right direction for a box: a drawing with room to spare is
 *  fine, a drawing that is clipped is not. */
function absolutePoints(d: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (const run of d.matchAll(/[MC]([^A-Za-z]*)/g)) {
    const numbers = (run[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  }
  return points;
}

/** Maps a point from a node's own coordinates out to the root.
 *
 *  The face is drawn in its own frame and placed with `translate(...) scale(...)`,
 *  so a test that reads the `d` attribute and stops there is measuring numbers
 *  that were never where it thinks. Walking outward, each ancestor turns the
 *  point it is handed into `(a + s·x, b + s·y)`. */
function toRoot(node: Element, [x, y]: [number, number]): [number, number] {
  let point: [number, number] = [x, y];
  for (let el: Element | null = node; el; el = el.parentElement) {
    const transform = el.getAttribute("transform");
    if (!transform) continue;
    const translate = transform.match(/translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/);
    const scale = transform.match(/scale\(\s*(-?[\d.]+)\s*\)/);
    const k = scale ? Number(scale[1]) : 1;
    point = [
      (translate ? Number(translate[1]) : 0) + k * point[0],
      (translate ? Number(translate[2]) : 0) + k * point[1],
    ];
  }
  return point;
}

describe("the cats", () => {
  it.each(POSES)("keeps every part of the %s inside its own viewBox", (pose) => {
    const { container } = render(<Cat pose={pose} coat="ginger" />);
    const svg = container.querySelector("svg")!;
    const [, , width, height] = svg.getAttribute("viewBox")!.split(" ").map(Number);

    // Half the outline sits outside the line it follows, and the tails are
    // stroked at 15, so the box has to hold the widest stroke as well.
    const room = 7.5;
    const outside = [...svg.querySelectorAll("path")]
      .flatMap((path) =>
        absolutePoints(path.getAttribute("d") ?? "").map((point) => toRoot(path, point)),
      )
      // Every tail in the first version of this file was sliced off at the edge
      // of its own drawing, and nothing said so: an SVG that overflows its
      // viewBox simply stops being painted there.
      .filter(([x, y]) => x < room || y < room || x > width - room || y > height - room);

    expect(outside).toEqual([]);
  });

  it("gives the same seed the same cat, every time", () => {
    // The cats are chosen during render, on the server and again on the client.
    // Anything random here is a hydration mismatch that only shows up in a
    // browser, so sameness is the property worth holding onto.
    expect(catFor("Nothing here yet")).toEqual(catFor("Nothing here yet"));
    expect(POSES).toContain(catFor("anything at all").pose);
    expect(COATS).toContain(catFor("anything at all").coat);
  });

  it("does not hand the same cat to every seed", () => {
    const seen = new Set(
      ["Algebra", "Biology", "Nothing matches", "No folders yet", "The bank", "Chemistry"].map(
        (seed) => `${catFor(seed).pose}/${catFor(seed).coat}`,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is decorative unless it is given something to say", () => {
    const { container, rerender } = render(<Cat seed="x" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(<Cat seed="x" label="A sleeping cat" />);
    expect(screen.getByRole("img", { name: "A sleeping cat" })).toBeInTheDocument();
  });

  it("sits in an empty state without becoming part of what it says", () => {
    render(<Empty title="Nothing here yet" body="Put something in." />);

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    // The drawing is between the heading and the sentence explaining it. Read
    // aloud, "cat" in that gap is noise, so it must carry no name at all.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
