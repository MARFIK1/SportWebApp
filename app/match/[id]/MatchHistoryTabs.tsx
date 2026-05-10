"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import { teamLogoUrl } from "@/app/util/urls";

export interface MatchHistoryItem {
    eventId: number;
    date: string;
    homeTeamId: number;
    homeTeam: string;
    awayTeamId: number;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
}

interface H2hStats {
    homeWins: number;
    draws: number;
    awayWins: number;
}

interface MatchHistoryTabsProps {
    homeTeam: string;
    awayTeam: string;
    homeTeamId: number;
    awayTeamId: number;
    h2h: MatchHistoryItem[];
    homeRecent: MatchHistoryItem[];
    awayRecent: MatchHistoryItem[];
    h2hStats: H2hStats;
}

type ActiveTab = "home" | "h2h" | "away";
type ResultMark = "W" | "D" | "L";

function scoreLabel(match: MatchHistoryItem): string {
    if (match.homeScore == null || match.awayScore == null) return "-";
    return `${match.homeScore} - ${match.awayScore}`;
}

function resultForTeam(match: MatchHistoryItem, teamId: number): ResultMark {
    if (match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) return "D";
    const teamIsHome = match.homeTeamId === teamId;
    const homeWon = match.homeScore > match.awayScore;
    return teamIsHome === homeWon ? "W" : "L";
}

function recordForTeam(matches: MatchHistoryItem[], teamId: number) {
    return matches.reduce(
        (record, match) => {
            const result = resultForTeam(match, teamId);
            if (result === "W") record.wins += 1;
            else if (result === "D") record.draws += 1;
            else record.losses += 1;
            return record;
        },
        { wins: 0, draws: 0, losses: 0 }
    );
}

function resultClass(result: ResultMark): string {
    if (result === "W") return "bg-emerald-500/15 text-emerald-300";
    if (result === "D") return "bg-gray-500/20 text-gray-200";
    return "bg-red-500/15 text-red-300";
}

function TeamCell({ id, name, align = "left" }: { id: number; name: string; align?: "left" | "right" }) {
    return (
        <div className={`grid min-w-0 items-center gap-2 ${align === "right" ? "grid-cols-[minmax(0,1fr)_22px] text-right" : "grid-cols-[22px_minmax(0,1fr)]"}`}>
            {align === "right" ? (
                <>
                    <span className="min-w-0 break-words text-sm font-bold leading-tight text-gray-900 dark:text-white">{name}</span>
                    <Image src={teamLogoUrl(id)} alt={name} width={22} height={22} className="h-[22px] w-[22px] object-contain" />
                </>
            ) : (
                <>
                    <Image src={teamLogoUrl(id)} alt={name} width={22} height={22} className="h-[22px] w-[22px] object-contain" />
                    <span className="min-w-0 break-words text-sm font-bold leading-tight text-gray-900 dark:text-white">{name}</span>
                </>
            )}
        </div>
    );
}

function MobileTeamBlock({ id, name }: { id: number; name: string }) {
    return (
        <div className="flex min-w-0 flex-col items-center text-center">
            <div className="flex h-8 items-center justify-center">
                <Image src={teamLogoUrl(id)} alt={name} width={28} height={28} className="h-7 w-7 object-contain" />
            </div>
            <span className="mt-2 block min-h-10 min-w-0 max-w-full line-clamp-2 break-words text-sm font-black leading-tight text-gray-900 dark:text-white">
                {name}
            </span>
        </div>
    );
}

function SummaryCard({ value, label, tone }: { value: number; label: string; tone: "home" | "draw" | "away" | "loss" }) {
    const valueClass =
        tone === "home" ? "text-emerald-400" :
        tone === "away" ? "text-blue-400" :
        tone === "loss" ? "text-red-400" :
        "text-gray-300";

    return (
        <div className="flex min-h-[78px] flex-col items-center justify-center rounded-2xl bg-gray-50 p-4 text-center dark:bg-gray-800/50">
            <div className={`text-2xl font-black ${valueClass}`}>{value}</div>
            <div className="mt-1 max-w-full break-words text-xs leading-tight text-gray-500 dark:text-gray-400">{label}</div>
        </div>
    );
}

function MobileHistoryCard({
    historyMatch,
    result,
}: {
    historyMatch: MatchHistoryItem;
    result: ResultMark | null;
}) {
    return (
        <Link
            href={`/match/${historyMatch.eventId}?date=${historyMatch.date.slice(0, 10)}`}
            prefetch={false}
            className="block rounded-xl bg-gray-50 px-3 py-3 transition-colors hover:bg-gray-100 dark:bg-gray-800/40 dark:hover:bg-gray-800/70 sm:hidden"
        >
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{historyMatch.date.slice(0, 10)}</span>
                {result && (
                    <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-black ${resultClass(result)}`}>
                        {result}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_minmax(0,1fr)] items-center gap-2">
                <MobileTeamBlock id={historyMatch.homeTeamId} name={historyMatch.homeTeam} />
                <span className="rounded-lg bg-white px-2 py-1.5 text-center text-base font-black text-gray-900 shadow-sm dark:bg-gray-950/70 dark:text-white">
                    {scoreLabel(historyMatch)}
                </span>
                <MobileTeamBlock id={historyMatch.awayTeamId} name={historyMatch.awayTeam} />
            </div>
        </Link>
    );
}

export default function MatchHistoryTabs({
    homeTeam,
    awayTeam,
    homeTeamId,
    awayTeamId,
    h2h,
    homeRecent,
    awayRecent,
    h2hStats,
}: MatchHistoryTabsProps) {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<ActiveTab>("h2h");

    const activeData = useMemo(() => {
        if (activeTab === "home") {
            return {
                title: `${homeTeam} - ${t("recent_results")}`,
                matches: homeRecent,
                teamId: homeTeamId,
                record: recordForTeam(homeRecent, homeTeamId),
            };
        }
        if (activeTab === "away") {
            return {
                title: `${awayTeam} - ${t("recent_results")}`,
                matches: awayRecent,
                teamId: awayTeamId,
                record: recordForTeam(awayRecent, awayTeamId),
            };
        }
        return {
            title: t("head_to_head"),
            matches: h2h,
            teamId: null,
            record: {
                wins: h2hStats.homeWins,
                draws: h2hStats.draws,
                losses: h2hStats.awayWins,
            },
        };
    }, [activeTab, awayRecent, awayTeam, awayTeamId, h2h, h2hStats, homeRecent, homeTeam, homeTeamId, t]);

    const tabs: { key: ActiveTab; label: string; logo?: number }[] = [
        { key: "home", label: homeTeam, logo: homeTeamId },
        { key: "h2h", label: t("direct_duels") },
        { key: "away", label: awayTeam, logo: awayTeamId },
    ];

    if (h2h.length === 0 && homeRecent.length === 0 && awayRecent.length === 0) return null;

    return (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900/50 sm:p-6">
            <div className="mb-5 space-y-4">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{t("match_history")}</p>
                    <h3 className="mt-1 break-words text-lg font-black text-gray-900 dark:text-white sm:text-xl">{activeData.title}</h3>
                </div>
                <div className="grid w-full min-w-0 gap-2 sm:grid-cols-3">
                    {tabs.map((tab) => {
                        const active = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition-colors ${
                                    active
                                        ? "border-emerald-500/60 bg-emerald-500/15 text-gray-900 dark:text-white"
                                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-emerald-500/40 dark:border-white/10 dark:bg-gray-800/40 dark:text-gray-300"
                                }`}
                                aria-pressed={active}
                            >
                                {tab.logo ? (
                                    <Image src={teamLogoUrl(tab.logo)} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
                                ) : (
                                    <span className="rounded-full border border-emerald-400/60 px-2 py-1 text-[11px] font-black text-emerald-300">VS</span>
                                )}
                                <span className="min-w-0 break-words text-center leading-tight">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                {activeTab === "h2h" ? (
                    <>
                        <SummaryCard value={h2hStats.homeWins} label={homeTeam} tone="home" />
                        <SummaryCard value={h2hStats.draws} label={t("draws")} tone="draw" />
                        <SummaryCard value={h2hStats.awayWins} label={awayTeam} tone="away" />
                    </>
                ) : (
                    <>
                        <SummaryCard value={activeData.record.wins} label={t("wins")} tone="home" />
                        <SummaryCard value={activeData.record.draws} label={t("draws")} tone="draw" />
                        <SummaryCard value={activeData.record.losses} label={t("losses")} tone="loss" />
                    </>
                )}
            </div>

            <div className="space-y-2">
                {activeData.matches.map((historyMatch) => {
                    const result = activeData.teamId == null ? null : resultForTeam(historyMatch, activeData.teamId);
                    return (
                        <div key={historyMatch.eventId}>
                            <MobileHistoryCard historyMatch={historyMatch} result={result} />
                            <Link
                                href={`/match/${historyMatch.eventId}?date=${historyMatch.date.slice(0, 10)}`}
                                prefetch={false}
                                className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_82px] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 sm:grid"
                            >
                                <TeamCell id={historyMatch.homeTeamId} name={historyMatch.homeTeam} />
                                <div className="flex items-center justify-center gap-2">
                                    {result && (
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${resultClass(result)}`}>
                                            {result}
                                        </span>
                                    )}
                                    <span className="rounded-lg bg-gray-100 px-3 py-1 text-base font-black text-gray-900 dark:bg-gray-950/70 dark:text-white">
                                        {scoreLabel(historyMatch)}
                                    </span>
                                </div>
                                <TeamCell id={historyMatch.awayTeamId} name={historyMatch.awayTeam} align="right" />
                                <span className="text-right text-xs text-gray-500 dark:text-gray-400">{historyMatch.date.slice(0, 10)}</span>
                            </Link>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
