const SOFASCORE_API = "https://api.sofascore.app/api/v1";
const SOFASCORE_IMAGE_CDN = "https://img.sofascore.com/api/v1";

export function teamLogoUrl(teamId: number): string {
    return `${SOFASCORE_IMAGE_CDN}/team/${teamId}/image`;
}

export function teamLogoFallbackUrl(teamId: number): string {
    return `/api/team-logo/${teamId}`;
}

export function playerImageUrl(playerId: number): string {
    return `${SOFASCORE_API}/player/${playerId}/image`;
}
