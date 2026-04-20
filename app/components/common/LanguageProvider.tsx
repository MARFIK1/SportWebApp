"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
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
        const stored = localStorage.getItem("locale") as Locale | null;
        if (stored === "en" || stored === "pl") {
            setLocaleState((current) => stored === current ? current : stored);
        }
    }, []);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        localStorage.setItem("locale", next);
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
