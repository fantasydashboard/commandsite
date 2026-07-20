// Focal Point Church - forward scheduling health (real, from Planning Center
// Services). Team-level only, no PII. For the next Sundays, each expected team
// carries scheduled counts (by confirmation status), the still-needed count, AND
// the specific unfilled positions, so the board can say WHAT is short (e.g. Band:
// Acoustic Guitar, Drums), not just how many. Flag is derived in the UI from
// confirmed-vs-minimum + need; declines are not surfaced (PCO nets them out).
// Source: scripts/pull-sched-forward.mjs + pull-sched-positions.mjs.
export type SchedFlag = "forgotten" | "empty" | "short" | "unconfirmed" | "ok"
export interface NeededPosition { pos: string; qty: number }
export interface TeamWeek { team: string; sched: number; confirmed: number; unconfirmed: number; declined: number; need: number; flag: SchedFlag; positions: NeededPosition[] }
export interface SchedWeek { date: string; label: string; teams: TeamWeek[] }
export const focalPointSchedule: { expected: string[]; weeks: SchedWeek[] } = {
  expected: ["Vocals","Band","First Impressions Team","Reception Team","Hospitality","Ushers","Safety Team","Parking Team","Media Team"],
  weeks: [
  {
    "date": "2026-07-19",
    "label": "Jul 19",
    "teams": [
      {
        "team": "Vocals",
        "sched": 6,
        "confirmed": 3,
        "unconfirmed": 1,
        "declined": 2,
        "need": 0,
        "flag": "unconfirmed",
        "positions": []
      },
      {
        "team": "Band",
        "sched": 4,
        "confirmed": 3,
        "unconfirmed": 0,
        "declined": 1,
        "need": 2,
        "flag": "short",
        "positions": [
          {
            "pos": "Acoustic Guitar",
            "qty": 1
          },
          {
            "pos": "Drums",
            "qty": 1
          }
        ]
      },
      {
        "team": "First Impressions Team",
        "sched": 10,
        "confirmed": 6,
        "unconfirmed": 3,
        "declined": 1,
        "need": 0,
        "flag": "unconfirmed",
        "positions": []
      },
      {
        "team": "Reception Team",
        "sched": 1,
        "confirmed": 1,
        "unconfirmed": 0,
        "declined": 0,
        "need": 3,
        "flag": "short",
        "positions": [
          {
            "pos": "10:15AM - 12:00PM",
            "qty": 2
          },
          {
            "pos": "11:45AM - 1:30PM",
            "qty": 1
          }
        ]
      },
      {
        "team": "Hospitality",
        "sched": 19,
        "confirmed": 14,
        "unconfirmed": 3,
        "declined": 2,
        "need": 2,
        "flag": "short",
        "positions": [
          {
            "pos": "After 2nd",
            "qty": 1
          },
          {
            "pos": "Service Leader",
            "qty": 1
          }
        ]
      },
      {
        "team": "Ushers",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 13,
        "flag": "empty",
        "positions": [
          {
            "pos": "Usher",
            "qty": 13
          }
        ]
      },
      {
        "team": "Safety Team",
        "sched": 1,
        "confirmed": 1,
        "unconfirmed": 0,
        "declined": 0,
        "need": 14,
        "flag": "short",
        "positions": [
          {
            "pos": "Kids Point Check In",
            "qty": 2
          },
          {
            "pos": "Lobby",
            "qty": 3
          },
          {
            "pos": "Sanctuary",
            "qty": 6
          },
          {
            "pos": "Security Team",
            "qty": 3
          }
        ]
      },
      {
        "team": "Parking Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "After 10:30am Service",
            "qty": 2
          },
          {
            "pos": "Before 10:30am Service",
            "qty": 2
          }
        ]
      },
      {
        "team": "Media Team",
        "sched": 2,
        "confirmed": 1,
        "unconfirmed": 1,
        "declined": 0,
        "need": 0,
        "flag": "unconfirmed",
        "positions": []
      }
    ]
  },
  {
    "date": "2026-07-26",
    "label": "Jul 26",
    "teams": [
      {
        "team": "Vocals",
        "sched": 4,
        "confirmed": 2,
        "unconfirmed": 1,
        "declined": 1,
        "need": 1,
        "flag": "short",
        "positions": [
          {
            "pos": "Alto",
            "qty": 1
          }
        ]
      },
      {
        "team": "Band",
        "sched": 5,
        "confirmed": 4,
        "unconfirmed": 1,
        "declined": 0,
        "need": 0,
        "flag": "unconfirmed",
        "positions": []
      },
      {
        "team": "First Impressions Team",
        "sched": 4,
        "confirmed": 4,
        "unconfirmed": 0,
        "declined": 0,
        "need": 5,
        "flag": "short",
        "positions": [
          {
            "pos": "Door Host",
            "qty": 2
          },
          {
            "pos": "Starting Point Host",
            "qty": 3
          }
        ]
      },
      {
        "team": "Reception Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "10:15AM - 12:00PM",
            "qty": 2
          },
          {
            "pos": "11:45AM - 1:30PM",
            "qty": 1
          },
          {
            "pos": "8:30AM - 10:30AM",
            "qty": 1
          }
        ]
      },
      {
        "team": "Hospitality",
        "sched": 19,
        "confirmed": 12,
        "unconfirmed": 7,
        "declined": 0,
        "need": 0,
        "flag": "unconfirmed",
        "positions": []
      },
      {
        "team": "Ushers",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 13,
        "flag": "empty",
        "positions": [
          {
            "pos": "Usher",
            "qty": 13
          }
        ]
      },
      {
        "team": "Safety Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 15,
        "flag": "empty",
        "positions": [
          {
            "pos": "Kids Point Check In",
            "qty": 3
          },
          {
            "pos": "Lobby",
            "qty": 3
          },
          {
            "pos": "Sanctuary",
            "qty": 6
          },
          {
            "pos": "Security Team",
            "qty": 3
          }
        ]
      },
      {
        "team": "Parking Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "After 10:30am Service",
            "qty": 2
          },
          {
            "pos": "Before 10:30am Service",
            "qty": 2
          }
        ]
      },
      {
        "team": "Media Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 0,
        "flag": "forgotten",
        "positions": []
      }
    ]
  },
  {
    "date": "2026-08-02",
    "label": "Aug 2",
    "teams": [
      {
        "team": "Vocals",
        "sched": 4,
        "confirmed": 4,
        "unconfirmed": 0,
        "declined": 0,
        "need": 0,
        "flag": "ok",
        "positions": []
      },
      {
        "team": "Band",
        "sched": 2,
        "confirmed": 1,
        "unconfirmed": 1,
        "declined": 0,
        "need": 3,
        "flag": "short",
        "positions": [
          {
            "pos": "Acoustic Guitar",
            "qty": 1
          },
          {
            "pos": "Electric Guitar",
            "qty": 1
          },
          {
            "pos": "Keys",
            "qty": 1
          }
        ]
      },
      {
        "team": "First Impressions Team",
        "sched": 2,
        "confirmed": 2,
        "unconfirmed": 0,
        "declined": 0,
        "need": 7,
        "flag": "short",
        "positions": [
          {
            "pos": "Door Host",
            "qty": 4
          },
          {
            "pos": "Starting Point Host",
            "qty": 3
          }
        ]
      },
      {
        "team": "Reception Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "10:15AM - 12:00PM",
            "qty": 2
          },
          {
            "pos": "11:45AM - 1:30PM",
            "qty": 1
          },
          {
            "pos": "8:30AM - 10:30AM",
            "qty": 1
          }
        ]
      },
      {
        "team": "Hospitality",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 18,
        "flag": "empty",
        "positions": [
          {
            "pos": "After 1st",
            "qty": 2
          },
          {
            "pos": "After 2nd",
            "qty": 2
          },
          {
            "pos": "After 3rd & Tear Down",
            "qty": 4
          },
          {
            "pos": "Service Leader",
            "qty": 6
          },
          {
            "pos": "Set Up 7:15AM",
            "qty": 4
          }
        ]
      },
      {
        "team": "Ushers",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 13,
        "flag": "empty",
        "positions": [
          {
            "pos": "Usher",
            "qty": 13
          }
        ]
      },
      {
        "team": "Safety Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 15,
        "flag": "empty",
        "positions": [
          {
            "pos": "Kids Point Check In",
            "qty": 3
          },
          {
            "pos": "Lobby",
            "qty": 3
          },
          {
            "pos": "Sanctuary",
            "qty": 6
          },
          {
            "pos": "Security Team",
            "qty": 3
          }
        ]
      },
      {
        "team": "Parking Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "After 10:30am Service",
            "qty": 2
          },
          {
            "pos": "Before 10:30am Service",
            "qty": 2
          }
        ]
      },
      {
        "team": "Media Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 0,
        "flag": "forgotten",
        "positions": []
      }
    ]
  },
  {
    "date": "2026-08-09",
    "label": "Aug 9",
    "teams": [
      {
        "team": "Vocals",
        "sched": 3,
        "confirmed": 2,
        "unconfirmed": 1,
        "declined": 0,
        "need": 1,
        "flag": "short",
        "positions": [
          {
            "pos": "Soprano",
            "qty": 1
          }
        ]
      },
      {
        "team": "Band",
        "sched": 3,
        "confirmed": 2,
        "unconfirmed": 1,
        "declined": 0,
        "need": 2,
        "flag": "short",
        "positions": [
          {
            "pos": "Acoustic Guitar",
            "qty": 1
          },
          {
            "pos": "Electric Guitar",
            "qty": 1
          }
        ]
      },
      {
        "team": "First Impressions Team",
        "sched": 2,
        "confirmed": 2,
        "unconfirmed": 0,
        "declined": 0,
        "need": 7,
        "flag": "short",
        "positions": [
          {
            "pos": "Door Host",
            "qty": 5
          },
          {
            "pos": "Starting Point Host",
            "qty": 2
          }
        ]
      },
      {
        "team": "Reception Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "10:15AM - 12:00PM",
            "qty": 2
          },
          {
            "pos": "11:45AM - 1:30PM",
            "qty": 1
          },
          {
            "pos": "8:30AM - 10:30AM",
            "qty": 1
          }
        ]
      },
      {
        "team": "Hospitality",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 18,
        "flag": "empty",
        "positions": [
          {
            "pos": "After 1st",
            "qty": 2
          },
          {
            "pos": "After 2nd",
            "qty": 2
          },
          {
            "pos": "After 3rd & Tear Down",
            "qty": 4
          },
          {
            "pos": "Service Leader",
            "qty": 6
          },
          {
            "pos": "Set Up 7:15AM",
            "qty": 4
          }
        ]
      },
      {
        "team": "Ushers",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 13,
        "flag": "empty",
        "positions": [
          {
            "pos": "Usher",
            "qty": 13
          }
        ]
      },
      {
        "team": "Safety Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 15,
        "flag": "empty",
        "positions": [
          {
            "pos": "Kids Point Check In",
            "qty": 3
          },
          {
            "pos": "Lobby",
            "qty": 3
          },
          {
            "pos": "Sanctuary",
            "qty": 6
          },
          {
            "pos": "Security Team",
            "qty": 3
          }
        ]
      },
      {
        "team": "Parking Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 4,
        "flag": "empty",
        "positions": [
          {
            "pos": "After 10:30am Service",
            "qty": 2
          },
          {
            "pos": "Before 10:30am Service",
            "qty": 2
          }
        ]
      },
      {
        "team": "Media Team",
        "sched": 0,
        "confirmed": 0,
        "unconfirmed": 0,
        "declined": 0,
        "need": 0,
        "flag": "forgotten",
        "positions": []
      }
    ]
  }
],
}
