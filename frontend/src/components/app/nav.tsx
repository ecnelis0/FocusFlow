"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Cat } from "@/components/app/cat";
import { SidePanelToggle } from "@/components/app/side-panel";
import { cn } from "@/lib/utils";

/** Study is first because it is the front door: material goes in there, and
 *  everything the other three screens show is what came out of it. */
const LINKS = [
  { href: "/", label: "Study" },
  { href: "/bank", label: "The bank" },
  { href: "/concepts", label: "Concepts" },
  { href: "/map", label: "The map" },
];

/** The app's navigation: a fixed sidebar on the left on wide screens, and a
 *  scrollable top bar on narrow ones. One list of links feeds both. */
export function Nav() {
  const pathname = usePathname();
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
        </Link>
      );
    });

  return (
    <>
      {/* Wide screens: the sidebar. */}
      <aside
        aria-label="Main"
        className="surface fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r lg:flex"
      >
        <Link href="/" className="px-5 py-5 text-base font-bold tracking-tight">
          Focus<span className="text-muted-foreground">Flow</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">{links("vertical")}</nav>
        {/* The house cat, asleep at the bottom of the sidebar where there is
            nothing else to put. Fixed pose: this one is furniture, and
            furniture that moves is unsettling. */}
        <Cat pose="curl" coat="ginger" width={78} className="mx-auto mb-1 opacity-80" />
        <div className="border-t px-3 py-3">
          <SidePanelToggle />
        </div>
      </aside>

      {/* Narrow screens: the top bar. */}
      <header className="surface sticky top-0 z-30 border-b lg:hidden">
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
