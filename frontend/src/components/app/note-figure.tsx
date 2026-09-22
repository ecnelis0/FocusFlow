import type { NoteFigure } from "@/lib/types";

/** The four shapes a note can draw, in CSS rather than SVG.
 *
 *  CSS because these figures are made of text — dates, part names, one-line
 *  captions — and text in SVG does not wrap, does not reflow, and cannot be
 *  selected or read aloud properly. A `viewBox` that fits on a laptop clips on a
 *  phone, and the model cannot be asked to guess how long a label will be. The
 *  rules and dots that make them read as diagrams are borders and pseudo-
 *  elements, which cost nothing and adapt.
 *
 *  Each shape refuses to draw when it has too little to be a figure: a timeline
 *  with one entry, or a comparison with one column, is a sentence pretending to
 *  be a picture, and printing the frame around it only draws attention to that.
 */

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="my-4 rounded-xl border bg-muted/25 px-5 py-4">
      <figcaption className="mb-3 text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
        {title}
      </figcaption>
      {children}
    </figure>
  );
}

/** Things that happened in order: a rule down the left, a marker per entry. */
function Timeline({ figure }: { figure: NoteFigure }) {
  return (
    <Frame title={figure.title}>
      <ol className="relative ml-2 space-y-4 border-l pl-6">
        {figure.steps.map((step, index) => (
          <li key={`${step.label}-${index}`} className="relative">
            {/* The dot sits on the rule, centred on the label's first line. */}
            <span
              aria-hidden
              className="absolute top-[0.45rem] -left-[1.72rem] size-2.5 rounded-full border-2 border-background bg-primary"
            />
            <span className="block text-xs font-medium tracking-[0.05em] text-primary uppercase tabular-nums">
              {step.label}
            </span>
            <span className="mt-0.5 block text-sm leading-snug">{step.text}</span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** Steps carried out in order: numbered, with an arrow between them. */
function Process({ figure }: { figure: NoteFigure }) {
  return (
    <Frame title={figure.title}>
      <ol className="space-y-1">
        {figure.steps.map((step, index) => (
          <li key={`${step.label}-${index}`}>
            <div className="flex items-start gap-3 rounded-lg bg-background px-3 py-2">
              <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug">{step.label}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                  {step.text}
                </span>
              </span>
            </div>
            {index < figure.steps.length - 1 && (
              <div aria-hidden className="py-0.5 pl-[1.4rem] text-sm text-muted-foreground">
                ↓
              </div>
            )}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** One thing pulled apart: the subject, then its labelled pieces. */
function Parts({ figure }: { figure: NoteFigure }) {
  return (
    <Frame title={figure.title}>
      {figure.centre && (
        <p className="mb-3 rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground">
          {figure.centre}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {figure.parts.map((part, index) => (
          <li
            key={`${part.name}-${index}`}
            className="rounded-lg border-l-2 border-primary/50 bg-background px-3 py-2"
          >
            <span className="block text-sm font-medium leading-snug">{part.name}</span>
            <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
              {part.text}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Two or three things set against each other on the same criteria. */
function Compare({ figure }: { figure: NoteFigure }) {
  return (
    <Frame title={figure.title}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b px-2 py-1.5 text-left text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                <span className="sr-only">What is being compared</span>
              </th>
              {figure.columns.map((column) => (
                <th
                  key={column}
                  className="border-b px-2 py-1.5 text-left text-sm font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {figure.rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <th
                  scope="row"
                  className="border-b px-2 py-1.5 text-left align-top text-sm font-medium text-muted-foreground"
                >
                  {row.label}
                </th>
                {figure.columns.map((column, cell) => (
                  <td key={column} className="border-b px-2 py-1.5 align-top leading-snug">
                    {row.cells[cell] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

/** Draws a figure, or nothing when there is not enough of one to draw.
 *
 *  The model is asked for figures only where they help, and mostly obliges — but
 *  a one-entry timeline or a single-column comparison is a sentence in a frame,
 *  and the frame is what makes it look like a mistake. Better to drop it: the
 *  points beside it already say the same thing. */
export function NoteFigureBlock({ figure }: { figure: NoteFigure }) {
  switch (figure.kind) {
    case "timeline":
      return figure.steps.length >= 2 ? <Timeline figure={figure} /> : null;
    case "process":
      return figure.steps.length >= 2 ? <Process figure={figure} /> : null;
    case "parts":
      return figure.parts.length >= 2 ? <Parts figure={figure} /> : null;
    case "compare":
      return figure.columns.length >= 2 && figure.rows.length >= 1 ? (
        <Compare figure={figure} />
      ) : null;
    default:
      // A kind the backend knows and this file does not. Drawing nothing is the
      // honest answer; the section's points stand on their own.
      return null;
  }
}
