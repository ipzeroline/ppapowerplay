import type { Metadata } from "next";
import type { Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import type { ReactNode } from "react";
import "./styles.css";
import "./responsive.css";
// Back-office styles load only under /AdminConsole (app/AdminConsole/layout.tsx).

// Noto Sans Thai covers Latin too and comes first in every font stack, so Inter is only a
// fallback: not preloaded, fetched only if a character ever needs it.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-aura",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PPA Power Play",
  description: "LINE LIFF booking, membership, wallet and rewards app for PPA Power Play.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th" className={`${inter.variable} ${notoSansThai.variable}`}>
      <body>{children}</body>
    </html>
  );
}
