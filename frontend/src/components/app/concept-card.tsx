import { NoteFigureBlock } from "@/components/app/note-figure";
import type { ConceptCard } from "@/lib/types";

/** A concept in the shape it is revised from.
 *
 *  The body of a concept is a paragraph, which is what you write when you
 *  already understand something and the worst thing to revise from: it hides
 *  where one idea ends, it buries the one line that would have been enough, and
 *  it never says what the question will look like on the paper.
 *
 *  So the card has named parts, and each part earns its place by answering a
 *  different question: what is this (takeaway), what word unlocks it (keyword),
 *  how will I recognise it in an exam (cue), how do I picture it (mental model),
 *  what will they try to catch me with (trap), what will still be in my head
 *  tomorrow (hook).
 *
 *  A part with nothing to say is dropped rather than drawn empty. Three strong
 *  sections read better than seven of which four are padding, and the writer is
 *  told to leave them null for exactly that reason.
 */

/** The writer is asked for the cue "quoted as it would appear", and obliges —
 *  so wrapping it in quotes again gives “"like this"”. Strip whatever it brought
 *  and let the page supply the quotation marks. */
function unquoted(text: string): string {
  return text.replace(/^["“'\s]+|["”'\s]+$/g, "");
}

function Label({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <span className="text-primary" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}

/** Line icons rather than the map's scenes: at 16px a scene is a smudge, and
 *  these sit next to words that are already doing the explaining. */
const ICONS = {
  bulb: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.5a4 4 0 0 0-2.4 7.2v1.8h4.8V8.7A4 4 0 0 0 8 1.5Z" strokeLinejoin="round" />
      <path d="M6.4 12.5h3.2M6.9 14.3h2.2" strokeLinecap="round" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5.5" cy="5.5" r="3.2" />
      <path d="M7.8 7.8 13 13M11 11l1.6-1.6M12.6 12.6 14 11.2" strokeLinecap="round" />
    </svg>
  ),
  cue: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.3" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.4 2.5v1" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r=".7" fill="currentColor" stroke="none" />
    </svg>
  ),
  model: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2.2c2.6 0 4.4 1.6 4.4 3.6 0 1-.5 1.8-1.2 2.4v2.2a1.8 1.8 0 0 1-1.8 1.8H6.6a1.8 1.8 0 0 1-1.8-1.8V8.2C4.1 7.6 3.6 6.8 3.6 5.8 3.6 3.8 5.4 2.2 8 2.2Z" strokeLinejoin="round" />
      <path d="M8 2.4v9.8M5.6 6.2h4.8" strokeLinecap="round" />
    </svg>
  ),
  trap: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 14.2 13H1.8L8 2Z" strokeLinejoin="round" />
      <path d="M8 6.4v3.2" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r=".7" fill="currentColor" stroke="none" />
    </svg>
  ),
  hook: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m8 1.8 1.5 3.6 3.9.3-3 2.6.9 3.8L8 10.1 4.7 12.1l.9-3.8-3-2.6 3.9-.3L8 1.8Z" strokeLinejoin="round" />
    </svg>
  ),
};

export function ConceptCardView({ card }: { card: ConceptCard }) {
  return (
    <div className="space-y-4">
      {/* The one line, given the weight that claim deserves rather than set as
          another paragraph among the rest. */}
      <div className="rounded-xl border bg-muted/30 px-4 py-3.5">
        <Label icon={ICONS.bulb}>One-line takeaway</Label>
        <p className="mt-1.5 text-[1.05rem] leading-snug font-semibold">{card.takeaway}</p>
      </div>

      {(card.keyword || card.exam_cue) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {card.keyword && (
            <div className="rounded-xl border bg-muted/30 px-4 py-3.5">
              <Label icon={ICONS.key}>Keyword</Label>
              <p className="mt-1.5 text-[1.05rem] font-semibold">{card.keyword}</p>
            </div>
          )}
          {card.exam_cue && (
            <div className="rounded-xl border bg-muted/30 px-4 py-3.5">
              <Label icon={ICONS.cue}>Exam cue</Label>
              {/* Quoted, because it is the wording of a question rather than a
                  claim this app is making. */}
              <p className="mt-1.5 text-[1.05rem] leading-snug">“{unquoted(card.exam_cue)}”</p>
            </div>
          )}
        </div>
      )}

      {(card.mental_model || card.figure || card.trap || card.hook) && (
        <div className="space-y-4 border-t pt-4">
          {card.mental_model && (
            <div>
              <Label icon={ICONS.model}>Mental model</Label>
              <p className="mt-1.5 text-sm leading-relaxed">{card.mental_model}</p>
            </div>
          )}

          {card.figure && (
            // The same figure vocabulary the notes draw from, so a 2×2 of
            // outcomes looks the same wherever it turns up.
            <NoteFigureBlock figure={card.figure} />
          )}

          {card.trap && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <Label icon={ICONS.trap}>What it catches you with</Label>
              <p className="mt-1.5 text-sm leading-relaxed">{card.trap}</p>
            </div>
          )}

          {card.hook && (
            <div>
              <Label icon={ICONS.hook}>Memory hook</Label>
              <p className="mt-1.5 text-sm leading-relaxed italic">“{unquoted(card.hook)}”</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
