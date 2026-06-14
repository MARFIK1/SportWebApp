const SOFASCORE_IMAGE_URLS = [
    "https://img.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.app/api/v1/team/{id}/image",
    "https://www.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.com/api/v1/team/{id}/image",
    "https://img.sofascore.com/api/v1/team/{id}/image/small",
    "https://api.sofascore.app/api/v1/team/{id}/image/small",
];
const IMAGE_CACHE_CONTROL = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";
const FALLBACK_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;
const BROWSER_LOGO_CACHE_CONTROL = "public, max-age=300, s-maxage=300";

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
    };
}

function logoResponse(entry: CachedLogo, cacheState: "hit" | "miss" | "pending"): Response {
    return new Response(entry.body.slice(0), {
        status: 200,
        headers: {
            "Content-Type": entry.contentType,
            "Cache-Control": entry.cacheControl,
            "X-Team-Logo-Cache": cacheState,
            ...(entry.fallback ? { "X-Team-Logo-Fallback": "1" } : {}),
        },
    });
}

function browserLogoResponse(id: string, cacheState: "hit" | "miss" | "pending"): Response {
    return new Response(null, {
        status: 307,
        headers: {
            Location: `https://img.sofascore.com/api/v1/team/${id}/image`,
            "Cache-Control": BROWSER_LOGO_CACHE_CONTROL,
            "X-Team-Logo-Cache": cacheState,
            "X-Team-Logo-Redirect": "1",
        },
    });
}

async function fetchLogo(id: string): Promise<CachedLogo> {
    for (const template of SOFASCORE_IMAGE_URLS) {
        for (const headers of IMAGE_REQUEST_HEADER_VARIANTS) {
            try {
                const response = await fetch(template.replace("{id}", id), {
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
                };
            } catch {
                continue;
            }
        }
    }

    return fallbackLogoEntry(id);
}

export async function GET(_request: Request, context: RouteContext) {
    const params = await Promise.resolve(context.params);
    const id = params?.id ?? "";

    if (!/^\d+$/.test(id)) {
        return logoResponse(fallbackLogoEntry(id), "miss");
    }

    const cached = logoCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
        if (cached.fallback) {
            logoCache.delete(id);
            return browserLogoResponse(id, "hit");
        }
        return logoResponse(cached, "hit");
    }

    const pending = pendingLogoRequests.get(id);
    if (pending) {
        const entry = await pending;
        if (entry.fallback) {
            return browserLogoResponse(id, "pending");
        }
        return logoResponse(entry, "pending");
    }

    const request = fetchLogo(id)
        .then((entry) => {
            if (!entry.fallback) {
                logoCache.set(id, entry);
            }
            return entry;
        })
        .finally(() => {
            pendingLogoRequests.delete(id);
        });

    pendingLogoRequests.set(id, request);
    const entry = await request;
    if (entry.fallback) {
        return browserLogoResponse(id, "miss");
    }
    return logoResponse(entry, "miss");
}
