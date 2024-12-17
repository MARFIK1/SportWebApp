"use client";
import { useState, useEffect } from "react";

export default function MatchDetails({ fixtureDate, children } : { fixtureDate: string, children: React.ReactNode }) {
    const [isMatchStarted, setIsMatchStarted] = useState(false);
    useEffect(() => {
        const now = new Date();
        const matchDate = new Date(fixtureDate);
        if (now >= matchDate) {
            setIsMatchStarted(true);
        }
        else {
            const timeout = setTimeout(() => setIsMatchStarted(true), matchDate.getTime() - now.getTime());
            return () => clearTimeout(timeout);
        }
    }, [fixtureDate])

    return (
        <>
            {isMatchStarted && children}
        </>
    )
}