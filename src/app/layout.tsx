import { Heebo } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { AuthNav, Footer } from "@/components/layout/AuthNav";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AuthProvider } from "@/contexts/AuthProvider";
import { AuthGate } from "@/components/auth/AuthGate";
import { PhoneGate } from "@/components/auth/PhoneGate";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "כרם רעים — ספריית כלים קואופרטיבית",
  description: "השאלת כלים קהילתית עם ניהול קופות חכם",
  applicationName: "כרם רעים",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "כרם רעים",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
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
            <PhoneGate>
              <main
                className={`mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 ${
                  /* less bottom padding on login (no bottom nav) */
                  "py-5 pb-24 sm:py-10 sm:pb-10"
                }`}
              >
                {children}
              </main>
            </PhoneGate>
          </AuthGate>
          <Footer />
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
