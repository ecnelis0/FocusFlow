"use client";

import { Ask } from "@/components/app/ask";
import { SidePanel } from "@/components/app/side-panel";

/** The side panel. One thing in it now that the Categories rail has gone: that
 *  rail was built on `/stats`, and the bank itself does the browsing — subjects,
 *  then folders, then what you put in each. */
export function Assistant() {
  return (
    <SidePanel>
      <Ask />
    </SidePanel>
  );
}
