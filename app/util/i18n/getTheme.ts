import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export function getServerTheme(): Theme {
    const val = cookies().get("theme")?.value;
    return val === "light" ? "light" : "dark";
}
