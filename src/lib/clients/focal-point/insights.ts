// Focal Point Church - Insights (real, aggregate). Safe to commit (no PII).
// Combines Planning Center data (first-time visitor flow, serving) with Focal
// Point's own weekly summary sheet (adult service attendance by service, online
// / YouTube, youth) which lives outside Planning Center. Sources:
// scripts/pull-fp-insights.mjs (PCO) + scripts/parse-fp-summary.mjs (their sheet).

export const focalPointInsights = {
  "kpis": {
    "avgWeekend": 1008,
    "members": 1210,
    "visitors": 3112,
    "volunteers": 2168,
    "youtubeSubscribers": 2384
  },
  "weekendAttendance": {
    "labels": [
      "Jan 4",
      "Jan 11",
      "Jan 18",
      "Jan 25",
      "Feb 1",
      "Feb 8",
      "Feb 15",
      "Feb 22",
      "Mar 1",
      "Mar 8",
      "Mar 15",
      "Mar 22",
      "Mar 29",
      "Apr 5",
      "Apr 12",
      "Apr 19",
      "Apr 26",
      "May 3",
      "May 10",
      "May 17",
      "May 24",
      "May 31",
      "Jun 7",
      "Jun 14",
      "Jun 21",
      "Jun 28",
      "Jul 5"
    ],
    "counts": [
      1068,
      960,
      1083,
      1182,
      801,
      1049,
      1060,
      853,
      1043,
      910,
      1012,
      981,
      978,
      1782,
      1037,
      909,
      842,
      978,
      997,
      999,
      1015,
      923,
      1034,
      894,
      1026,
      929,
      862
    ]
  },
  "adultsKids": {
    "labels": [
      "Jan 4",
      "Jan 11",
      "Jan 18",
      "Jan 25",
      "Feb 1",
      "Feb 8",
      "Feb 15",
      "Feb 22",
      "Mar 1",
      "Mar 8",
      "Mar 15",
      "Mar 22",
      "Mar 29",
      "Apr 5",
      "Apr 12",
      "Apr 19",
      "Apr 26",
      "May 3",
      "May 10",
      "May 17",
      "May 24",
      "May 31",
      "Jun 7",
      "Jun 14",
      "Jun 21",
      "Jun 28",
      "Jul 5"
    ],
    "adults": [
      902,
      803,
      889,
      871,
      596,
      788,
      781,
      618,
      779,
      689,
      733,
      747,
      755,
      1518,
      723,
      671,
      694,
      778,
      829,
      816,
      766,
      735,
      854,
      741,
      862,
      769,
      710
    ],
    "kids": [
      166,
      157,
      194,
      171,
      127,
      156,
      191,
      180,
      166,
      160,
      118,
      179,
      172,
      314,
      182,
      183,
      148,
      200,
      168,
      183,
      186,
      188,
      180,
      153,
      164,
      160,
      152
    ]
  },
  "services": [
    {
      "name": "Sun 9:00",
      "avg": 193
    },
    {
      "name": "Sun 10:30",
      "avg": 269
    },
    {
      "name": "Sun 12:00",
      "avg": 218
    },
    {
      "name": "Brazilian",
      "avg": 262
    }
  ],
  "online": {
    "subscribers": {
      "labels": [
        "Jan 4",
        "Jan 11",
        "Jan 18",
        "Jan 25",
        "Feb 1",
        "Feb 8",
        "Feb 15",
        "Feb 22",
        "Mar 1",
        "Mar 8",
        "Mar 15",
        "Mar 22",
        "Mar 29",
        "Apr 5",
        "Apr 12",
        "Apr 19",
        "Apr 26",
        "May 3",
        "May 10",
        "May 17",
        "May 24",
        "May 31"
      ],
      "counts": [
        2231,
        2242,
        2248,
        2252,
        2260,
        2269,
        2276,
        2284,
        2287,
        2292,
        2296,
        2299,
        2291,
        2303,
        2311,
        2317,
        2328,
        2332,
        2348,
        2357,
        2363,
        2384
      ]
    },
    "liveViews": {
      "labels": [
        "Jan 4",
        "Jan 11",
        "Jan 18",
        "Jan 25",
        "Feb 1",
        "Feb 8",
        "Feb 15",
        "Feb 22",
        "Mar 1",
        "Mar 8",
        "Mar 15",
        "Mar 22",
        "Mar 29",
        "Apr 5",
        "Apr 12",
        "Apr 19",
        "Apr 26",
        "May 3",
        "May 10",
        "May 17",
        "May 24",
        "May 31"
      ],
      "counts": [
        499,
        534,
        473,
        233,
        346,
        257,
        265,
        290,
        238,
        242,
        202,
        217,
        191,
        263,
        215,
        216,
        184,
        190,
        175,
        224,
        182,
        212
      ]
    }
  },
  "youth": {
    "labels": [
      "Jan 11",
      "Jan 18",
      "Jan 25",
      "Feb 1",
      "Feb 8",
      "Feb 15",
      "Feb 22",
      "Mar 1",
      "Mar 8",
      "Mar 22",
      "Mar 29",
      "Apr 5",
      "Apr 12",
      "Apr 19",
      "May 3",
      "May 10",
      "May 17",
      "May 24",
      "May 31",
      "Jun 7"
    ],
    "counts": [
      68,
      68,
      75,
      61,
      72,
      66,
      98,
      74,
      58,
      95,
      114,
      64,
      65,
      42,
      77,
      50,
      87,
      73,
      93,
      54
    ]
  },
  "visitorFlow": {
    "labels": [
      "Jan 11",
      "Jan 18",
      "Jan 25",
      "Feb 1",
      "Feb 8",
      "Feb 15",
      "Feb 22",
      "Mar 1",
      "Mar 8",
      "Mar 15",
      "Mar 22",
      "Mar 29",
      "Apr 5",
      "Apr 12",
      "Apr 19",
      "Apr 26",
      "May 3",
      "May 10",
      "May 17",
      "May 24",
      "May 31",
      "Jun 7",
      "Jun 14",
      "Jun 21",
      "Jun 28",
      "Jul 5"
    ],
    "counts": [
      6,
      17,
      16,
      8,
      14,
      3,
      2,
      17,
      6,
      5,
      16,
      10,
      26,
      10,
      12,
      7,
      14,
      10,
      11,
      8,
      5,
      14,
      8,
      6,
      4,
      7
    ]
  },
  "serving": {
    "volunteers": 2168,
    "lapsed": 104
  },
  // The latest completed weekend, for the "This Weekend" Monday scorecard.
  // Jul 5 2026 was the Fourth of July weekend: Saturday 5:30 and the Spanish /
  // Brazilian service did not meet, which is why the grand total dips. Services
  // that met are listed now-vs-prior-week. All from the weekly summary sheet.
  "thisWeekend": {
    "date": "Jul 5",
    "prevDate": "Jun 28",
    "grand": 862,
    "prevGrand": 929,
    "firstTimers": 7,
    "volunteers": 133,
    "servicesMet": [
      { "name": "Sun 9:00", "now": 185, "prev": 221 },
      { "name": "Sun 10:30", "now": 234, "prev": 278 },
      { "name": "Sun 12:00", "now": 208, "prev": 168 },
      { "name": "Brazilian", "now": 235, "prev": 262 }
    ],
    "servicesAbsent": ["Spanish"]
  },
  // Volunteer check-ins per weekend across all services (real serving load,
  // distinct from the 2,168 six-month distinct roster). Aligned to weekendAttendance labels.
  "weeklyVolunteers": {
    "counts": [174, 134, 154, 163, 150, 143, 166, 87, 169, 143, 155, 147, 151, 198, 156, 78, 116, 148, 137, 136, 128, 116, 134, 123, 131, 132, 133]
  },
  // Body health: engagement penetration across the committed core (Members +
  // Regular Attenders), not the 12k accumulated PCO records. Serving is real
  // from volunteer check-ins; giving and groups light up with those scopes.
  // See scripts/pull-demographics.mjs. Denominator = 1,385 core adults.
  "bodyHealth": {
    "coreAdults": 1385,
    "serving": { "count": 398, "pct": 29, "live": true },
    "groups": { "count": 932, "groupCount": 60, "live": true },
    // growth-group snapshot (real, live from the Groups API). Attendance trend and
    // group-drift come once groups resume meeting in the fall.
    "groupSnapshot": {
      "people": 932,
      "groups": 60,
      "avgAttendance": 8,
      "byType": [
        { "type": "English", "groups": 39, "members": 640, "avgAtt": 8 },
        { "type": "Brazilian", "groups": 13, "members": 298, "avgAtt": 10 },
        { "type": "Youth", "groups": 8, "members": 138, "avgAtt": null }
      ]
    },
    "giving": { "pct": null, "live": false }
  },
  // Salvation responses (hands raised) by year, real, from the Metrics workbooks
  // ("Challenge. Giving" sheet, Raised Hands row). 2026 is year to date (18 weeks),
  // on pace to pass 2025. The mission outcome.
  "salvations": {
    "thisYearTotal": 249,
    "thisYearWeeks": 18,
    "pace": 719,
    "byYear": [
      { "year": 2024, "total": 510, "partial": false },
      { "year": 2025, "total": 629, "partial": false },
      { "year": 2026, "total": 249, "partial": true }
    ]
  },
  // Average weekend attendance by year, real, from their Metrics workbooks
  // (Grand Total row, each year's Weekly Summary sheet). 2024 pending; 2026 is
  // year-to-date through July. The four-year arc: up about 67% since 2022.
  "yearlyAttendance": [
    { "year": 2022, "avg": 602, "partial": false },
    { "year": 2023, "avg": 733, "partial": false },
    { "year": 2024, "avg": 856, "partial": false },
    { "year": 2025, "avg": 983, "partial": false },
    { "year": 2026, "avg": 1008, "partial": true }
  ],
  // Age profile of the committed core adults (18+) who have a birthdate on file.
  // Coverage is about half the core, stated honestly in the UI. The signal that
  // matters: 18-24 is thin (young-adult gap), 35-54 is the center of gravity.
  "ageProfile": {
    "coverage": 49,
    "sample": 680,
    "bands": [
      { "band": "18-24", "count": 26, "pct": 3.8 },
      { "band": "25-34", "count": 109, "pct": 16.0 },
      { "band": "35-44", "count": 185, "pct": 27.2 },
      { "band": "45-54", "count": 166, "pct": 24.4 },
      { "band": "55-64", "count": 107, "pct": 15.7 },
      { "band": "65+", "count": 87, "pct": 12.8 }
    ]
  }
} as const
