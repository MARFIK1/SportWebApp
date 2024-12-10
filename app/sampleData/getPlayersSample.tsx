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
                            nationality: "Spain",
                            age: 34,
                            photo: "https://media.api-sports.io/football/players/735.png",
                            captain: true,
                            injured: false,
                        },
                        {
                            id: 752,
                            name: "Toni Kroos",
                            position: "Midfielder",
                            number: 8,
                            nationality: "Germany",
                            age: 34,
                            photo: "https://media.api-sports.io/football/players/752.png",
                            captain: false,
                            injured: false,
                        },
                        {
                            id: 2273,
                            name: "Kepa Arrizabalaga",
                            position: "Goalkeeper",
                            number: 1,
                            nationality: "Spain",
                            age: 30,
                            photo: "https://media.api-sports.io/football/players/2273.png",
                            captain: false,
                            injured: true,
                        },
                        {
                            id: 10166,
                            name: "Reinier Jesus",
                            position: "Midfielder",
                            number: 19,
                            nationality: "Brazil",
                            age: 22,
                            photo: "https://media.api-sports.io/football/players/10166.png",
                            captain: false,
                            injured: false,
                        },
                        {
                            id: 18907,
                            name: "Joselu",
                            position: "Attacker",
                            number: 9,
                            nationality: "Spain",
                            age: 34,
                            photo: "https://media.api-sports.io/football/players/18907.png",
                            captain: false,
                            injured: false,
                        },
                        {
                            id: 46734,
                            name: "Pablo Ramón",
                            position: "Defender",
                            number: 4,
                            nationality: "Spain",
                            age: 23,
                            photo: "https://media.api-sports.io/football/players/46734.png",
                            captain: false,
                            injured: true,
                        },
                    ],
                },
            ],
        },
    ];
}
