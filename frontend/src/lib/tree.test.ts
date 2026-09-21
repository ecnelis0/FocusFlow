import { describe, expect, it } from "vitest";

import { layout } from "@/lib/tree";
import type { Concept } from "@/lib/types";

function concept(
  id: string,
  title: string,
  parent_id: string | null = null,
  sequence: number | null = null,
  when_label: string | null = null,
): Concept {
  return {
    id,
    title,
    created_at: new Date().toISOString(),
    updated_at: null,
    body: null,
    subject: "APUSH",
    folder_id: null,
    parent_id,
    sequence,
    when_label,
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

    // The parent ties only. "Leads to" is a separate claim with its own edges,
    // asserted below; counting both here would say a detail hangs off its
    // predecessor, which is not what the map draws.
    const ties = edges
      .filter((edge) => edge.kind === "parent")
      .map((edge) => `${edge.source}->${edge.target}`);
    expect(ties.sort()).toEqual(["e->l", "r->p", "r->y"]);
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

describe("layout — the order the material runs in", () => {
  // Deliberately built out of order and with the alphabet fighting the chronology:
  // sorted by title this is Proclamation, Stamp, War; the years say otherwise.
  const TIMELINE = [
    concept("stamp", "The Stamp Act", null, 3, "1765"),
    concept("war", "The French and Indian War", null, 1, "1754"),
    concept("proc", "The Proclamation Line", null, 2, "1763"),
  ];

  it("places the branches in sequence, not alphabetically", () => {
    const steps = layout(TIMELINE).nodes.map((node) => node.step);
    const titles = layout(TIMELINE).nodes.map((node) => node.title);

    expect(titles).toEqual([
      "The French and Indian War",
      "The Proclamation Line",
      "The Stamp Act",
    ]);
    expect(steps).toEqual([1, 2, 3]);
  });

  it("draws an arrow from each concept to the one that follows it", () => {
    const next = layout(TIMELINE).edges.filter((edge) => edge.kind === "next");

    expect(next.map((edge) => [edge.source, edge.target])).toEqual([
      ["war", "proc"],
      ["proc", "stamp"],
    ]);
    // The caption is the arriving concept's year: an arrow into 1763 says 1763.
    expect(next.map((edge) => edge.label)).toEqual(["1763", "1765"]);
  });

  it("orders a branch's details among themselves, and links those too", () => {
    const branch = [
      concept("rev", "The American Revolution", null, 1),
      concept("york", "Yorktown", "rev", 2, "1781"),
      concept("lex", "Lexington", "rev", 1, "1775"),
    ];
    const { nodes, edges } = layout(branch);

    const details = nodes.filter((node) => !node.isBranch).map((node) => node.title);
    expect(details).toEqual(["Lexington", "Yorktown"]);
    expect(
      edges.filter((e) => e.kind === "next").map((e) => [e.source, e.target]),
    ).toEqual([["lex", "york"]]);
    // The tie to its branch is a different claim and stays a different edge.
    expect(edges.filter((e) => e.kind === "parent").map((e) => e.target).sort()).toEqual([
      "lex",
      "york",
    ]);
  });

  it("an unordered concept goes last rather than first", () => {
    // Null is not zero. A concept the reading declined to place must not jump
    // the chronology and claim to come before 1754.
    const mixed = [
      concept("loose", "Something unplaced", null, null),
      concept("war", "The French and Indian War", null, 1, "1754"),
    ];

    expect(layout(mixed).nodes.map((node) => node.title)).toEqual([
      "The French and Indian War",
      "Something unplaced",
    ]);
  });

  it("still places every concept when nothing has an order at all", () => {
    // The whole invariant of this module: ordering must not become a way to
    // lose a concept that has none.
    const none = [concept("a", "Alpha"), concept("b", "Beta"), concept("c", "Gamma", "a")];
    const { nodes } = layout(none);

    expect(nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("layout — the shape follows the material", () => {
  const dated = (id: string, n: number) => concept(id, `Event ${id}`, null, n, `17${60 + n}`);

  it("puts a chronology on a line, in order, so the arrows read left to right", () => {
    // On a ring, 1 → 2 → 3 → 4 sends every arrow back across the middle and the
    // sequence becomes the least readable thing on the map.
    const { nodes } = layout([dated("a", 1), dated("b", 2), dated("c", 3), dated("d", 4)]);

    expect(nodes.map((node) => node.y)).toEqual([0, 0, 0, 0]);
    const xs = nodes.map((node) => node.x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
  });

  it("keeps the ring when the material has no order to show", () => {
    // The hand-drawn picture is still right for a map of themes.
    const { nodes } = layout([
      concept("a", "Alpha"),
      concept("b", "Beta"),
      concept("c", "Gamma"),
    ]);

    expect(new Set(nodes.map((node) => node.y)).size).toBeGreaterThan(1);
  });

  it("one unordered branch does not flip a chronology back to a ring", () => {
    // Concepts merged in from older notes keep their own absent order, so a
    // mixed folder is the normal case, not the exotic one.
    const { nodes } = layout([dated("a", 1), dated("b", 2), concept("c", "Unplaced")]);

    expect(nodes.map((node) => node.y)).toEqual([0, 0, 0]);
  });

  it("stacks a spine's details in a column, so wide cards cannot overlap", () => {
    // On an arc they sat ~85px apart while a card is 240px wide, and every
    // cluster on the map drew on top of itself.
    const { nodes } = layout([
      dated("a", 1),
      dated("b", 2),
      concept("d1", "Detail one", "a", 1),
      concept("d2", "Detail two", "a", 2),
      concept("d3", "Detail three", "a", 3),
    ]);

    const branch = nodes.find((node) => node.id === "a")!;
    const column = nodes.filter((node) => !node.isBranch);
    expect(column.map((node) => node.x)).toEqual([branch.x, branch.x, branch.x]);
    const ys = column.map((node) => node.y);
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
  });

  it("ties a spine's branch to the head of its column, not to all four at once", () => {
    // Four ties down one track is four lines on top of each other; the chain
    // below already says they hang off the same branch.
    const { edges } = layout([
      dated("a", 1),
      dated("b", 2),
      concept("d1", "Detail one", "a", 1),
      concept("d2", "Detail two", "a", 2),
    ]);

    const ties = edges.filter((edge) => edge.kind === "parent");
    expect(ties.map((edge) => [edge.source, edge.target])).toEqual([["a", "d1"]]);
    expect(
      edges.filter((e) => e.kind === "next").map((e) => [e.source, e.target]),
    ).toContainEqual(["d1", "d2"]);
  });

  it("hangs a spine's details below it, never on top of the line", () => {
    const { nodes } = layout([
      dated("a", 1),
      dated("b", 2),
      concept("d1", "Detail one", "a", 1),
      concept("d2", "Detail two", "a", 2),
    ]);

    const details = nodes.filter((node) => !node.isBranch);
    expect(details).toHaveLength(2);
    // Screen coordinates: below means a larger y than the branch row at 0.
    for (const detail of details) expect(detail.y).toBeGreaterThan(0);
  });
});
