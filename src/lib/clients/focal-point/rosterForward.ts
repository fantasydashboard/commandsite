// Focal Point Church - forward scheduling health (real, from Planning Center
// Services). Team-level only, no PII. Regenerate with scripts/gen-roster-live.mjs.
// Generated 2026-08-11.
export type SchedFlag = "forgotten" | "empty" | "short" | "unconfirmed" | "ok"
export interface NeededPosition { pos: string; qty: number }
export interface TeamWeek { team: string; sched: number; confirmed: number; unconfirmed: number; declined: number; need: number; flag: SchedFlag; positions: NeededPosition[] }
export interface SchedWeek { date: string; label: string; teams: TeamWeek[] }
export const focalPointSchedule: { expected: string[]; weeks: SchedWeek[] } = {
  expected: ["First Impressions Team","Ushers","Reception Team","Safety Team","Worship","Hospitality","Media Team","Vocals","Parking Team"],
  weeks: [
    {
      "date": "2026-08-16",
      "label": "Aug 16",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 9,
          "confirmed": 7,
          "unconfirmed": 2,
          "declined": 0,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 13,
          "confirmed": 11,
          "unconfirmed": 0,
          "declined": 2,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Reception Team",
          "sched": 3,
          "confirmed": 2,
          "unconfirmed": 1,
          "declined": 0,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 15,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 7,
          "confirmed": 7,
          "unconfirmed": 0,
          "declined": 0,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 20,
          "confirmed": 17,
          "unconfirmed": 3,
          "declined": 0,
          "need": 1,
          "flag": "short",
          "positions": []
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
        },
        {
          "team": "Vocals",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 5,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 4,
          "confirmed": 0,
          "unconfirmed": 4,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
        }
      ]
    },
    {
      "date": "2026-08-23",
      "label": "Aug 23",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 9,
          "confirmed": 6,
          "unconfirmed": 3,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 10,
          "confirmed": 10,
          "unconfirmed": 0,
          "declined": 0,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Reception Team",
          "sched": 3,
          "confirmed": 0,
          "unconfirmed": 3,
          "declined": 0,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 15,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 9,
          "confirmed": 6,
          "unconfirmed": 2,
          "declined": 1,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 19,
          "confirmed": 14,
          "unconfirmed": 3,
          "declined": 2,
          "need": 2,
          "flag": "short",
          "positions": []
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
        },
        {
          "team": "Vocals",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 5,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 4,
          "flag": "empty",
          "positions": []
        }
      ]
    },
    {
      "date": "2026-08-30",
      "label": "Aug 30",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 4,
          "confirmed": 4,
          "unconfirmed": 0,
          "declined": 0,
          "need": 5,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 8,
          "confirmed": 1,
          "unconfirmed": 7,
          "declined": 0,
          "need": 7,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Reception Team",
          "sched": 4,
          "confirmed": 0,
          "unconfirmed": 4,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 15,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 7,
          "confirmed": 5,
          "unconfirmed": 2,
          "declined": 0,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 21,
          "confirmed": 17,
          "unconfirmed": 4,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
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
        },
        {
          "team": "Vocals",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 4,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 4,
          "flag": "empty",
          "positions": []
        }
      ]
    },
    {
      "date": "2026-09-06",
      "label": "Sep 6",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 1,
          "confirmed": 1,
          "unconfirmed": 0,
          "declined": 0,
          "need": 8,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 5,
          "confirmed": 5,
          "unconfirmed": 0,
          "declined": 0,
          "need": 8,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Reception Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 4,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 15,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 8,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 18,
          "flag": "empty",
          "positions": []
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
        },
        {
          "team": "Vocals",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 3,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 4,
          "flag": "empty",
          "positions": []
        }
      ]
    }
  ],
}
