import { cookies } from "next/headers";
import type { Locale } from "./translations";
import { getTranslations } from "./translations";

export async function getServerLocale(): Promise<Locale> {
    const cookieStore = await cookies();
    const val = cookieStore.get("locale")?.value;
    if (val === "en" || val === "pl") return val;
    return "en";
}

export async function getServerT() {
    return getTranslations(await getServerLocale());
}
