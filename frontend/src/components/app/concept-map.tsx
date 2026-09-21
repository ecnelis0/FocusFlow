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
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { layout, type MapNode } from "@/lib/tree";
import type { Concept } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What React Flow carries on each node. Its `data` must be an index signature,
 *  so the map's own fields are spread in rather than nested under a key. */
type ConceptNodeData = Omit<MapNode, "x" | "y"> & Record<string, unknown>;
type ConceptNode = Node<ConceptNodeData, "concept">;

/** One concept on the map: a branch in the accent colour, a detail in paper.
 *
 *  The two are told apart by weight and colour rather than by a label, the way
 *  the middle of a hand-drawn mind map is bigger than the things around it. */
function ConceptNodeCard({ data }: NodeProps<ConceptNode>) {
  const { title, questionCount, hasDetails, step, whenLabel } = data;
  return (
    <div
      className={cn(
        "max-w-[15rem] rounded-xl border px-3.5 py-2.5 text-center shadow-sm transition-shadow hover:shadow-md",
        hasDetails
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground",
      )}
    >
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
      <div
        className={cn(
          "leading-snug",
          hasDetails ? "text-[0.95rem] font-semibold" : "text-[0.8rem] font-medium",
        )}
      >
        {title}
      </div>
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
 *  Read-only on purpose: dragging a node would imply the position means
 *  something and is saved, and neither is true — the arrangement is derived from
 *  which concept sits under which. Clicking one opens it. */
export function ConceptMap({ concepts }: { concepts: Concept[] }) {
  const router = useRouter();

  const { nodes, edges } = useMemo(() => {
    const placed = layout(concepts);
    const nodes: ConceptNode[] = placed.nodes.map(({ x, y, ...rest }) => ({
      id: rest.id,
      type: "concept" as const,
      position: { x, y },
      data: rest,
      draggable: false,
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
  }, [concepts]);

  return (
    <div className="h-[38rem] w-full overflow-hidden rounded-xl border bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_event, node) => router.push(`/concepts/${node.id}`)}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.04}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={22} size={1} className="opacity-60" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
