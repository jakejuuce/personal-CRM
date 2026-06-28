import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Personal CRM",
  description: "Intent-matching founders to VCs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
