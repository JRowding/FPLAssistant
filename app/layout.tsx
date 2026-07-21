import type { Metadata } from "next";
import "./globals.css";
import "./planning.css";

export const metadata: Metadata = {
  title: "Assistant Manager — FPL Decision Room",
  description: "Live FPL squad analysis, captaincy, transfers and weekly planning.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
