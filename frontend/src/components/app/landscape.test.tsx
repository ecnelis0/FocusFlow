import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Landscape } from "@/components/app/landscape";

describe("the landscape", () => {
  it("cannot take a click meant for the app", () => {
    const { container } = render(<Landscape />);
    const painting = container.firstElementChild!;

    // A full-viewport element that swallows pointer events is the oldest way to
    // make a page look right and behave as though it were frozen. jsdom applies
    // no Tailwind, so the class is the only thing there is to assert on — but
    // the class is also the whole of the mechanism.
    expect(painting).toHaveClass("pointer-events-none");
    expect(painting).toHaveClass("fixed");
    expect(painting).toHaveClass("-z-10");
  });

  it("says nothing to a screen reader", () => {
    const { container } = render(<Landscape />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("title, [aria-label]")).toHaveLength(0);
  });

  it("gives each crop of the painting its own gradient ids", () => {
    // The wide and the narrow crop are the same scene rendered twice. Sharing
    // one set of ids between them is invalid, and resolves to whichever copy
    // came first — which is a bug that only appears when the first copy is the
    // one being hidden.
    const { container } = render(<Landscape />);
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);

    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every fill at an id that exists", () => {
    const { container } = render(<Landscape />);
    const ids = new Set([...container.querySelectorAll("[id]")].map((node) => node.id));

    const references = [...container.querySelectorAll("[fill], [filter]")].flatMap((node) =>
      ["fill", "filter"]
        .map((attribute) => node.getAttribute(attribute) ?? "")
        .map((value) => value.match(/^url\(#(.+)\)$/)?.[1])
        .filter((name): name is string => Boolean(name)),
    );

    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((name) => !ids.has(name))).toEqual([]);
  });
});
