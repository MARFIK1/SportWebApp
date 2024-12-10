import moment from "moment";

import { Fixture } from "@/types";
import FixtureItem from "./FixtureItem";

export default function FixturesByLeague({ fixturesData } : { fixturesData: Fixture[] }) {
    const upcomingFixtures = fixturesData.filter((fixture) => moment(fixture.fixture.date).isSameOrAfter(moment(), 'day'));

    if (upcomingFixtures.length === 0) {
        return <div className="text-center text-neutral-400">No upcoming matches</div>;
    }

    return (
        <div className="flex flex-col w-full">
            {
                upcomingFixtures.map((match, index) => (
                    <FixtureItem 
                        match={match} 
                        index={index}
                        key={match.fixture.id || index} 
                    />
                ))
            }
        </div>
    )
}