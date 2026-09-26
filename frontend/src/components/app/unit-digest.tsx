"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, keys } from "@/lib/api";
import type { Folder } from "@/lib/types";

/** A unit as a working set: its brief, and what its sources add up to.
 *
 *  A folder used to be a place to put things. It is now the thing several
 *  sources are read *as*: the brief applies to everything filed here, and the
 *  synthesis is the one piece of knowledge that does not exist inside any single
 *  source — where they agree, what each adds alone, where they disagree, and
 *  what none of them covers.
 *
 *  Written once and kept, like the notes and the concept cards. A synthesis that
 *  comes back different every time you look is one you cannot revise from.
 */
export function UnitDigest({ folder }: { folder: Folder }) {
  const queryClient = useQueryClient();
  const [editingBrief, setEditingBrief] = useState(false);
  const [brief, setBrief] = useState(folder.instructions ?? "");

  const settle = () => {
    queryClient.invalidateQueries({ queryKey: keys.subjects() });
  };

  const saveBrief = useMutation({
    mutationFn: () => api.updateFolder(folder.id, { instructions: brief }),
    onSuccess: () => {
      settle();
      setEditingBrief(false);
      toast.success("Brief saved. It applies to everything filed here.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const write = useMutation({
    mutationFn: (force: boolean) => api.writeFolderDigest(folder.id, force),
    onSuccess: () => {
      settle();
      toast.success("Read them together.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const digest = folder.digest;

  return (
    <div className="space-y-4">
      {/* The brief. Shown even when empty, because a unit that reads its own way
          is the point of a unit and nobody discovers a setting they cannot see. */}
      <div className="rounded-xl border bg-card px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">How everything here is read</h3>
          {!editingBrief && (
            <button
              type="button"
              onClick={() => {
                setBrief(folder.instructions ?? "");
                setEditingBrief(true);
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {folder.instructions ? "Change it" : "Set a brief"}
            </button>
          )}
        </div>

        {editingBrief ? (
          <div className="mt-2 space-y-2">
            <Textarea
              rows={3}
              autoFocus
              aria-label={`Brief for ${folder.name}`}
              className="bg-background/60"
              placeholder="e.g. These are lecture notes for a DBQ unit. Keep the causal chain, name every date, skip the anecdotes."
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => saveBrief.mutate()} disabled={saveBrief.isPending}>
                {saveBrief.isPending ? "Saving…" : "Save the brief"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingBrief(false)}
                disabled={saveBrief.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : folder.instructions ? (
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">
            {folder.instructions}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Nothing set. Anything filed here is read the app&rsquo;s usual way.
          </p>
        )}
      </div>

      {/* The synthesis. */}
      <div className="rounded-xl border bg-card px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">What these sources add up to</h3>
          {digest && (
            <button
              type="button"
              onClick={() => write.mutate(true)}
              disabled={write.isPending}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              {write.isPending ? "Reading them…" : "Read them again"}
            </button>
          )}
        </div>

        {!digest ? (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">
              Read every source in this unit together: what they agree on, what each one
              adds that the others do not, where they disagree, and what none of them
              covers. Needs at least two sources.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => write.mutate(false)}
              disabled={write.isPending}
            >
              {write.isPending ? "Reading them…" : "Read the sources together"}
            </Button>
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            <p className="text-sm leading-relaxed">{digest.overview}</p>

            {digest.agreements.length > 0 && (
              <div>
                <h4 className="text-[11px] font-medium tracking-[0.09em] text-primary uppercase">
                  They agree on
                </h4>
                <ul className="mt-1.5 space-y-2">
                  {digest.agreements.map((agreement, index) => (
                    <li key={index} className="border-l-2 border-primary/30 pl-3">
                      <p className="text-sm leading-snug">{agreement.claim}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {agreement.sources.join(" · ")}
                        {agreement.note ? ` — ${agreement.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {digest.contributions.length > 0 && (
              <div>
                <h4 className="text-[11px] font-medium tracking-[0.09em] text-primary uppercase">
                  Only in one of them
                </h4>
                <ul className="mt-1.5 space-y-2">
                  {digest.contributions.map((contribution, index) => (
                    <li key={index} className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-xs font-medium">{contribution.source}</p>
                      <p className="mt-0.5 text-sm leading-snug">{contribution.adds}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {digest.conflicts.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <h4 className="text-[11px] font-medium tracking-[0.09em] text-destructive uppercase">
                  They disagree
                </h4>
                <ul className="mt-1.5 space-y-1.5">
                  {digest.conflicts.map((conflict, index) => (
                    <li key={index} className="text-sm leading-snug">
                      {conflict}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {digest.gaps.length > 0 && (
              <div>
                <h4 className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
                  No source here covers
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {digest.gaps.map((gap, index) => (
                    <li key={index} className="text-sm leading-snug text-muted-foreground">
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
