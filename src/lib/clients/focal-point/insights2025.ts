// Focal Point Church - 2025 weekend attendance, REAL, from their Metrics 2025
// workbook (the "2025 Weekly Summary" sheet, Grand Total row). These are the
// first 27 weeks, aligned to the 2026 Jan-through-Jul window for the year-over-year
// overlay. Note the Easter offset: 2026 Easter fell Apr 5, 2025 Easter fell about
// Apr 20, so the spikes (1,782 in 2026, 1,576 in 2025) land in different weeks.
// Grace's read explains that so a moved feast does not read as a swing.
export const focalPoint2025 = {
  isSample: false,
  labels: [
    'Jan 4', 'Jan 11', 'Jan 18', 'Jan 25', 'Feb 1', 'Feb 8', 'Feb 15', 'Feb 22',
    'Mar 1', 'Mar 8', 'Mar 15', 'Mar 22', 'Mar 29', 'Apr 5', 'Apr 12', 'Apr 19',
    'Apr 26', 'May 3', 'May 10', 'May 17', 'May 24', 'May 31', 'Jun 7', 'Jun 14',
    'Jun 21', 'Jun 28', 'Jul 5',
  ],
  counts: [
    992, 924, 940, 949, 958, 894, 984, 1055, 929, 889, 882, 910, 893, 891, 926,
    1576, 977, 934, 1033, 990, 834, 931, 947, 852, 858, 886, 881,
  ],
  avgWeekend: 952, // first-27-weeks avg; 2026 same stretch is 1,008 => +5.9% YoY
} as const
