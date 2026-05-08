import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AppHeader from "./components/common/AppHeader";
import ThemeProvider from "./components/common/ThemeProvider";
import LanguageProvider from "./components/common/LanguageProvider";
import { getServerLocale } from "@/app/util/i18n/getLocale";
import { getServerTheme } from "@/app/util/i18n/getTheme";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: "SportWebApp | Football Results & ML Predictions",
        template: "%s | SportWebApp",
    },
    description: "Football results and ML-driven match predictions across 44 competitions. Compare 9 machine learning models with live accuracy tracking.",
    keywords: ["football", "soccer", "predictions", "machine learning", "sofascore", "standings", "xg"],
    openGraph: {
        title: "SportWebApp",
        description: "Football results and ML match predictions",
        type: "website",
        url: SITE_URL,
    },
    icons: {
        icon: "/logo.png",
        shortcut: "/logo.png",
        apple: "/logo.png",
    },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getServerLocale();
    const theme = await getServerTheme();

    return (
        <html lang={locale} className={`${theme === "dark" ? "dark" : ""} overflow-x-hidden`}>
            <body className={`${inter.className} overflow-x-hidden`}>
                <ThemeProvider initial={theme}>
                    <LanguageProvider initial={locale}>
                        <div className="flex min-h-dvh w-full min-w-0 overflow-x-hidden">
                            <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                                <AppHeader />
                                <main className="min-w-0 flex-1 overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#0b1220_0%,_#111827_48%,_#0b1220_100%)]">
                                    {children}
                                </main>
                            </div>
                        </div>
                    </LanguageProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}