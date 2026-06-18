import type { Metadata } from "next";
import { Open_Sans, Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";

// TEMPORARY: apply the saved theme before first paint so toggling persists
// across pages with no flash of the wrong palette. Remove with ThemeToggle.
const THEME_INIT = `try{if(localStorage.getItem('gmbit-theme')==='blue')document.documentElement.dataset.theme='blue';}catch(e){}`;

// Friendly humanist sans for the bulk of the UI. Loaded as a variable font so
// any weight (incl. the heavier body default and bumped utility scale) renders.
const openSans = Open_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Crisper, more neutral face kept for "serious" labels (brand names, etc.).
const montserrat = Montserrat({
  variable: "--font-serious",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "gmbit",
  description: "Chess game analysis with engine evaluation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openSans.variable} ${montserrat.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
