import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export async function getServerTheme(): Promise<Theme> {
    const val = (await cookies()).get("theme")?.value;
    return val === "light" ? "light" : "dark";
}
