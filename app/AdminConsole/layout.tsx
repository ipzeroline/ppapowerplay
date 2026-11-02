import type { ReactNode } from "react";
// Back-office styles: only AdminConsole pages (console, receipts) download them.
import "../admin.css";

export default function AdminConsoleLayout({ children }: { children: ReactNode }) {
  return children;
}
