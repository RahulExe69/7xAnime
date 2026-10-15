import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";

import NavBar from "@/components/navbar";
import AccessibilityPreferences from "@/components/accessibility-preferences";
import ForceUpdateGate from "@/components/force-update-gate";
import Footer from "@/components/footer";
import NativeBackHandler from "@/components/native-back-handler";
import Script from "next/script";
import QueryProvider from "@/providers/query-provider";
import { ThemeProvider } from "@/components/theme-provider";

import { Toaster } from "@/components/ui/sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
// const geistMono = localFont({
//   src: "./fonts/GeistMonoVF.woff",
//   variable: "--font-geist-mono",
//   weight: "100 900",
// });

const APP_NAME = "7xAnime";
const APP_DEFAULT_TITLE = "7xAnime | Anime Streaming";
const APP_DESCRIPTION = "Stream your favourite anime with ease and no ads";

export const viewport: Viewport = {
  themeColor: "#0b0307",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_DEFAULT_TITLE,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  manifest: "/manifest.json",
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-X9RZ58XPH1"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-X9RZ58XPH1');`}
        </Script>
        <link rel="icon" href="/brand/7xanime-icon.png" type="image/png" />
      </head>
      <body
        className={`${geistSans.className} antialiased max-w-[100vw] overflow-x-clip bg-background text-foreground pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            <ForceUpdateGate />
            <Suspense fallback={null}>
              <NativeBackHandler />
            </Suspense>
            <AccessibilityPreferences />
            <NavBar />
            {children}
            <Footer />
          </QueryProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
