"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { ChatReply, ChatTurn, Mistake } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The assistant, as a conversation.
 *
 *  It used to answer one question and then forget it, which meant every
 *  follow-up had to be a whole question again — "and in Biology?" got you the
 *  entire bank, because nothing knew what "and" referred to. A conversation is
 *  how people actually ask a second question.
 *
 *  What has not changed is where the answers come from: the model reads the
 *  sentence into a filter, the database runs it, and only then does the model
 *  get to speak, about rows that exist. It never answers from a recollection of
 *  the bank — so the rows it used are printed under every answer and each one
 *  is a link you can go and check.
 */

// Phrased as things this bank can actually answer. An example the assistant
// must fail at is worse than no example at all.
const EXAMPLES = [
  "What have I put in from Biology in the past 3 months?",
  "Which concepts have the most questions under them?",
  "Show me everything on cell transport",
];

interface Said extends ChatTurn {
  /** The rows the answer was drawn from. Only ever on an assistant turn. */
  hits?: Mistake[];
  searched?: string;
  error?: string | null;
}

function Hit({ mistake }: { mistake: Mistake }) {
  return (
    <Link
      href={`/bank/${mistake.id}`}
      className="block rounded-lg border bg-card/60 px-2.5 py-1.5 transition-colors hover:bg-muted/60"
    >
      {(mistake.subject || mistake.topic) && (
        <span className="block text-[10px] text-muted-foreground">
          {[mistake.subject, mistake.topic].filter(Boolean).join(" · ")}
        </span>
      )}
      <p className="line-clamp-2 text-xs leading-snug">{mistake.question_text}</p>
    </Link>
  );
}

/** The model writes markdown whether or not anyone asked it to, and `**like
 *  this**` rendered as plain text puts asterisks in the middle of the answer.
 *  Bold is the only marker it reaches for often enough to be worth handling;
 *  everything else reads fine as it is. */
function bolded(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, index) =>
    piece.startsWith("**") && piece.endsWith("**") && piece.length > 4 ? (
      <strong key={index} className="font-semibold">
        {piece.slice(2, -2)}
      </strong>
    ) : (
      piece
    ),
  );
}

function Bubble({ said }: { said: Said }) {
  const mine = said.role === "student";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border bg-card",
        )}
      >
        <p className="whitespace-pre-line">{bolded(said.content)}</p>

        {said.searched && (
          // What it searched for, so a wrong reading of the sentence is visible
          // rather than being mistaken for an empty bank.
          <p className="mt-2 text-[11px] text-muted-foreground">Searched: {said.searched}</p>
        )}
        {said.error && (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{said.error}</p>
        )}
        {said.hits && said.hits.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {said.hits.slice(0, 6).map((mistake) => (
              <Hit key={mistake.id} mistake={mistake} />
            ))}
            {said.hits.length > 6 && (
              <p className="text-[11px] text-muted-foreground">
                and {said.hits.length - 6} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Ask() {
  const [said, setSaid] = useState<Said[]>([]);
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<ChatReply | null>(null);
  const foot = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (messages: ChatTurn[]) => api.chat(messages),
    onSuccess: (answer) => {
      setReply(answer);
      setSaid((current) => [
        ...current,
        {
          role: "assistant",
          content: answer.answer,
          hits: answer.mistakes,
          searched: answer.filter_description,
          error: answer.error,
        },
      ]);
    },
    onError: (error: Error) => {
      setSaid((current) => [
        ...current,
        // The failure goes in the transcript rather than beside it: an error
        // that scrolls away with the question it belongs to is impossible to
        // make sense of three turns later.
        { role: "assistant", content: `That did not go through — ${error.message}` },
      ]);
    },
  });

  // Follow the conversation down as it grows.
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [said.length, ask.isPending]);

  const send = (asked: string) => {
    const trimmed = asked.trim();
    if (!trimmed || ask.isPending) return;
    const next: Said[] = [...said, { role: "student", content: trimmed }];
    setSaid(next);
    setQuestion("");
    // Only the two fields the API takes: the hits are this component's business.
    ask.mutate(next.map(({ role, content }) => ({ role, content })));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-medium">Ask the bank</h2>
        {said.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSaid([]);
              setReply(null);
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Start again
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {/* The offline assistant returning the whole bank looks exactly like a
            working search that matched everything. Say which one answered. */}
        {reply?.analyzer === "stub" && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Offline assistant — it matches your topics and concepts by keyword and reports
            counts, but it cannot reason about your bank. Set{" "}
            <code className="font-mono">AI_PROVIDER=agent</code> in{" "}
            <code className="font-mono">.env</code> for real answers.
          </p>
        )}
        {reply && !reply.analyzer_ready && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {reply.analyzer === "agent"
              ? "The agent provider is selected but the Claude CLI is not signed in. Run `claude auth login` on the machine running the API."
              : `${reply.analyzer} is selected but its API key is missing, so nothing was analysed.`}
          </p>
        )}

        {said.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Ask anything about what you have filed. Follow-ups work — it remembers what
              you were talking about.
            </p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => send(example)}
                className="block w-full rounded-md border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        <div aria-live="polite" className="space-y-3">
          {said.map((turn, index) => (
            <Bubble key={index} said={turn} />
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                Looking through the bank…
              </div>
            </div>
          )}
        </div>
        <div ref={foot} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(question);
        }}
        className="border-t px-4 py-3"
      >
        <Textarea
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(question);
            }
          }}
          placeholder={said.length ? "Ask a follow-up…" : "Ask about your bank…"}
          aria-label="Ask about your bank"
          className="resize-none bg-card/70"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Enter sends · Shift+Enter for a new line
          </span>
          <Button type="submit" size="sm" disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? "Looking…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
