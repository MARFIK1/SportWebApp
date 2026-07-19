"use client";

import Image from "next/image";
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
    const sources = teamLogoUrls(teamId, alt);
    const sourceKey = `${teamId}:${alt}`;
    const [fallbackState, setFallbackState] = useState({ sourceKey, sourceIndex: 0 });
    const sourceIndex = fallbackState.sourceKey === sourceKey ? fallbackState.sourceIndex : 0;
    const src = sources[Math.min(sourceIndex, sources.length - 1)];

    return (
        <Image
            src={src}
            alt={alt}
            width={width ?? size}
            height={height ?? size}
            loading={loading}
            decoding="async"
            referrerPolicy="no-referrer"
            className={className}
            style={style}
            onError={() => {
                setFallbackState((current) => {
                    const currentIndex = current.sourceKey === sourceKey ? current.sourceIndex : 0;
                    const nextIndex = Math.min(currentIndex + 1, sources.length - 1);
                    if (current.sourceKey === sourceKey && current.sourceIndex === nextIndex) {
                        return current;
                    }
                    return { sourceKey, sourceIndex: nextIndex };
                });
            }}
        />
    );
}
