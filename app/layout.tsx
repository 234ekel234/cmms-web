import type { Metadata } from "next";
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
  title: {
    default: "FMI CMMS",
    template: "%s · FMI CMMS",
  },
  description: "Maintenance management — track assets, work orders, and PM checklists across all sites.",
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
