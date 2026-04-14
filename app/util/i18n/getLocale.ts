import { cookies } from "next/headers";
import type { Locale } from "./translations";
import { getTranslations } from "./translations";

export function getServerLocale(): Locale {
    const cookieStore = cookies();
    const val = cookieStore.get("locale")?.value;
    if (val === "en" || val === "pl") return val;
    return "en";
}

export function getServerT() {
    return getTranslations(getServerLocale());
}
