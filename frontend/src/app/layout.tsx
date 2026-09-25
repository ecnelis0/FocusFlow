import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";

import { Assistant } from "@/components/app/assistant";
import { Landscape } from "@/components/app/landscape";
import { Nav } from "@/components/app/nav";
import { MainArea, SidePanelProvider } from "@/components/app/side-panel";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// One face for everything, headings included: Roboto for text, Roboto Mono for
// answers and codes. `weight` is pinned because Roboto on Google Fonts is not
// served as a variable font.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FocusFlow",
  description: "Every question you got wrong, in any subject, analysed and scheduled back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${robotoMono.variable} antialiased`}>
        {/* The painting goes in before anything else and never moves: it is
            fixed, so the app scrolls over a still landscape rather than
            dragging one along behind it. */}
        <Landscape />
        <Providers>
          <SidePanelProvider>
            <Nav />
            {/* Room for the fixed sidebar on wide screens; the top bar on narrow ones
                sits in normal flow above the content. */}
            <div className="lg:pl-56">
              <MainArea>{children}</MainArea>
            </div>
            <Assistant />
          </SidePanelProvider>
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
