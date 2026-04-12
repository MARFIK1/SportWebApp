import Link from "next/link";
import { PredictionMatch, ConsensusPrediction } from "@/types/predictions";
import MatchCard from "./MatchCard";
import { getServerT } from "@/app/util/i18n/getLocale";

interface LeagueSectionProps {
    league: string;
    leagueName: string;
    slug: string;
    matches: PredictionMatch[];
    teamIds: Record<string, number>;
    eventIds: Record<string, number>;
    selectedDate: string;
}

function getLeagueAccuracy(matches: PredictionMatch[]): { correct: number; total: number } | null {
    const finished = matches.filter((m) => m.status === "finished" && m.actual_result);
    if (finished.length === 0) return null;

    let correct = 0;
    for (const m of finished) {
        const consensus = m.predictions.consensus as ConsensusPrediction;
        if (consensus?.correct) correct++;
    }

    return { correct, total: finished.length };
}

export default function LeagueSection({ league, leagueName, slug, matches, teamIds, eventIds, selectedDate }: LeagueSectionProps) {
    const t = getServerT();
    const accuracy = getLeagueAccuracy(matches);

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-4">
                    <div>
                        <Link href={`/league/${slug}`} className="text-lg font-bold text-gray-900 dark:text-white hover:text-emerald-400 transition-colors">{leagueName}</Link>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{matches.length} {t("matches_count")}</span>
                    </div>
                    {accuracy && (
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{t("accuracy")}:</span>
                            <span className={`text-sm font-bold ${accuracy.correct / accuracy.total >= 0.5 ? "text-emerald-400" : "text-gray-700 dark:text-gray-300"}`}>
                                {accuracy.correct}/{accuracy.total}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({Math.round((accuracy.correct / accuracy.total) * 100)}%)
                            </span>
                        </div>
                    )}
                </div>
                <Link
                    href={`/league/${slug}`}
                    className="text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition-colors"
                >
                    {t("view_standings")} {"\u2197"}
                </Link>
            </div>
            {(() => {
                const finished = matches.filter((m) => m.status === "finished");
                const other = matches.filter((m) => m.status !== "finished");
                return (
                    <>
                        {finished.length > 0 && (
                            <div className="flex flex-wrap gap-3 pb-2">
                                {finished.map((match) => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        homeTeamId={teamIds[match.home_team] ?? null}
                                        awayTeamId={teamIds[match.away_team] ?? null}
                                        eventId={eventIds[`${match.home_team}_vs_${match.away_team}_${selectedDate}`] ?? null}
                                        date={selectedDate}
                                    />
                                ))}
                            </div>
                        )}
                        {finished.length > 0 && other.length > 0 && (
                            <div className="flex items-center gap-3 py-3 px-2">
                                <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
                                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t("scheduled")}</span>
                                <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
                            </div>
                        )}
                        {other.length > 0 && (
                            <div className="flex flex-wrap gap-3 pb-2">
                                {other.map((match) => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        homeTeamId={teamIds[match.home_team] ?? null}
                                        awayTeamId={teamIds[match.away_team] ?? null}
                                        eventId={eventIds[`${match.home_team}_vs_${match.away_team}_${selectedDate}`] ?? null}
                                        date={selectedDate}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                );
            })()}
        </div>
    );
}
