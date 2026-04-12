import Link from "next/link";
import Image from "next/image";
import { PredictionMatch, ConsensusPrediction } from "@/types/predictions";
import { getServerT } from "@/app/util/i18n/getLocale";

interface MatchCardProps {
    match: PredictionMatch;
    homeTeamId: number | null;
    awayTeamId: number | null;
    eventId: number | null;
    date: string;
}

function teamLogoUrl(teamId: number): string {
    return `https://api.sofascore.app/api/v1/team/${teamId}/image`;
}

function getPredictionColor(prediction: string): string {
    if (prediction === "HOME") return "text-emerald-400";
    if (prediction === "AWAY") return "text-emerald-400";
    return "text-yellow-400";
}

function getPredictionLabel(match: PredictionMatch, t: (key: string) => string): { text: string; color: string } | null {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    if (!consensus?.prediction) return null;

    const pred = consensus.prediction;
    const prob = consensus.avg_probabilities?.[pred] ?? 0;

    let label = "";
    if (pred === "HOME") label = `${t("home_win")} (${prob.toFixed(0)}%)`;
    else if (pred === "AWAY") label = `${t("away_win")} (${prob.toFixed(0)}%)`;
    else label = `${t("draw")} (${prob.toFixed(0)}%)`;

    return { text: label, color: getPredictionColor(pred) };
}

function isPredictionCorrect(match: PredictionMatch): boolean | null {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    if (!consensus?.prediction || match.status !== "finished" || !match.actual_result) return null;
    return consensus.correct;
}

export default function MatchCard({ match, homeTeamId, awayTeamId, eventId, date }: MatchCardProps) {
    const t = getServerT();
    const isFinished = match.status === "finished";
    const prediction = getPredictionLabel(match, t);
    const score = match.actual_score?.split("-").map((s) => s.trim());
    const correct = isPredictionCorrect(match);

    const borderColor = correct === null
        ? "border-gray-200 dark:border-gray-700"
        : correct
            ? "border-emerald-500/60"
            : "border-red-500/60";

    const href = eventId ? `/match/${eventId}?date=${date}` : "#";

    return (
        <Link href={href} className={`flex flex-col bg-white dark:bg-gray-800/80 border ${borderColor} rounded-xl p-4 w-[240px] hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col items-center gap-1 flex-1">
                    {homeTeamId ? (
                        <Image
                            src={teamLogoUrl(homeTeamId)}
                            alt={match.home_team}
                            width={40}
                            height={40}
                            className="object-contain"
                            style={{ width: "40px", height: "40px" }}
                        />
                    ) : (
                        <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-xs font-bold">
                            {match.home_team.slice(0, 2).toUpperCase()}
                        </div>
                    )}
                    <span className="text-xs text-center text-gray-700 dark:text-gray-300 leading-tight max-w-[90px]">
                        {match.home_team}
                    </span>
                </div>

                <div className="flex flex-col items-center gap-1">
                    {isFinished && score ? (
                        <>
                            <span className="text-xl font-bold text-gray-900 dark:text-white">
                                {score[0]} - {score[1]}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{t("ft")}</span>
                        </>
                    ) : match.status === "postponed" ? (
                        <>
                            <span className="text-sm font-semibold text-yellow-400">
                                {t("postponed")}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{match.start_time || ""}</span>
                        </>
                    ) : (
                        <>
                            <span className="text-lg font-semibold text-emerald-400">
                                {match.start_time || "TBD"}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{t("kick_off")}</span>
                        </>
                    )}
                </div>

                <div className="flex flex-col items-center gap-1 flex-1">
                    {awayTeamId ? (
                        <Image
                            src={teamLogoUrl(awayTeamId)}
                            alt={match.away_team}
                            width={40}
                            height={40}
                            className="object-contain"
                            style={{ width: "40px", height: "40px" }}
                        />
                    ) : (
                        <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-xs font-bold">
                            {match.away_team.slice(0, 2).toUpperCase()}
                        </div>
                    )}
                    <span className="text-xs text-center text-gray-700 dark:text-gray-300 leading-tight max-w-[90px]">
                        {match.away_team}
                    </span>
                </div>
            </div>

            {prediction && (
                <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t("ml_prediction")}</span>
                    <span className={`text-xs font-semibold ${prediction.color}`}>
                        {prediction.text}
                    </span>
                </div>
            )}
        </Link>
    );
}
