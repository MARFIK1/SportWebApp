const SOFASCORE_API = "https://api.sofascore.app/api/v1";
const SOFASCORE_IMAGE_CDN = "https://img.sofascore.com/api/v1";

export function cachedTeamLogoUrl(teamId: number): string {
    return `/team-logos/${teamId}.png`;
}

export function teamLogoUrl(teamId: number): string {
    return cachedTeamLogoUrl(teamId);
}

export function teamLogoUrls(teamId: number, teamName?: string): string[] {
    return [
        cachedTeamLogoUrl(teamId),
        `${SOFASCORE_IMAGE_CDN}/team/${teamId}/image`,
        `${SOFASCORE_IMAGE_CDN}/team/${teamId}/image/small`,
        teamLogoFallbackUrl(teamId, teamName),
    ];
}

export function teamLogoFallbackUrl(teamId: number, teamName?: string): string {
    const params = teamName ? `?name=${encodeURIComponent(teamName)}` : "";
    return `/api/team-logo/${teamId}${params}`;
}

export function playerImageUrl(playerId: number): string {
    return `${SOFASCORE_API}/player/${playerId}/image`;
}
