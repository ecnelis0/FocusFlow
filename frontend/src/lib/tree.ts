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
  /** Its place in the order among its siblings, 1-based, or null when the
   *  reading gave none. Shown on the card so the map reads as a sequence. */
  step: number | null;
  /** What that place is called — "1763", "Step 2" — or null. */
  whenLabel: string | null;
  x: number;
  y: number;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  /** "parent" hangs a detail off its branch; "next" is the order the material
   *  runs in, one concept leading to the one after it. Two different claims
   *  about two concepts, so they are drawn differently and never merged. */
  kind: "parent" | "next";
  /** The caption on a "next" edge, when the material named the moment. */
  label: string | null;
}

export interface MapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
}

/** Where a concept actually goes: where it was dragged, or where it was laid out.
 *
 *  A dragged position is a decision the student made and it outranks the
 *  computed one. Both coordinates or neither — half a position would read as a
 *  0 on the other axis and slam the card against the origin. */
function positionOf(concept: Concept, computed: { x: number; y: number }) {
  return concept.map_x !== null && concept.map_y !== null
    ? { x: concept.map_x, y: concept.map_y }
    : computed;
}

const BRANCH_RING = 450;
const DETAIL_RING = 250;
const PER_DETAIL = 46;
const GAP = 200;
// Past this many branches a ring is too big to read; they go in a grid instead.
const RING_LIMIT = 6;
// The arc details hang on below their branch on a spine. Screen coordinates, so
// a positive sine is downwards: these two are below the branch, not above it.
// A card's width, the drop from a branch to the head of its column, and the
// drop between details after that. The first one is bigger because a branch card
// is the tall one - an eyebrow, a title over three lines, and its question count,
// which at an even 96 was being clipped by the detail underneath it.
const CARD = 260;
const SPINE_HEAD = 158;
const SPINE_ROW = 110;

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

  /** Sibling order: the reading's sequence first, and everything it did not
   *  number after it. A null is not position zero — a concept the model declined
   *  to place must not jump the chronology and claim to come first. */
  const inOrder = (a: Concept, b: Concept): number => {
    if (a.sequence !== null && b.sequence !== null && a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    if (a.sequence !== null && b.sequence === null) return -1;
    if (a.sequence === null && b.sequence !== null) return 1;
    // Unordered, or tied. The ones with something under them first, so the part
    // of the map worth reading is where the eye lands rather than somewhere in a
    // field of loose concepts. Then the title, so the map draws the same twice.
    const weight =
      (childrenOf.get(b.id)?.length ?? 0) - (childrenOf.get(a.id)?.length ?? 0);
    return weight || a.title.localeCompare(b.title);
  };

  branches.sort(inOrder);
  for (const siblings of childrenOf.values()) siblings.sort(inOrder);

  // A ring is the right picture for a map of themes, and the wrong one for a
  // chronology: 1 → 2 → 3 → 4 laid on a circle sends every arrow back across the
  // middle, and the one thing the sequence was for becomes the least readable
  // thing on screen. When the material has an order, the branches go on a spine
  // instead and the arrows read left to right. Majority rather than all, because
  // a concept merged in from older notes keeps its own (absent) order, and one
  // of those must not flip the whole map back to a ring.
  const numbered = branches.filter((branch) => branch.sequence !== null).length;
  const chronological = branches.length > 1 && numbered * 2 > branches.length;

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
  // A spine only ever needs one card's width per branch, because its details go
  // in a column underneath rather than around it. Sized like a ring instead,
  // five branches came out 3,500px across and the map opened at a quarter size:
  // every card present, not one of them readable.
  const cell = chronological ? CARD + GAP : widest * 2 + GAP;

  // Three arrangements, because one does not survive both ends of the range. A
  // ring is the picture people draw by hand and it reads beautifully for a few
  // branches — but its radius grows with the number of branches, so fifty of them
  // put the map kilometres across and every node off screen. Past a handful they
  // go in a grid, whose extent grows with the square root instead.
  const place = (index: number): { x: number; y: number } => {
    if (branches.length === 1) return { x: 0, y: 0 };
    // The spine: evenly spaced, in order, centred on the origin.
    if (chronological) {
      return { x: at((index - (branches.length - 1) / 2) * cell), y: 0 };
    }
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
      step: index + 1,
      whenLabel: branch.when_label,
      ...positionOf(branch, { x: bx, y: by }),
    });

    // One branch leads to the next, in the order the material runs. The caption
    // is the *arriving* concept's: an arrow into 1763 is labelled 1763.
    const next = branches[index + 1];
    if (next) {
      edges.push({
        id: `next-${branch.id}-${next.id}`,
        source: branch.id,
        target: next.id,
        kind: "next",
        label: next.when_label,
      });
    }

    if (details.length === 0) return;

    // A full circle around the branch, starting at the top. Fanning them away
    // from the middle only means anything in a ring, and costs a special case
    // that has to agree with `place` about where the middle is.
    const ring = ringFor(branch.id);
    details.forEach((detail, position) => {
      // On a spine the details go straight down in a column, so a branch needs
      // no more width than its own card and the row of branches stays a line you
      // can read. On a ring they go all the way round, the hand-drawn picture.
      const angle = (position / details.length) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: detail.id,
        title: detail.title,
        questionCount: detail.question_count,
        isBranch: false,
        hasDetails: false,
        step: position + 1,
        whenLabel: detail.when_label,
        ...positionOf(detail, {
          x: chronological ? bx : at(bx + Math.cos(angle) * ring),
          y: chronological
            ? at(by + SPINE_HEAD + position * SPINE_ROW)
            : at(by + Math.sin(angle) * ring),
        }),
      });
      // In a column, one tie from the branch to the head of it. Drawing a tie to
      // every detail would stack four lines down the same track, and the chain
      // below already says these all hang off the same branch.
      if (!chronological || position === 0) {
        edges.push({
          id: `${branch.id}-${detail.id}`,
          source: branch.id,
          target: detail.id,
          kind: "parent",
          label: null,
        });
      }
      // And the details of one branch run in their own order too.
      const after = details[position + 1];
      if (after) {
        edges.push({
          id: `next-${detail.id}-${after.id}`,
          source: detail.id,
          target: after.id,
          kind: "next",
          // No caption inside a branch. The arrow is short and the card it
          // arrives at prints its own date directly underneath, so a label here
          // is the same string twice, eleven pixels apart.
          label: null,
        });
      }
    });
  });

  return { nodes, edges };
}
