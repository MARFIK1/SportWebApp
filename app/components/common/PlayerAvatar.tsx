"use client";

import Image from "next/image";
import { useState } from "react";
import { playerImageUrl } from "@/app/util/urls";

interface PlayerAvatarProps {
    playerId?: number;
    name: string;
    fallbackText?: string;
    badgeText?: string;
    size?: number;
    className?: string;
    fallbackClassName?: string;
    loading?: "eager" | "lazy";
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function PlayerAvatar({
    playerId,
    name,
    fallbackText,
    badgeText,
    size = 40,
    className = "",
    fallbackClassName = "",
    loading = "lazy",
}: PlayerAvatarProps) {
    const sourceKey = `${playerId ?? "missing"}:${name}`;
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const failed = failedSource === sourceKey;
    const hasImage = playerId != null && !failed;

    return (
        <span
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-950 ${className}`}
            style={{ width: size, height: size }}
            title={name}
        >
            {hasImage ? (
                <Image
                    src={playerImageUrl(playerId)}
                    alt={name}
                    fill
                    sizes={`${size}px`}
                    loading={loading}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="object-cover object-top"
                    onError={() => setFailedSource(sourceKey)}
                />
            ) : (
                <span className={`flex h-full w-full items-center justify-center text-xs font-black tabular-nums text-white ${fallbackClassName}`}>
                    {fallbackText || initials(name)}
                </span>
            )}
            {hasImage && badgeText && (
                <span className="absolute bottom-0 left-0 flex min-h-4 min-w-4 items-center justify-center rounded-tr-md bg-gray-950/90 px-0.5 text-[8px] font-black tabular-nums text-white">
                    {badgeText}
                </span>
            )}
        </span>
    );
}
