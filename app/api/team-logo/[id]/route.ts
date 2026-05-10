const SOFASCORE_API = "https://api.sofascore.app/api/v1";
const IMAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

type RouteContext = {
    params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: RouteContext) {
    const { id } = await context.params;

    if (!/^\d+$/.test(id)) {
        return new Response("Invalid team id", {
            status: 400,
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }

    try {
        const response = await fetch(`${SOFASCORE_API}/team/${id}/image`, {
            headers: {
                Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "User-Agent": "SportWebApp/1.0",
            },
        });

        if (!response.ok) {
            return new Response("Team logo not found", {
                status: response.status,
                headers: {
                    "Cache-Control": "public, max-age=300, s-maxage=300",
                },
            });
        }

        const contentType = response.headers.get("content-type") || "image/png";
        const image = await response.arrayBuffer();

        return new Response(image, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": IMAGE_CACHE_CONTROL,
            },
        });
    } catch {
        return new Response("Team logo unavailable", {
            status: 502,
            headers: {
                "Cache-Control": "public, max-age=300, s-maxage=300",
            },
        });
    }
}
