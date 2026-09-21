import { describe, expect, it } from "vitest";

import {
  countSelected,
  fromSearchParams,
  has,
  isEmpty,
  toQuery,
  toSearchParams,
  toggle,
  type Facets,
  NO_FACETS,
} from "@/lib/facets";

const PICKED: Facets = {
  concept_ids: [],
  tags: [],
  hasConcept: null,
  subjects: ["Calculus"],
  topics: ["limits"],
  folder_ids: [],
  hasFolder: null,
  text: "",
};

describe("facets", () => {
  it("toggling adds then removes, leaving the other facets alone", () => {
    const added = toggle(NO_FACETS, "topics", "circles");
    expect(added.topics).toEqual(["circles"]);
    expect(added.subjects).toEqual([]);

    expect(toggle(added, "topics", "circles").topics).toEqual([]);
  });

  it("holds several values in one facet", () => {
    const two = toggle(toggle(NO_FACETS, "topics", "circles"), "topics", "important");

    expect(two.topics).toEqual(["circles", "important"]);
  });

  it("survives the round trip through the URL", () => {
    const params = toSearchParams(PICKED);

    expect(fromSearchParams(params)).toEqual({ ...PICKED, text: "" });
  });

  it("puts each value in its own parameter, so commas in a topic are safe", () => {
    const params = toSearchParams({ ...NO_FACETS, topics: ["rates, ratios", "circles"] });

    expect(params.getAll("topic")).toEqual(["rates, ratios", "circles"]);
    expect(fromSearchParams(params).topics).toEqual(["rates, ratios", "circles"]);
  });

  it("reads a single-value link", () => {
    const facets = fromSearchParams(new URLSearchParams("topic=circles"));

    expect(facets.topics).toEqual(["circles"]);
    expect(countSelected(facets)).toBe(1);
  });

  it("knows when nothing is selected", () => {
    expect(isEmpty(NO_FACETS)).toBe(true);
    expect(isEmpty({ ...NO_FACETS, text: "  " })).toBe(true);
    expect(isEmpty(PICKED)).toBe(false);
    expect(countSelected(PICKED)).toBe(2);
  });

  it("becomes the query the backend runs", () => {
    const query = toQuery({ ...PICKED, text: "  circle  " });

    expect(query).toMatchObject({
      subjects: ["Calculus"],
      topics: ["limits"],
      text: "circle",
    });
  });

  it("sends no text rather than an empty string", () => {
    expect(toQuery({ ...NO_FACETS, text: "   " }).text).toBeNull();
  });

  it("has() only reports a value that is actually selected", () => {
    expect(has(PICKED, "subjects", "Calculus")).toBe(true);
    expect(has(PICKED, "subjects", "Biology")).toBe(false);
  });
});
