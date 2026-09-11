// Focal Point Church - growth group monthly attendance (real, from the Groups
// API: event attendance summed by month). Aggregate, no PII.
//
// Sep 2025 through May 2026 are from the 2026-07-13 pull; Jun 2026 onward were
// re-pulled 2026-09-11, which is why June moved from 332 to 466 (attendance is
// often logged weeks after the meeting). The page used to stop at June and say
// "the summer wind-down as groups break" in September, while August had 734
// attendances logged and September was on pace for a spring-level month.
export const focalPointGroupInsights: {
  asOf: string
  monthly: { label: string; total: number; partial?: boolean }[]
} = {
  asOf: 'Sep 11',
  monthly: [
    { label: 'Sep 25', total: 1515 }, { label: 'Oct 25', total: 1621 }, { label: 'Nov 25', total: 1214 },
    { label: 'Dec 25', total: 619 }, { label: 'Jan 26', total: 895 }, { label: 'Feb 26', total: 1480 },
    { label: 'Mar 26', total: 1555 }, { label: 'Apr 26', total: 1415 }, { label: 'May 26', total: 929 },
    { label: 'Jun 26', total: 466 }, { label: 'Jul 26', total: 108 }, { label: 'Aug 26', total: 734 },
    { label: 'Sep 26', total: 490, partial: true },
  ],
}
