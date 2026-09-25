import Link from "next/link";

import { Cat } from "@/components/app/cat";
import { cn } from "@/lib/utils";

import { Button, buttonVariants } from "@/components/ui/button";

export function Empty({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  /** An empty state that acts on the page it is on, rather than linking away. */
  onAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      {/* An empty screen is the one place in the app with nothing of the
          student's on it, so it is where a drawing costs nothing and reads as
          company rather than decoration. Seeded by the title: the same empty
          state keeps the same cat, which is what makes it feel like a place
          rather than a slot machine. */}
      <Cat seed={title} width={92} className="mx-auto mb-3" />
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && (
        <Link href={action.href} className={cn(buttonVariants(), "mt-5")}>
          {action.label}
        </Link>
      )}
      {onAction && (
        <Button className="mt-5" onClick={onAction.onClick}>
          {onAction.label}
        </Button>
      )}
    </div>
  );
}
