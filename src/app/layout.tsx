import { Heebo } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { AuthNav, Footer } from "@/components/layout/AuthNav";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AuthProvider } from "@/contexts/AuthProvider";
import { AuthGate } from "@/components/auth/AuthGate";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "כרם — ספריית כלים קואופרטיבית",
  description: "השאלת כלים קהילתית עם ניהול קופות חכם",
  applicationName: "כרם",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "כרם",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#185538",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className={`${heebo.className} flex min-h-screen flex-col antialiased`}>
        <AuthProvider>
          <AuthNav />
          <AuthGate>
            <main
              className={`mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 ${
                /* less bottom padding on login (no bottom nav) */
                "py-5 pb-24 sm:py-10 sm:pb-10"
              }`}
            >
              {children}
            </main>
          </AuthGate>
          <Footer />
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
