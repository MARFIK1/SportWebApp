"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import { useState } from "react";
import {
    ChartBarIcon,
    ClockIcon,
    PresentationChartLineIcon,
    Squares2X2Icon,
    UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useLanguage } from "@/app/components/common/LanguageProvider";

type MatchCenterTabKey = "overview" | "lineups" | "analysis" | "statistics" | "history";
type TabIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface MatchCenterTabsProps {
    overview?: ReactNode;
    lineups?: ReactNode;
    analysis?: ReactNode;
    statistics?: ReactNode;
    history?: ReactNode;
}

interface MatchCenterTab {
    key: MatchCenterTabKey;
    label: string;
    icon: TabIcon;
    content: ReactNode;
}

export default function MatchCenterTabs({
    overview,
    lineups,
    analysis,
    statistics,
    history,
}: MatchCenterTabsProps) {
    const { t } = useLanguage();
    const [activeKey, setActiveKey] = useState<MatchCenterTabKey>("overview");
    const candidates: Array<MatchCenterTab & { available: boolean }> = [
        {
            key: "overview",
            label: t("match_center_overview"),
            icon: Squares2X2Icon,
            content: overview,
            available: overview != null,
        },
        {
            key: "lineups",
            label: t("match_lineups"),
            icon: UserGroupIcon,
            content: lineups,
            available: lineups != null,
        },
        {
            key: "analysis",
            label: t("match_center_analysis"),
            icon: PresentationChartLineIcon,
            content: analysis,
            available: analysis != null,
        },
        {
            key: "statistics",
            label: t("match_statistics"),
            icon: ChartBarIcon,
            content: statistics,
            available: statistics != null,
        },
        {
            key: "history",
            label: t("match_center_history"),
            icon: ClockIcon,
            content: history,
            available: history != null,
        },
    ];
    const tabs = candidates.filter((tab): tab is MatchCenterTab & { available: true } => tab.available);
    const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

    if (!activeTab) return null;

    return (
        <section className="mt-6" aria-labelledby="match-center-title">
            <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">
                        {t("match_center")}
                    </p>
                    <h2 id="match-center-title" className="mt-1 text-lg font-black text-gray-900 dark:text-white sm:text-xl">
                        {activeTab.label}
                    </h2>
                </div>
                <span className="hidden text-xs font-semibold text-gray-500 dark:text-gray-400 sm:block">
                    {t("match_center_hint")}
                </span>
            </div>

            <div
                role="tablist"
                aria-label={t("match_center")}
                className="scrollbar-hide flex w-full gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-gray-900/70"
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = tab.key === activeTab.key;
                    return (
                        <button
                            key={tab.key}
                            id={`match-center-tab-${tab.key}`}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-controls={`match-center-panel-${tab.key}`}
                            onClick={() => setActiveKey(tab.key)}
                            className={`flex min-h-11 min-w-[132px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                                active
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                            }`}
                        >
                            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                            <span className="whitespace-nowrap">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            <div
                id={`match-center-panel-${activeTab.key}`}
                role="tabpanel"
                aria-labelledby={`match-center-tab-${activeTab.key}`}
                className="mt-5 min-w-0"
            >
                {activeTab.content}
            </div>
        </section>
    );
}
