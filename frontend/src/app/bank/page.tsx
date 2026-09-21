"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { ConceptHeader } from "@/components/app/concept-header";
import { Empty } from "@/components/app/empty";
import { FolderGrid } from "@/components/app/folder-grid";
import { MaterialList } from "@/components/app/material-list";
import { MistakeCard } from "@/components/app/mistake-card";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { SubjectTabs } from "@/components/app/subject-tabs";
import { Unreachable } from "@/components/app/unreachable";
import { useSubjectTree } from "@/components/app/use-subjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";
import {
  fromSearchParams,
  isEmpty,
  toQuery,
  toSearchParams,
  toggle,
  type Facets,
  NO_FACETS,
} from "@/lib/facets";

/** One selected facet, with the click that removes it.
 *
 *  `name` exists because `label` may be a badge rather than a string, and every
 *  one of these buttons used to answer to "Remove filter" — identical
 *  accessible names on one row, which tells a screen reader nothing about which
 *  filter it is about to drop and leaves a test no way to name one either. */
function Pill({
  label,
  name,
  onRemove,
}: {
  label: React.ReactNode;
  name: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 pr-1.5 pl-2.5 text-xs">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${name}`}
        className="rounded-full px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        ×
      </button>
    </span>
  );
}

function BankList() {
  const router = useRouter();
  const params = useSearchParams();

  // The URL is the single source of truth for the facets, so a filtered view is
  // a link, and arriving from elsewhere needs no syncing effect.
  const selected = useMemo(() => fromSearchParams(params), [params]);
  const [text, setText] = useState(() => params.get("q") ?? "");
  const facets: Facets = { ...selected, text };

  const apply = (next: Facets) => {
    setText(next.text);
    const query = toSearchParams(next).toString();
    router.replace(query ? `/bank?${query}` : "/bank");
  };

  const { data: subjects } = useSubjectTree();
  // One subject in the URL is a tab; two or more is a filter no tab can
  // represent, so the strip falls back to All rather than lying.
  const tab = selected.subjects.length === 1 ? selected.subjects[0] : null;
  const openSubject = subjects?.find((subject) => subject.name === tab) ?? null;

  const selectSubject = (name: string | null) =>
    // Folders belong to the subject being left, so they go with it.
    apply({
      ...facets,
      subjects: name === null ? [] : [name],
      folder_ids: [],
      hasFolder: null,
    });

  const selectFolder = (folderId: string | null) =>
    apply({ ...facets, folder_ids: folderId === null ? [] : [folderId], hasFolder: null });

  const selectUnfiled = () =>
    apply({ ...facets, folder_ids: [], hasFolder: facets.hasFolder === false ? null : false });

  // Only to label the concept pills: an id in the URL means nothing to read.
  const { data: concepts } = useQuery({
    queryKey: keys.concepts(),
    queryFn: api.listConcepts,
    enabled: selected.concept_ids.length > 0,
  });
  const conceptTitle = (id: string) =>
    concepts?.find((concept) => concept.id === id)?.title ?? "concept";
  const folderName = (id: string) =>
    subjects?.flatMap((subject) => subject.folders).find((folder) => folder.id === id)?.name ??
    "folder";

  const openFolder =
    openSubject?.folders.find((folder) => folder.id === facets.folder_ids[0]) ?? null;

  // Searching is a different question from browsing. Browsing asks "what have I
  // put in here" and is answered by the materials; searching asks "where is that
  // question" and is answered by rows. Showing both at once would be two answers
  // to whichever one was actually asked. A folder on its own is browsing.
  const searching =
    facets.text.trim() !== "" ||
    facets.concept_ids.length > 0 ||
    facets.tags.length > 0 ||
    facets.topics.length > 0 ||
    facets.hasConcept !== null ||
    facets.hasFolder !== null;

  const query = toQuery(facets);
  const { data, isPending, isError, error } = useQuery({
    queryKey: keys.search(query),
    queryFn: () => api.searchMistakes(query),
    enabled: searching,
  });

  const filtering = !isEmpty(facets);

  // A concept with nothing tagged returns an empty bank, which is correct and
  // reads exactly like a broken filter. Name it, and offer the way out.
  const onlyEmptyConcept =
    facets.concept_ids.length === 1 &&
    facets.subjects.length === 0 &&
    facets.topics.length === 0 &&
    facets.tags.length === 0 &&
    facets.folder_ids.length === 0 &&
    facets.hasFolder === null &&
    facets.hasConcept === null &&
    !facets.text.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="The bank"
        lede="Your subjects, the folders inside them, and everything you have put into each."
      />

      <SubjectTabs
        subjects={subjects ?? []}
        selected={tab}
        onSelect={selectSubject}
        total={subjects?.reduce((sum, subject) => sum + subject.question_count, 0) ?? 0}
      />

      {openSubject && (
        <FolderGrid
          subject={openSubject}
          selected={facets.folder_ids[0] ?? null}
          unfiledSelected={facets.hasFolder === false}
          onSelect={selectFolder}
          onSelectUnfiled={selectUnfiled}
        />
      )}

      <Input
        value={facets.text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search the questions…"
        aria-label="Search the questions"
      />

      {filtering && (
        <div className="flex flex-wrap items-center gap-1.5">
          {facets.concept_ids.map((value) => (
            <Pill
              key={value}
              label={conceptTitle(value)}
              name={conceptTitle(value)}
              onRemove={() => apply(toggle(facets, "concept_ids", value))}
            />
          ))}
          {facets.hasConcept !== null && (
            <Pill
              label={facets.hasConcept ? "Filed under a concept" : "No concept yet"}
              name={facets.hasConcept ? "Filed under a concept" : "No concept yet"}
              onRemove={() => apply({ ...facets, hasConcept: null })}
            />
          )}
          {facets.subjects.map((value) => (
            <Pill
              key={value}
              label={value}
              name={value}
              onRemove={() => apply(toggle(facets, "subjects", value))}
            />
          ))}
          {facets.topics.map((value) => (
            <Pill
              key={value}
              label={value}
              name={value}
              onRemove={() => apply(toggle(facets, "topics", value))}
            />
          ))}
          {facets.tags.map((value) => (
            <Pill
              key={value}
              label={value}
              name={value}
              onRemove={() => apply(toggle(facets, "tags", value))}
            />
          ))}
          {facets.folder_ids.map((value) => (
            <Pill
              key={value}
              label={folderName(value)}
              name={folderName(value)}
              onRemove={() => apply(toggle(facets, "folder_ids", value))}
            />
          ))}
          {facets.hasFolder !== null && (
            <Pill
              label={facets.hasFolder ? "In a folder" : "Not in a folder"}
              name={facets.hasFolder ? "In a folder" : "Not in a folder"}
              onRemove={() => apply({ ...facets, hasFolder: null })}
            />
          )}
          <Button size="sm" variant="ghost" onClick={() => apply(NO_FACETS)}>
            Clear all
          </Button>
        </div>
      )}

      {/* One concept selected: show the concept, then the questions under it. */}
      {selected.concept_ids.length === 1 && (
        <ConceptHeader conceptId={selected.concept_ids[0]} />
      )}

      {searching ? (
        isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError ? (
          <Unreachable error={error as Error} />
        ) : data && data.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {data.length} question{data.length === 1 ? "" : "s"}
            </p>
            <div className="space-y-3">
              {data.map((mistake) => (
                <MistakeCard key={mistake.id} mistake={mistake} />
              ))}
            </div>
          </>
        ) : (
          <Empty
            title={
              onlyEmptyConcept
                ? `Nothing is tagged with “${conceptTitle(facets.concept_ids[0])}” yet.`
                : "Nothing matches all of those."
            }
            body={
              onlyEmptyConcept
                ? "The concept exists — no question has been filed under it."
                : "The filters narrow each other, so a question has to satisfy every one. Drop one and see."
            }
            action={
              onlyEmptyConcept
                ? { href: `/concepts/${facets.concept_ids[0]}`, label: "Open the concept" }
                : { href: "/", label: "Add material" }
            }
          />
        )
      ) : openFolder ? (
        <Section
          title={`In ${openFolder.name}`}
          description="Everything you have put into this folder, newest first. Open one to see the concepts and questions it produced."
        >
          <MaterialList folderId={openFolder.id} />
        </Section>
      ) : tab ? (
        <Section
          title={`Everything in ${tab}`}
          description="Across every folder in this subject. Pick a folder above to narrow it."
        >
          <MaterialList subject={tab} />
        </Section>
      ) : (
        <Section
          title="Everything you have put in"
          description="Newest first, across every subject. Pick a subject above to narrow it."
        >
          <MaterialList />
        </Section>
      )}
    </div>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BankList />
    </Suspense>
  );
}
