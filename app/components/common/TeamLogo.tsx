"use client";

import { useState, type CSSProperties } from "react";
import { teamLogoFallbackUrl, teamLogoUrl } from "@/app/util/urls";

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
    const primarySrc = teamLogoUrl(teamId);
    const fallbackSrc = teamLogoFallbackUrl(teamId);
    const [failedPrimarySrc, setFailedPrimarySrc] = useState<string | null>(null);
    const src = failedPrimarySrc === primarySrc ? fallbackSrc : primarySrc;

    return (
        <img
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
                if (failedPrimarySrc !== primarySrc) {
                    setFailedPrimarySrc(primarySrc);
                }
            }}
        />
    );
}
