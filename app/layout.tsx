import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host") ?? "sts-tender-intelligence.poreddyjeevanreddy.chatgpt.site";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const siteUrl = new URL(`${protocol}://${host}`);

  return {
    metadataBase: siteUrl,
    title: "NSW Opportunity Radar",
    description: "NSW geotechnical opportunity intelligence linking early project signals, procurement pathways, and next commercial actions.",
    openGraph: {
      title: "NSW Opportunity Radar",
      description: "Find NSW geotechnical work before it becomes an obvious tender.",
      type: "website",
      url: siteUrl,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "STS Tender Intelligence opportunity dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "NSW Opportunity Radar",
      description: "Find NSW geotechnical work before it becomes an obvious tender.",
      images: ["/og.png"],
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
