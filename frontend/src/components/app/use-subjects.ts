"use client";

import { useQuery } from "@tanstack/react-query";

import { api, keys } from "@/lib/api";
import type { Folder, Subject } from "@/lib/types";

/** Every subject with its folders — the bank's tab strip, in one request.
 *
 *  `isError` is passed through deliberately: a failed load must not be drawn as
 *  "no subjects yet", which in an app about not losing your work is the most
 *  alarming and least true thing the screen could say. */
export function useSubjectTree() {
  return useQuery({ queryKey: keys.subjects(), queryFn: api.listSubjects });
}

/** Every subject name, for the free-text boxes that offer them as a `<datalist>`.
 *
 *  Reads the subject rows rather than tallying what has been logged: a course you
 *  set up this morning and have not logged into yet is still one you want offered.
 *  Falls back to nothing rather than to a stale list. */
export function useSubjects(): string[] {
  const { data } = useSubjectTree();
  return (data ?? []).map((subject) => subject.name);
}

/** Every folder in the bank, flattened, each carrying the subject it belongs to.
 *  What a folder picker needs: one list, grouped for display by subject name. */
export interface FolderChoice {
  folder: Folder;
  subject: Subject;
}

export function flattenFolders(subjects: Subject[]): FolderChoice[] {
  return subjects.flatMap((subject) =>
    subject.folders.map((folder) => ({ folder, subject })),
  );
}
