"use client";

import Link from "next/link";
import { useState } from "react";

import { Motif, MOTIF_TINT } from "@/components/app/motifs";
import { Unreachable } from "@/components/app/unreachable";
import { Skeleton } from "@/components/ui/skeleton";
import { motifFor } from "@/lib/motif";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import type { Concept, Subject } from "@/lib/types";

/** Everything one course holds, as an outline: units, and the concepts in them.
 *
 *  The map shows how the concepts relate; this shows what there *is*. Both are
 *  needed and neither replaces the other — you cannot count a map, and an
 *  outline cannot tell you that one thing led to another.
 *
 *  Units are shut until asked. A course with nine of them is a page you can take
 *  in at a glance when they are closed and a wall of ninety lines when they are
 *  not, and the count on the right is what tells you which one to open.
 */
function Unit({
  name,
  concepts,
  count,
  open,
  onToggle,
}: {
  name: string;
  concepts: Concept[];
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const scene = motifFor({ title: name });

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // Not "Open <unit>": the folder grid above already has a button by that
        // name for the same unit, and two controls with one name is a screen
        // reader being told nothing and a click landing on whichever came first.
        aria-label={open ? `Hide the concepts in ${name}` : `Show the concepts in ${name}`}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-md"
          style={{ backgroundColor: MOTIF_TINT[scene] }}
        >
          <Motif name={scene} className="size-6" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {count} concept{count === 1 ? "" : "s"}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <ul className="border-t">
          {concepts.map((concept) => {
            const glyph = motifFor(concept);
            return (
              <li key={concept.id}>
                <Link
                  href={`/concepts/${concept.id}`}
                  className="flex items-center gap-2.5 border-b px-3.5 py-2 pl-6 text-sm transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded"
                    style={{ backgroundColor: MOTIF_TINT[glyph] }}
                  >
                    <Motif name={glyph} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{concept.title}</span>
                  {concept.question_count > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {concept.question_count} question
                      {concept.question_count === 1 ? "" : "s"}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {concepts.length === 0 && (
            <p className="px-3.5 py-3 pl-6 text-sm text-muted-foreground">
              Nothing filed in here yet.
            </p>
          )}
        </ul>
      )}
    </li>
  );
}

export function UnitOutline({ subject }: { subject: Subject }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const concepts = useQuery({ queryKey: keys.concepts(), queryFn: api.listConcepts });

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (concepts.isPending) return <Skeleton className="h-40 w-full" />;
  // Never an empty outline for a failed load: "no units" and "the API is down"
  // look identical otherwise, and only one of them is the student's fault.
  if (concepts.isError) return <Unreachable error={concepts.error as Error} />;

  const inThisSubject = concepts.data.filter((concept) => concept.subject === subject.name);
  const unfiled = inThisSubject.filter((concept) => concept.folder_id === null);

  return (
    <ul className="space-y-2">
      {subject.folders.map((folder) => (
        <Unit
          key={folder.id}
          name={folder.name}
          count={folder.concept_count}
          concepts={inThisSubject.filter((concept) => concept.folder_id === folder.id)}
          open={open.has(folder.id)}
          onToggle={() => toggle(folder.id)}
        />
      ))}
      {unfiled.length > 0 && (
        <Unit
          name="Not in a unit"
          count={unfiled.length}
          concepts={unfiled}
          open={open.has("__unfiled__")}
          onToggle={() => toggle("__unfiled__")}
        />
      )}
    </ul>
  );
}
