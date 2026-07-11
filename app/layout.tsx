import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STS Tender Intelligence",
  description:
    "Australia-focused geotechnical opportunity intelligence, scoring, relationship tracking, and proposal planning.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
