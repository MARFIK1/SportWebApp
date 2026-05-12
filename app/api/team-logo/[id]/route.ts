const SOFASCORE_IMAGE_URLS = [
    "https://img.sofascore.com/api/v1/team/{id}/image",
    "https://img.sofascore.com/api/v1/team/{id}/image/small",
    "https://api.sofascore.app/api/v1/team/{id}/image",
    "https://api.sofascore.app/api/v1/team/{id}/image/small",
    "https://www.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.com/api/v1/team/{id}/image",
];
const IMAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const FALLBACK_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

const IMAGE_REQUEST_HEADERS = {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.sofascore.com/",
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

type RouteContext = {
    params: Promise<{ id?: string }> | { id?: string };
};

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

function fallbackLogoResponse(id: string): Response {
    return new Response(fallbackLogoSvg(id), {
        status: 200,
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": FALLBACK_CACHE_CONTROL,
            "X-Team-Logo-Fallback": "1",
        },
    });
}

export async function GET(_request: Request, context: RouteContext) {
    const params = await Promise.resolve(context.params);
    const id = params?.id ?? "";

    if (!/^\d+$/.test(id)) {
        return fallbackLogoResponse(id);
    }

    for (const template of SOFASCORE_IMAGE_URLS) {
        try {
            const response = await fetch(template.replace("{id}", id), {
                headers: IMAGE_REQUEST_HEADERS,
                redirect: "follow",
            });

            if (!response.ok) {
                continue;
            }

            const image = await response.arrayBuffer();
            if (image.byteLength === 0) {
                continue;
            }

            const contentType = response.headers.get("content-type") || "image/png";

            return new Response(image, {
                status: 200,
                headers: {
                    "Content-Type": contentType,
                    "Cache-Control": IMAGE_CACHE_CONTROL,
                },
            });
        } catch {
            continue;
        }
    }

    return fallbackLogoResponse(id);
}
