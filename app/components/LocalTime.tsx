"use client";
import { useState, useEffect } from "react";
import moment from "moment";

import { Fixture } from "@/types";

type PageProps = {
    fixture: Fixture
}

export default function LocalTime({ fixture } : PageProps) {
    const [formattedTime, setFormattedTime] = useState("");

    useEffect(() => {
        function formatToLocalTime(timeUTC: string) : string {
            const newTime = moment(timeUTC);
            const localDateString = newTime.format("DD.MM.YYYY");
            const localTimeString = newTime.format("HH:mm");
            return `${localDateString} ${localTimeString}`;
        }

        const fixtureTime = fixture.fixture.date;
        const formatted = formatToLocalTime(fixtureTime);
        setFormattedTime(formatted);
    }, [])

    return (
        <div className="flex justify-center items-center text-center">
            {formattedTime}
        </div>
    )
}