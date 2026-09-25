"use client";

import {
  Controls,
  Handle,
  Position,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Motif, MOTIF_TINT, type MotifName } from "@/components/app/motifs";
import { motifFor } from "@/lib/motif";
import { HUB_ID, layout, type MapNode } from "@/lib/tree";
import { api, keys } from "@/lib/api";
import type { Concept } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What React Flow carries on each node. Its `data` must be an index signature,
 *  so the map's own fields are spread in rather than nested under a key. */
type ConceptNodeData = Omit<MapNode, "x" | "y"> & {
  /** Rename from the card itself. Carried on the node rather than reached
   *  through a context because React Flow owns the tree between the two. */
  onRename: (id: string, title: string) => void;
  /** Fold a branch up, or open it again. */
  onToggle: (id: string) => void;
  collapsed: boolean;
} & Record<string, unknown>;
type ConceptNode = Node<ConceptNodeData, "concept">;

/** The middle of the map: what all of this is about.
 *
 *  Deliberately the one card with no picture on it. Everything around it is a
 *  scene, and a scene in the centre too would be a map with no centre — the eye
 *  needs one thing that is plainly a label. */
function HubCard({ title, count }: { title: string; count: number }) {
  return (
    <div className="rounded-full border-[3px] border-[#C9A24A] bg-[#2C4739] px-8 py-5 text-center shadow-[0_8px_24px_rgba(30,44,34,0.24)]">
      <div className="max-w-[13rem] text-[1.15rem] leading-tight font-semibold text-[#F4EEDE]">
        {title}
      </div>
      <div className="mt-0.5 text-[0.68rem] tracking-[0.1em] text-[#E3C57E] uppercase">
        {count} {count === 1 ? "theme" : "themes"}
      </div>
    </div>
  );
}

/** A detail, as a chip.
 *
 *  These used to be cards like their branch, and forty cards of equal weight is
 *  a wall, not a map. A chip says the same words at a size that admits what it
 *  is: the thing you read *after* the theme has told you where to look. */
function DetailChip({
  title,
  questionCount,
  scene,
}: {
  title: string;
  questionCount: number;
  scene: MotifName;
}) {
  return (
    <div className="flex w-[12rem] items-center gap-2 rounded-lg border border-[#D9CDB2] bg-card px-2.5 py-1.5 shadow-[0_2px_6px_rgba(30,44,34,0.10)] transition-shadow hover:shadow-[0_4px_12px_rgba(30,44,34,0.18)]">
      <span
        className="grid size-7 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: MOTIF_TINT[scene] }}
      >
        <Motif name={scene} className="size-5" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[0.72rem] leading-tight font-medium">{title}</span>
        {questionCount > 0 && (
          <span className="block text-[0.62rem] text-muted-foreground">
            {questionCount} question{questionCount === 1 ? "" : "s"}
          </span>
        )}
      </span>
    </div>
  );
}

/** One concept on the map: a scene, then the claim it illustrates.
 *
 *  A mind map of grey boxes is an org chart. What a student actually navigates
 *  by is the picture — you find the carriage before you have read a word of the
 *  card under it — so the artwork is the top two thirds and the words sit under
 *  it like a caption in a museum.
 *
 *  Two frames, told apart the way a gallery tells apart a painting and its
 *  label: a branch is a dark board in a gilt surround, a detail is a plaque on
 *  cream card. Neither says "branch" anywhere, and neither has to.
 */
function ConceptNodeCard({ data }: NodeProps<ConceptNode>) {
  const {
    id,
    kind,
    title,
    body,
    subject,
    motif,
    questionCount,
    hasDetails,
    detailCount,
    collapsed,
    step,
    whenLabel,
    onRename,
    onToggle,
  } = data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const scene = motifFor({ title, body, subject, motif });

  if (kind === "hub") return <HubCard title={title} count={detailCount} />;
  if (kind === "detail") {
    return (
      <>
        {/* Top and bottom, not left and right. A chain between two chips in a
            column has to leave one and arrive at the other along the axis they
            are stacked on; out of the side and back in meant every tie took the
            long way round the outside of the map. */}
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <DetailChip title={title} questionCount={questionCount} scene={scene} />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      </>
    );
  }

  const commit = () => {
    setEditing(false);
    const tidy = draft.trim();
    if (tidy && tidy !== title) onRename(id, tidy);
    else setDraft(title);
  };

  return (
    <div
      className={cn(
        "group/card relative overflow-hidden rounded-[14px] shadow-[0_6px_18px_rgba(30,44,34,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(30,44,34,0.22)]",
        hasDetails
          ? "w-[15rem] border-[3px] border-[#C9A24A] bg-[#2C4739] text-[#F4EEDE]"
          : "w-[13rem] border-[3px] border-[#D9CDB2] bg-card text-card-foreground",
      )}
    >
      {/* Renaming gets its own control rather than a double-click on the title.
          The card already answers to two gestures — click opens the concept,
          drag moves it — and React Flow's drag handler swallows the double-click
          that would have been the third. `nodrag` keeps a press here from
          starting a drag; the name says which card, because every card would
          otherwise have a button called "Rename". */}
      {!editing && (
        <button
          type="button"
          aria-label={`Rename ${title}`}
          title="Rename"
          onClick={(event) => {
            event.stopPropagation();
            setDraft(title);
            setEditing(true);
          }}
          className={cn(
            "nodrag absolute top-1 right-1 z-10 rounded bg-black/20 px-1 text-[11px] leading-none text-white opacity-0 transition-opacity group-hover/card:opacity-80 hover:!opacity-100 focus-visible:opacity-100",
          )}
        >
          ✎
        </button>
      )}
      {/* Folding. The count is on the button rather than beside it because the
          number is the reason to press it: "6" is what tells you there is
          anything under this at all. Named per card — twelve buttons called
          "Expand" is a duplicate accessible name and tells a screen reader
          nothing about which theme it is about to open. */}
      {hasDetails && (
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? `Show what is under ${title}` : `Hide what is under ${title}`
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggle(id);
          }}
          className="nodrag absolute top-1 left-1 z-10 flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 text-[11px] leading-none text-white/90 transition-colors hover:bg-black/45"
        >
          <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
          {detailCount}
        </button>
      )}
      {/* Both handles on every node, hidden: React Flow needs somewhere to start
          and end an edge, and a branch is a source while a detail is a target. */}
      <Handle type="target" position={Position.Top} className="!opacity-0" />

      {/* The scene. Its wash is part of the vocabulary — a map reads as coloured
          tiles from across the room, and the colour still means something when
          you get to it. */}
      <div
        className={cn("w-full", hasDetails ? "h-[5.6rem]" : "h-[4.6rem]")}
        style={{ backgroundColor: MOTIF_TINT[scene] }}
      >
        <Motif name={scene} className="h-full w-full" />
      </div>

      <div
        className={cn(
          "px-3 pt-2 pb-2.5 text-center",
          hasDetails ? "border-t-[3px] border-[#C9A24A]" : "border-t-[3px] border-[#D9CDB2]",
        )}
      >
        {/* The moment if the material named one, otherwise the position. A step
            number is the weaker claim of the two, so the date wins when both
            exist rather than printing "3 · 1763" and making the reader pick. */}
        {(whenLabel || step !== null) && (
          <div
            className={cn(
              "mb-0.5 text-[0.65rem] font-medium tracking-[0.1em] uppercase",
              hasDetails ? "text-[#E3C57E]" : "text-muted-foreground",
            )}
          >
            {whenLabel ?? step}
          </div>
        )}
        {editing ? (
          // `nodrag` so a click into the text does not start dragging the card,
          // and `nowheel` so selecting with the trackpad does not zoom the canvas.
          <input
            autoFocus
            aria-label={`Rename ${title}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraft(title);
                setEditing(false);
              }
            }}
            className={cn(
              "nodrag nowheel w-full rounded border bg-background px-1.5 py-0.5 text-center leading-snug text-foreground outline-none",
              hasDetails ? "text-[0.95rem] font-semibold" : "text-[0.8rem] font-medium",
            )}
          />
        ) : (
          <div
            className={cn(
              "leading-snug",
              hasDetails ? "text-[0.92rem] font-semibold" : "text-[0.8rem] font-medium",
            )}
          >
            {title}
          </div>
        )}
        {questionCount > 0 && (
          <div
            className={cn(
              "mt-1 text-[0.7rem]",
              hasDetails ? "text-[#F4EEDE]/70" : "text-muted-foreground",
            )}
          >
            {questionCount} question{questionCount === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const NODE_TYPES = { concept: ConceptNodeCard };

/** The concepts of one scope drawn as a mind map, details around their branch.
 *
 *  The arrangement is computed from which concept sits under which, and a card
 *  can be dragged off it — which is saved, so the nudge holds rather than being
 *  undone the next time the page is drawn. Clicking a card opens the concept;
 *  double-clicking its title renames it where it stands. */
export function ConceptMap({ concepts, hub }: { concepts: Concept[]; hub?: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Which themes are folded up. Client state: it is how you are reading the map
  // right now, not a fact about the concepts, and it should not follow you to
  // another device or outlive the tab.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const settle = (id: string) => {
    queryClient.invalidateQueries({ queryKey: keys.concepts() });
    queryClient.invalidateQueries({ queryKey: keys.concept(id) });
  };

  const move = useMutation({
    mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) =>
      api.updateConcept(id, { map_x: x, map_y: y }),
    onSuccess: (updated) => settle(updated.id),
    onError: (error: Error) => toast.error(error.message),
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.updateConcept(id, { title }),
    onSuccess: (updated) => {
      settle(updated.id);
      toast.success("Renamed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // `mutate` is referentially stable; the mutation object around it is not, and
  // depending on that would rebuild the whole layout on every render.
  const renameConcept = rename.mutate;

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const branchIds = useMemo(
    () =>
      new Set(
        concepts
          .filter((concept) => concepts.some((other) => other.parent_id === concept.id))
          .map((concept) => concept.id),
      ),
    [concepts],
  );
  const allFolded = branchIds.size > 0 && collapsed.size >= branchIds.size;

  const { nodes, edges } = useMemo(() => {
    const placed = layout(concepts, { hub, collapsed });
    const nodes: ConceptNode[] = placed.nodes.map(({ x, y, ...rest }) => ({
      id: rest.id,
      type: "concept" as const,
      position: { x, y },
      data: {
        ...rest,
        collapsed: collapsed.has(rest.id),
        onRename: (id: string, title: string) => renameConcept({ id, title }),
        onToggle: toggle,
      },
      // Nothing is stored for the hub, so there is no row to save a drag to.
      draggable: rest.kind !== "hub",
      // Measured from the centre, so the radial maths puts the middle of a card
      // where it computed a point rather than the card's top-left corner.
      origin: [0.5, 0.5] as [number, number],
    }));
    // Two different claims, drawn as two different lines. A plain tie hangs a
    // detail off its branch; an arrowed, accented one says the material runs
    // from here to there. Drawn identically they would read as one relationship.
    const edges: Edge[] = placed.edges.map(({ kind, label, ...edge }) => ({
      ...edge,
      type: kind === "next" ? "smoothstep" : "default",
      label: label ?? undefined,
      animated: kind === "next",
      // Three claims, three lines. A thick ink curve from the middle says "this
      // is one of the themes"; a hairline says "this hangs off that"; an arrow
      // in the accent colour says "the material runs from here to there".
      style:
        kind === "next"
          ? { strokeWidth: 2, stroke: "var(--color-primary)" }
          : kind === "hub"
            ? { strokeWidth: 2.5, stroke: "var(--color-ink)", opacity: 0.45 }
            : { strokeWidth: 1.25, stroke: "var(--color-ink)", opacity: 0.3 },
      markerEnd:
        kind === "next"
          ? { type: MarkerType.ArrowClosed, color: "var(--color-primary)" }
          : undefined,
      labelStyle: { fontSize: 11, fill: "var(--color-muted-foreground)" },
      labelBgPadding: [4, 2] as [number, number],
      labelBgStyle: { fill: "var(--color-background)", fillOpacity: 0.9 },
    }));
    return { nodes, edges };
  }, [concepts, hub, collapsed, renameConcept]);

  // A thin wash rather than a solid surface: the cards and chips are opaque in
  // themselves now, so the landscape can come through between them the way it
  // does everywhere else, and the map reads as drawn on the country rather than
  // pasted over it.
  return (
    <div className="relative h-[42rem] w-full overflow-hidden rounded-xl border bg-card/45">
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(allFolded ? new Set() : new Set(branchIds))}
          className="rounded-full border border-[#D9CDB2] bg-card/90 px-3 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-card"
        >
          {allFolded ? "Open every theme" : "Fold every theme"}
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_event, node) => {
          if (node.id !== HUB_ID) router.push(`/concepts/${node.id}`);
        }}
        // Saved where it was dropped, in the map's own coordinates. `origin` is
        // the card's centre, and React Flow reports the same frame back.
        onNodeDragStop={(_event, node) => {
          if (node.id === HUB_ID) return;
          move.mutate({ id: node.id, x: node.position.x, y: node.position.y });
        }}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.04}
        maxZoom={1.6}
        nodesConnectable={false}
        edgesFocusable={false}
        // React Flow zooms the canvas on a double-click by default, which eats
        // the one this map uses to rename a card.
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: false }}
      >
        {/* No dot grid: there is a painting behind this one. */}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
