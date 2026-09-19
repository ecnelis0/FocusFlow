import type { Concept } from "./types";

/** A concept placed on the map. Coordinates are React Flow's, in graph space. */
export interface MapNode {
  id: string;
  title: string;
  questionCount: number;
  /** True when this sits at the top of the map rather than under something. */
  isBranch: boolean;
  /** True when something actually hangs off it. Styling keys off this, not off
   *  `isBranch`: a top-level concept with nothing under it is a loose concept,
   *  and drawing it like a major theme told the reader forty things were themes
   *  when two of them were. */
  hasDetails: boolean;
  x: number;
  y: number;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
}

export interface MapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
}

const BRANCH_RING = 450;
const DETAIL_RING = 250;
const PER_DETAIL = 46;
const GAP = 200;
// Past this many branches a ring is too big to read; they go in a grid instead.
const RING_LIMIT = 6;

/** Rounds, and turns -0 into 0. `Math.round(Math.sin(-Math.PI / 2) * 0)` is -0,
 *  which compares equal to 0 everywhere except a strict deep-equal, so it shows
 *  up as a baffling test failure long before it shows up on screen. */
function at(value: number): number {
  return Math.round(value) || 0;
}

/** Where the concepts go on a mind map: branches in a ring, details around each.
 *
 *  Laid out here rather than by a graph library because the shape is fixed and
 *  tiny — two levels, radial — and the layout engines worth adopting (dagre, elk)
 *  draw layered trees, which is a different picture from the one this is for. The
 *  part that is genuinely solved — rendering, panning, zooming, edge routing — is
 *  React Flow's, and this only decides coordinates.
 *
 *  **Every concept handed in comes back placed.** That is the invariant the rest
 *  of it serves: a concept whose parent is outside the current scope (filtered to
 *  one folder, say) is drawn as a branch of its own rather than vanishing, and so
 *  is one caught in a cycle. A mind map that silently omits things is worse than
 *  no mind map, because there is no way to tell. */
export function layout(concepts: Concept[]): MapLayout {
  const present = new Set(concepts.map((concept) => concept.id));

  // A parent outside the set is no parent here. Same for a concept pointing at
  // itself, which the API refuses but a hand-edited row could still hold.
  const parentOf = (concept: Concept): string | null => {
    const parent = concept.parent_id;
    if (!parent || parent === concept.id || !present.has(parent)) return null;
    return parent;
  };

  const childrenOf = new Map<string, Concept[]>();
  for (const concept of concepts) {
    const parent = parentOf(concept);
    if (parent === null) continue;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(concept);
    else childrenOf.set(parent, [concept]);
  }

  // Anything with no parent is a branch. Then anything still unplaced — a cycle
  // leaves every member with a parent, so none of them would be a branch — is
  // promoted until nothing is left over.
  const branches = concepts.filter((concept) => parentOf(concept) === null);
  const placed = new Set<string>();
  for (const branch of branches) {
    placed.add(branch.id);
    for (const child of childrenOf.get(branch.id) ?? []) placed.add(child.id);
  }
  for (const concept of concepts) {
    if (placed.has(concept.id)) continue;
    branches.push(concept);
    placed.add(concept.id);
    for (const child of childrenOf.get(concept.id) ?? []) placed.add(child.id);
  }

  // The ones with something under them first, so the part of the map worth
  // reading is where the eye lands rather than somewhere in a field of loose
  // concepts. Stable within each group, so the map still draws the same twice.
  branches.sort(
    (a, b) => (childrenOf.get(b.id)?.length ?? 0) - (childrenOf.get(a.id)?.length ?? 0),
  );

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // How much room a branch needs to itself: its own card, plus the ring its
  // details sit on. Spacing is derived from this rather than fixed, so a branch
  // with twenty details does not overlap the one beside it.
  const ringFor = (id: string): number => {
    const count = childrenOf.get(id)?.length ?? 0;
    return count === 0 ? 0 : Math.max(DETAIL_RING, count * PER_DETAIL);
  };
  const widest = branches.reduce((most, branch) => Math.max(most, ringFor(branch.id)), 0);
  const cell = widest * 2 + GAP;

  // Three arrangements, because one does not survive both ends of the range. A
  // ring is the picture people draw by hand and it reads beautifully for a few
  // branches — but its radius grows with the number of branches, so fifty of them
  // put the map kilometres across and every node off screen. Past a handful they
  // go in a grid, whose extent grows with the square root instead.
  const place = (index: number): { x: number; y: number } => {
    if (branches.length === 1) return { x: 0, y: 0 };
    if (branches.length <= RING_LIMIT) {
      // Enough radius that neighbouring branches' rings do not touch.
      const radius = Math.max(BRANCH_RING, (branches.length * cell) / (Math.PI * 2));
      const heading = (index / branches.length) * Math.PI * 2 - Math.PI / 2;
      return { x: at(Math.cos(heading) * radius), y: at(Math.sin(heading) * radius) };
    }
    const columns = Math.ceil(Math.sqrt(branches.length));
    const rows = Math.ceil(branches.length / columns);
    return {
      x: at(((index % columns) - (columns - 1) / 2) * cell),
      y: at((Math.floor(index / columns) - (rows - 1) / 2) * cell),
    };
  };

  branches.forEach((branch, index) => {
    const { x: bx, y: by } = place(index);
    const details = childrenOf.get(branch.id) ?? [];
    nodes.push({
      id: branch.id,
      title: branch.title,
      questionCount: branch.question_count,
      isBranch: true,
      hasDetails: details.length > 0,
      x: bx,
      y: by,
    });

    if (details.length === 0) return;

    // A full circle around the branch, starting at the top. Fanning them away
    // from the middle only means anything in a ring, and costs a special case
    // that has to agree with `place` about where the middle is.
    const ring = ringFor(branch.id);
    details.forEach((detail, position) => {
      const angle = (position / details.length) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: detail.id,
        title: detail.title,
        questionCount: detail.question_count,
        isBranch: false,
        hasDetails: false,
        x: at(bx + Math.cos(angle) * ring),
        y: at(by + Math.sin(angle) * ring),
      });
      edges.push({ id: `${branch.id}-${detail.id}`, source: branch.id, target: detail.id });
    });
  });

  return { nodes, edges };
}
