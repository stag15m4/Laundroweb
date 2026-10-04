import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Laundroweb",
  description: "Laundromat management dashboard",
  manifest: "/manifest.webmanifest",
  // Lets "Add to Home Screen" on iPhone launch without Safari's address bar,
  // so the icon behaves like a regular app rather than a bookmark.
  appleWebApp: {
    capable: true,
    title: "Laundroweb",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#030712",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
