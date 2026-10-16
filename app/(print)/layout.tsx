import { AuthProvider } from "@/context/AuthContext";
import "./print.css";

/**
 * Pages meant for paper. Signed in like the dashboard, but without its chrome:
 * a sidebar and top bar hidden by print CSS still cost layout on screen, and the
 * preview is the page — what you see here is what comes out of the printer.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
