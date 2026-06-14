const SOFASCORE_IMAGE_URLS = [
    "https://img.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.app/api/v1/team/{id}/image",
    "https://www.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.com/api/v1/team/{id}/image",
    "https://img.sofascore.com/api/v1/team/{id}/image/small",
    "https://api.sofascore.app/api/v1/team/{id}/image/small",
];
const FOTMOB_IMAGE_URLS = [
    "https://images.fotmob.com/image_resources/logo/teamlogo/{id}.png",
    "https://images.fotmob.com/image_resources/logo/teamlogo/{id}_small.png",
];
const IMAGE_CACHE_CONTROL = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";
const FALLBACK_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;
const FOTMOB_SEARCH_URL = "https://www.fotmob.com/api/data/search/suggest";
const SPORTSDB_SEARCH_URL = "https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=";

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

function searchTerms(teamName: string): string[] {
    const trimmed = teamName.trim();
    if (!trimmed) {
        return [];
    }

    const normalized = normalizeTeamName(trimmed);
    const withoutDash = trimmed.replace(/-/g, " ");
    const compact = normalized && normalized !== trimmed ? normalized : "";
    return [...new Set([trimmed, withoutDash, compact].filter(Boolean))];
}

function teamNameScore(candidateName: string, targetName: string): number {
    const candidate = normalizeTeamName(candidateName);
    const target = normalizeTeamName(targetName);
    if (!candidate || !target) {
        return 0;
    }

    if (candidate === target) {
        return 1;
    }

    const candidateTokens = new Set(candidate.split(" ").filter(Boolean));
    const targetTokens = new Set(target.split(" ").filter(Boolean));
    const overlap = [...targetTokens].filter((token) => candidateTokens.has(token)).length;
    const overlapScore = overlap / Math.max(candidateTokens.size, targetTokens.size, 1);
    const containsScore = candidate.includes(target) || target.includes(candidate) ? 0.7 : 0;
    return Math.max(overlapScore, containsScore);
}

function isDevelopmentTeamName(name: string, targetName: string): boolean {
    const candidate = normalizeTeamName(name);
    const target = normalizeTeamName(targetName);
    if (target.includes(" u") || target.includes(" women") || target.includes(" w ")) {
        return false;
    }
    return /\b(u\d{2}|ii|b|women|w)\b/.test(candidate);
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

async function fetchFotMobLogoByName(teamName: string): Promise<CachedLogo | null> {
    const terms = searchTerms(teamName);
    for (const term of terms) {
        try {
            const url = new URL(FOTMOB_SEARCH_URL);
            url.searchParams.set("hits", "20");
            url.searchParams.set("lang", "en");
            url.searchParams.set("term", term);

            const response = await fetch(url, {
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
            });

            if (!response.ok) {
                continue;
            }

            const payload = (await response.json()) as {
                suggestions?: {
                    id?: string;
                    name?: string;
                    type?: string;
                }[];
            }[];

            const candidates = payload
                .flatMap((group) => group.suggestions ?? [])
                .filter((candidate) => candidate.type === "team" && candidate.id && candidate.name)
                .map((candidate) => ({
                    id: candidate.id as string,
                    name: candidate.name as string,
                    score: teamNameScore(candidate.name ?? "", teamName),
                    development: isDevelopmentTeamName(candidate.name ?? "", teamName),
                }))
                .filter((candidate) => candidate.score >= 0.5)
                .sort((a, b) => {
                    if (a.development !== b.development) {
                        return a.development ? 1 : -1;
                    }
                    return b.score - a.score;
                });

            const best = candidates[0];
            if (!best) {
                continue;
            }

            const entry = await fetchImageTemplates(best.id, FOTMOB_IMAGE_URLS, "fotmob-search");
            if (entry) {
                return entry;
            }
        } catch {
            continue;
        }
    }

    return null;
}

async function fetchSportsDbLogo(teamName: string): Promise<CachedLogo | null> {
    const terms = searchTerms(teamName);
    for (const term of terms) {
        try {
            const response = await fetch(`${SPORTSDB_SEARCH_URL}${encodeURIComponent(term)}`, {
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
            });

            if (!response.ok) {
                continue;
            }

            const payload = (await response.json()) as {
                teams?: {
                    strBadge?: string;
                    strSport?: string;
                    strTeam?: string;
                }[] | null;
            };
            const team = (payload.teams ?? [])
                .filter((candidate) => candidate.strSport === "Soccer" && candidate.strBadge)
                .map((candidate) => ({
                    ...candidate,
                    score: teamNameScore(candidate.strTeam ?? "", teamName),
                }))
                .filter((candidate) => candidate.score >= 0.5)
                .sort((a, b) => b.score - a.score)[0];

            if (!team?.strBadge) {
                continue;
            }

            const entry = await fetchImageFromUrl(team.strBadge, "thesportsdb", [
                {
                    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    "User-Agent": "Mozilla/5.0",
                },
            ]);
            if (entry) {
                return entry;
            }
        } catch {
            continue;
        }
    }

    return null;
}

async function fetchLogo(id: string, teamName: string): Promise<CachedLogo> {
    const sofascore = await fetchImageTemplates(id, SOFASCORE_IMAGE_URLS, "sofascore");
    if (sofascore) {
        return sofascore;
    }

    const fotmobSearch = await fetchFotMobLogoByName(teamName);
    if (fotmobSearch) {
        return fotmobSearch;
    }

    const sportsDb = await fetchSportsDbLogo(teamName);
    if (sportsDb) {
        return sportsDb;
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

    const logoRequest = fetchLogo(id, teamName)
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
