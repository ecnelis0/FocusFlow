import type { ReactNode } from "react";

/** Every page opens the same way: a bold title, one line saying what the
 *  page is for, and any actions pushed to the right. Consistency here is most of
 *  what makes a set of screens feel like one product. */
export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-[2.1rem] leading-[1.08] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {lede && <p className="max-w-2xl text-sm text-muted-foreground">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
