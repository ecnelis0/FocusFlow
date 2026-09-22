"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Empty } from "@/components/app/empty";
import { NoteFigureBlock } from "@/components/app/note-figure";
import { Unreachable } from "@/components/app/unreachable";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";
import type { NoteSection } from "@/lib/types";

/** A page of revision notes written from one material.
 *
 *  Laid out as a page rather than as cards: this is the thing you read straight
 *  through the night before, so it gets a measure you can actually read at, a
 *  display serif for the title, and nothing in the margins competing with it.
 *
 *  Notes are written once and kept. Rewriting is a deliberate act with its own
 *  button, because the same material handing back a different page each time is
 *  one you cannot come back to and trust. */

function Section({ section, index }: { section: NoteSection; index: number }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2.5 text-lg font-semibold tracking-[-0.01em]">
        <span className="text-sm font-medium text-primary tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        {section.heading}
      </h2>

      {/* Marked list rather than paragraphs: every line here is meant to be one
          thing worth remembering, and prose hides where one ends. */}
      <ul className="space-y-1.5 border-l-2 border-primary/25 pl-4">
        {section.points.map((point, at) => (
          <li key={at} className="text-[0.95rem] leading-relaxed">
            {point}
          </li>
        ))}
      </ul>

      {section.figure && <NoteFigureBlock figure={section.figure} />}
    </section>
  );
}

export default function MaterialNotesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const material = useQuery({
    queryKey: keys.material(id),
    queryFn: () => api.getMaterial(id),
  });
  const notes = useQuery({
    queryKey: keys.notes(id),
    queryFn: () => api.getNotes(id),
  });

  const write = useMutation({
    mutationFn: (force: boolean) => api.writeNotes(id, force),
    onSuccess: (document) => {
      queryClient.setQueryData(keys.notes(id), document);
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success("Written up.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (notes.isPending || material.isPending) return <Skeleton className="h-96 w-full" />;
  // A failed load is never an empty page: "no notes yet" and "the API is down"
  // look identical otherwise, and only one of them is worth pressing a button at.
  if (notes.isError) return <Unreachable error={notes.error as Error} />;
  if (material.isError) return <Unreachable error={material.error as Error} />;

  const backToFolder = material.data.folder_id
    ? `/bank?subject=${encodeURIComponent(material.data.subject ?? "")}&folder=${material.data.folder_id}`
    : "/bank";

  if (!notes.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href={backToFolder} className="text-sm text-muted-foreground hover:text-foreground">
          ← {material.data.title}
        </Link>
        <Empty
          title="No notes written from this yet."
          body="A revision page: the headings, the handful of lines under each that are actually worth remembering, and a diagram or a timeline where one says it faster."
        />
        <div className="flex justify-center">
          <Button onClick={() => write.mutate(false)} disabled={write.isPending}>
            {write.isPending ? "Writing them…" : "Write the notes"}
          </Button>
        </div>
      </div>
    );
  }

  const document = notes.data;

  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backToFolder} className="text-sm text-muted-foreground hover:text-foreground">
          ← {material.data.title}
        </Link>
        <Link
          href={`/map?subject=${encodeURIComponent(material.data.subject ?? "")}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          See the map
        </Link>
      </div>

      <header className="space-y-3 border-b pb-6">
        <h1 className="font-display text-[2.1rem] leading-[1.08] font-bold tracking-[-0.02em]">
          {document.title}
        </h1>
        {/* The one sentence to have read if you read nothing else. Given the
            weight that claim deserves rather than set as another paragraph. */}
        <p className="border-l-2 border-primary pl-4 text-[1.05rem] leading-relaxed text-muted-foreground">
          {document.in_a_sentence}
        </p>
      </header>

      <div className="space-y-8">
        {document.sections.map((section, index) => (
          <Section key={`${section.heading}-${index}`} section={section} index={index} />
        ))}
      </div>

      {document.traps.length > 0 && (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <h2 className="mb-2 text-[11px] font-medium tracking-[0.09em] text-destructive uppercase">
            Easy to mix up
          </h2>
          <ul className="space-y-1.5">
            {document.traps.map((trap, index) => (
              <li key={index} className="text-[0.95rem] leading-relaxed">
                {trap}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => write.mutate(true)}
          disabled={write.isPending}
        >
          {write.isPending ? "Writing them again…" : "Write them again"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Rewriting replaces this page. It will not come back the same.
        </span>
      </footer>
    </article>
  );
}
