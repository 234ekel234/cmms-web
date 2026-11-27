import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Inter is the UI face the design system was drawn against. It must actually be
// loaded — globals.css names it first in the body font stack, and without this
// the whole app silently fell back to Arial.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  // Enables the variable weight axis so 500/600/700 render as true weights
  // rather than synthesised bold.
  weight: ["400", "500", "600", "700"],
});

// Used for IDs, timers, and other figures that need to stop shifting width.
const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative URLs in generated metadata (Open Graph, canonical) against
  // the canonical origin rather than localhost. NEXT_PUBLIC_SITE_URL lets a
  // preview deployment describe itself accurately instead of claiming to be
  // production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://hanni.servicemasterph.com"),
  title: {
    default: "FMI HANNI",
    template: "%s · FMI HANNI",
  },
  description: "FMI HANNI — Hub for Asset Needs, Notices & Inspections. Track assets, work orders, and PM checklists across all sites.",
  applicationName: "FMI HANNI",
  // Installed on an iPhone's Home Screen: open without Safari's bars, named HANNI.
  appleWebApp: { capable: true, title: "HANNI", statusBarStyle: "default" },
};

// Colours the browser bar and the installed app's title bar.
export const viewport: Viewport = {
  themeColor: "#2C377D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the inline script below stamps data-theme on
    // this element before React hydrates, so the server and client markup
    // legitimately differ on that one attribute.
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Must run before first paint, otherwise dark-mode users get a white
            flash on every navigation that reloads the document. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
