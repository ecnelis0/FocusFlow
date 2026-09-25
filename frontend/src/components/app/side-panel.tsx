"use client";

import { createContext, useContext, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SidePanelContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidePanelContext value={{ open, setOpen }}>{children}</SidePanelContext>
  );
}

export function useSidePanel() {
  const context = useContext(SidePanelContext);
  if (!context) throw new Error("useSidePanel must be used inside SidePanelProvider");
  return context;
}

export function SidePanelToggle() {
  const { open, setOpen } = useSidePanel();

  return (
    <Button
      size="sm"
      variant={open ? "secondary" : "ghost"}
      aria-expanded={open}
      aria-controls="side-panel"
      onClick={() => setOpen(!open)}
    >
      {open ? "Close" : "Ask the bank"}
    </Button>
  );
}

/** Makes room for the rail on a wide screen instead of covering the page with it. */
export function MainArea({ children }: { children: React.ReactNode }) {
  const { open } = useSidePanel();

  return (
    <main
      className={cn(
        // The scroll: a sheet of silk laid over the painting, which is how a
        // hanging scroll is mounted and, more to the point, the only way text
        // is guaranteed to be readable wherever it lands. The landscape puts
        // its deep greens in the margins and along the floor — outside this
        // sheet on a wide screen — and what shows through the sheet itself is
        // the pale middle of the picture, blurred the way silk blurs what is
        // behind it.
        "mx-auto my-6 max-w-5xl rounded-2xl bg-background/74 px-5 py-8 ring-1 ring-foreground/5",
        "shadow-[0_2px_40px_rgba(28,46,36,0.08)] backdrop-blur-[3px] sm:px-8",
        "transition-[margin] duration-200",
        open && "lg:mr-[26rem]",
      )}
    >
      {children}
    </main>
  );
}

/** The rail itself.
 *
 *  Fixed-position and always mounted when open, with no clip-path and no transform
 *  on a clipped child - the two ways a panel in this codebase has previously been
 *  laid out, opaque, and still invisible. */
export function SidePanel({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useSidePanel();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[1px] lg:hidden"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        id="side-panel"
        aria-label="Ask the bank"
        className={cn(
          "surface fixed top-14 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l",
          // Not `overflow-y-auto` on the rail itself any more: the transcript
          // scrolls and the box under it stays put, which a single scrolling
          // column cannot do.
          "overflow-hidden shadow-lg sm:w-[26rem]",
        )}
      >
        {children}
      </aside>
    </>
  );
}
