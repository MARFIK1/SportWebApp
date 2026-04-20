"use client";
import { useState, useEffect } from "react";

export default function MatchDetails({ fixtureDate, children } : { fixtureDate: string, children: React.ReactNode }) {
    const [isMatchStarted, setIsMatchStarted] = useState(() => new Date() >= new Date(fixtureDate));

    useEffect(() => {
        const now = new Date();
        const matchDate = new Date(fixtureDate);
        const delay = matchDate.getTime() - now.getTime();
        if (delay <= 0) return;

        const timeout = setTimeout(() => setIsMatchStarted(true), delay);
        return () => clearTimeout(timeout);
    }, [fixtureDate]);

    return (
        <>
            {isMatchStarted && children}
        </>
    );
}