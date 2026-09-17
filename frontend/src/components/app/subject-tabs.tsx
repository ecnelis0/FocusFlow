"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, keys } from "@/lib/api";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The bank's courses, as tabs: All, then APUSH, SAT, Calculus…
 *
 *  Subjects are rows, not the distinct strings found by grouping what has been
 *  logged, so a course you set up before logging anything into it still gets a
 *  tab. That is the whole point of setting one up. */
export function SubjectTabs({
  subjects,
  selected,
  onSelect,
  total,
}: {
  subjects: Subject[];
  /** The selected subject's name, or null for "All". */
  selected: string | null;
  onSelect: (name: string | null) => void;
  total: number;
}) {
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (value: string) => api.createSubject(value),
    onSuccess: (subject) => {
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      setNaming(false);
      setName("");
      onSelect(subject.name);
      toast.success(`Added ${subject.name}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const tidy = name.trim();
    if (tidy) create.mutate(tidy);
  };

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Subjects"
        className="flex flex-wrap items-center gap-1.5"
      >
        <Tab
          label="All"
          count={total}
          active={selected === null}
          onClick={() => onSelect(null)}
        />
        {subjects.map((subject) => (
          <Tab
            key={subject.id}
            label={subject.name}
            count={subject.question_count}
            active={selected === subject.name}
            onClick={() => onSelect(subject.name)}
          />
        ))}

        {naming ? (
          <form onSubmit={submit} className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setNaming(false)}
              placeholder="APUSH"
              aria-label="New subject"
              className="h-8 w-36 text-sm"
            />
            <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setNaming(false)}
            >
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
            + Subject
          </Button>
        )}
      </div>
    </div>
  );
}

function Tab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground/15 bg-secondary font-medium text-secondary-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}
