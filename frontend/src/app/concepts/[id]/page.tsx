"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConceptCardView } from "@/components/app/concept-card";
import { ConceptForm } from "@/components/app/concept-form";
import { ConceptImages } from "@/components/app/concept-images";
import { Empty } from "@/components/app/empty";
import { MistakeCard } from "@/components/app/mistake-card";
import { TagQuestions } from "@/components/app/tag-questions";
import { useSubjectTree } from "@/components/app/use-subjects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";

export default function ConceptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: concept, isPending, isError } = useQuery({
    queryKey: keys.concept(id),
    queryFn: () => api.getConcept(id),
  });

  // The unit's name, for the line under the title. Read off the tree already in
  // the cache rather than fetched per concept: it is one more request for one
  // word, on a page that has made three.
  const { data: subjects } = useSubjectTree();
  const unit = (subjects ?? [])
    .flatMap((subject) => subject.folders)
    .find((folder) => folder.id === concept?.folder_id)?.name;

  const writeCard = useMutation({
    mutationFn: (force: boolean) => api.writeConceptCard(id, force),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.concept(id), updated);
      queryClient.invalidateQueries({ queryKey: keys.concepts() });
      toast.success("Card written.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const untag = useMutation({
    mutationFn: (mistakeId: string) => api.untagQuestion(id, mistakeId),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.concept(id), updated);
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: keys.concepts() });
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      toast.success("Untagged.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteConcept(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.concepts() });
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      toast.success("Concept deleted. The questions are untouched.");
      router.push("/concepts");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !concept) {
    return (
      <Empty
        title="No such concept."
        body="It was deleted, or it belongs to someone else."
        action={{ href: "/concepts", label: "Back to concepts" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Two ways back, because there are two ways in. Arriving from the map and
          being offered only "Concepts" means going the long way round to the
          picture you were just looking at. The map link carries the concept's
          own subject, so it opens on the branch this belongs to. */}
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/concepts" className="text-sm text-muted-foreground hover:text-foreground">
          ← Concepts
        </Link>
        <Link
          href={
            concept.subject
              ? `/map?subject=${encodeURIComponent(concept.subject)}`
              : "/map"
          }
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← The map
        </Link>
      </div>

      <Card>
        <CardContent>
          {editing ? (
            <ConceptForm concept={concept} onDone={() => setEditing(false)} />
          ) : (
            <div className="space-y-4">
              {/* Title, where it lives, and what it is worth — the three things
                  you want before deciding whether to read the rest. */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight">{concept.title}</h1>
                  {(concept.subject || unit) && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[concept.subject, unit].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {concept.mistakes.length > 0 && (
                    <Badge variant="secondary">
                      {concept.mistakes.length} question
                      {concept.mistakes.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                </div>
              </div>

              {concept.card ? (
                <ConceptCardView card={concept.card} />
              ) : (
                // Concepts filed from now on arrive with a card; everything
                // filed before this existed is offered one. The body is still
                // shown underneath either way — the card is the revision shape,
                // not a replacement for what was written.
                <div className="rounded-xl border border-dashed px-4 py-4 text-center">
                  <p className="text-sm font-medium">No revision card yet.</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    The one line, the keyword, the phrasing an exam uses for it, the picture
                    to think with, and what it catches people out with.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => writeCard.mutate(false)}
                    disabled={writeCard.isPending}
                  >
                    {writeCard.isPending ? "Writing it…" : "Write the card"}
                  </Button>
                </div>
              )}

              {concept.body ? (
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                    <span className="group-open:hidden">Show the full note</span>
                    <span className="hidden group-open:inline">Hide the full note</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
                    {concept.body}
                  </p>
                </details>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No notes yet. Edit to write what this actually means.
                </p>
              )}

              {concept.card && (
                <div className="flex items-center gap-3 border-t pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => writeCard.mutate(true)}
                    disabled={writeCard.isPending}
                  >
                    {writeCard.isPending ? "Writing it again…" : "Write the card again"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    It will not come back the same.
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <ConceptImages concept={concept} editable />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Questions under this concept
          </h2>
          {concept.mistakes.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => router.push(`/bank?concept=${concept.id}`)}
            >
              Filter the bank
            </Button>
          )}
        </div>

        <TagQuestions concept={concept} />

        {concept.mistakes.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-medium">Nothing tagged yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Use the button above to tag questions with this concept, or tag from a
              question&rsquo;s own page. Either way they show up here.
            </p>
          </div>
        ) : (
          concept.mistakes.map((mistake) => (
            <div key={mistake.id} className="space-y-1">
              <MistakeCard mistake={mistake} />
              <div className="flex justify-end">
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={untag.isPending}
                  onClick={() => untag.mutate(mistake.id)}
                >
                  Untag
                </Button>
              </div>
            </div>
          ))
        )}
      </section>

      <Button
        variant="ghost"
        className="text-muted-foreground"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm("Delete this concept? The questions themselves stay.")) {
            remove.mutate();
          }
        }}
      >
        Delete this concept
      </Button>
    </div>
  );
}
