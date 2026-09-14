"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ConceptForm } from "@/components/app/concept-form";
import { Empty } from "@/components/app/empty";
import { PageHeader } from "@/components/app/page-header";
import { Unreachable } from "@/components/app/unreachable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";
import type { Concept } from "@/lib/types";

/** Concepts are grouped by subject because a concept belongs to one, and mixing
 *  them makes the list something to scan rather than something to open. A concept
 *  with no subject still needs a home, so it gets a group of its own, last. */
const NO_SUBJECT = "No subject";

function groupBySubject(
  concepts: Concept[],
): { label: string; concepts: Concept[] }[] {
  const bySubject = new Map<string, Concept[]>();
  const unfiled: Concept[] = [];
  for (const concept of concepts) {
    if (concept.subject === null) unfiled.push(concept);
    else
      bySubject.set(concept.subject, [
        ...(bySubject.get(concept.subject) ?? []),
        concept,
      ]);
  }
  const groups = [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, inGroup]) => ({ label, concepts: inGroup }));
  if (unfiled.length > 0) groups.push({ label: NO_SUBJECT, concepts: unfiled });
  return groups;
}

export default function ConceptsPage() {
  const [writing, setWriting] = useState(false);
  // Every group open to begin with, so the state is the ones that were shut. A
  // collapsed list of two things is worse than no grouping, and a group that
  // starts shut hides a concept you just wrote.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const { data, isPending, isError, error } = useQuery({
    queryKey: keys.concepts(),
    queryFn: api.listConcepts,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concepts"
        actions={
          <Button
            variant={writing ? "ghost" : "default"}
            onClick={() => setWriting(!writing)}
          >
            {writing ? "Cancel" : "Write a concept"}
          </Button>
        }
      />

      {writing && (
        <Card>
          <CardContent>
            <ConceptForm onDone={() => setWriting(false)} />
          </CardContent>
        </Card>
      )}

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <Unreachable error={error as Error} />
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {groupBySubject(data).map((group) => {
            const inGroup = group.concepts;
            const open = !collapsed.includes(group.label);

            return (
              <section key={group.label} className="rounded-xl border">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setCollapsed(
                      open
                        ? [...collapsed, group.label]
                        : collapsed.filter((value) => value !== group.label),
                    )
                  }
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  {/* Decoration: aria-expanded already says open or shut, and a
                      glyph in the accessible name makes the button "▾ Biology". */}
                  <span aria-hidden className="text-xs text-muted-foreground">
                    {open ? "▾" : "▸"}
                  </span>
                  <span className="font-medium">{group.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {inGroup.length} concept{inGroup.length === 1 ? "" : "s"}
                  </span>
                </button>

                {open && (
                  <ul className="space-y-2 border-t px-3 py-3">
                    {inGroup.map((concept) => (
                      <li key={concept.id}>
                        <Link
                          href={`/concepts/${concept.id}`}
                          className="block rounded-lg border px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-muted/30"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium">{concept.title}</h3>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {concept.question_count} question
                              {concept.question_count === 1 ? "" : "s"}
                            </span>
                          </div>
                          {concept.body && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {concept.body}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        !writing && (
          <Empty
            title="No concepts yet."
            body="A concept is the thing behind a family of misses — the rule you keep forgetting, not the question you got wrong. Write the first one."
            onAction={{
              label: "Write your first concept",
              onClick: () => setWriting(true),
            }}
          />
        )
      )}
    </div>
  );
}
