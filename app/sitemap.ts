import type { MetadataRoute } from "next";
import { getAllCompetitions } from "./util/league/leagueRegistry";

export default function sitemap(): MetadataRoute.Sitemap {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://sportwebapp.local";
    const now = new Date();

    const staticRoutes: MetadataRoute.Sitemap = [
        { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
        { url: `${base}/predictions`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ];

    const leagueRoutes: MetadataRoute.Sitemap = getAllCompetitions().map((c) => ({
        url: `${base}/league/${c.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
    }));

    return [...staticRoutes, ...leagueRoutes];
}
