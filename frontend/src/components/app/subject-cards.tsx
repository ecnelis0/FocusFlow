"use client";

import { Motif, MOTIF_TINT } from "@/components/app/motifs";
import { motifFor } from "@/lib/motif";
import type { Subject } from "@/lib/types";

/** The bank's front door: one card per course.
 *
 *  A tab strip is a good way to switch between things you already know are
 *  there; it is a poor way to see what you have. Cards give each course a size,
 *  a scene and a count, so opening the bank answers "what am I carrying?"
 *  before you have clicked anything.
 *
 *  The scene comes from the same vocabulary the map draws from — matched off the
 *  course's own name, so Psychology gets a brain and APUSH a book — which is
 *  what keeps this page and the map looking like two views of one thing rather
 *  than two designs.
 */
export function SubjectCards({
  subjects,
  onOpen,
}: {
  subjects: Subject[];
  onOpen: (name: string) => void;
}) {
  if (subjects.length === 0) return null;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((subject) => {
        const scene = motifFor({ title: subject.name, subject: subject.name });
        const units = subject.folders.length;
        return (
          <li key={subject.id}>
            <button
              type="button"
              onClick={() => onOpen(subject.name)}
              aria-label={`Open ${subject.name}`}
              className="group flex w-full items-center gap-3.5 rounded-xl border bg-card px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_6px_18px_rgba(30,44,34,0.10)]"
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: MOTIF_TINT[scene] }}
              >
                <Motif name={scene} className="size-8" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium transition-colors group-hover:text-primary">
                  {subject.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {subject.concept_count} concept{subject.concept_count === 1 ? "" : "s"}
                  {units > 0 && ` · ${units} unit${units === 1 ? "" : "s"}`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
