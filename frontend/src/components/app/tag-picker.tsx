"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { RemoveButton } from "@/components/app/remove-button";
import { Input } from "@/components/ui/input";
import { api, keys } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Pick labels you have used before, or invent one.
 *
 *  Free strings rather than a managed vocabulary: the point of a label like "by
 *  mistake" is that you can add it the moment you think of it. Existing ones are
 *  offered so the bank does not fill up with three spellings of the same idea. */
export function TagPicker({
  selected,
  onChange,
  disabled = false,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const { data: known } = useQuery({ queryKey: keys.tags(), queryFn: api.listTags });

  // Deleting a label is bank-wide, which is a different act from taking it off
  // this question — so it lives on the list of labels that already exist rather
  // than on the chips above, where the two would be one click apart and read the
  // same. The questions themselves are untouched either way.
  const forget = useMutation({
    mutationFn: (tag: string) => api.deleteTag(tag),
    onSuccess: (_result, tag) => {
      queryClient.invalidateQueries({ queryKey: keys.tags() });
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: ["mistake"] });
      onChange(selected.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
      toast.success(`Removed "${tag}" from every question carrying it.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chosen = new Set(selected.map((tag) => tag.toLowerCase()));
  const offered = (known ?? []).filter((entry) => !chosen.has(entry.tag.toLowerCase()));

  const add = (tag: string) => {
    const tidy = tag.trim().replace(/\s+/g, " ");
    if (!tidy || chosen.has(tidy.toLowerCase())) return;
    onChange([...selected, tidy]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-xs">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove label ${tag}`}
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((item) => item !== tag))}
                  className="rounded-full px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Input
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            // Enter here means "add this label", not "submit the whole form".
            event.preventDefault();
            add(draft);
          }
        }}
        placeholder="Your own label — type it and press Enter"
        aria-label="Add a label"
      />

      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {offered.slice(0, 10).map((entry) => (
            <span
              key={entry.tag}
              className={cn(
                "group/label inline-flex items-center rounded-full border pr-0.5 text-xs",
                entry.suggested ? "border-dashed text-muted-foreground" : "",
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => add(entry.tag)}
                className="rounded-full py-0.5 pl-2.5 transition-colors hover:text-foreground"
              >
                {entry.tag}
                {entry.count > 0 && (
                  <span className="ml-1 text-muted-foreground">{entry.count}</span>
                )}
              </button>
              <span className="opacity-0 transition-opacity group-hover/label:opacity-100 focus-within:opacity-100">
                <RemoveButton
                  name={`the label ${entry.tag}`}
                  keeps="off every question"
                  pending={forget.isPending}
                  onRemove={() => forget.mutate(entry.tag)}
                />
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
