import { AllFixtures } from "@/types";

export default function getFixturesSample(): AllFixtures[] {
    let fixturesSample = `[{
            "name": "Premier League",
            "fixtures": [
                {
                    "fixture": {
                        "id": 1035551,
                        "referee": null,
                        "timezone": "UTC",
                        "date": "2024-12-03T15:00:00+00:00",
                        "timestamp": 1733408400,
                        "periods": {
                            "first": 1733408400,
                            "second": 1733412000
                        },
                        "venue": {
                            "id": 555,
                            "name": "Etihad Stadium",
                            "city": "Manchester"
                        },
                        "status": {
                            "long": "Match Scheduled",
                            "short": "NS",
                            "elapsed": null
                        }
                    },
                    "league": {
                        "id": 39,
                        "name": "Premier League",
                        "country": "England",
                        "logo": "https://media-3.api-sports.io/football/leagues/39.png",
                        "flag": "https://media-3.api-sports.io/flags/gb.svg",
                        "season": 2024,
                        "round": "Regular Season - 38"
                    },
                    "teams": {
                        "home": {
                            "id": 50,
                            "name": "Manchester City",
                            "logo": "https://media-3.api-sports.io/football/teams/50.png",
                            "winner": null
                        },
                        "away": {
                            "id": 48,
                            "name": "West Ham",
                            "logo": "https://media-1.api-sports.io/football/teams/48.png",
                            "winner": null
                        }
                    },
                    "goals": {
                        "home": null,
                        "away": null
                    },
                    "score": {
                        "halftime": {
                            "home": null,
                            "away": null
                        },
                        "fulltime": {
                            "home": null,
                            "away": null
                        },
                        "extratime": {
                            "home": null,
                            "away": null
                        },
                        "penalty": {
                            "home": null,
                            "away": null
                        }
                    }
                },
                {
                    "fixture": {
                        "id": 1035552,
                        "referee": null,
                        "timezone": "UTC",
                        "date": "2024-12-04T15:00:00+00:00",
                        "timestamp": 1733494800,
                        "periods": {
                            "first": 1733494800,
                            "second": 1733498400
                        },
                        "venue": {
                            "id": 555,
                            "name": "London Stadium",
                            "city": "London"
                        },
                        "status": {
                            "long": "Match Scheduled",
                            "short": "NS",
                            "elapsed": null
                        }
                    },
                    "league": {
                        "id": 39,
                        "name": "Premier League",
                        "country": "England",
                        "logo": "https://media-3.api-sports.io/football/leagues/39.png",
                        "flag": "https://media-3.api-sports.io/flags/gb.svg",
                        "season": 2024,
                        "round": "Regular Season - 38"
                    },
                    "teams": {
                        "home": {
                            "id": 62,
                            "name": "Sheffield Utd",
                            "logo": "https://media-3.api-sports.io/football/teams/62.png",
                            "winner": null
                        },
                        "away": {
                            "id": 47,
                            "name": "Tottenham",
                            "logo": "https://media-1.api-sports.io/football/teams/47.png",
                            "winner": null
                        }
                    },
                    "goals": {
                        "home": null,
                        "away": null
                    },
                    "score": {
                        "halftime": {
                            "home": null,
                            "away": null
                        },
                        "fulltime": {
                            "home": null,
                            "away": null
                        },
                        "extratime": {
                            "home": null,
                            "away": null
                        },
                        "penalty": {
                            "home": null,
                            "away": null
                        }
                    }
                },
                {
                    "fixture": {
                        "id": 1035553,
                        "referee": null,
                        "timezone": "UTC",
                        "date": "2024-12-05T15:00:00+00:00",
                        "timestamp": 1733581200,
                        "periods": {
                            "first": 1733581200,
                            "second": 1733584800
                        },
                        "venue": {
                            "id": 555,
                            "name": "Estadio Santiago Bernabéu",
                            "city": "Madrid"
                        },
                        "status": {
                            "long": "Match Scheduled",
                            "short": "NS",
                            "elapsed": null
                        }
                    },
                    "league": {
                        "id": 140,
                        "name": "La Liga",
                        "country": "Spain",
                        "logo": "https://media-3.api-sports.io/football/leagues/140.png",
                        "flag": "https://media-3.api-sports.io/flags/es.svg",
                        "season": 2024,
                        "round": "Regular Season - 38"
                    },
                    "teams": {
                        "home": {
                            "id": 541,
                            "name": "Real Madrid",
                            "logo": "https://media-1.api-sports.io/football/teams/541.png",
                            "winner": null
                        },
                        "away": {
                            "id": 543,
                            "name": "Real Betis",
                            "logo": "https://media-3.api-sports.io/football/teams/543.png",
                            "winner": null
                        }
                    },
                    "goals": {
                        "home": null,
                        "away": null
                    },
                    "score": {
                        "halftime": {
                            "home": null,
                            "away": null
                        },
                        "fulltime": {
                            "home": null,
                            "away": null
                        },
                        "extratime": {
                            "home": null,
                            "away": null
                        },
                        "penalty": {
                            "home": null,
                            "away": null
                        }
                    }
                }
            ]
        }
    ]`;

    let fixturesSampleJson: AllFixtures[] = [];

    try {
        const jsonData = JSON.parse(fixturesSample);
        fixturesSampleJson = jsonData;
    }
    catch (error) {
        console.error("Error parsing JSON data: " + error);
    }

    return fixturesSampleJson;
}