import Image from "next/image";
import Link from "next/link";

import { Player } from "@/types";

export default function Players({ players } : { players: Player[] }) {
    const groupedPlayers = players.reduce((acc, player) => {
        if (!acc[player.position]) {
            acc[player.position] = [];
        }
        acc[player.position].push(player);
        return acc;
    }, {} as Record<string, Player[]>)

    const positionsOrder = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];

    return (
        <div className="w-full mt-4 text-center">
            <div className="text-xl font-bold mb-6">
                Squad
            </div>
            {
                positionsOrder.map((position) => {
                    const positionPlayers = groupedPlayers[position] || [];
                    if (positionPlayers.length === 0) {
                        return null;
                    }

                    return (
                        <div 
                            key={position}
                            className="mb-8"
                        >
                            <h2 className="text-lg font-semibold mb-4">
                                {position}s
                            </h2>
                            <div className="grid grid-cols-3 md:grid-cols-4 gap-4 justify-items-center">
                                {
                                    positionPlayers.map((player) => (
                                        <Link
                                            key={player.id}
                                            href={{ pathname: `/player/${player.id}`, query: { number: player.number }}}
                                            className="bg-gray-800 w-32 h-44 flex flex-col items-center justify-between p-2 rounded-lg hover:bg-gray-700 transition"
                                        >
                                            <Image
                                                src={player.photo || "/default-logo.png"}
                                                alt={player.name}
                                                width={64}
                                                height={64}
                                                className="rounded-full"
                                            />
                                            <div className="font-semibold text-sm mt-2 text-center break-words w-full h-auto">
                                                {player.name}
                                            </div>
                                            <div className="text-xs text-gray-400 text-center leading-tight break-words h-8 flex items-center justify-center">
                                                Age: {player.age} | No: {player.number || "N/A"}
                                            </div>
                                        </Link>
                                    ))
                                }
                            </div>
                        </div>
                    )
                })
            }
        </div>
    )
}