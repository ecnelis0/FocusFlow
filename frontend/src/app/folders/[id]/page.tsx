"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { Empty } from "@/components/app/empty";
import { MistakeCard } from "@/components/app/mistake-card";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { Section } from "@/components/app/section";
import { Unreachable } from "@/components/app/unreachable";
import { useSubjectTree } from "@/components/app/use-subjects";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";
import type { Concept } from "@/lib/types";

/** The concepts of this folder as branches with their details, in one pass.
 *
 *  A detail whose branch is filed elsewhere is shown at the top level rather
 *  than dropped — the same rule the map follows, for the same reason: this page
 *  claims to hold everything in the folder, so it has to. */
function asTree(concepts: Concept[]): { branch: Concept; details: Concept[] }[] {
  const here = new Set(concepts.map((concept) => concept.id));
  const details = new Map<string, Concept[]>();
  const branches: Concept[] = [];

  for (const concept of concepts) {
    const parent = concept.parent_id;
    if (parent && parent !== concept.id && here.has(parent)) {
      details.set(parent, [...(details.get(parent) ?? []), concept]);
    } else {
      branches.push(concept);
    }
  }

  const ordered = branches.map((branch) => ({
    branch,
    details: details.get(branch.id) ?? [],
  }));
  // Branches carrying something first: the shape of the folder is the point.
  ordered.sort((a, b) => b.details.length - a.details.length);

  const shown = new Set(ordered.flatMap(({ branch, details }) => [branch.id, ...details.map((d) => d.id)]));
  return [
    ...ordered,
    // Anything caught in a cycle, so nothing in the folder goes unlisted.
    ...concepts.filter((c) => !shown.has(c.id)).map((branch) => ({ branch, details: [] })),
  ];
}

function ConceptLine({ concept, detail = false }: { concept: Concept; detail?: boolean }) {
  return (
    <Link
      href={`/concepts/${concept.id}`}
      className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <span className={detail ? "text-sm" : "text-[0.95rem] font-medium"}>
        {concept.title}
      </span>
      {concept.question_count > 0 && (
        <span className="ml-2 text-xs text-muted-foreground">
          {concept.question_count} question{concept.question_count === 1 ? "" : "s"}
        </span>
      )}
      {concept.body && (
        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
          {concept.body}
        </span>
      )}
    </Link>
  );
}

export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: subjects, isPending: loadingTree, isError: treeFailed, error: treeError } =
    useSubjectTree();
  const concepts = useQuery({ queryKey: keys.concepts(), queryFn: api.listConcepts });
  const questions = useQuery({
    queryKey: ["mistakes", "folder", id],
    // 100 is the API's ceiling on `limit`; asking for more is a 422, which this
    // page rendered as "can't reach the API" under a perfectly healthy server.
    queryFn: () => api.searchMistakes({ folder_ids: [id], sort: "newest", limit: 100 }),
  });

  const subject = (subjects ?? []).find((candidate) =>
    candidate.folders.some((folder) => folder.id === id),
  );
  const folder = subject?.folders.find((candidate) => candidate.id === id);

  if (loadingTree) return <Skeleton className="h-64 w-full" />;
  // A failed load and a folder that is gone are different answers, and saying
  // "no such folder" when the API is down is the false one.
  if (treeFailed) return <Unreachable error={treeError as Error} />;
  if (!folder || !subject) {
    return (
      <Empty
        title="No such folder."
        body="It may have been removed. What was in it is still in the bank."
        action={{ href: "/bank", label: "Go to the bank" }}
      />
    );
  }

  const mine = (concepts.data ?? []).filter((concept) => concept.folder_id === id);
  const tree = asTree(mine);

  return (
    <div className="space-y-8">
      <PageHeader
        title={folder.name}
        lede={
          <>
            Everything filed in this folder, under <b>{subject.name}</b> —{" "}
            {folder.concept_count} concept{folder.concept_count === 1 ? "" : "s"} and{" "}
            {folder.question_count} question{folder.question_count === 1 ? "" : "s"}.
          </>
        }
        actions={
          <>
            <Link
              href={`/map?subject=${encodeURIComponent(subject.name)}&folder=${id}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              See the map
            </Link>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Add material
            </Link>
          </>
        }
      />

      <Section
        title="Concepts"
        description="The big ideas in this folder, with what hangs under each. Open one for its description and the questions filed against it."
      >
        {concepts.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : concepts.isError ? (
          <Unreachable error={concepts.error as Error} />
        ) : tree.length === 0 ? (
          <Empty
            title="No concepts in here yet."
            body="Put a video, a PDF or your notes into Study and file them here — the concepts and practice questions land in this folder."
            action={{ href: "/", label: "Add material" }}
          />
        ) : (
          <ul className="space-y-3">
            {tree.map(({ branch, details }) => (
              <li key={branch.id}>
                <Panel>
                  <div className="p-1.5">
                    <ConceptLine concept={branch} />
                    {details.length > 0 && (
                      <ul className="mt-1 ml-3 border-l pl-2">
                        {details.map((detail) => (
                          <li key={detail.id}>
                            <ConceptLine concept={detail} detail />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Questions"
        description="Everything filed here that comes back on the review ladder."
        actions={
          <Link
            href={`/bank?folder=${id}`}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Filter the bank by this folder →
          </Link>
        }
      >
        {questions.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : questions.isError ? (
          <Unreachable error={questions.error as Error} />
        ) : (questions.data ?? []).length === 0 ? (
          <Empty
            title="No questions in here yet."
            body="Practice questions pulled out of your material are filed alongside its concepts."
            action={{ href: "/", label: "Add material" }}
          />
        ) : (
          <div className="space-y-3">
            {(questions.data ?? []).map((mistake) => (
              <MistakeCard key={mistake.id} mistake={mistake} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
