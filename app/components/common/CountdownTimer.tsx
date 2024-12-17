"use client";
import { useEffect, useState } from "react";

export default function CountdownTimer({ startTime } : { startTime: string }) {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const matchDate = new Date(startTime);
            const diff = matchDate.getTime() - now.getTime();

            if (diff <= 0) {
                clearInterval(interval);
                setTimeLeft("Match is starting!");
            }
            else {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((diff / (1000 * 60)) % 60);
                const seconds = Math.floor((diff / 1000) % 60);
                const daysText = days > 0 ? `${days}d ` : "";
                setTimeLeft(`${daysText}${hours}h ${minutes}m ${seconds}s`);
            }
        }, 1000)

        return () => clearInterval(interval);
    }, [startTime])

    return <p className="text-center text-lg text-gray-300 mt-4">Time to kickoff: {timeLeft}</p>;
}