import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Personal CRM",
  description: "Intent-matching founders to VCs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          margin: 0,
          background: "#fafafa",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 20px" }}>{children}</div>
      </body>
    </html>
  );
}
