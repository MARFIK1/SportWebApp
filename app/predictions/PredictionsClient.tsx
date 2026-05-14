"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { PredictionMatch, ModelPrediction, ConsensusPrediction } from "@/types/predictions";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import TeamLogo from "@/app/components/common/TeamLogo";

interface PredictionsClientProps {
    matches: PredictionMatch[];
    leagues: { dataPath: string; name: string; count: number }[];
    teamIds: Record<string, number>;
}

export default function PredictionsClient({ matches, leagues, teamIds }: PredictionsClientProps) {
    const { t } = useLanguage();
    const [selectedLeague, setSelectedLeague] = useState<string>("all");
    const [leagueMenuOpen, setLeagueMenuOpen] = useState(false);
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
    const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const pendingScrollMatch = useRef<string | null>(null);

    const filtered = selectedLeague === "all"
        ? matches
        : matches.filter((m) => `${m.comp_type}/${m.league}` === selectedLeague);
    const leagueOptions = [
        { dataPath: "all", name: t("all_leagues"), count: matches.length },
        ...leagues,
    ];
    const selectedLeagueOption = leagueOptions.find((league) => league.dataPath === selectedLeague) ?? leagueOptions[0];

    useEffect(() => {
        if (!expandedMatch || pendingScrollMatch.current !== expandedMatch) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            matchRefs.current[expandedMatch]?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
            pendingScrollMatch.current = null;
        });

        return () => window.cancelAnimationFrame(frame);
    }, [expandedMatch]);

    const toggleExpandedMatch = (matchId: string, isExpanded: boolean) => {
        if (isExpanded) {
            pendingScrollMatch.current = null;
            setExpandedMatch(null);
            return;
        }

        pendingScrollMatch.current = matchId;
        setExpandedMatch(matchId);
    };

    const outcomeLabel = (outcome: ModelPrediction["prediction"]) => {
        if (!outcome) return "-";
        if (outcome === "HOME") return t("home_short");
        if (outcome === "AWAY") return t("away_short");
        return t("draw_short");
    };

    return (
        <div className="min-w-0">
            <div className="mb-4 sm:hidden">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400" htmlFor="league-filter-button">
                    {t("all_leagues")}
                </label>
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-gray-900">
                    <button
                        id="league-filter-button"
                        type="button"
                        onClick={() => setLeagueMenuOpen((open) => !open)}
                        aria-expanded={leagueMenuOpen}
                        aria-controls="league-filter-options"
                        className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-3 text-left text-sm font-semibold text-gray-900 outline-none transition-colors focus:ring-2 focus:ring-inset focus:ring-emerald-500/40 dark:text-white"
                    >
                        <span className="min-w-0 truncate">
                            {selectedLeagueOption.name} ({selectedLeagueOption.count})
                        </span>
                        <ChevronDownIcon
                            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${leagueMenuOpen ? "rotate-180" : ""}`}
                            aria-hidden="true"
                        />
                    </button>

                    {leagueMenuOpen && (
                        <div id="league-filter-options" className="border-t border-gray-200 p-1 dark:border-white/10">
                            <div
                                className="scrollbar-app max-h-72 overflow-y-auto overscroll-contain"
                                data-header-scroll-ignore="true"
                                onTouchMove={(event) => event.stopPropagation()}
                                onTouchStart={(event) => event.stopPropagation()}
                                onWheel={(event) => event.stopPropagation()}
                            >
                                {leagueOptions.map((league) => {
                                    const selected = selectedLeague === league.dataPath;
                                    return (
                                        <button
                                            key={league.dataPath}
                                            type="button"
                                            onClick={() => {
                                                setSelectedLeague(league.dataPath);
                                                setExpandedMatch(null);
                                                setLeagueMenuOpen(false);
                                            }}
                                            className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                                                selected
                                                    ? "bg-emerald-600 text-white"
                                                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                                            }`}
                                        >
                                            <span className="min-w-0 truncate">{league.name}</span>
                                            <span className={`shrink-0 text-xs ${selected ? "text-white/80" : "text-gray-400 dark:text-gray-500"}`}>
                                                {league.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="scrollbar-app mb-4 hidden max-w-full items-center gap-2 overflow-x-auto pb-2 sm:flex">
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

            <div className="min-w-0 space-y-3">
                {filtered.map((match) => {
                    const consensus = match.predictions.consensus as ConsensusPrediction;
                    const isExpanded = expandedMatch === match.id;
                    const models = Object.entries(match.predictions).filter(([key]) => key !== "consensus") as [string, ModelPrediction][];
                    const isFinished = match.status === "finished";
                    const score = match.actual_score?.split("-").map((s) => s.trim());
                    const correct = consensus?.correct;

                    return (
                        <div
                            key={match.id}
                            ref={(element) => {
                                matchRefs.current[match.id] = element;
                            }}
                            className="min-w-0 scroll-mt-36 overflow-hidden rounded-xl bg-white dark:bg-gray-900/50 sm:scroll-mt-6"
                        >
                            <button
                                onClick={() => toggleExpandedMatch(match.id, isExpanded)}
                                aria-expanded={isExpanded}
                                aria-controls={`prediction-details-${match.id}`}
                                className="flex w-full flex-col gap-3 p-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 sm:flex-row sm:items-center sm:gap-5 sm:p-4"
                            >
                                <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-[420px] lg:w-[520px] lg:gap-4 2xl:w-[700px]">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {teamIds[match.home_team] && (
                                            <TeamLogo
                                                teamId={teamIds[match.home_team]}
                                                alt={match.home_team}
                                                size={24}
                                                className="h-6 w-6 shrink-0 object-contain"
                                            />
                                        )}
                                        <span className="min-w-0 truncate text-sm text-gray-900 dark:text-white">{match.home_team}</span>
                                    </div>
                                    {isFinished && score ? (
                                        <span className="rounded-lg bg-gray-100 px-2 py-1 text-sm font-bold text-gray-900 dark:bg-black/30 dark:text-white">{score[0]} - {score[1]}</span>
                                    ) : (
                                        <span className="px-1 text-sm text-gray-400 dark:text-gray-500">vs</span>
                                    )}
                                    <div className="flex min-w-0 items-center justify-end gap-2">
                                        <span className="min-w-0 truncate text-right text-sm text-gray-900 dark:text-white">{match.away_team}</span>
                                        {teamIds[match.away_team] && (
                                            <TeamLogo
                                                teamId={teamIds[match.away_team]}
                                                alt={match.away_team}
                                                size={24}
                                                className="h-6 w-6 shrink-0 object-contain"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:gap-4 xl:justify-end">
                                    {consensus && (
                                        <>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                consensus.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                consensus.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                "bg-yellow-600/30 text-yellow-400"
                                            }`}>
                                                {consensus.prediction}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 sm:text-xs">
                                                {consensus.agreement}
                                            </span>
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500 sm:text-xs">
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

                                <span className="self-end text-sm text-gray-400 dark:text-gray-500 sm:self-auto" aria-hidden="true">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                            </button>

                            {isExpanded && (
                                <div id={`prediction-details-${match.id}`} className="border-t border-gray-200 px-3 pb-4 pt-3 dark:border-white/10 sm:px-4">
                                    <div className="space-y-3 md:hidden">
                                        {models.map(([name, pred]) => (
                                            <div key={name} className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-gray-800/50">
                                                <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                                                    <span className="min-w-0 truncate text-sm font-black text-gray-900 dark:text-white">{name}</span>
                                                    <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${
                                                        pred.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                        pred.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                        "bg-yellow-600/30 text-yellow-400"
                                                    }`}>
                                                        {outcomeLabel(pred.prediction)}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-center min-[390px]:grid-cols-4">
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("home_pct")}</div>
                                                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pred.probabilities.HOME?.toFixed(1)}%</div>
                                                    </div>
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("draw_pct")}</div>
                                                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pred.probabilities.DRAW?.toFixed(1)}%</div>
                                                    </div>
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("away_pct")}</div>
                                                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pred.probabilities.AWAY?.toFixed(1)}%</div>
                                                    </div>
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("confidence")}</div>
                                                        <div className={`mt-1 text-sm font-bold ${(pred.confidence ?? 0) >= 60 ? "text-emerald-400" : (pred.confidence ?? 0) >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                            {pred.confidence !== null ? `${pred.confidence.toFixed(1)}%` : "-"}
                                                        </div>
                                                    </div>
                                                </div>
                                                {isFinished && pred.correct != null && (
                                                    <div className="mt-3 flex justify-end">
                                                        <span className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}>
                                                            {pred.correct ? "\u2713" : "\u2717"}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="scrollbar-app hidden max-w-full overflow-x-auto md:block">
                                    <table className="w-full min-w-[720px] text-sm">
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
                                                        <span className={`font-semibold ${(pred.confidence ?? 0) >= 60 ? "text-emerald-400" : (pred.confidence ?? 0) >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                            {pred.confidence !== null ? `${pred.confidence.toFixed(1)}%` : "-"}
                                                        </span>
                                                    </td>
                                                    {isFinished && (
                                                        <td className="text-center py-2 px-2">
                                                            {pred.correct != null && (
                                                                <span
                                                                    className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}
                                                                    aria-label={pred.correct ? t("correct") : t("incorrect")}
                                                                    role="img"
                                                                >
                                                                    <span aria-hidden="true">{pred.correct ? "\u2713" : "\u2717"}</span>
                                                                </span>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
