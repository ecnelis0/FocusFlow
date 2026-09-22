"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useState } from "react";

import { Empty } from "@/components/app/empty";
import { Panel } from "@/components/app/panel";
import { Unreachable } from "@/components/app/unreachable";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";
import type { Concept, Material } from "@/lib/types";

/** What each kind is called on screen. A bare "pdf" reads like a file
 *  extension; "PDF" reads like the thing you put in. */
const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  image: "Picture",
  text: "Notes",
  audio: "Recording",
  video: "Video",
};

/** The concepts of one material as branches with their details underneath.
 *
 *  A detail whose branch came from a *different* upload is shown at the top
 *  level rather than dropped: this list claims to hold everything that came out
 *  of this material, so it has to. */
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
  return branches.map((branch) => ({ branch, details: details.get(branch.id) ?? [] }));
}

function ConceptLine({ concept, detail = false }: { concept: Concept; detail?: boolean }) {
  return (
    <Link
      href={`/concepts/${concept.id}`}
      className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
    >
      {(concept.when_label || concept.sequence !== null) && (
        <span className="mr-2 text-[0.7rem] font-medium tracking-[0.05em] text-muted-foreground uppercase tabular-nums">
          {concept.when_label ?? concept.sequence}
        </span>
      )}
      <span className={detail ? "text-sm" : "text-[0.95rem] font-medium"}>
        {concept.title}
      </span>
      {concept.body && (
        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
          {concept.body}
        </span>
      )}
    </Link>
  );
}

/** One material, opened: what the AI made of it.
 *
 *  Fetched only once it is expanded. A folder with a term's worth of uploads
 *  would otherwise pull every concept and question in it just to draw a list of
 *  titles. */
function MaterialBody({ id }: { id: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: keys.material(id),
    queryFn: () => api.getMaterial(id),
  });

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (isError) return <Unreachable error={error as Error} />;

  const tree = asTree(data.concepts);

  return (
    <div className="space-y-4 border-t px-4 py-4">
      {tree.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
            Concepts
          </h4>
          <ul>
            {tree.map(({ branch, details }) => (
              <li key={branch.id}>
                <ConceptLine concept={branch} />
                {details.length > 0 && (
                  <ul className="mt-0.5 ml-3 border-l pl-2">
                    {details.map((item) => (
                      <li key={item.id}>
                        <ConceptLine concept={item} detail />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.questions.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
            Questions
          </h4>
          <ul className="space-y-1">
            {data.questions.map((question) => (
              <li key={question.id}>
                <Link
                  href={`/bank/${question.id}`}
                  className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
                >
                  <span className="block text-sm">{question.question_text}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <span className="font-medium">Answer</span>{" "}
                    <span className="font-mono">{question.correct_answer}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tree.length === 0 && data.questions.length === 0 && (
        <p className="px-3 text-sm text-muted-foreground">
          Nothing came out of this one. The concepts it produced may have been
          struck out before filing, or moved to another folder since.
        </p>
      )}
    </div>
  );
}

function MaterialCard({ material }: { material: Material }) {
  const [open, setOpen] = useState(false);
  const kind = KIND_LABELS[material.kind] ?? material.kind;

  return (
    <Panel className="group/material relative">
      {/* A link, not a button: it navigates. Named for the material, because a
          folder of six uploads would otherwise be six controls called "Notes". */}
      <Link
        href={`/materials/${material.id}/notes`}
        aria-label={`${material.has_notes ? "Read the notes on" : "Write notes from"} ${material.title}`}
        className="absolute top-3 right-3 z-10 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover/material:opacity-100 focus-visible:opacity-100"
      >
        {material.has_notes ? "Notes" : "Write notes"}
      </Link>

      <button
        type="button"
        // Named for the material, not "Expand": a folder of six uploads would
        // otherwise be six controls answering to one name.
        aria-label={`${open ? "Collapse" : "Expand"} ${material.title}`}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-start gap-3 px-4 py-3.5 pr-24 text-left"
      >
        <span
          aria-hidden
          className="mt-1 text-xs text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{material.title}</span>
          {material.summary && (
            <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">
              {material.summary}
            </span>
          )}
          <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
            {kind} · {material.concept_count} concept
            {material.concept_count === 1 ? "" : "s"} · {material.question_count} question
            {material.question_count === 1 ? "" : "s"} ·{" "}
            {format(new Date(material.created_at), "d MMM")}
          </span>
        </span>
      </button>

      {open && <MaterialBody id={material.id} />}
    </Panel>
  );
}

/** Everything put into one folder, newest first, each opening to what it made.
 *
 *  This is what a folder *is*, as far as reading it goes: not a pooled heap of
 *  concepts, but the list of things you put in and what came out of each. */
export function MaterialList({
  folderId,
  subject,
}: {
  folderId?: string;
  subject?: string;
}) {
  const filters = folderId ? { folder_id: folderId } : subject ? { subject } : {};
  const { data, isPending, isError, error } = useQuery({
    queryKey: keys.materials(filters),
    queryFn: () => api.listMaterials(filters),
  });

  // A question can be moved into a folder on its own, from its own page, and its
  // material stays where it was. Listing only materials would then show an empty
  // folder that demonstrably holds something - so the strays are listed too.
  const strays = useQuery({
    queryKey: ["mistakes", "stray", filters],
    queryFn: () =>
      api.searchMistakes({
        ...(folderId ? { folder_ids: [folderId] } : {}),
        ...(subject ? { subjects: [subject] } : {}),
        sort: "newest",
        limit: 100,
      }),
    enabled: folderId !== undefined || subject !== undefined,
  });

  if (isPending) return <Skeleton className="h-40 w-full" />;
  // Never the empty state for a failed load: "nothing in here" is the one thing
  // that would make a student think their work was gone.
  if (isError) return <Unreachable error={error as Error} />;

  const here = new Set(data.map((material) => material.id));
  const loose = (strays.data ?? []).filter(
    (question) => question.material_id === null || !here.has(question.material_id),
  );

  if (data.length === 0 && loose.length === 0) {
    return (
      <Empty
        title="Nothing put in here yet."
        body="Drop a PDF, paste a YouTube link or write your notes out in Study, and file it here. What comes out of it is listed on this page."
        action={{ href: "/", label: "Add material" }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {data.length > 0 && (
        <ul className="space-y-3">
          {data.map((material) => (
            <li key={material.id}>
              <MaterialCard material={material} />
            </li>
          ))}
        </ul>
      )}

      {loose.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
            Also filed here
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Questions moved into this folder on their own. What they came from is
            filed somewhere else.
          </p>
          <ul className="space-y-1">
            {loose.map((question) => (
              <li key={question.id}>
                <Link
                  href={`/bank/${question.id}`}
                  className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
                >
                  <span className="block text-sm">{question.question_text}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <span className="font-medium">Answer</span>{" "}
                    <span className="font-mono">{question.correct_answer}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
