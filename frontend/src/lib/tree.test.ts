import { describe, expect, it } from "vitest";

import { layout } from "@/lib/tree";
import type { Concept } from "@/lib/types";

function concept(id: string, title: string, parent_id: string | null = null): Concept {
  return {
    id,
    title,
    created_at: new Date().toISOString(),
    updated_at: null,
    body: null,
    subject: "APUSH",
    folder_id: null,
    parent_id,
    question_count: 0,
    images: [],
  };
}

/** Distance between two placed nodes, for the "it did not stack them" checks. */
function apart(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const REVOLUTION = [
  concept("r", "The American Revolution"),
  concept("y", "The Battle of Yorktown", "r"),
  concept("p", "The Proclamation Line of 1763", "r"),
  concept("e", "The Enlightenment"),
  concept("l", "Locke on consent", "e"),
];

describe("layout", () => {
  it("draws a branch for each big idea and hangs its details off it", () => {
    const { nodes, edges } = layout(REVOLUTION);

    expect(nodes).toHaveLength(5);
    const branches = nodes.filter((node) => node.isBranch).map((node) => node.title);
    expect(branches.sort()).toEqual(["The American Revolution", "The Enlightenment"]);

    expect(edges.map((edge) => `${edge.source}->${edge.target}`).sort()).toEqual([
      "e->l",
      "r->p",
      "r->y",
    ]);
  });

  it("places every concept it is given", () => {
    // The invariant the whole thing serves: a map that quietly drops a concept is
    // worse than no map, because nothing on screen says anything is missing.
    const { nodes } = layout(REVOLUTION);
    expect(nodes.map((node) => node.id).sort()).toEqual(["e", "l", "p", "r", "y"]);
  });

  it("promotes a concept whose parent is outside the scope, rather than dropping it", () => {
    // Filtering the map to one folder cuts parents off from their children all the
    // time; the child is still a concept and still has to be drawn.
    const orphan = [concept("y", "The Battle of Yorktown", "r-not-here")];
    const { nodes, edges } = layout(orphan);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: "y", isBranch: true });
    expect(edges).toEqual([]);
  });

  it("places a concept that points at itself", () => {
    const { nodes, edges } = layout([concept("a", "Itself", "a")]);
    expect(nodes).toMatchObject([{ id: "a", isBranch: true }]);
    expect(edges).toEqual([]);
  });

  it("places every member of a cycle instead of losing the lot", () => {
    // In a cycle nothing has a null parent, so nothing qualifies as a branch by
    // the ordinary rule and a naive layout draws an empty map.
    const { nodes } = layout([
      concept("a", "A", "b"),
      concept("b", "B", "a"),
    ]);
    expect(nodes.map((node) => node.id).sort()).toEqual(["a", "b"]);
  });

  it("puts a lone branch in the middle and rings its details around it", () => {
    const one = [
      concept("r", "The American Revolution"),
      concept("y", "Yorktown", "r"),
      concept("p", "Proclamation Line", "r"),
      concept("t", "Treaty of Paris", "r"),
    ];
    const { nodes } = layout(one);
    const root = nodes.find((node) => node.id === "r")!;
    expect(root).toMatchObject({ x: 0, y: 0 });

    const details = nodes.filter((node) => !node.isBranch);
    expect(details).toHaveLength(3);
    for (const detail of details) {
      expect(apart(detail, root)).toBeGreaterThan(100);
    }
  });

  it("keeps branches apart from each other", () => {
    const { nodes } = layout(REVOLUTION);
    const [first, second] = nodes.filter((node) => node.isBranch);
    expect(apart(first, second)).toBeGreaterThan(400);
  });

  it("does not stack two details on the same spot", () => {
    const many = [
      concept("r", "Branch"),
      ...Array.from({ length: 8 }, (_, i) => concept(`c${i}`, `Detail ${i}`, "r")),
    ];
    const details = layout(many).nodes.filter((node) => !node.isBranch);

    for (let i = 0; i < details.length; i += 1) {
      for (let j = i + 1; j < details.length; j += 1) {
        expect(apart(details[i], details[j])).toBeGreaterThan(20);
      }
    }
  });

  it("stays compact when a whole flat bank is branches", () => {
    // The bug this is here for: branches on a ring need a radius that grows with
    // how many there are, so fifty concepts with no parents put the map about
    // sixteen thousand pixels across. Every node was laid out, none was on
    // screen, and elementFromPoint at a node's own centre returned null.
    // Branches *with* details, deliberately: spacing is derived from the widest
    // detail ring, so branches carrying nothing are compact on a ring too and a
    // bank of those cannot tell a ring from a grid. The first version of this
    // test used bare concepts and passed with the ring restored.
    const many = Array.from({ length: 55 }, (_, i) => i).flatMap((i) => [
      concept(`b${i}`, `Branch ${i}`),
      ...Array.from({ length: 3 }, (_, j) => concept(`b${i}d${j}`, `Detail ${i}.${j}`, `b${i}`)),
    ]);
    const { nodes } = layout(many);

    const width = Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x));
    const height = Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y));
    expect(width).toBeLessThan(7000);
    expect(height).toBeLessThan(7000);
  });

  it("never lands two branches on top of each other, however many details they have", () => {
    // Spacing is derived from the widest detail ring, so the branch with twenty
    // details is the one that sets it.
    const lopsided = [
      concept("a", "Branch A"),
      ...Array.from({ length: 20 }, (_, i) => concept(`a${i}`, `A detail ${i}`, "a")),
      concept("b", "Branch B"),
      concept("c", "Branch C"),
    ];
    const branches = layout(lopsided).nodes.filter((node) => node.isBranch);

    for (let i = 0; i < branches.length; i += 1) {
      for (let j = i + 1; j < branches.length; j += 1) {
        expect(apart(branches[i], branches[j])).toBeGreaterThan(900);
      }
    }
  });

  it("is stable: the same concepts draw the same map", () => {
    expect(layout(REVOLUTION).nodes).toEqual(layout(REVOLUTION).nodes);
  });

  it("has nothing to draw for no concepts", () => {
    expect(layout([])).toEqual({ nodes: [], edges: [] });
  });
});
