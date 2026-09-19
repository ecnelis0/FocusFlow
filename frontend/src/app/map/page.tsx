"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { ConceptMap } from "@/components/app/concept-map";
import { Empty } from "@/components/app/empty";
import { FolderGrid } from "@/components/app/folder-grid";
import { PageHeader } from "@/components/app/page-header";
import { SubjectTabs } from "@/components/app/subject-tabs";
import { Unreachable } from "@/components/app/unreachable";
import { useSubjectTree } from "@/components/app/use-subjects";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";

function MapPage() {
  const router = useRouter();
  const params = useSearchParams();
  const subject = params.get("subject");
  const folder = params.get("folder");

  const concepts = useQuery({ queryKey: keys.concepts(), queryFn: api.listConcepts });
  const { data: subjects } = useSubjectTree();
  const openSubject = (subjects ?? []).find((candidate) => candidate.name === subject);

  const go = (next: URLSearchParams) => {
    const query = next.toString();
    router.push(query ? `/map?${query}` : "/map");
  };

  const selectSubject = (name: string | null) => {
    const next = new URLSearchParams();
    if (name) next.set("subject", name);
    go(next); // A different subject's folder is not this subject's filter.
  };

  const selectFolder = (folderId: string | null) => {
    const next = new URLSearchParams();
    if (subject) next.set("subject", subject);
    if (folderId) next.set("folder", folderId);
    go(next);
  };

  const shown = useMemo(() => {
    const all = concepts.data ?? [];
    if (folder) return all.filter((concept) => concept.folder_id === folder);
    if (subject) return all.filter((concept) => concept.subject === subject);
    return all;
  }, [concepts.data, subject, folder]);

  const scope = openSubject?.folders.find((f) => f.id === folder)?.name ?? subject ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="The map"
        lede="How the concepts hang together: the big ideas, with their details around
          them. Narrow it to a subject or a folder to read one branch at a time, and click
          any concept to open it."
      />

      <SubjectTabs
        subjects={subjects ?? []}
        selected={subject}
        onSelect={selectSubject}
        total={subjects?.reduce((sum, s) => sum + s.concept_count, 0) ?? 0}
        countOf={(subject) => subject.concept_count}
      />

      {openSubject && (
        <FolderGrid
          subject={openSubject}
          selected={folder}
          unfiledSelected={false}
          onSelect={selectFolder}
          onSelectUnfiled={() => selectFolder(null)}
        />
      )}

      {concepts.isPending ? (
        <Skeleton className="h-[34rem] w-full" />
      ) : concepts.isError ? (
        // Never an empty map for a failed load: "nothing connects to anything" is
        // the most alarming and least true thing this screen could say.
        <Unreachable error={concepts.error as Error} />
      ) : shown.length === 0 ? (
        <Empty
          title={scope ? `Nothing is mapped in “${scope}” yet.` : "Nothing to map yet."}
          body={
            scope
              ? "Concepts filed here will appear as a map. Put some material into this folder and the branches draw themselves."
              : "The map is drawn from your concepts. Put a video, a PDF or your notes into Study and it fills in."
          }
          action={{ href: "/", label: "Add some material" }}
        />
      ) : (
        <ConceptMap concepts={shown} />
      )}
    </div>
  );
}

export default function Page() {
  // useSearchParams needs a Suspense boundary to prerender, the same way the
  // bank's does.
  return (
    <Suspense fallback={<Skeleton className="h-[34rem] w-full" />}>
      <MapPage />
    </Suspense>
  );
}
