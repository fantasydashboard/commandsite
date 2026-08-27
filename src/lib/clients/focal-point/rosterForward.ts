// Focal Point Church - forward scheduling health (real, from Planning Center
// Services). Team-level only, no PII. Regenerate with scripts/gen-roster-live.mjs.
// Generated 2026-08-27.
export type SchedFlag = "forgotten" | "empty" | "short" | "unconfirmed" | "ok"
export interface NeededPosition { pos: string; qty: number }
export interface TeamWeek { team: string; sched: number; confirmed: number; unconfirmed: number; declined: number; need: number; flag: SchedFlag; positions: NeededPosition[] }
export interface SchedWeek { date: string; label: string; teams: TeamWeek[] }
export const focalPointSchedule: { expected: string[]; weeks: SchedWeek[] } = {
  expected: ["Ushers","First Impressions Team","Reception Team","Worship","Hospitality","Media Team","Safety Team","Parking Team","Vocals"],
  weeks: [
    {
      "date": "2026-08-30",
      "label": "Aug 30",
      "teams": [
        {
          "team": "Ushers",
          "sched": 16,
          "confirmed": 11,
          "unconfirmed": 3,
          "declined": 2,
          "need": 2,
          "flag": "short",
          "positions": []
        },
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
          "team": "Reception Team",
          "sched": 4,
          "confirmed": 1,
          "unconfirmed": 3,
          "declined": 0,
          "need": 0,
          "flag": "unconfirmed",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 9,
          "confirmed": 9,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "ok",
          "positions": []
        },
        {
          "team": "Hospitality",
          "sched": 21,
          "confirmed": 18,
          "unconfirmed": 2,
          "declined": 1,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Media Team",
          "sched": 7,
          "confirmed": 4,
          "unconfirmed": 2,
          "declined": 1,
          "need": 1,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Safety Team",
          "sched": 5,
          "confirmed": 5,
          "unconfirmed": 0,
          "declined": 0,
          "need": 6,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Parking Team",
          "sched": 4,
          "confirmed": 4,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "ok",
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
    },
    {
      "date": "2026-09-06",
      "label": "Sep 6",
      "teams": [
        {
          "team": "Ushers",
          "sched": 8,
          "confirmed": 8,
          "unconfirmed": 0,
          "declined": 0,
          "need": 5,
          "flag": "short",
          "positions": []
        },
        {
          "team": "First Impressions Team",
          "sched": 8,
          "confirmed": 8,
          "unconfirmed": 0,
          "declined": 0,
          "need": 0,
          "flag": "ok",
          "positions": []
        },
        {
          "team": "Reception Team",
          "sched": 2,
          "confirmed": 0,
          "unconfirmed": 2,
          "declined": 0,
          "need": 2,
          "flag": "short",
          "positions": []
        },
        {
          "team": "Worship",
          "sched": 6,
          "confirmed": 0,
          "unconfirmed": 6,
          "declined": 0,
          "need": 3,
          "flag": "short",
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
      "date": "2026-09-13",
      "label": "Sep 13",
      "teams": [
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
    },
    {
      "date": "2026-09-20",
      "label": "Sep 20",
      "teams": [
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
          "need": 0,
          "flag": "forgotten",
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
