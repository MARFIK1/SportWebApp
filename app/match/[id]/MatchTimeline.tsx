"use client";

import { useMemo, useState } from "react";
import {
    ArrowsRightLeftIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import type { MatchEventSnapshot, MatchTimelineEvent } from "@/types/matchEvents";

interface MatchTimelineProps {
    snapshot: MatchEventSnapshot;
    homeTeam: string;
    awayTeam: string;
}

function eventOrder(event: MatchTimelineEvent): number {
    return (event.minute ?? -1) * 100 + (event.added_time ?? 0);
}

function eventClass(event: MatchTimelineEvent): string {
    return (event.source_class ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDisplayableEvent(event: MatchTimelineEvent): boolean {
    if (event.type !== "unknown") return true;
    return Boolean(event.player?.name || event.text || event.reason);
}

export function visibleTimelineEvents(
    events: MatchTimelineEvent[],
    showSubstitutions: boolean,
): MatchTimelineEvent[] {
    return events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => isDisplayableEvent(event))
        .filter(({ event }) => showSubstitutions || event.type !== "substitution")
        .sort((left, right) => eventOrder(right.event) - eventOrder(left.event) || right.index - left.index)
        .map(({ event }) => event);
}

export function timelineMinuteLabel(event: MatchTimelineEvent): string {
    if (event.minute == null) return "";
    return event.added_time
        ? `${event.minute}+${event.added_time}'`
        : `${event.minute}'`;
}

function EventMarker({ event }: { event: MatchTimelineEvent }) {
    const sourceClass = eventClass(event);

    if (event.type === "card") {
        const isRed = sourceClass.includes("red");
        return (
            <span
                aria-hidden="true"
                className={`h-4 w-2.5 rounded-[2px] shadow-sm ${isRed ? "bg-red-500" : "bg-amber-400"}`}
            />
        );
    }
    if (event.type === "substitution") {
        return <ArrowsRightLeftIcon aria-hidden="true" className="h-4 w-4 text-emerald-400" />;
    }
    if (event.type === "var") {
        return <VideoCameraIcon aria-hidden="true" className="h-4 w-4 text-sky-400" />;
    }

    const marker = event.type === "goal"
        ? "G"
        : event.type === "shootout"
            ? "P"
            : event.type === "injury_time"
                ? "+"
                : "i";
    return (
        <span
            aria-hidden="true"
            className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-black ${
                event.type === "goal"
                    ? "border-emerald-400 bg-emerald-400/15 text-emerald-300"
                    : "border-gray-600 bg-gray-800 text-gray-300"
            }`}
        >
            {marker}
        </span>
    );
}

function eventLabel(event: MatchTimelineEvent, t: (key: string) => string): string {
    const sourceClass = eventClass(event);

    if (event.type === "goal") {
        if (sourceClass.includes("missed")) return t("missed_penalty");
        if (sourceClass.includes("own")) return t("own_goal");
        if (sourceClass.includes("penalty")) return t("penalty_goal");
        return t("goal");
    }
    if (event.type === "card") {
        return sourceClass.includes("red") ? t("red_card") : t("yellow_card");
    }
    if (event.type === "substitution") return t("substitution");
    if (event.type === "var") return t("var_decision");
    if (event.type === "shootout") return t("penalty_shootout");
    if (event.type === "injury_time") return t("additional_time");
    return event.text || event.reason || event.source_type;
}

function EventDetails({
    event,
    align,
}: {
    event: MatchTimelineEvent;
    align: "left" | "right";
}) {
    const { t } = useLanguage();
    const primaryName = event.type === "substitution"
        ? event.player_in?.short_name ?? event.player_in?.name
        : event.player?.short_name ?? event.player?.name;
    const secondaryName = event.type === "substitution"
        ? event.player_out?.short_name ?? event.player_out?.name
        : event.assist?.short_name ?? event.assist?.name;
    const label = eventLabel(event, t);
    const score = event.home_score != null && event.away_score != null
        ? `${event.home_score}-${event.away_score}`
        : null;

    return (
        <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
            <div className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}>
                {score && (
                    <span className="shrink-0 rounded border border-gray-700 bg-gray-950/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {score}
                    </span>
                )}
                <span className="min-w-0 break-words text-xs font-semibold text-gray-100 sm:text-sm">
                    {primaryName || label}
                </span>
            </div>
            {primaryName && (
                <p className="mt-0.5 text-[10px] font-medium uppercase text-gray-500">
                    {label}
                </p>
            )}
            {secondaryName && (
                <p className="mt-0.5 break-words text-[11px] text-gray-400">
                    {event.type === "substitution" ? `${t("player_out")}: ${secondaryName}` : `${t("assist")}: ${secondaryName}`}
                </p>
            )}
            {event.reason && event.reason !== label && (
                <p className="mt-0.5 break-words text-[11px] text-gray-500">{event.reason}</p>
            )}
        </div>
    );
}

function SystemEvent({ event }: { event: MatchTimelineEvent }) {
    const { t } = useLanguage();
    const label = event.type === "injury_time" && event.length
        ? `${t("additional_time")} +${event.length}'`
        : eventLabel(event, t);

    return (
        <li className="flex items-center gap-3 py-3">
            <span className="h-px flex-1 bg-gray-800" />
            <span className="flex max-w-[75%] items-center gap-2 text-center text-[10px] font-bold uppercase text-gray-500">
                <EventMarker event={event} />
                {timelineMinuteLabel(event)} {label}
            </span>
            <span className="h-px flex-1 bg-gray-800" />
        </li>
    );
}

export default function MatchTimeline({ snapshot, homeTeam, awayTeam }: MatchTimelineProps) {
    const { t } = useLanguage();
    const [showSubstitutions, setShowSubstitutions] = useState(false);
    const hasSubstitutions = snapshot.events.some((event) => event.type === "substitution");
    const visibleEvents = useMemo(
        () => visibleTimelineEvents(snapshot.events, showSubstitutions),
        [showSubstitutions, snapshot.events],
    );

    if (visibleEvents.length === 0 && !hasSubstitutions) return null;

    const isLive = snapshot.status === "inprogress";

    return (
        <section className="mb-6 overflow-hidden rounded-2xl border border-gray-800 bg-white dark:bg-gray-900/50">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-4 sm:px-6">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                        {t("match_timeline")}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">{t("match_timeline_hint")}</p>
                </div>
                {isLive && (
                    <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-300">
                        {t("live")}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] gap-2 border-b border-gray-800 px-4 py-2 text-[10px] font-bold uppercase text-gray-500 sm:px-6">
                <span className="truncate text-right" title={homeTeam}>{homeTeam}</span>
                <span className="text-center">{t("minute_short")}</span>
                <span className="truncate text-left" title={awayTeam}>{awayTeam}</span>
            </div>

            <ol className="divide-y divide-gray-800/80 px-4 sm:px-6">
                {visibleEvents.map((event) => {
                    if (event.is_home == null) {
                        return <SystemEvent key={event.id} event={event} />;
                    }

                    return (
                        <li
                            key={event.id}
                            className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center gap-2 py-3"
                        >
                            <div>{event.is_home && <EventDetails event={event} align="right" />}</div>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold tabular-nums text-gray-400">
                                    {timelineMinuteLabel(event)}
                                </span>
                                <EventMarker event={event} />
                            </div>
                            <div>{!event.is_home && <EventDetails event={event} align="left" />}</div>
                        </li>
                    );
                })}
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 px-4 py-3 sm:px-6">
                <p className="text-[10px] text-gray-500">
                    {t("timeline_snapshot")}: {snapshot.updated_at}
                </p>
                {hasSubstitutions && (
                    <button
                        type="button"
                        onClick={() => setShowSubstitutions((visible) => !visible)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
                    >
                        {showSubstitutions ? t("hide_substitutions") : t("show_substitutions")}
                        {showSubstitutions
                            ? <ChevronUpIcon aria-hidden="true" className="h-4 w-4" />
                            : <ChevronDownIcon aria-hidden="true" className="h-4 w-4" />}
                    </button>
                )}
            </div>
        </section>
    );
}

