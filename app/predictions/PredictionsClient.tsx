"use client";
import { useState } from "react";
import Image from "next/image";
import { PredictionMatch, ModelPrediction, ConsensusPrediction, ModelAccuracy } from "@/types/predictions";
import { teamLogoUrl } from "@/app/util/urls";
import { useLanguage } from "@/app/components/common/LanguageProvider";

interface PredictionsClientProps {
    matches: PredictionMatch[];
    leagues: { dataPath: string; name: string; count: number }[];
    teamIds: Record<string, number>;
    dayAccuracy: Record<string, ModelAccuracy>;
}

export default function PredictionsClient({ matches, leagues, teamIds, dayAccuracy }: PredictionsClientProps) {
    const { t } = useLanguage();
    const [selectedLeague, setSelectedLeague] = useState<string>("all");
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

    const filtered = selectedLeague === "all"
        ? matches
        : matches.filter((m) => `${m.comp_type}/${m.league}` === selectedLeague);

    return (
        <div>
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                <button
                    onClick={() => setSelectedLeague("all")}
                    className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                        selectedLeague === "all" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                >
                    {t("all_leagues")} ({matches.length})
                </button>
                {leagues.map((l) => (
                    <button
                        key={l.dataPath}
                        onClick={() => setSelectedLeague(l.dataPath)}
                        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                            selectedLeague === l.dataPath ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                    >
                        {l.name} ({l.count})
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                {filtered.map((match) => {
                    const consensus = match.predictions.consensus as ConsensusPrediction;
                    const isExpanded = expandedMatch === match.id;
                    const models = Object.entries(match.predictions).filter(([key]) => key !== "consensus") as [string, ModelPrediction][];
                    const isFinished = match.status === "finished";
                    const score = match.actual_score?.split("-").map((s) => s.trim());
                    const correct = consensus?.correct;

                    return (
                        <div key={match.id} className="bg-white dark:bg-gray-900/50 rounded-xl overflow-hidden">
                            <button
                                onClick={() => setExpandedMatch(isExpanded ? null : match.id)}
                                className="w-full flex items-center gap-4 p-4 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-2 w-[280px]">
                                    {teamIds[match.home_team] && (
                                        <Image
                                            src={teamLogoUrl(teamIds[match.home_team])}
                                            alt={match.home_team}
                                            width={24}
                                            height={24}
                                            className="object-contain"
                                            style={{ width: "24px", height: "24px" }}
                                        />
                                    )}
                                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{match.home_team}</span>
                                    {isFinished && score ? (
                                        <span className="text-sm font-bold text-gray-900 dark:text-white mx-2">{score[0]} - {score[1]}</span>
                                    ) : (
                                        <span className="text-sm text-gray-400 dark:text-gray-500 mx-2">vs</span>
                                    )}
                                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1 text-right">{match.away_team}</span>
                                    {teamIds[match.away_team] && (
                                        <Image
                                            src={teamLogoUrl(teamIds[match.away_team])}
                                            alt={match.away_team}
                                            width={24}
                                            height={24}
                                            className="object-contain"
                                            style={{ width: "24px", height: "24px" }}
                                        />
                                    )}
                                </div>

                                <div className="flex-1 flex items-center gap-4">
                                    {consensus && (
                                        <>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                consensus.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                consensus.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                "bg-yellow-600/30 text-yellow-400"
                                            }`}>
                                                {consensus.prediction}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {consensus.agreement}
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                H:{consensus.avg_probabilities?.HOME?.toFixed(0)}%
                                                {" "}D:{consensus.avg_probabilities?.DRAW?.toFixed(0)}%
                                                {" "}A:{consensus.avg_probabilities?.AWAY?.toFixed(0)}%
                                            </span>
                                        </>
                                    )}
                                </div>

                                {isFinished && (
                                    <span
                                        className={`text-xs font-bold ${correct ? "text-emerald-400" : "text-red-400"}`}
                                        aria-label={correct ? t("correct") : t("incorrect")}
                                        role="img"
                                    >
                                        <span aria-hidden="true">{correct ? "\u2713" : "\u2717"}</span>
                                    </span>
                                )}

                                <span className="text-gray-400 dark:text-gray-500 text-sm" aria-hidden="true">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                            </button>

                            {isExpanded && (
                                <div className="px-4 pb-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-800">
                                                <th className="text-left py-2 px-2">{t("model")}</th>
                                                <th className="text-center py-2 px-2">{t("prediction")}</th>
                                                <th className="text-center py-2 px-2">{t("home_pct")}</th>
                                                <th className="text-center py-2 px-2">{t("draw_pct")}</th>
                                                <th className="text-center py-2 px-2">{t("away_pct")}</th>
                                                <th className="text-center py-2 px-2">{t("confidence")}</th>
                                                {isFinished && <th className="text-center py-2 px-2">{t("result")}</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {models.map(([name, pred]) => (
                                                <tr key={name} className="border-b border-gray-200 dark:border-gray-800/50">
                                                    <td className="py-2 px-2 text-gray-900 dark:text-white">{name}</td>
                                                    <td className="text-center py-2 px-2">
                                                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                                            pred.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                            pred.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                            "bg-yellow-600/30 text-yellow-400"
                                                        }`}>
                                                            {pred.prediction}
                                                        </span>
                                                    </td>
                                                    <td className="text-center py-2 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.HOME?.toFixed(1)}%</td>
                                                    <td className="text-center py-2 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.DRAW?.toFixed(1)}%</td>
                                                    <td className="text-center py-2 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.AWAY?.toFixed(1)}%</td>
                                                    <td className="text-center py-2 px-2">
                                                        <span className={`font-semibold ${pred.confidence >= 60 ? "text-emerald-400" : pred.confidence >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                            {pred.confidence.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                    {isFinished && (
                                                        <td className="text-center py-2 px-2">
                                                            <span
                                                                className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}
                                                                aria-label={pred.correct ? t("correct") : t("incorrect")}
                                                                role="img"
                                                            >
                                                                <span aria-hidden="true">{pred.correct ? "\u2713" : "\u2717"}</span>
                                                            </span>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
