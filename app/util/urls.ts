const SOFASCORE_API = "https://api.sofascore.app/api/v1";

export function teamLogoUrl(teamId: number): string {
    return `/api/team-logo/${teamId}`;
}

export function playerImageUrl(playerId: number): string {
    return `${SOFASCORE_API}/player/${playerId}/image`;
}
