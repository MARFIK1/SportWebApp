import Image from "next/image";
import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import { resolveSofascoreMatchResult, type ResolvedMatchResult } from "@/app/util/predictions/matchResult";
import {
    candidatePairForWinnerPlaceholder,
    formatWorldCupSlotCandidatePair,
    type WorldCupSlotCandidatePair,
} from "@/app/util/predictions/worldCupSlotResolver";
import type { SofascoreMatch } from "@/types/sofascore";
import type { PredictionMatch } from "@/types/predictions";
import type { TournamentFormat } from "./bracketConfig";

const TEAM_RADIUS = 470;
const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;
const TWO_PI = Math.PI * 2;
const PLACEHOLDER_TEAM_RE = /^(?:[12][A-Z]|[GH][12]|[WL]\d+|3[A-Z](?:\/3[A-Z])+)$/;
const CREST_IMAGE_CLASS = "block h-full w-full rounded-full object-cover object-center";

function isPlaceholderTeam(name: string): boolean {
    return !name || PLACEHOLDER_TEAM_RE.test(name.trim());
}

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
}

function buildParentMap(children: Record<number, [number, number]>): Record<number, number> {
    const parentOf: Record<number, number> = {};
    for (const [parent, kids] of Object.entries(children)) {
        for (const kid of kids) parentOf[kid] = Number(parent);
    }
    return parentOf;
}

interface Interval {
    s: number;
    e: number;
}

function buildIntervals(format: TournamentFormat): Map<number, Interval> {
    const map = new Map<number, Interval>();
    const recurse = (slot: number, s: number, e: number) => {
        map.set(slot, { s, e });
        const kids = format.children[slot];
        if (!kids) return;
        const mid = (s + e) / 2;
        recurse(kids[0], s, mid);
        recurse(kids[1], mid, e);
    };
    recurse(format.finalSlot, 0, format.leafTeamSlots);
    return map;
}

function slotAngle(format: TournamentFormat, slot: number): number {
    return -Math.PI / 2 + (slot / format.leafTeamSlots) * TWO_PI;
}

function polar(radius: number, angle: number): { x: number; y: number } {
    return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function stageOfSlot(format: TournamentFormat, slot: number) {
    return format.stageBySlot[slot];
}

function nodePosition(format: TournamentFormat, slot: number, interval: Interval): { x: number; y: number } {
    const stage = stageOfSlot(format, slot);
    const radius = stage ? format.stageRadii[stage] ?? 0 : 0;
    return polar(radius, slotAngle(format, (interval.s + interval.e) / 2));
}

function pct(value: number): string {
    return `${(value / VIEWBOX) * 100}%`;
}

function scoreLabel(state: ResolvedMatchResult, t: (key: string) => string, sideOrder: [MatchSide, MatchSide] = ["HOME", "AWAY"]): string | null {
    if (!state.regularScore) return null;
    const regularScores = {
        HOME: state.regularScore.home,
        AWAY: state.regularScore.away,
    };
    const base = `${regularScores[sideOrder[0]]}-${regularScores[sideOrder[1]]}`;
    if (state.penaltyScore) {
        const penaltyScores = {
            HOME: state.penaltyScore.home,
            AWAY: state.penaltyScore.away,
        };
        return `${base} \u00b7 ${t("penalties")} ${penaltyScores[sideOrder[0]]}-${penaltyScores[sideOrder[1]]}`;
    }
    if (state.wentToExtraTime) return `${base} AET`;
    return base;
}

interface Side {
    teamId: number;
    teamName: string;
    isPlaceholder: boolean;
}

type MatchSide = "HOME" | "AWAY";

interface TeamCrestProps {
    side: Side;
    dim: boolean;
    highlight: "none" | "winner" | "current";
    size?: number;
    candidatePair?: WorldCupSlotCandidatePair | null;
}

interface WorldCupBracketProps {
    format: TournamentFormat;
    matches: SofascoreMatch[];
    slotByEventId: Map<number, number>;
    predictionsByEventId: Map<number, PredictionMatch>;
    candidatePairs: Map<number, WorldCupSlotCandidatePair>;
    currentMatchId: number;
    t: (key: string) => string;
}

function sidesOf(match: SofascoreMatch | undefined): { home: Side; away: Side } {
    if (!match) {
        const unknown: Side = { teamId: 0, teamName: "", isPlaceholder: true };
        return { home: unknown, away: unknown };
    }
    return {
        home: { teamId: match.home_team_id, teamName: match.home_team, isPlaceholder: isPlaceholderTeam(match.home_team) },
        away: { teamId: match.away_team_id, teamName: match.away_team, isPlaceholder: isPlaceholderTeam(match.away_team) },
    };
}

function displaySideName(side: Side, candidatePair: WorldCupSlotCandidatePair | null, t: (key: string) => string): string {
    if (candidatePair) return formatWorldCupSlotCandidatePair(candidatePair, " / ");
    return side.isPlaceholder ? t("to_be_decided") : side.teamName;
}

function sameTeam(left: Pick<Side, "teamId" | "teamName">, right: Pick<Side, "teamId" | "teamName">): boolean {
    if (validTeamId(left.teamId) && validTeamId(right.teamId) && left.teamId === right.teamId) return true;
    const leftName = left.teamName.trim().toLowerCase();
    const rightName = right.teamName.trim().toLowerCase();
    return leftName !== "" && leftName === rightName;
}

function sourcePositionForSide(format: TournamentFormat, slot: number, target: Pick<Side, "teamId" | "teamName">, intervals: Map<number, Interval>, matchesBySlot: Map<number, SofascoreMatch>): { x: number; y: number } | null {
    const interval = intervals.get(slot);
    if (!interval) return null;

    const kids = format.children[slot];
    if (kids) {
        for (const kid of kids) {
            const hit = sourcePositionForSide(format, kid, target, intervals, matchesBySlot);
            if (hit) return hit;
        }
    } else {
        const match = matchesBySlot.get(slot);
        const { home, away } = sidesOf(match);
        if (sameTeam(home, target)) return polar(TEAM_RADIUS, slotAngle(format, interval.s + 0.5));
        if (sameTeam(away, target)) return polar(TEAM_RADIUS, slotAngle(format, interval.s + 1.5));
    }

    const match = matchesBySlot.get(slot);
    if (!match) return null;
    const { home, away } = sidesOf(match);
    if (sameTeam(home, target) || sameTeam(away, target)) return nodePosition(format, slot, interval);
    return null;
}

function sourcePositionForRenderSide<TRenderSide extends { side: Side; candidatePair: WorldCupSlotCandidatePair | null }>(format: TournamentFormat, parentSlot: number, renderSide: TRenderSide, intervals: Map<number, Interval>, matchesBySlot: Map<number, SofascoreMatch>): { x: number; y: number } | null {
    const childSlots = format.children[parentSlot];
    if (!childSlots) return null;

    const target = renderSide.candidatePair?.winner ?? renderSide.side;
    for (const childSlot of childSlots) {
        const hit = sourcePositionForSide(format, childSlot, target, intervals, matchesBySlot);
        if (hit) return hit;
    }
    return null;
}

function orderRadialPairSides<TRenderSide extends { side: Side; candidatePair: WorldCupSlotCandidatePair | null }>(format: TournamentFormat, parentSlot: number, sides: TRenderSide[], intervals: Map<number, Interval>, matchesBySlot: Map<number, SofascoreMatch>): TRenderSide[] {
    if (sides.length !== 2) return sides;

    const positioned = sides.map((side) => ({
        side,
        position: sourcePositionForRenderSide(format, parentSlot, side, intervals, matchesBySlot),
    }));
    if (positioned.some((item) => item.position == null)) return sides;

    return positioned
        .sort((left, right) => {
            if (!left.position || !right.position) return 0;
            const xDelta = left.position.x - right.position.x;
            if (Math.abs(xDelta) > 0.5) return xDelta;
            return left.position.y - right.position.y;
        })
        .map((item) => item.side);
}

function TeamCrest({ side, dim, highlight, size = 32, candidatePair = null }: TeamCrestProps) {
    const ring =
        highlight === "current"
            ? "border-amber-400 ring-2 ring-amber-400/40"
            : highlight === "winner"
                ? "border-emerald-400/80"
                : "border-white/15";
    return (
        <div
            className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border bg-gray-950/80 p-[10%] shadow-md transition ${ring} ${dim ? "opacity-60 saturate-50" : ""}`}
        >
            {candidatePair?.winner ? (
                <TeamLogo
                    teamId={candidatePair.winner.teamId}
                    alt={candidatePair.winner.teamName}
                    size={size}
                    className={CREST_IMAGE_CLASS}
                />
            ) : candidatePair ? (
                <span className="flex h-full w-full items-center justify-center -space-x-1">
                    <span className="flex h-[78%] w-[78%] items-center justify-center overflow-hidden rounded-full bg-gray-950/80 p-[4%]">
                        <TeamLogo teamId={candidatePair.home.teamId} alt={candidatePair.home.teamName} size={size} className={CREST_IMAGE_CLASS} />
                    </span>
                    <span className="flex h-[78%] w-[78%] items-center justify-center overflow-hidden rounded-full bg-gray-950/80 p-[4%]">
                        <TeamLogo teamId={candidatePair.away.teamId} alt={candidatePair.away.teamName} size={size} className={CREST_IMAGE_CLASS} />
                    </span>
                </span>
            ) : validTeamId(side.teamId) && !side.isPlaceholder ? (
                <TeamLogo
                    teamId={side.teamId}
                    alt={side.teamName}
                    size={size}
                    className={CREST_IMAGE_CLASS}
                />
            ) : (
                <span className="text-[9px] font-black text-gray-500">?</span>
            )}
        </div>
    );
}

export default function WorldCupBracket({ format, matches, slotByEventId, predictionsByEventId, candidatePairs, currentMatchId, t }: WorldCupBracketProps) {
    const byNumber = new Map<number, SofascoreMatch>();
    for (const match of matches) {
        const slot = slotByEventId.get(match.event_id);
        if (slot != null) byNumber.set(slot, match);
    }
    const intervals = buildIntervals(format);
    const parentOf = buildParentMap(format.children);

    const resultOf = (match: SofascoreMatch): ResolvedMatchResult =>
        resolveSofascoreMatchResult(match, predictionsByEventId.get(match.event_id) ?? null);

    let currentNumber: number | null = null;
    for (const [num, match] of byNumber) {
        if (match.event_id === currentMatchId) {
            currentNumber = num;
            break;
        }
    }

    const pathNumbers = new Set<number>();
    if (currentNumber != null) {
        let cursor: number | undefined = currentNumber;
        while (cursor != null) {
            pathNumbers.add(cursor);
            cursor = parentOf[cursor];
        }
    }

    const entryNumbers = new Set<number>();
    const entryLeafSides = new Map<number, Set<MatchSide>>();

    const markLeafSide = (slot: number, side: MatchSide) => {
        const sides = entryLeafSides.get(slot) ?? new Set<MatchSide>();
        sides.add(side);
        entryLeafSides.set(slot, sides);
    };

    const collectEntryPath = (slot: number) => {
        entryNumbers.add(slot);
        const kids = format.children[slot];
        if (!kids) {
            const match = byNumber.get(slot);
            const state = match ? resultOf(match) : null;
            if (state?.isFinished && state.actualResult === "HOME") {
                markLeafSide(slot, "HOME");
            } else if (state?.isFinished && state.actualResult === "AWAY") {
                markLeafSide(slot, "AWAY");
            } else {
                markLeafSide(slot, "HOME");
                markLeafSide(slot, "AWAY");
            }
            return;
        }

        const match = byNumber.get(slot);
        const state = match ? resultOf(match) : null;
        if (state?.isFinished && state.actualResult === "HOME") {
            collectEntryPath(kids[0]);
        } else if (state?.isFinished && state.actualResult === "AWAY") {
            collectEntryPath(kids[1]);
        } else {
            collectEntryPath(kids[0]);
            collectEntryPath(kids[1]);
        }
    };

    if (currentNumber != null) {
        entryNumbers.add(currentNumber);
        const kids = format.children[currentNumber];
        if (kids) {
            collectEntryPath(kids[0]);
            collectEntryPath(kids[1]);
        } else {
            collectEntryPath(currentNumber);
        }
    }

    const leafNumbers = Array.from(intervals.keys()).filter((slot) => stageOfSlot(format, slot) === format.leafStage);
    if (leafNumbers.length === 0) return null;

    interface Segment {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        onPath: boolean;
    }
    const segments: Segment[] = [];

    for (const [num, interval] of intervals) {
        const kids = format.children[num];
        const parentPos = nodePosition(format, num, interval);
        if (kids) {
            for (const kid of kids) {
                const kidInterval = intervals.get(kid);
                if (!kidInterval) continue;
                const kidPos = nodePosition(format, kid, kidInterval);
                segments.push({
                    x1: kidPos.x,
                    y1: kidPos.y,
                    x2: parentPos.x,
                    y2: parentPos.y,
                    onPath: (pathNumbers.has(num) && pathNumbers.has(kid)) || (entryNumbers.has(num) && entryNumbers.has(kid)),
                });
            }
        } else {
            const home = polar(TEAM_RADIUS, slotAngle(format, interval.s + 0.5));
            const away = polar(TEAM_RADIUS, slotAngle(format, interval.s + 1.5));
            const entrySides = entryLeafSides.get(num);
            const homeOnPath = Boolean(entrySides?.has("HOME"));
            const awayOnPath = Boolean(entrySides?.has("AWAY"));
            segments.push({ x1: home.x, y1: home.y, x2: parentPos.x, y2: parentPos.y, onPath: homeOnPath });
            segments.push({ x1: away.x, y1: away.y, x2: parentPos.x, y2: parentPos.y, onPath: awayOnPath });
        }
    }

    const guideRadii = format.treeStages
        .filter((stage) => stage !== format.leafStage && stage !== "FINAL")
        .map((stage) => format.stageRadii[stage])
        .filter((radius): radius is number => typeof radius === "number" && radius > 0);

    const finalMatch = byNumber.get(format.finalSlot);
    const finalState = finalMatch ? resultOf(finalMatch) : null;
    const finalSides = sidesOf(finalMatch);
    const champion =
        finalState?.isFinished && finalState.actualResult
            ? finalState.actualResult === "HOME"
                ? finalSides.home
                : finalState.actualResult === "AWAY"
                    ? finalSides.away
                    : null
            : null;

    return (
        <div className="relative mx-auto w-full max-w-[860px]">
            <div className="relative aspect-square w-full">
                <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="absolute inset-0 h-full w-full">
                    <defs>
                        <radialGradient id="wc-core" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(251,191,36,0.25)" />
                            <stop offset="55%" stopColor="rgba(251,191,36,0.06)" />
                            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
                        </radialGradient>
                    </defs>
                    <circle cx={CENTER} cy={CENTER} r={TEAM_RADIUS - 6} fill="url(#wc-core)" />
                    {guideRadii.map((r) => (
                        <circle key={r} cx={CENTER} cy={CENTER} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                    ))}
                    {segments
                        .filter((seg) => !seg.onPath)
                        .map((seg, index) => (
                            <line
                                key={`base-${index}`}
                                x1={seg.x1}
                                y1={seg.y1}
                                x2={seg.x2}
                                y2={seg.y2}
                                stroke="rgba(255,255,255,0.12)"
                                strokeWidth={2}
                            />
                        ))}
                    {segments
                        .filter((seg) => seg.onPath)
                        .map((seg, index) => (
                            <line
                                key={`path-${index}`}
                                x1={seg.x1}
                                y1={seg.y1}
                                x2={seg.x2}
                                y2={seg.y2}
                                stroke="rgba(52,211,153,0.9)"
                                strokeWidth={3.5}
                            />
                        ))}
                </svg>

                {leafNumbers.flatMap((num) => {
                    const interval = intervals.get(num);
                    if (!interval) return [];
                    const match = byNumber.get(num);
                    const state = match ? resultOf(match) : null;
                    const { home, away } = sidesOf(match);
                    const winner = state?.isFinished ? state.actualResult : null;
                    const isCurrent = currentNumber === num;
                    const href = match ? `/match/${match.event_id}?date=${match.date.slice(0, 10)}` : null;

                    return [
                        { side: home, slot: interval.s + 0.5, isWinner: winner === "HOME", isLoser: winner === "AWAY", key: `${num}-h` },
                        { side: away, slot: interval.s + 1.5, isWinner: winner === "AWAY", isLoser: winner === "HOME", key: `${num}-a` },
                    ].map(({ side, slot, isWinner, isLoser, key }) => {
                        const pos = polar(TEAM_RADIUS, slotAngle(format, slot));
                        const candidatePair = candidatePairForWinnerPlaceholder(side.teamName, candidatePairs);
                        const title = displaySideName(side, candidatePair, t);
                        const crest = (
                            <TeamCrest
                                side={side}
                                dim={isLoser}
                                highlight={isCurrent ? "current" : isWinner ? "winner" : "none"}
                                candidatePair={candidatePair}
                            />
                        );
                        return (
                            <div
                                key={key}
                                className="absolute -translate-x-1/2 -translate-y-1/2"
                                style={{ left: pct(pos.x), top: pct(pos.y), width: "7%", height: "7%" }}
                                title={title}
                            >
                                {href ? (
                                    <Link href={href} prefetch={false} className="block h-full w-full">
                                        {crest}
                                    </Link>
                                ) : (
                                    crest
                                )}
                            </div>
                        );
                    });
                })}

                {Array.from(intervals.keys())
                    .filter((num) => {
                        const stage = stageOfSlot(format, num);
                        return Boolean(stage && stage !== format.leafStage && stage !== "FINAL" && stage !== "THIRD_PLACE");
                    })
                    .map((num) => {
                        const interval = intervals.get(num);
                        if (!interval) return null;
                        const stage = stageOfSlot(format, num);
                        if (!stage) return null;
                        const pos = nodePosition(format, num, interval);
                        const match = byNumber.get(num);
                        const state = match ? resultOf(match) : null;
                        const winner = state?.isFinished ? state.actualResult : null;
                        const onPath = pathNumbers.has(num);
                        const isCurrent = currentNumber === num;
                        const { home, away } = sidesOf(match);
                        const href = match ? `/match/${match.event_id}?date=${match.date.slice(0, 10)}` : null;

                        const crestSize = stage === "R16" ? 4.8 : stage === "QF" ? 4.2 : 3.6;
                        const homeCandidatePair = candidatePairForWinnerPlaceholder(home.teamName, candidatePairs);
                        const awayCandidatePair = candidatePairForWinnerPlaceholder(away.teamName, candidatePairs);
                        const sides = orderRadialPairSides(format, num, [
                            { side: home, matchSide: "HOME" as const, isWinner: winner === "HOME", isLoser: winner === "AWAY", candidatePair: homeCandidatePair },
                            { side: away, matchSide: "AWAY" as const, isWinner: winner === "AWAY", isLoser: winner === "HOME", candidatePair: awayCandidatePair },
                        ], intervals, byNumber);
                        const label = state ? scoreLabel(state, t, [sides[0].matchSide, sides[1].matchSide]) : null;
                        const title = `${sides.map(({ side, candidatePair }) => displaySideName(side, candidatePair, t)).join(" vs ")}${label ? ` \u00b7 ${label}` : ""}`;

                        const pairing = (
                            <div
                                className={`flex h-full w-full items-center justify-center gap-[8%] rounded-full p-[6%] transition ${
                                    isCurrent
                                        ? "bg-amber-400/15 ring-1 ring-amber-400/50"
                                        : onPath
                                            ? "bg-emerald-500/10 ring-1 ring-emerald-400/40"
                                            : "bg-gray-950/45"
                                }`}
                            >
                                {sides.map(({ side, isWinner, isLoser, candidatePair }, index) => (
                                    <div key={index} className="h-full" style={{ aspectRatio: "1 / 1" }}>
                                        <TeamCrest
                                            side={side}
                                            dim={isLoser}
                                            highlight={isCurrent ? "current" : isWinner ? "winner" : "none"}
                                            size={20}
                                            candidatePair={candidatePair}
                                        />
                                    </div>
                                ))}
                            </div>
                        );

                        return (
                            <div
                                key={`node-${num}`}
                                className="absolute -translate-x-1/2 -translate-y-1/2"
                                style={{
                                    left: pct(pos.x),
                                    top: pct(pos.y),
                                    width: `${crestSize * 2.35}%`,
                                    height: `${crestSize}%`,
                                }}
                                title={title}
                            >
                                {href ? (
                                    <Link href={href} prefetch={false} className="block h-full w-full">
                                        {pairing}
                                    </Link>
                                ) : (
                                    pairing
                                )}
                            </div>
                        );
                    })}

                <div
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: "50%", top: "50%", width: "16%", height: "16%" }}
                >
                    {(() => {
                        const href = finalMatch ? `/match/${finalMatch.event_id}?date=${finalMatch.date.slice(0, 10)}` : null;
                        const core = (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-full border border-amber-400/50 bg-gradient-to-b from-amber-300/25 to-amber-500/10 p-2 text-center shadow-xl backdrop-blur-sm">
                                {champion && validTeamId(champion.teamId) ? (
                                    <TeamLogo teamId={champion.teamId} alt={champion.teamName} size={44} className="h-[46%] w-[46%] object-contain" />
                                ) : (
                                    <Image
                                        src="/icons/world-cup-trophy.svg"
                                        alt=""
                                        aria-hidden="true"
                                        width={64}
                                        height={64}
                                        className="h-[70%] w-auto drop-shadow-[0_2px_6px_rgba(251,191,36,0.45)]"
                                    />
                                )}
                                <span className="text-[8px] font-black uppercase tracking-[0.14em] text-amber-200">
                                    {champion ? t("champion") : t("final")}
                                </span>
                            </div>
                        );
                        return href ? (
                            <Link href={href} prefetch={false} className="block h-full w-full">
                                {core}
                            </Link>
                        ) : (
                            core
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
