import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host") ?? "sts-tender-intelligence.poreddyjeevanreddy.chatgpt.site";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const siteUrl = new URL(`${protocol}://${host}`);

  return {
    metadataBase: siteUrl,
    title: "Australia Opportunity Radar",
    description: "Australia-focused opportunity intelligence linking early project signals, procurement pathways, and next commercial actions.",
    openGraph: {
      title: "Australia Opportunity Radar",
      description: "Find Australian work before it becomes an obvious tender.",
      type: "website",
      url: siteUrl,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "STS Tender Intelligence opportunity dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Australia Opportunity Radar",
      description: "Find Australian work before it becomes an obvious tender.",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
