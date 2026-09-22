"use client";

import {
  Background,
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

import { layout, type MapNode } from "@/lib/tree";
import { api, keys } from "@/lib/api";
import type { Concept } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What React Flow carries on each node. Its `data` must be an index signature,
 *  so the map's own fields are spread in rather than nested under a key. */
type ConceptNodeData = Omit<MapNode, "x" | "y"> & {
  /** Rename from the card itself. Carried on the node rather than reached
   *  through a context because React Flow owns the tree between the two. */
  onRename: (id: string, title: string) => void;
} & Record<string, unknown>;
type ConceptNode = Node<ConceptNodeData, "concept">;

/** One concept on the map: a branch in the accent colour, a detail in paper.
 *
 *  The two are told apart by weight and colour rather than by a label, the way
 *  the middle of a hand-drawn mind map is bigger than the things around it. */
function ConceptNodeCard({ data }: NodeProps<ConceptNode>) {
  const { id, title, questionCount, hasDetails, step, whenLabel, onRename } = data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const commit = () => {
    setEditing(false);
    const tidy = draft.trim();
    if (tidy && tidy !== title) onRename(id, tidy);
    else setDraft(title);
  };
  return (
    <div
      className={cn(
        "group/card relative max-w-[15rem] rounded-xl border px-3.5 py-2.5 text-center shadow-sm transition-shadow hover:shadow-md",
        hasDetails
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground",
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
            "nodrag absolute top-1 right-1 rounded px-1 text-[11px] leading-none opacity-0 transition-opacity group-hover/card:opacity-70 hover:!opacity-100 focus-visible:opacity-100",
            hasDetails ? "text-primary-foreground" : "text-muted-foreground",
          )}
        >
          ✎
        </button>
      )}
      {/* Both handles on every node, hidden: React Flow needs somewhere to start
          and end an edge, and a branch is a source while a detail is a target. */}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      {/* The moment if the material named one, otherwise the position. A step
          number is the weaker claim of the two, so the date wins when both
          exist rather than printing "3 · 1763" and making the reader pick. */}
      {(whenLabel || step !== null) && (
        <div
          className={cn(
            "mb-1 text-[0.65rem] font-medium tracking-[0.06em] uppercase",
            hasDetails ? "text-primary-foreground/70" : "text-muted-foreground",
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
            hasDetails ? "text-[0.95rem] font-semibold" : "text-[0.8rem] font-medium",
          )}
        >
          {title}
        </div>
      )}
      {questionCount > 0 && (
        <div
          className={cn(
            "mt-1 text-[0.7rem]",
            hasDetails ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {questionCount} question{questionCount === 1 ? "" : "s"}
        </div>
      )}
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
export function ConceptMap({ concepts }: { concepts: Concept[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const { nodes, edges } = useMemo(() => {
    const placed = layout(concepts);
    const nodes: ConceptNode[] = placed.nodes.map(({ x, y, ...rest }) => ({
      id: rest.id,
      type: "concept" as const,
      position: { x, y },
      data: {
        ...rest,
        onRename: (id: string, title: string) => renameConcept({ id, title }),
      },
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
      style:
        kind === "next"
          ? { strokeWidth: 2, stroke: "var(--color-primary)" }
          : { strokeWidth: 1.5, opacity: 0.55 },
      markerEnd:
        kind === "next"
          ? { type: MarkerType.ArrowClosed, color: "var(--color-primary)" }
          : undefined,
      labelStyle: { fontSize: 11, fill: "var(--color-muted-foreground)" },
      labelBgPadding: [4, 2] as [number, number],
      labelBgStyle: { fill: "var(--color-background)", fillOpacity: 0.9 },
    }));
    return { nodes, edges };
  }, [concepts, renameConcept]);

  return (
    <div className="h-[38rem] w-full overflow-hidden rounded-xl border bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_event, node) => router.push(`/concepts/${node.id}`)}
        // Saved where it was dropped, in the map's own coordinates. `origin` is
        // the card's centre, and React Flow reports the same frame back.
        onNodeDragStop={(_event, node) =>
          move.mutate({ id: node.id, x: node.position.x, y: node.position.y })
        }
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
        <Background gap={22} size={1} className="opacity-60" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
