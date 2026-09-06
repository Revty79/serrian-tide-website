import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";

import { getAppearanceCssVariables } from "@/features/appearance/appearance";
import { getPublicSiteAppearance } from "@/features/appearance/appearance-service";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Serrian Tide",
  description: "Enter your imagination.",
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

export default async function RootLayout({ children }: RootLayoutProps) {
  const appearance = await getPublicSiteAppearance();
  const themeStyle = getAppearanceCssVariables(appearance) as CSSProperties;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-appearance-preset={appearance.presetId}
      style={themeStyle}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
