import { Player } from "@/types";

export default function getPlayersSample(): { league: string; teams: { id: number; name: string; players: Player[] }[] }[] {
    return [
        {
            league: "La Liga",
            teams: [
                {
                    id: 541,
                    name: "Real Madrid",
                    players: [
                        {
                            id: 735,
                            name: "Nacho Fernández",
                            position: "Defender",
                            number: 6,
                            age: 34,
                            photo: "https://media.api-sports.io/football/players/735.png",
                        },
                        {
                            id: 752,
                            name: "Toni Kroos",
                            position: "Midfielder",
                            number: 8,
                            age: 34,
                            photo: "https://media.api-sports.io/football/players/752.png",
                        },
                        {
                            id: 2273,
                            name: "Kepa Arrizabalaga",
                            position: "Goalkeeper",
                            number: 1,
                            age: 30,
                            photo: "https://media.api-sports.io/football/players/2273.png",
                        },
                        {
                            id: 10166,
                            name: "Reinier Jesus",
                            position: "Midfielder",
                            number: 19,
                            age: 22,
                            photo: "https://media.api-sports.io/football/players/10166.png",
                        },
                        {
                            id: 18907,
                            name: "Joselu",
                            position: "Attacker",
                            number: 9,
                            age: 34,
                            photo: "https://media.api-sports.io/football/players/18907.png",
                        },
                        {
                            id: 46734,
                            name: "Pablo Ramón",
                            position: "Defender",
                            number: 4,
                            age: 23,
                            photo: "https://media.api-sports.io/football/players/46734.png",
                        },
                    ],
                },
            ],
        },
    ];
}
