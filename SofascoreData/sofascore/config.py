import os

BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# Structure: type -> country -> league -> {tournament_id, seasons}
# To add a new league: fill seasons dict or leave empty {} (will fetch from API)

COMPETITIONS = {
    'league': {
        'austria': {
            'bundesliga': {
                'tournament_id': 45,
                'seasons': {}
            },
        },
        'belgium': {
            'jupiler_pro_league': {
                'tournament_id': 38,
                'seasons': {}
            },
        },
        'england': {
            'championship': {
                'tournament_id': 18,
                'seasons': {}
            },
            'league_one': {
                'tournament_id': 24,
                'seasons': {}
            },
            'league_two': {
                'tournament_id': 25,
                'seasons': {}
            },
            'premier_league': {
                'tournament_id': 17,
                'seasons': {
                    "Premier League 21/22": 37036,
                    "Premier League 22/23": 41886,
                    "Premier League 23/24": 52186,
                    "Premier League 24/25": 61627,
                    "Premier League 25/26": 76986,
                }
            },
        },
        'france': {
            'ligue_1': {
                'tournament_id': 34,
                'seasons': {}
            },
            'ligue_2': {
                'tournament_id': 182,
                'seasons': {}
            },
        },
        'germany': {
            '2_bundesliga': {
                'tournament_id': 44,
                'seasons': {}
            },
            'bundesliga': {
                'tournament_id': 35,
                'seasons': {}
            },
        },
        'greece': {
            'super_league': {
                'tournament_id': 185,
                'seasons': {}
            },
        },
        'italy': {
            'serie_a': {
                'tournament_id': 23,
                'seasons': {}
            },
            'serie_b': {
                'tournament_id': 53,
                'seasons': {}
            },
        },
        'netherlands': {
            'eredivisie': {
                'tournament_id': 37,
                'seasons': {}
            },
        },
        'poland': {
            '1_liga': {
                'tournament_id': 229,
                'seasons': {}
            },
            'ekstraklasa': {
                'tournament_id': 202,
                'seasons': {}
            },
        },
        'portugal': {
            'primeira_liga': {
                'tournament_id': 238,
                'seasons': {}
            },
        },
        'scotland': {
            'premiership': {
                'tournament_id': 36,
                'seasons': {}
            },
        },
        'spain': {
            'la_liga': {
                'tournament_id': 8,
                'seasons': {}
            },
            'la_liga_2': {
                'tournament_id': 54,
                'seasons': {}
            },
        },
        'turkey': {
            'super_lig': {
                'tournament_id': 52,
                'seasons': {}
            },
        },
    },

    'cups': {
        'england': {
            'community_shield': {
                'tournament_id': 346,
                'seasons': {}
            },
            'efl_cup': {
                'tournament_id': 21,
                'seasons': {}
            },
            'fa_cup': {
                'tournament_id': 19,
                'seasons': {}
            },
        },
        'france': {
            'coupe_de_france': {
                'tournament_id': 335,
                'seasons': {}
            },
            'trophee_des_champions': {
                'tournament_id': 339,
                'seasons': {}
            },
        },
        'germany': {
            'dfb_pokal': {
                'tournament_id': 217,
                'seasons': {}
            },
            'supercup': {
                'tournament_id': 799,
                'seasons': {}
            },
        },
        'italy': {
            'coppa_italia': {
                'tournament_id': 328,
                'seasons': {}
            },
            'supercoppa': {
                'tournament_id': 341,
                'seasons': {}
            },
        },
        'poland': {
            'puchar_polski': {
                'tournament_id': 281,
                'seasons': {}
            },
        },
        'spain': {
            'copa_del_rey': {
                'tournament_id': 329,
                'seasons': {}
            },
            'supercopa': {
                'tournament_id': 213,
                'seasons': {}
            },
        },
    },

    'european': {
        'uefa': {
            'champions_league': {
                'tournament_id': 7,
                'seasons': {}
            },
            'conference_league': {
                'tournament_id': 17015,
                'seasons': {}
            },
            'europa_league': {
                'tournament_id': 679,
                'seasons': {}
            },
            'super_cup': {
                'tournament_id': 465,
                'seasons': {}
            },
        },
    },

    'international': {
        'fifa': {
            'world_cup': {
                'tournament_id': 16,
                'seasons': {}
            },
            'world_cup_qualifiers_europe': {
                'tournament_id': 11,
                'seasons': {}
            },
        },
        'uefa': {
            'euro': {
                'tournament_id': 1,
                'seasons': {}
            },
            'euro_qualifiers': {
                'tournament_id': 27,
                'seasons': {}
            },
            'nations_league': {
                'tournament_id': 10783,
                'seasons': {}
            },
        },
    },
}


def get_competition(comp_type, country, league):
    return COMPETITIONS.get(comp_type, {}).get(country, {}).get(league, {})


def get_competition_path(comp_type, country, league):
    if comp_type in ['european', 'international']:
        return os.path.join(BASE_DIR, comp_type, league)
    return os.path.join(BASE_DIR, comp_type, country, league)


def list_all_competitions():
    print("=" * 60)
    print("AVAILABLE COMPETITIONS:")
    print("=" * 60)
    for comp_type, countries in COMPETITIONS.items():
        print(f"\n[{comp_type.upper()}]")
        for country, leagues in countries.items():
            print(f"  {country}")
            for league, config in leagues.items():
                seasons_count = len(config.get('seasons', {}))
                status = f"({seasons_count} seasons)" if seasons_count > 0 else "(fetch from API)"
                print(f"      - {league} {status}")
