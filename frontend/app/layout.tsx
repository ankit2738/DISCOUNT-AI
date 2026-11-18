import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth-provider";
import { PwaRegister } from "@/components/pwa-register";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DISCOUNT AI — Buy Smarter. Not Just Cheaper.",
    template: "%s | DISCOUNT AI",
  },
  description:
    "Independent shopping intelligence for Indian online shoppers: verified price comparison, deal scores, fake discount detection, coupons, bank offers and an AI shopping copilot.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  applicationName: "DISCOUNT AI",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <PwaRegister />
          <SiteHeader />
          <div className="min-h-[70vh]">{children}</div>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
