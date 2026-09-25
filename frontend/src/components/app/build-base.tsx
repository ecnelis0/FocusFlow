import Link from "next/link";

import { CatScene, type SceneKind } from "@/components/app/cat-scenes";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The three doors into the bank, and the one button that opens all of them.
 *
 *  Every route here goes to Study, because Study is the only surface that reads
 *  material — the three are not three features, they are three answers to "what
 *  have you got?". Links rather than buttons: they navigate, and a control that
 *  navigates announced as a button tells a screen reader the wrong thing about
 *  what is going to happen.
 */
const WAYS: ReadonlyArray<{ kind: SceneKind; label: string }> = [
  { kind: "pdf", label: "Add a PDF" },
  { kind: "video", label: "Paste a YouTube link" },
  { kind: "notes", label: "Write your notes" },
];

export function BuildBase() {
  return (
    <section className="space-y-3">
      <h2 className="text-[1.05rem] font-medium tracking-[0.14em] text-primary uppercase">
        Let&rsquo;s build your knowledge base
      </h2>

      <div className="rounded-2xl border bg-card px-4 py-7 sm:px-8">
        <ul className="grid gap-6 sm:grid-cols-3">
          {WAYS.map((way) => (
            <li key={way.kind}>
              <Link
                href="/"
                className="group flex flex-col items-center gap-4 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CatScene
                  kind={way.kind}
                  className="w-full max-w-[11rem] transition-transform duration-200 group-hover:-translate-y-1.5"
                />
                <span className="text-center text-sm font-medium tracking-[0.08em] uppercase transition-colors group-hover:text-primary">
                  {way.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-7 flex justify-center">
          <Link
            href="/"
            className={cn(
              buttonVariants({ size: "lg" }),
              "gap-2 px-7 text-sm font-medium tracking-[0.06em] uppercase",
            )}
          >
            <span aria-hidden className="text-base leading-none">
              +
            </span>
            Add material
          </Link>
        </div>
      </div>
    </section>
  );
}
