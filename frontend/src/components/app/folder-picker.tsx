"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useSubjectTree } from "@/components/app/use-subjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, keys } from "@/lib/api";

/** Choose which topic folder a capture is filed into, before it is read.
 *
 *  One `<select>` rather than a subject box and a folder box: a folder already
 *  carries its subject, and two controls where the second depends on the first is
 *  a state machine to get wrong for no gain. Options are grouped by subject, so
 *  the hierarchy is visible without being something to operate.
 *
 *  The folder is also the strongest possible steer for the reading — its subject
 *  is a course the student actually set up, not a word they typed once.
 *
 *  Making one is offered here too. Filing is the last thing you do before handing
 *  over a video, and discovering at that moment that the folder does not exist yet
 *  used to mean leaving the page, losing what you had typed, and coming back. */
export function FolderPicker({
  value,
  onChange,
  id = "folder-picker",
  label = "File it into",
  description = "Everything this finds goes in the folder you pick, and takes its subject.",
}: {
  value: string | null;
  onChange: (folderId: string | null) => void;
  id?: string;
  label?: string;
  description?: string;
}) {
  const queryClient = useQueryClient();
  const { data: subjects, isPending } = useSubjectTree();
  const [making, setMaking] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [folderName, setFolderName] = useState("");
  // The unit's standing brief, set as it is made. A folder is a working set —
  // several sources read the same way — and the moment you name "Unit 3" is the
  // moment you know what kind of material is going into it.
  const [brief, setBrief] = useState("");

  const all = subjects ?? [];
  const withFolders = all.filter((subject) => subject.folders.length > 0);

  const create = useMutation({
    mutationFn: async ({
      subject,
      folder,
      instructions,
    }: {
      subject: string;
      folder: string;
      instructions: string;
    }) => {
      // A folder needs a subject to live in, and naming one that does not exist yet
      // is the common case on a first capture — so make it rather than refusing.
      const existing = all.find(
        (candidate) => candidate.name.toLowerCase() === subject.toLowerCase(),
      );
      const owner = existing ?? (await api.createSubject(subject));
      const updated = await api.createFolder(owner.id, folder, instructions);
      const added = updated.folders.find(
        (candidate) => candidate.name.toLowerCase() === folder.toLowerCase(),
      );
      if (!added) throw new Error(`${folder} was created but did not come back.`);
      return { folder: added, subject: updated };
    },
    onSuccess: ({ folder, subject }) => {
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      onChange(folder.id);
      setMaking(false);
      setSubjectName("");
      setFolderName("");
      toast.success(`Filing into ${folder.name}, in ${subject.name}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: React.SyntheticEvent) => {
    event.preventDefault();
    const subject = subjectName.trim();
    const folder = folderName.trim();
    if (subject && folder) create.mutate({ subject, folder, instructions: brief });
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {withFolders.length === 0 && !isPending
          ? "No folders yet. Make the first one here — a subject, and a topic inside it."
          : description}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          id={id}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={withFolders.length === 0}
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
        {!making && (
          <Button type="button" variant="outline" size="sm" onClick={() => setMaking(true)}>
            New folder
          </Button>
        )}
      </div>

      {making && (
        // Not a <form>: this sits inside the capture form, and a nested one is
        // invalid HTML whose submit button would send the outer one instead.
        <div className="mt-3 space-y-3 rounded-lg border border-dashed px-4 py-3">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor={`${id}-subject`}>Subject for the folder</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                An existing one, or a new course.
              </p>
              <Input
                id={`${id}-subject`}
                autoFocus
                className="mt-1 w-56"
                list={`${id}-subjects`}
                placeholder="APUSH"
                value={subjectName}
                disabled={create.isPending}
                onChange={(event) => setSubjectName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submit(event)}
              />
              <datalist id={`${id}-subjects`}>
                {all.map((subject) => (
                  <option key={subject.id} value={subject.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor={`${id}-folder`}>Folder name</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">The topic inside it.</p>
              <Input
                id={`${id}-folder`}
                className="mt-1 w-56"
                placeholder="Unit 3: Revolution"
                value={folderName}
                disabled={create.isPending}
                onChange={(event) => setFolderName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submit(event)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`${id}-brief`}>How to read everything in this folder</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Optional, and kept. Every source you file here is read this way — a video, a
              PDF and your notes all get the same brief.
            </p>
            <Textarea
              id={`${id}-brief`}
              rows={2}
              className="mt-1 bg-card/70"
              placeholder="e.g. These are lecture notes for a DBQ unit. Keep the causal chain, name every date, and skip the anecdotes."
              value={brief}
              disabled={create.isPending}
              onChange={(event) => setBrief(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!subjectName.trim() || !folderName.trim() || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Making it…" : "Create folder"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => setMaking(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
