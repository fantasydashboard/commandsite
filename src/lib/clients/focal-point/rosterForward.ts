// Focal Point Church - forward scheduling health (real, from Planning Center
// Services). Team-level only, no PII. Regenerate with scripts/gen-roster-live.mjs.
// Generated 2026-08-21.
export type SchedFlag = "forgotten" | "empty" | "short" | "unconfirmed" | "ok"
export interface NeededPosition { pos: string; qty: number }
export interface TeamWeek { team: string; sched: number; confirmed: number; unconfirmed: number; declined: number; need: number; flag: SchedFlag; positions: NeededPosition[] }
export interface SchedWeek { date: string; label: string; teams: TeamWeek[] }
export const focalPointSchedule: { expected: string[]; weeks: SchedWeek[] } = {
  expected: ["First Impressions Team","Ushers","Reception Team","Worship","Hospitality","Parking Team","Media Team","Safety Team","Vocals"],
  weeks: [
    {
      "date": "2026-08-23",
      "label": "Aug 23",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 9,
          "confirmed": 8,
          "unconfirmed": 1,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 13,
          "confirmed": 13,
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
          "team": "Worship",
          "sched": 9,
          "confirmed": 8,
          "unconfirmed": 0,
          "declined": 1,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 19,
          "confirmed": 16,
          "unconfirmed": 1,
          "declined": 2,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 4,
          "confirmed": 2,
          "unconfirmed": 0,
          "declined": 2,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Media Team",
          "sched": 8,
          "confirmed": 4,
          "unconfirmed": 2,
          "declined": 2,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 6,
          "confirmed": 6,
          "unconfirmed": 0,
          "declined": 0,
          "need": 7,
          "flag": "short",
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
        }
      ]
    },
    {
      "date": "2026-08-30",
      "label": "Aug 30",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 9,
          "confirmed": 7,
          "unconfirmed": 1,
          "declined": 1,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 9,
          "confirmed": 4,
          "unconfirmed": 5,
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
          "team": "Worship",
          "sched": 7,
          "confirmed": 6,
          "unconfirmed": 1,
          "declined": 0,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 21,
          "confirmed": 17,
          "unconfirmed": 3,
          "declined": 1,
          "need": 1,
          "flag": "short",
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
        },
        {
          "team": "Media Team",
          "sched": 7,
          "confirmed": 5,
          "unconfirmed": 2,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 3,
          "confirmed": 3,
          "unconfirmed": 0,
          "declined": 0,
          "need": 10,
          "flag": "short",
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
        }
      ]
    },
    {
      "date": "2026-09-06",
      "label": "Sep 6",
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
          "sched": 7,
          "confirmed": 7,
          "unconfirmed": 0,
          "declined": 0,
          "need": 6,
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
          "team": "Parking Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 4,
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
          "team": "Safety Team",
          "sched": 1,
          "confirmed": 1,
          "unconfirmed": 0,
          "declined": 0,
          "need": 14,
          "flag": "short",
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
        }
      ]
    },
    {
      "date": "2026-09-13",
      "label": "Sep 13",
      "teams": [
        {
          "team": "First Impressions Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "forgotten",
          "positions": []
        },
        {
          "team": "Ushers",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "forgotten",
          "positions": []
        },
        {
          "team": "Reception Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "forgotten",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 1,
          "flag": "empty",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "forgotten",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 0,
          "confirmed": 0,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "forgotten",
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
          "team": "Safety Team",
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
          "need": 0,
          "flag": "forgotten",
          "positions": []
        }
      ]
    }
  ],
}
