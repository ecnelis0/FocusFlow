"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AnalysisPanel } from "@/components/app/analysis";
import { Empty } from "@/components/app/empty";
import { MistakeImages } from "@/components/app/images";
import { Panel, SPINE } from "@/components/app/panel";
import { UrgencyBadge } from "@/components/app/urgency-badge";
import { Unreachable } from "@/components/app/unreachable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";
import { INTERVAL_LABELS } from "@/lib/labels";
import type { DueReview, ReviewAnswerResult, StudentOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ReviewSession() {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  // The verdict stays on screen with the question it belongs to until "Next",
  // even though the queue behind it has already moved on.
  const [verdict, setVerdict] = useState<{ item: DueReview; result: ReviewAnswerResult } | null>(
    null,
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
    queryClient.invalidateQueries({ queryKey: ["mistakes"] });
    queryClient.invalidateQueries({ queryKey: keys.stats() });
  };

  const check = useMutation({
    mutationFn: ({ item, text }: { item: DueReview; text: string }) =>
      api.answerReview(item.review.id, text).then((result) => ({ item, result })),
    onSuccess: ({ item, result }) => {
      setVerdict({ item, result });
      setAnswer("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: due, isPending, isError, error } = useQuery({
    queryKey: keys.due(),
    queryFn: api.dueReviews,
  });

  const complete = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: StudentOutcome }) =>
      api.completeReview(id, outcome),
    onSuccess: (result) => {
      setAnswer("");
      invalidate();
      toast[result.ladder_restarted ? "info" : "success"](
        result.ladder_restarted
          ? "Back to the top — you'll see this again in an hour."
          : "Marked. Next rung is set.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // A failed load must not read as "nothing is due" - that is the one message that
  // would make a student close the app believing they had no reviews.
  if (isError) return <Unreachable error={error as Error} />;

  // While a verdict is showing, the queue has moved on; keep the answered one.
  const current = verdict?.item ?? due?.[0];

  if (verdict) {
    const { mistake, review } = verdict.item;
    const { result } = verdict;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Panel
          spine={result.correct ? "bg-emerald-500" : "bg-destructive"}
          className="px-7 py-7"
          data-testid="verdict"
        >
          <div
            role="status"
            className={cn(
              "rounded-xl px-4 py-3 text-sm",
              result.correct
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <p className="font-medium">
              {result.correct ? "Correct." : "Not this time."}
            </p>
            <p className="mt-1">
              <span className="opacity-80">You put </span>
              <span className="font-mono">{result.your_answer}</span>
              {!result.correct && (
                <>
                  <span className="opacity-80"> · the answer is </span>
                  <span className="font-mono font-medium">{result.correct_answer}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">
              {result.ladder_restarted
                ? "Back to the top of the ladder — you'll see this again in an hour."
                : `${INTERVAL_LABELS[review.interval_label] ?? review.interval_label} rung done. Next rung is set.`}
            </p>
          </div>

          <p className="mt-5 text-base leading-relaxed whitespace-pre-line text-muted-foreground">
            {mistake.question_text}
          </p>

          <div className="mt-5">
            <AnalysisPanel mistake={mistake} />
          </div>

          <div className="mt-6 border-t pt-5">
            <Button onClick={() => setVerdict(null)} autoFocus>
              {due && due.length > 0 ? "Next question" : "Done"}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  if (!current) {
    return (
      <Empty
        title="Nothing is due."
        body="Every question in the bank is waiting on its next rung. Come back when one comes round, or log a new miss."
        action={{ href: "/log", label: "Log a miss" }}
      />
    );
  }

  const { review, mistake } = current;
  const remaining = due.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Progress first: knowing how many are left is what makes a session finishable. */}
      <div className="flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.max(6, 100 / Math.max(remaining, 1))}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {remaining} left
        </span>
      </div>

      <Panel
        spine={mistake.urgency ? SPINE[mistake.urgency] : undefined}
        className="px-7 py-7"
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {mistake.urgency && <UrgencyBadge urgency={mistake.urgency} />}
          {(mistake.subject || mistake.topic) && (
            <span className="text-xs text-muted-foreground">
              {[mistake.subject, mistake.topic].filter(Boolean).join(" · ")}
            </span>
          )}
          <span className="ml-auto rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
            {INTERVAL_LABELS[review.interval_label] ?? review.interval_label} review
          </span>
        </div>

        {/* The question is the content; everything else is chrome around it. */}
        <p className="text-lg leading-relaxed whitespace-pre-line">
          {mistake.question_text}
        </p>

        {mistake.images.length > 0 && (
          <div className="mt-5">
            <MistakeImages mistake={mistake} />
          </div>
        )}

        {mistake.choices && (
          <ol className="mt-5 space-y-2">
            {mistake.choices.map((choice, index) => (
              <li
                key={choice}
                className="flex gap-3 rounded-xl border bg-background/60 px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{choice}</span>
              </li>
            ))}
          </ol>
        )}

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (answer.trim() && !check.isPending) check.mutate({ item: current, text: answer });
          }}
        >
          {mistake.choices ? (
            <div role="radiogroup" aria-label="Your answer" className="grid gap-2 sm:grid-cols-2">
              {mistake.choices.map((choice, index) => {
                const letter = String.fromCharCode(65 + index);
                const on = answer === letter;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={check.isPending}
                    onClick={() => setAnswer(letter)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
                      on ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{letter}</span>
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <Input
              aria-label="Your answer"
              placeholder="Type your answer"
              autoComplete="off"
              value={answer}
              disabled={check.isPending}
              onChange={(event) => setAnswer(event.target.value)}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!answer.trim() || check.isPending}>
              {check.isPending ? "Checking…" : "Check answer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              onClick={() => complete.mutate({ id: review.id, outcome: "skipped" })}
              disabled={complete.isPending || check.isPending}
            >
              Skip
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
