"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/app/util/i18n/translations";
import { getTranslations } from "@/app/util/i18n/translations";

interface LanguageContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
    locale: "en",
    setLocale: () => {},
    t: (key) => key,
});

export function useLanguage() {
    return useContext(LanguageContext);
}

export default function LanguageProvider({ children, initial }: { children: React.ReactNode; initial: Locale }) {
    const [locale, setLocaleState] = useState<Locale>(initial);
    const router = useRouter();

    useEffect(() => {
        const stored = window.localStorage.getItem("locale");
        if ((stored !== "en" && stored !== "pl") || stored === initial) {
            return;
        }

        const timer = window.setTimeout(() => {
            setLocaleState(stored);
            document.cookie = `locale=${stored};path=/;max-age=31536000`;
            router.refresh();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [initial, router]);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        window.localStorage.setItem("locale", next);
        document.cookie = `locale=${next};path=/;max-age=31536000`;
        router.refresh();
    }, [router]);

    const t = getTranslations(locale);

    return (
        <LanguageContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </LanguageContext.Provider>
    );
}
