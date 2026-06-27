import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/app/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OmniTest Engine — Secure Test Platform",
  description:
    "Production-grade, secure survey & testing platform. Admin-driven, effortless for participants.",
  keywords: [
    "OmniTest",
    "test platform",
    "quiz",
    "assessment",
    "anti-cheat",
    "Next.js",
  ],
  authors: [{ name: "OmniTest Engine" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "OmniTest Engine",
    description: "Secure, scalable test-taking platform",
    siteName: "OmniTest Engine",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OmniTest Engine",
    description: "Secure, scalable test-taking platform",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
