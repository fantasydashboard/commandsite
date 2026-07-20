// Focal Point Church - first-time visitors from the two Starting Point workflows
// in Planning Center (real, from scripts/pull-starting-point.mjs). Aggregate counts
// only, no PII, so this is committed normally. English = "Starting Point - Weekend
// Service", Brazilian = "Starting Point/Brazilian Service" (started Apr 2025).
export type Campus = 'all' | 'english' | 'brazilian'
export interface YearCount { year: number; count: number; partial?: boolean }

export const startingPoint = {
  // All-time cards (first-timer entries) per congregation.
  total: { all: 2435, english: 2219, brazilian: 216 } as Record<Campus, number>,
  // Average first-time visitors per week in 2026.
  avgPerWeek: { all: 10, english: 6, brazilian: 5 } as Record<Campus, number>,
  // First-timers by year (2026 is year-to-date). Brazilian has no 2024 (workflow
  // began Apr 2025), and its 2025 is a partial year.
  byYear: {
    all: [
      { year: 2024, count: 265 },
      { year: 2025, count: 385 },
      { year: 2026, count: 293, partial: true },
    ],
    english: [
      { year: 2024, count: 265 },
      { year: 2025, count: 305 },
      { year: 2026, count: 157, partial: true },
    ],
    brazilian: [
      { year: 2025, count: 80, partial: true },
      { year: 2026, count: 136, partial: true },
    ],
  } as Record<Campus, YearCount[]>,
}
