"use client";

import Link from "next/link";

import { Panel } from "@/components/app/panel";
import type { Mistake } from "@/lib/types";

/** One question in a list: what it asks, what it is filed under, its answer.
 *
 *  The answer is on the card rather than behind a reveal. It used to be hidden
 *  because these were questions you were about to be tested on; nothing tests
 *  you now, so hiding it only costs a click on the way to reading it. */
export function MistakeCard({ mistake }: { mistake: Mistake }) {
  // Subject · topic, skipping whichever is missing. Either can be.
  const meta = [mistake.subject, mistake.topic].filter(Boolean).join(" · ");

  return (
    <Panel interactive className="px-5 py-4">
      <Link href={`/bank/${mistake.id}`} className="block space-y-2.5">
        {/* One line of metadata, quiet, so the question itself is what you read. */}
        <div className="flex flex-wrap items-center gap-2">
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          {mistake.concepts.map((concept) => (
            <span
              key={concept.id}
              className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground"
            >
              {concept.title}
            </span>
          ))}
        </div>

        <p className="line-clamp-2 leading-snug">{mistake.question_text}</p>

        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Answer</span>{" "}
          <span className="font-mono">{mistake.correct_answer}</span>
        </p>
      </Link>
    </Panel>
  );
}
