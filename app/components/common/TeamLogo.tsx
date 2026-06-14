"use client";

import { useState, type CSSProperties } from "react";
import { teamLogoUrls } from "@/app/util/urls";

interface TeamLogoProps {
    teamId: number;
    alt: string;
    className?: string;
    height?: number;
    loading?: "eager" | "lazy";
    size?: number;
    style?: CSSProperties;
    width?: number;
}

export default function TeamLogo({
    teamId,
    alt,
    className,
    height,
    loading = "lazy",
    size = 32,
    style,
    width,
}: TeamLogoProps) {
    const sources = teamLogoUrls(teamId);
    const [fallbackState, setFallbackState] = useState({ teamId, sourceIndex: 0 });
    const sourceIndex = fallbackState.teamId === teamId ? fallbackState.sourceIndex : 0;
    const src = sources[Math.min(sourceIndex, sources.length - 1)];

    return (
        <img
            src={src}
            alt={alt}
            width={width ?? size}
            height={height ?? size}
            loading={loading}
            decoding="async"
            referrerPolicy="origin"
            className={className}
            style={style}
            onError={() => {
                setFallbackState((current) => {
                    const currentIndex = current.teamId === teamId ? current.sourceIndex : 0;
                    const nextIndex = Math.min(currentIndex + 1, sources.length - 1);
                    if (current.teamId === teamId && current.sourceIndex === nextIndex) {
                        return current;
                    }
                    return { teamId, sourceIndex: nextIndex };
                });
            }}
        />
    );
}
