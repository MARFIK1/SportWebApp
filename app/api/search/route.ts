import { NextResponse } from "next/server";
import { buildSearchData } from "@/app/util/data/dataService";
import { getLeagues } from "@/app/util/league/leagueRegistry";

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 5;

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const q = normalize((url.searchParams.get("q") || "").slice(0, MAX_QUERY_LENGTH));

    if (q.length < 2) {
        return NextResponse.json(
            { teams: [], players: [] },
            { headers: { "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400" } }
        );
    }

    const { teams, players } = buildSearchData(getLeagues());
    const response = {
        teams: teams.filter((team) => normalize(team.name).includes(q)).slice(0, RESULT_LIMIT),
        players: players.filter((player) => normalize(player.name).includes(q)).slice(0, RESULT_LIMIT),
    };

    return NextResponse.json(response, {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400" },
    });
}
