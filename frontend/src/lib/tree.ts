import type { Concept } from "./types";

/** A concept placed on the map. Coordinates are React Flow's, in graph space. */
export interface MapNode {
  id: string;
  title: string;
  /** Carried so the card can choose its scene. The motif is picked from the
   *  concept's own words when the extractor did not pick one while reading. */
  body: string | null;
  subject: string | null;
  motif: string | null;
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
  /** How many concepts hang off it. Shown on a branch that has been folded up,
   *  which is otherwise a card that says nothing about what it is hiding. */
  detailCount: number;
  /** Which of the three things this is. `isBranch` and `hasDetails` still say
   *  what they always said; this says how the card is drawn. */
  kind: "hub" | "branch" | "detail";
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
  kind: "parent" | "next" | "hub";
  /** The caption on a "next" edge, when the material named the moment. */
  label: string | null;
}

export interface MapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface LayoutOptions {
  /** The name in the middle — the subject, or the folder. A hub is only drawn
   *  for a map that is actually about one thing; "everything, across every
   *  subject" is not a centre, it is an absence of one. */
  hub?: string | null;
  /** Branches folded up. Their details are not laid out at all, which is the
   *  point: a map of five themes is readable and the same map with ninety
   *  details on it is wallpaper. */
  collapsed?: ReadonlySet<string>;
}

/** The id of the centre. Not a concept id: nothing is stored for the hub, so it
 *  cannot collide with one and cannot be opened, dragged or renamed. */
export const HUB_ID = "__hub__";

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

const BRANCH_RING = 560;
const DETAIL_RING = 220;
const GAP = 240;
/** Details are chips now, not cards: a short stack of them beside their branch
 *  rather than a ring around it. A ring of forty chips is a wreath nobody can
 *  read, and it was the thing pushing the whole map kilometres wide. */
const COLUMN_X = 250;
const CHIP_ROW = 62;
// Past this many branches a ring is too big to read; they go in a grid instead.
const RING_LIMIT = 6;
// The arc details hang on below their branch on a spine. Screen coordinates, so
// a positive sine is downwards: these two are below the branch, not above it.
// A card's width, the drop from a branch to the head of its column, and the
// drop between details after that. The first one is bigger because a branch card
// is the tall one - an eyebrow, a title over three lines, and its question count,
// which at an even 96 was being clipped by the detail underneath it.
const CARD = 300;
const SPINE_HEAD = 200;
const SPINE_ROW = CHIP_ROW;

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
export function layout(concepts: Concept[], options: LayoutOptions = {}): MapLayout {
  const collapsed = options.collapsed ?? new Set<string>();
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
  //
  // The signal is the *named* moment, not the sequence number. Every concept
  // gets a sequence — the reading numbers them all, so that a map has an order
  // to walk through — and keying off it put every subject on a timeline,
  // including the ones with no time in them. A `when_label` is the material
  // itself saying "1763", and only material that says so gets a spine.
  const dated = branches.filter((branch) => branch.when_label !== null).length;
  const chronological = branches.length > 1 && dated * 2 > branches.length;

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // How much room a branch needs to itself: its own card, plus the ring its
  // details sit on. Spacing is derived from this rather than fixed, so a branch
  // with twenty details does not overlap the one beside it.
  const ringFor = (id: string): number => {
    const count = collapsed.has(id) ? 0 : (childrenOf.get(id)?.length ?? 0);
    // Half the height of the column of chips: what the branch needs above and
    // below itself before it touches its neighbour.
    return count === 0 ? 0 : Math.max(DETAIL_RING, (count * CHIP_ROW) / 2);
  };
  const widest = branches.reduce((most, branch) => Math.max(most, ringFor(branch.id)), 0);
  // A spine only ever needs one card's width per branch, because its details go
  // in a column underneath rather than around it. Sized like a ring instead,
  // five branches came out 3,500px across and the map opened at a quarter size:
  // every card present, not one of them readable.
  // Never less than a card and a gap. With no details at all `widest` is 0, so
  // this came out at exactly the width of a card and every neighbour in the grid
  // touched the one beside it.
  const cell = chronological ? CARD + GAP : Math.max(CARD + GAP, widest * 2 + GAP);

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

  // The centre. Only for a ring: on a spine the middle of the picture is
  // already occupied by the third or fourth thing that happened, and a hub
  // dropped on top of it would be a label sitting on a date.
  const hubbed =
    Boolean(options.hub) && !chronological && branches.length > 1 && branches.length <= RING_LIMIT;
  if (hubbed) {
    nodes.push({
      id: HUB_ID,
      title: options.hub as string,
      body: null,
      subject: options.hub as string,
      motif: null,
      questionCount: 0,
      isBranch: false,
      hasDetails: true,
      step: null,
      whenLabel: null,
      detailCount: branches.length,
      kind: "hub",
      x: 0,
      y: 0,
    });
  }

  branches.forEach((branch, index) => {
    const { x: bx, y: by } = place(index);
    const all = childrenOf.get(branch.id) ?? [];
    const details = collapsed.has(branch.id) ? [] : all;
    nodes.push({
      id: branch.id,
      title: branch.title,
      body: branch.body,
      subject: branch.subject,
      motif: branch.motif ?? null,
      questionCount: branch.question_count,
      isBranch: true,
      hasDetails: all.length > 0,
      step: index + 1,
      whenLabel: branch.when_label,
      detailCount: all.length,
      kind: "branch",
      ...positionOf(branch, { x: bx, y: by }),
    });

    if (hubbed) {
      edges.push({
        id: `hub-${branch.id}`,
        source: HUB_ID,
        target: branch.id,
        kind: "hub",
        label: null,
      });
    }

    // One branch leads to the next, in the order the material runs. The caption
    // is the *arriving* concept's: an arrow into 1763 is labelled 1763.
    //
    // Only on a spine. On a ring the chain has to travel all the way round the
    // circle, so five themes become five long dashed rectangles crossing every
    // other thing on the map — and a ring is used precisely when the material
    // had no chronology to show in the first place.
    const next = chronological ? branches[index + 1] : undefined;
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

    // A column beside the branch rather than a ring around it, pushed to
    // whichever side is away from the middle — so the chips hang off the outside
    // of the map and the space between a branch and the hub stays clear for the
    // line that joins them.
    const outward = bx >= 0 ? 1 : -1;
    const middle = (details.length - 1) / 2;
    details.forEach((detail, position) => {
      nodes.push({
        id: detail.id,
        title: detail.title,
        body: detail.body,
        subject: detail.subject,
        motif: detail.motif ?? null,
        questionCount: detail.question_count,
        isBranch: false,
        hasDetails: false,
        step: position + 1,
        whenLabel: detail.when_label,
        detailCount: 0,
        kind: "detail",
        ...positionOf(detail, {
          x: chronological ? bx : at(bx + outward * COLUMN_X),
          y: chronological
            ? at(by + SPINE_HEAD + position * SPINE_ROW)
            : at(by + (position - middle) * CHIP_ROW),
        }),
      });
      // In a column, one tie from the branch to the head of it. Drawing a tie to
      // every detail would stack four lines down the same track, and the chain
      // below already says these all hang off the same branch.
      if (!chronological || position === 0) {
        // On a ring each chip gets its own tie: they fan out sideways, so four
        // lines do not stack down one track the way they do on a spine.
        edges.push({
          id: `${branch.id}-${detail.id}`,
          source: branch.id,
          target: detail.id,
          kind: "parent",
          label: null,
        });
      }
      // And the details of one branch run in their own order too — but only
      // where there is an order to show. On a ring the chips are a stack beside
      // their theme, read top to bottom, and chaining them drew a dashed line
      // out of one chip's side and back into the next one's, all the way around
      // the outside of the map.
      const after = chronological ? details[position + 1] : undefined;
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
