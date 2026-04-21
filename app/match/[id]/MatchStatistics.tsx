"use client";
import { useState } from "react";
import { useLanguage } from "@/app/components/common/LanguageProvider";

interface StatItem {
    type: string;
    homeValue: number;
    awayValue: number;
}

const PRIMARY_STATS = [
    "Ball Possession",
    "Total Shots",
    "Shots on Goal",
    "Corner Kicks",
    "Fouls",
    "Expected Goals (xG)",
];

const STAT_LABEL_KEYS: Record<string, string> = {
    "Ball Possession": "ball_possession",
    "Expected Goals (xG)": "expected_goals",
    "Total Shots": "total_shots",
    "Shots on Goal": "shots_on_goal",
    "Shots off Goal": "shots_off_goal",
    "Blocked Shots": "blocked_shots",
    "Corner Kicks": "corner_kicks",
    Fouls: "fouls",
    "Yellow Cards": "yellow_cards",
    "Goalkeeper Saves": "goalkeeper_saves",
    "Total Passes": "total_passes",
    "Accurate Passes": "accurate_passes",
    Tackles: "tackles",
};

export default function MatchStatistics({ stats }: { stats: StatItem[] }) {
    const { t } = useLanguage();
    const [showAll, setShowAll] = useState(false);

    const primary = stats.filter((s) => PRIMARY_STATS.includes(s.type));
    const secondary = stats.filter((s) => !PRIMARY_STATS.includes(s.type));
    const visible = showAll ? [...primary, ...secondary] : primary;

    return (
        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("match_statistics")}</h3>
            <div className="space-y-5">
                {visible.map((stat) => {
                    const total = stat.homeValue + stat.awayValue;
                    const homePct = total > 0 ? (stat.homeValue / total) * 100 : 50;
                    const isPossession = stat.type === "Ball Possession";
                    const statLabel = t(STAT_LABEL_KEYS[stat.type] ?? stat.type);

                    return (
                        <div key={stat.type}>
                            <div className="flex justify-between text-sm mb-2">
                                <span className={`font-semibold ${stat.homeValue > stat.awayValue ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                                    {isPossession ? `${stat.homeValue}%` : stat.homeValue}
                                </span>
                                <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wider">{statLabel}</span>
                                <span className={`font-semibold ${stat.awayValue > stat.homeValue ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                                    {isPossession ? `${stat.awayValue}%` : stat.awayValue}
                                </span>
                            </div>
                            <div className="flex gap-1 h-2">
                                <div className="flex-1 flex justify-end rounded-l-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    <div
                                        className={`h-full rounded-l-full ${stat.homeValue >= stat.awayValue ? "bg-emerald-500" : "bg-gray-600"}`}
                                        style={{ width: `${homePct}%` }}
                                    />
                                </div>
                                <div className="flex-1 flex rounded-r-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    <div
                                        className={`h-full rounded-r-full ${stat.awayValue >= stat.homeValue ? "bg-emerald-500" : "bg-gray-600"}`}
                                        style={{ width: `${100 - homePct}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {secondary.length > 0 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                    {showAll ? t("show_less") : `${t("show_all")} (${stats.length})`}
                </button>
            )}
        </div>
    );
}
