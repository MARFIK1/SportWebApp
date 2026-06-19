import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

const SOFASCORE_IMAGE_URLS = [
    "https://img.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.app/api/v1/team/{id}/image",
    "https://www.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.com/api/v1/team/{id}/image",
    "https://img.sofascore.com/api/v1/team/{id}/image/small",
    "https://api.sofascore.app/api/v1/team/{id}/image/small",
];
const IMAGE_CACHE_CONTROL = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";
const LOCAL_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const FALLBACK_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;

const IMAGE_REQUEST_HEADER_VARIANTS: Record<string, string>[] = [
    {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    {
        "User-Agent": "Mozilla/5.0",
    },
    {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.sofascore.com/",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
];

type RouteContext = {
    params: Promise<{ id?: string }>;
};

type CachedLogo = {
    body: ArrayBuffer;
    cacheControl: string;
    contentType: string;
    expiresAt: number;
    fallback: boolean;
    source: string;
};

const logoCache = new Map<string, CachedLogo>();
const pendingLogoRequests = new Map<string, Promise<CachedLogo>>();

function fallbackLogoSvg(id: string): string {
    const label = id && /^\d+$/.test(id) ? id.slice(-2).padStart(2, "0") : "FC";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Team logo fallback">
<defs>
<linearGradient id="g" x1="20" y1="12" x2="82" y2="86" gradientUnits="userSpaceOnUse">
<stop stop-color="#22d3ee"/>
<stop offset="0.58" stop-color="#10b981"/>
<stop offset="1" stop-color="#38bdf8"/>
</linearGradient>
</defs>
<rect width="96" height="96" rx="24" fill="#0f172a"/>
<path d="M48 10 78 22v20c0 21-12 36-30 44-18-8-30-23-30-44V22L48 10Z" fill="#111827" stroke="url(#g)" stroke-width="4"/>
<circle cx="48" cy="39" r="13" fill="#10b981" opacity="0.95"/>
<path d="M36 57h24" stroke="#22d3ee" stroke-width="5" stroke-linecap="round"/>
<text x="48" y="77" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" fill="#e5f9ff">${label}</text>
</svg>`;
}

function fallbackLogoEntry(id: string): CachedLogo {
    return {
        body: new TextEncoder().encode(fallbackLogoSvg(id)).buffer,
        cacheControl: FALLBACK_CACHE_CONTROL,
        contentType: "image/svg+xml; charset=utf-8",
        expiresAt: Date.now() + FALLBACK_CACHE_TTL_MS,
        fallback: true,
        source: "fallback",
    };
}

function logoResponse(entry: CachedLogo, cacheState: "hit" | "miss" | "pending"): Response {
    return new Response(entry.body.slice(0), {
        status: 200,
        headers: {
            "Content-Type": entry.contentType,
            "Cache-Control": entry.cacheControl,
            "X-Team-Logo-Cache": cacheState,
            "X-Team-Logo-Source": entry.source,
            ...(entry.fallback ? { "X-Team-Logo-Fallback": "1" } : {}),
        },
    });
}

function normalizeTeamName(name: string): string {
    return name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

async function fetchImageFromUrl(
    url: string,
    source: string,
    headerVariants: Record<string, string>[] = IMAGE_REQUEST_HEADER_VARIANTS,
): Promise<CachedLogo | null> {
    for (const headers of headerVariants) {
        try {
            const response = await fetch(url, {
                cache: "no-store",
                headers,
                redirect: "follow",
            });

            if (!response.ok) {
                continue;
            }

            const contentType = response.headers.get("content-type") || "";
            if (!contentType.toLowerCase().startsWith("image/")) {
                continue;
            }

            const image = await response.arrayBuffer();
            if (image.byteLength === 0) {
                continue;
            }

            return {
                body: image,
                cacheControl: IMAGE_CACHE_CONTROL,
                contentType,
                expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
                fallback: false,
                source,
            };
        } catch {
            continue;
        }
    }

    return null;
}

async function fetchImageTemplates(id: string, templates: string[], source: string): Promise<CachedLogo | null> {
    for (const template of templates) {
        const entry = await fetchImageFromUrl(template.replace("{id}", id), source);
        if (entry) {
            return entry;
        }
    }

    return null;
}

async function fetchLocalLogo(id: string): Promise<CachedLogo | null> {
    try {
        const logo = await readFile(join(process.cwd(), "public", "team-logos", `${id}.png`));

        return {
            body: logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength),
            cacheControl: LOCAL_IMAGE_CACHE_CONTROL,
            contentType: "image/png",
            expiresAt: Number.MAX_SAFE_INTEGER,
            fallback: false,
            source: "local",
        };
    } catch {
        return null;
    }
}

async function fetchLogo(id: string): Promise<CachedLogo> {
    const local = await fetchLocalLogo(id);
    if (local) {
        return local;
    }

    const sofascore = await fetchImageTemplates(id, SOFASCORE_IMAGE_URLS, "sofascore");
    if (sofascore) {
        return sofascore;
    }

    return fallbackLogoEntry(id);
}

export async function GET(request: Request, context: RouteContext) {
    const params = await Promise.resolve(context.params);
    const id = params?.id ?? "";
    const url = new URL(request.url);
    const teamName = url.searchParams.get("name")?.trim() ?? "";
    const cacheKey = `${id}:${normalizeTeamName(teamName)}`;

    if (!/^\d+$/.test(id)) {
        return logoResponse(fallbackLogoEntry(id), "miss");
    }

    const cached = logoCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return logoResponse(cached, "hit");
    }

    const pending = pendingLogoRequests.get(cacheKey);
    if (pending) {
        const entry = await pending;
        return logoResponse(entry, "pending");
    }

    const logoRequest = fetchLogo(id)
        .then((entry) => {
            logoCache.set(cacheKey, entry);
            return entry;
        })
        .finally(() => {
            pendingLogoRequests.delete(cacheKey);
        });

    pendingLogoRequests.set(cacheKey, logoRequest);
    const entry = await logoRequest;
    return logoResponse(entry, "miss");
}
