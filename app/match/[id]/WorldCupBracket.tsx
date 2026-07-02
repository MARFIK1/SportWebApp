import Image from "next/image";
import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import { resolveSofascoreMatchResult, type ResolvedMatchResult } from "@/app/util/predictions/matchResult";
import type { SofascoreMatch } from "@/types/sofascore";
import type { PredictionMatch } from "@/types/predictions";

const CHILDREN: Record<number, [number, number]> = {
    89: [73, 75], 90: [74, 77], 91: [76, 78], 92: [79, 80],
    93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
    97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
    101: [97, 98], 102: [99, 100],
    104: [101, 102],
};
const FINAL_NUMBER = 104;
const THIRD_PLACE_NUMBER = 103;

const PARENT_OF: Record<number, number> = {};
for (const [parent, kids] of Object.entries(CHILDREN)) {
    for (const kid of kids) PARENT_OF[kid] = Number(parent);
}

const NUMBER_BY_CHILDREN = new Map<string, number>();
for (const [parent, kids] of Object.entries(CHILDREN)) {
    NUMBER_BY_CHILDREN.set([...kids].sort((a, b) => a - b).join(","), Number(parent));
}

const R32_SLOT_DEFINITION: [number, string[]][] = [
    [73, ["2A", "2B"]], [74, ["1E"]], [75, ["1F", "2C"]], [76, ["1C", "2F"]],
    [77, ["1I"]], [78, ["2E", "2I"]], [79, ["1A"]], [80, ["1L"]],
    [81, ["1D"]], [82, ["1G"]], [83, ["2K", "2L"]], [84, ["1H", "2J"]],
    [85, ["1B"]], [86, ["1J", "2H"]], [87, ["1K"]], [88, ["2D", "2G"]],
];
const SLOT_BY_DEFINITE_CODE: Record<string, number> = {};
for (const [slot, codes] of R32_SLOT_DEFINITION) {
    for (const code of codes) SLOT_BY_DEFINITE_CODE[code] = slot;
}

function normalizeGroupCode(code: string): string {
    const value = (code ?? "").trim().toUpperCase();
    const swapped = /^([A-Z])([12])$/.exec(value);
    if (swapped) return `${swapped[2]}${swapped[1]}`;
    return value;
}

function r32SlotFromCodes(home: string, away: string): number | null {
    for (const code of [home, away]) {
        const slot = SLOT_BY_DEFINITE_CODE[normalizeGroupCode(code)];
        if (slot) return slot;
    }
    return null;
}

function matchNumberFromCode(code: string): number | null {
    const match = /^[WL](\d+)$/i.exec((code ?? "").trim());
    return match ? Number(match[1]) : null;
}

function childSlotsFromCodes(home: string, away: string): [number, number] | null {
    const a = matchNumberFromCode(home);
    const b = matchNumberFromCode(away);
    if (a != null && b != null) return [a, b];
    return null;
}

const RADIUS_BY_ROUND: Record<number, number> = { 6: 392, 5: 304, 27: 212, 28: 118, 29: 0 };
const TEAM_RADIUS = 470;
const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;
const TWO_PI = Math.PI * 2;

const PLACEHOLDER_TEAM_RE = /^(?:[12][A-Z]|[GH][12]|[WL]\d+|3[A-Z](?:\/3[A-Z])+)$/;

function isPlaceholderTeam(name: string): boolean {
    return !name || PLACEHOLDER_TEAM_RE.test(name.trim());
}

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
}

function roundOfNumber(n: number): number {
    if (n >= 73 && n <= 88) return 6;
    if (n >= 89 && n <= 96) return 5;
    if (n >= 97 && n <= 100) return 27;
    if (n === 101 || n === 102) return 28;
    if (n === FINAL_NUMBER) return 29;
    if (n === THIRD_PLACE_NUMBER) return 50;
    return 0;
}

function sortMatches(a: SofascoreMatch, b: SofascoreMatch): number {
    const byDate = String(a.date ?? "").localeCompare(String(b.date ?? ""));
    if (byDate !== 0) return byDate;
    return a.event_id - b.event_id;
}

export function computeKnockoutSlots(rawMatches: SofascoreMatch[]): Map<number, number> {
    const slotByEventId = new Map<number, number>();
    const usedSlots = new Set<number>();

    const r32 = rawMatches.filter((m) => Number(m.round) === 6);
    const unmatchedR32: SofascoreMatch[] = [];
    for (const match of r32) {
        const slot = r32SlotFromCodes(match.home_team, match.away_team);
        if (slot != null && !usedSlots.has(slot)) {
            slotByEventId.set(match.event_id, slot);
            usedSlots.add(slot);
        } else {
            unmatchedR32.push(match);
        }
    }
    if (unmatchedR32.length > 0) {
        const freeSlots: number[] = [];
        for (let slot = 73; slot <= 88; slot++) if (!usedSlots.has(slot)) freeSlots.push(slot);
        unmatchedR32.sort(sortMatches).forEach((match, index) => {
            const slot = freeSlots[index];
            if (slot != null) slotByEventId.set(match.event_id, slot);
        });
    }

    for (const match of rawMatches) {
        const round = Number(match.round);
        if (round === 6) continue;
        if (round === 50) {
            slotByEventId.set(match.event_id, THIRD_PLACE_NUMBER);
            continue;
        }
        const kids = childSlotsFromCodes(match.home_team, match.away_team);
        if (!kids) continue;
        const number = NUMBER_BY_CHILDREN.get([...kids].sort((a, b) => a - b).join(","));
        if (number != null) slotByEventId.set(match.event_id, number);
    }

    return slotByEventId;
}

interface Interval {
    s: number;
    e: number;
}

function buildIntervals(): Map<number, Interval> {
    const map = new Map<number, Interval>();
    const recurse = (n: number, s: number, e: number) => {
        map.set(n, { s, e });
        const kids = CHILDREN[n];
        if (!kids) return;
        const mid = (s + e) / 2;
        recurse(kids[0], s, mid);
        recurse(kids[1], mid, e);
    };
    recurse(FINAL_NUMBER, 0, 32);
    return map;
}

function slotAngle(slot: number): number {
    return -Math.PI / 2 + (slot / 32) * TWO_PI;
}

function polar(radius: number, angle: number): { x: number; y: number } {
    return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function nodePosition(n: number, interval: Interval): { x: number; y: number } {
    const radius = RADIUS_BY_ROUND[roundOfNumber(n)] ?? 0;
    return polar(radius, slotAngle((interval.s + interval.e) / 2));
}

function pct(value: number): string {
    return `${(value / VIEWBOX) * 100}%`;
}

function scoreLabel(state: ResolvedMatchResult, t: (key: string) => string): string | null {
    if (!state.regularScore) return null;
    const base = `${state.regularScore.home}-${state.regularScore.away}`;
    if (state.penaltyScore) return `${base} · ${t("penalties")} ${state.penaltyScore.home}-${state.penaltyScore.away}`;
    return base;
}

interface Side {
    teamId: number;
    teamName: string;
    isPlaceholder: boolean;
}

interface TeamCrestProps {
    side: Side;
    dim: boolean;
    highlight: "none" | "winner" | "current";
    size?: number;
}

interface WorldCupBracketProps {
    matches: SofascoreMatch[];
    slotByEventId: Map<number, number>;
    predictionsByEventId: Map<number, PredictionMatch>;
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

function TeamCrest({ side, dim, highlight, size = 32 }: TeamCrestProps) {
    const ring =
        highlight === "current"
            ? "border-amber-400 ring-2 ring-amber-400/40"
            : highlight === "winner"
                ? "border-emerald-400/80"
                : "border-white/15";
    return (
        <div
            className={`flex h-full w-full items-center justify-center rounded-full border bg-gray-950/80 p-[10%] shadow-md transition ${ring} ${dim ? "opacity-35 grayscale" : ""}`}
        >
            {validTeamId(side.teamId) && !side.isPlaceholder ? (
                <TeamLogo
                    teamId={side.teamId}
                    alt={side.teamName}
                    size={size}
                    className="h-full w-full object-contain"
                />
            ) : (
                <span className="text-[9px] font-black text-gray-500">?</span>
            )}
        </div>
    );
}

export default function WorldCupBracket({ matches, slotByEventId, predictionsByEventId, currentMatchId, t }: WorldCupBracketProps) {
    const byNumber = new Map<number, SofascoreMatch>();
    for (const match of matches) {
        const slot = slotByEventId.get(match.event_id);
        if (slot != null) byNumber.set(slot, match);
    }
    const intervals = buildIntervals();

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
            cursor = PARENT_OF[cursor];
        }
    }

    const leafNumbers = Array.from(intervals.keys()).filter((n) => roundOfNumber(n) === 6);
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
        const kids = CHILDREN[num];
        const parentPos = nodePosition(num, interval);
        if (kids) {
            for (const kid of kids) {
                const kidInterval = intervals.get(kid);
                if (!kidInterval) continue;
                const kidPos = nodePosition(kid, kidInterval);
                segments.push({
                    x1: kidPos.x,
                    y1: kidPos.y,
                    x2: parentPos.x,
                    y2: parentPos.y,
                    onPath: pathNumbers.has(num) && pathNumbers.has(kid),
                });
            }
        } else {
            const home = polar(TEAM_RADIUS, slotAngle(interval.s + 0.5));
            const away = polar(TEAM_RADIUS, slotAngle(interval.s + 1.5));
            const onPath = pathNumbers.has(num);
            segments.push({ x1: home.x, y1: home.y, x2: parentPos.x, y2: parentPos.y, onPath });
            segments.push({ x1: away.x, y1: away.y, x2: parentPos.x, y2: parentPos.y, onPath });
        }
    }

    const guideRadii = [RADIUS_BY_ROUND[5], RADIUS_BY_ROUND[27], RADIUS_BY_ROUND[28]];

    const finalMatch = byNumber.get(FINAL_NUMBER);
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
                        const pos = polar(TEAM_RADIUS, slotAngle(slot));
                        const crest = (
                            <TeamCrest
                                side={side}
                                dim={isLoser}
                                highlight={isCurrent ? "current" : isWinner ? "winner" : "none"}
                            />
                        );
                        return (
                            <div
                                key={key}
                                className="absolute -translate-x-1/2 -translate-y-1/2"
                                style={{ left: pct(pos.x), top: pct(pos.y), width: "7%", height: "7%" }}
                                title={side.isPlaceholder ? t("to_be_decided") : side.teamName}
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
                    .filter((num) => roundOfNumber(num) >= 5 && roundOfNumber(num) !== 6 && num !== FINAL_NUMBER)
                    .map((num) => {
                        const interval = intervals.get(num);
                        if (!interval) return null;
                        const pos = nodePosition(num, interval);
                        const round = roundOfNumber(num);
                        const match = byNumber.get(num);
                        const state = match ? resultOf(match) : null;
                        const label = state ? scoreLabel(state, t) : null;
                        const winner = state?.isFinished ? state.actualResult : null;
                        const onPath = pathNumbers.has(num);
                        const isCurrent = currentNumber === num;
                        const { home, away } = sidesOf(match);
                        const href = match ? `/match/${match.event_id}?date=${match.date.slice(0, 10)}` : null;

                        const crestSize = round === 5 ? 4.8 : round === 27 ? 4.2 : 3.6;
                        const sides: { side: Side; isWinner: boolean; isLoser: boolean }[] = [
                            { side: home, isWinner: winner === "HOME", isLoser: winner === "AWAY" },
                            { side: away, isWinner: winner === "AWAY", isLoser: winner === "HOME" },
                        ];
                        const title = home.isPlaceholder || away.isPlaceholder
                            ? t("to_be_decided")
                            : `${home.teamName} vs ${away.teamName}${label ? ` · ${label}` : ""}`;

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
                                {sides.map(({ side, isWinner, isLoser }, index) => (
                                    <div key={index} className="h-full" style={{ aspectRatio: "1 / 1" }}>
                                        <TeamCrest
                                            side={side}
                                            dim={isLoser}
                                            highlight={isCurrent ? "current" : isWinner ? "winner" : "none"}
                                            size={20}
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
                                ) : (<Image
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
