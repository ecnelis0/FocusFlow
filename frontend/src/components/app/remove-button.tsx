"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** A destructive control that asks once, in place.
 *
 *  Not `window.confirm`: it cannot say what will survive, it cannot be styled to
 *  look like the rest of the product, and on a list of ten folders it gives the
 *  same faceless "Are you sure?" for every one of them. Here the second click
 *  carries the answer — "Remove Unit 3?" — so the thing about to go is named at
 *  the moment of confirming, and the question can also say what stays behind.
 *
 *  It arms and disarms itself: clicking away, pressing Escape, or five seconds
 *  of not answering puts it back. An armed delete left lying under the cursor is
 *  how the next click removes something nobody meant to touch. */
export function RemoveButton({
  name,
  keeps,
  onRemove,
  pending = false,
  className,
}: {
  /** What is being removed, for the accessible name. A list of six of these
   *  would otherwise be six controls all called "Remove". */
  name: string;
  /** What survives it, shown while armed. Say nothing only when nothing does. */
  keeps?: string;
  onRemove: () => void;
  pending?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!armed) return;
    timer.current = window.setTimeout(() => setArmed(false), 5_000);
    return () => window.clearTimeout(timer.current);
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setArmed(true);
        }}
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
          className,
        )}
      >
        ×
      </button>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {keeps && <span className="text-[11px] text-muted-foreground">{keeps}</span>}
      <button
        type="button"
        autoFocus
        aria-label={`Confirm removing ${name}`}
        disabled={pending}
        onBlur={() => setArmed(false)}
        onKeyDown={(event) => event.key === "Escape" && setArmed(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setArmed(false);
          onRemove();
        }}
        className="rounded-md bg-destructive px-2 py-0.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove?"}
      </button>
    </span>
  );
}
