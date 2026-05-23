import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "sportwebapp_admin";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function adminSecret(): string {
    return process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_TOKEN || "";
}

export function isAdminConfigured(): boolean {
    return adminSecret().length > 0;
}

export function isLocalAdminBypass(): boolean {
    return process.env.NODE_ENV !== "production" && !isAdminConfigured();
}

function digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminPassword(password: string): boolean {
    const secret = adminSecret();

    if (!secret) {
        return false;
    }

    return safeEqual(digest(password), digest(secret));
}

export async function isAdminAuthenticated(): Promise<boolean> {
    if (isLocalAdminBypass()) {
        return true;
    }

    const secret = adminSecret();

    if (!secret) {
        return false;
    }

    const cookieStore = await cookies();
    const session = cookieStore.get(ADMIN_COOKIE)?.value ?? "";

    return safeEqual(session, digest(secret));
}

export async function setAdminSession(): Promise<void> {
    const secret = adminSecret();

    if (!secret) {
        return;
    }

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE, digest(secret), {
        httpOnly: true,
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: "/admin",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });
}

export async function clearAdminSession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/admin",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });
}
