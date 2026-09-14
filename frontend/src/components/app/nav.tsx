"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidePanelToggle } from "@/components/app/side-panel";
import { api, keys } from "@/lib/api";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/log", label: "Log a miss" },
  { href: "/capture", label: "Scan notes" },
  { href: "/bank", label: "The bank" },
  { href: "/concepts", label: "Concepts" },
  { href: "/review", label: "Review" },
];

function DueBadge({ due }: { due: number }) {
  if (due <= 0) return null;
  return (
    <span
      className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground"
      aria-label={`${due} due now`}
    >
      {due}
    </span>
  );
}

/** The app's navigation: a fixed sidebar on the left on wide screens, and a
 *  scrollable top bar on narrow ones. One list of links feeds both. */
export function Nav() {
  const pathname = usePathname();
  const { data: stats } = useQuery({
    queryKey: keys.stats(),
    queryFn: api.stats,
    refetchInterval: 60_000,
  });
  const due = stats?.due_now ?? 0;
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const links = (orientation: "vertical" | "horizontal") =>
    LINKS.map((link) => {
      const active = isActive(link.href);
      return (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md text-sm transition-colors",
            orientation === "vertical" ? "px-3 py-2" : "shrink-0 px-3 py-1.5",
            active
              ? "bg-secondary font-medium text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {link.label}
          {link.href === "/review" && <DueBadge due={due} />}
        </Link>
      );
    });

  return (
    <>
      {/* Wide screens: the sidebar. */}
      <aside
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-background lg:flex"
      >
        <Link href="/" className="px-5 py-5 text-base font-bold tracking-tight">
          Focus<span className="text-muted-foreground">Flow</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">{links("vertical")}</nav>
        <div className="border-t px-3 py-3">
          <SidePanelToggle />
        </div>
      </aside>

      {/* Narrow screens: the top bar. */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur lg:hidden">
        <nav className="flex h-14 items-center gap-1 overflow-x-auto px-4">
          <Link href="/" className="mr-3 shrink-0 font-bold tracking-tight">
            Focus<span className="text-muted-foreground">Flow</span>
          </Link>
          {links("horizontal")}
          <div className="ml-auto shrink-0 pl-2">
            <SidePanelToggle />
          </div>
        </nav>
      </header>
    </>
  );
}
