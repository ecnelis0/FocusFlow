"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/app/panel";
import { RemoveButton } from "@/components/app/remove-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, keys } from "@/lib/api";
import type { Folder, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The topic folders inside one subject, plus the card for what is not in one yet.
 *
 *  A folder holds both halves of the bank — the concepts filed under the topic and
 *  the questions logged against it — so the counts are shown side by side rather
 *  than as one number that could mean either. */
export function FolderGrid({
  subject,
  selected,
  unfiledSelected,
  onSelect,
  onSelectUnfiled,
}: {
  subject: Subject;
  /** The open folder's id, or null when the whole subject is shown. */
  selected: string | null;
  /** True when the "Not in a folder" card is the current filter. */
  unfiledSelected: boolean;
  onSelect: (folderId: string | null) => void;
  onSelectUnfiled: () => void;
}) {
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (value: string) => api.createFolder(subject.id, value),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      setNaming(false);
      setName("");
      const added = updated.folders.find(
        (folder) => folder.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (added) onSelect(added.id);
      toast.success(`Added ${name.trim()}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (folder: Folder) => api.deleteFolder(folder.id),
    onSuccess: (_result, folder) => {
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: keys.concepts() });
      if (selected === folder.id) onSelect(null);
      toast.success(`Removed ${folder.name}. What was in it is still in ${subject.name}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const tidy = name.trim();
    if (tidy) create.mutate(tidy);
  };

  const unfiled = subject.unfiled_question_count + subject.unfiled_concept_count;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {subject.folders.map((folder) => (
          <FolderCard
            key={folder.id}
            name={folder.name}
            questions={folder.question_count}
            concepts={folder.concept_count}
            href={`/folders/${folder.id}`}
            active={selected === folder.id}
            onOpen={() => onSelect(selected === folder.id ? null : folder.id)}
            onRemove={() => remove.mutate(folder)}
          />
        ))}

        {/* Only when there is something loose to see. An "Unfiled (0)" card on a
            tidy subject is a permanent reminder of a job already done. */}
        {unfiled > 0 && (
          <FolderCard
            name="Not in a folder"
            questions={subject.unfiled_question_count}
            concepts={subject.unfiled_concept_count}
            active={unfiledSelected}
            muted
            onOpen={onSelectUnfiled}
          />
        )}
      </div>

      {naming ? (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setNaming(false)}
            placeholder="Unit 3: Revolution"
            aria-label="New folder"
            className="h-8 w-56 text-sm"
          />
          <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
            Add folder
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNaming(true)}
          className="text-muted-foreground"
        >
          + Folder in {subject.name}
        </Button>
      )}
    </div>
  );
}

function FolderCard({
  name,
  questions,
  concepts,
  active,
  muted = false,
  href,
  onOpen,
  onRemove,
}: {
  name: string;
  questions: number;
  concepts: number;
  active: boolean;
  muted?: boolean;
  /** The folder's own page, when it has one. "Not in a folder" does not. */
  href?: string;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  return (
    <Panel
      interactive
      className={cn("group", active && "border-foreground/25 bg-secondary/40")}
    >
      <div className="flex items-start gap-2 p-3.5">
        {/* An explicit name. Left to the DOM, this button is called "Unit 3 4
            questions · 2 concepts" — the counts read as part of the control, and
            it is a substring match away from the Remove button beside it. */}
        <button
          type="button"
          aria-pressed={active}
          aria-label={`Open ${name}`}
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={cn(
              "block truncate text-sm font-medium",
              muted && "text-muted-foreground",
            )}
          >
            {name}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
            {questions} question{questions === 1 ? "" : "s"} · {concepts} concept
            {concepts === 1 ? "" : "s"}
          </span>
        </button>

        {/* A link, not a button: it navigates, and `role="button"` would tell a
            screen reader the wrong thing about what is going to happen. Named for
            the folder, because "View" six times over is six identical names. */}
        {href && (
          <Link
            href={href}
            aria-label={`View everything in ${name}`}
            title={`View everything in ${name}`}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            View
          </Link>
        )}

        {onRemove && (
          <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <RemoveButton
              name={name}
              keeps="its questions stay"
              onRemove={onRemove}
            />
          </span>
        )}
      </div>
    </Panel>
  );
}
