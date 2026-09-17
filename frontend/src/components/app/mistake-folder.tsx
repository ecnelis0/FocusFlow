"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";

import { useSubjectTree } from "@/components/app/use-subjects";
import { api, keys } from "@/lib/api";
import type { Mistake } from "@/lib/types";

/** Where this question is filed: a subject, and a topic folder inside it.
 *
 *  One `<select>`, grouped by subject, for the same reason the capture form uses
 *  one: a folder already carries its subject, so a second control for the subject
 *  is a second thing to disagree with it. The server treats the folder as
 *  authoritative and rewrites the subject to match, which is what the readback
 *  underneath shows — so a wrong pick is visible rather than inferred. */
export function MistakeFolder({ mistake }: { mistake: Mistake }) {
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjectTree();
  const withFolders = (subjects ?? []).filter((subject) => subject.folders.length > 0);

  const save = useMutation({
    mutationFn: (folderId: string | null) =>
      api.updateMistake(mistake.id, { folder_id: folderId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.mistake(mistake.id), updated);
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      // The folder's counts changed, and the bank's strip is drawn from them.
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const current = withFolders
    .flatMap((subject) => subject.folders)
    .find((folder) => folder.id === mistake.folder_id);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">Where it is filed</h2>

      <select
        aria-label="Folder"
        value={mistake.folder_id ?? ""}
        onChange={(event) => save.mutate(event.target.value || null)}
        disabled={save.isPending || withFolders.length === 0}
        className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">No folder</option>
        {withFolders.map((subject) => (
          <optgroup key={subject.id} label={subject.name}>
            {subject.folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <p className="text-xs text-muted-foreground">
        {current ? (
          <>
            Filed in {current.name}
            {mistake.subject ? `, under ${mistake.subject}` : null}.
          </>
        ) : withFolders.length === 0 ? (
          <>
            No folders yet. Make one on <Link href="/bank" className="underline">the bank</Link> —
            a subject, then a topic inside it.
          </>
        ) : mistake.subject ? (
          <>Under {mistake.subject}, but not in a folder yet.</>
        ) : (
          <>Not filed anywhere yet.</>
        )}
      </p>
    </div>
  );
}
