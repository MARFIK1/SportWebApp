"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface LeagueAccuracy {
    correct: number;
    total: number;
}

interface LeagueSectionToggleProps {
    leagueName: string;
    slug: string;
    matchCount: number;
    statusText: string;
    accuracy: LeagueAccuracy | null;
    defaultOpen: boolean;
    labels: {
        matchesCount: string;
        accuracy: string;
        viewStandings: string;
        expandLeague: string;
        collapseLeague: string;
    };
    children: ReactNode;
}

export default function LeagueSectionToggle({
    leagueName,
    slug,
    matchCount,
    statusText,
    accuracy,
    defaultOpen,
    labels,
    children,
}: LeagueSectionToggleProps) {
    const [open, setOpen] = useState(defaultOpen);
    const toggleLabel = open ? labels.collapseLeague : labels.expandLeague;

    return (
        <section className="mb-6 rounded-3xl border border-gray-200 bg-white/40 p-3 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/20 dark:shadow-black/10 sm:mb-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="group flex min-w-0 flex-1 items-center gap-4 rounded-2xl px-1 py-1 text-left transition-colors hover:bg-gray-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-white/[0.03]"
                    aria-expanded={open}
                    aria-label={`${toggleLabel}: ${leagueName}`}
                >
                    <div className="h-12 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 via-emerald-500 to-cyan-400" />
                    <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <span className="min-w-0 max-w-full truncate text-lg font-bold text-gray-900 transition-colors group-hover:text-emerald-500 dark:text-white dark:group-hover:text-emerald-400 sm:text-xl">
                                {leagueName}
                            </span>
                            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                {matchCount} {labels.matchesCount}
                            </span>
                        </div>
                        <p className="text-xs uppercase tracking-[0.24em] text-gray-400 dark:text-gray-500">
                            {statusText}
                        </p>
                    </div>
                </button>

                <div className="flex items-center gap-2">
                    {accuracy && (
                        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/70 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{labels.accuracy}:</span>
                            <span className={`text-sm font-bold ${accuracy.correct / accuracy.total >= 0.5 ? "text-emerald-400" : "text-gray-700 dark:text-gray-300"}`}>
                                {accuracy.correct}/{accuracy.total}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({Math.round((accuracy.correct / accuracy.total) * 100)}%)
                            </span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:border-emerald-400/50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-emerald-500/40 dark:hover:text-white"
                        aria-expanded={open}
                        aria-label={`${toggleLabel}: ${leagueName}`}
                    >
                        {open ? <ChevronUpIcon className="h-5 w-5" aria-hidden="true" /> : <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />}
                    </button>
                    <Link
                        href={`/league/${slug}`}
                        prefetch={false}
                        className="hidden rounded-xl border border-emerald-500/20 px-3 py-2 text-center text-sm font-semibold text-emerald-500 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 sm:block"
                    >
                        {labels.viewStandings} {"\u2197"}
                    </Link>
                </div>
            </div>

            {open && <div className="mt-4">{children}</div>}
        </section>
    );
}
