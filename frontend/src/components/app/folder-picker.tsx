"use client";

import { useSubjectTree } from "@/components/app/use-subjects";
import { Label } from "@/components/ui/label";

/** Choose which topic folder a capture is filed into, before it is read.
 *
 *  One `<select>` rather than a subject box and a folder box: a folder already
 *  carries its subject, and two controls where the second depends on the first is
 *  a state machine to get wrong for no gain. Options are grouped by subject, so
 *  the hierarchy is visible without being something to operate.
 *
 *  The folder is also the strongest possible steer for the reading — its subject
 *  is a course the student actually set up, not a word they typed once. */
export function FolderPicker({
  value,
  onChange,
  id = "folder-picker",
  label = "File it into",
  description = "Optional. Everything this finds goes in the folder you pick, and takes its subject.",
}: {
  value: string | null;
  onChange: (folderId: string | null) => void;
  id?: string;
  label?: string;
  description?: string;
}) {
  const { data: subjects, isPending } = useSubjectTree();
  const withFolders = (subjects ?? []).filter((subject) => subject.folders.length > 0);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {withFolders.length === 0 && !isPending ? (
          <>
            No folders yet. Make one on <b>The bank</b> — a subject, then a topic
            inside it — and it will be offered here.
          </>
        ) : (
          description
        )}
      </p>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={withFolders.length === 0}
        className="mt-1.5 h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
