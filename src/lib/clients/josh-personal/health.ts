/**
 * Josh Personal — shared mock data for the Health-area modules.
 *
 * One source of truth so the Health / Plan / Trends / Bloodwork /
 * Goals modules don't drift apart. When real data wires up (Phase
 * 0+1 — Apple Health webhook), this file becomes a composable that
 * pulls from Supabase instead of returning fixtures.
 *
 * Demo state is anchored to "Saturday morning, 18 minutes after
 * Sage drafted next week's plan" — the highest-information moment.
 */

// ── Constants
export const STEPS_DAILY_TARGET = 10_000
export const TODAY_LABEL = 'Saturday, May 9'
export const NEXT_WEEK_LABEL = 'Mon May 11 - Sun May 17'

// ── Sage activity (recent moves she's made)
export interface SageActivity {
  icon: string
  label: string
  detail: string
  ago: string
  cta?: boolean
}

export const sageActivity: SageActivity[] = [
  {
    icon: '📋',
    label: 'Drafted next week\'s plan',
    detail: '7-day meals · 4-day push/pull/legs split · 23-item shopping list ready',
    ago: '18m ago',
    cta: true,
  },
  {
    icon: '⚠️',
    label: 'Pulled saturated fat to 18g/day',
    detail: 'Your LDL is trending wrong direction (110→128→141→148 over 4 panels)',
    ago: '18m ago',
  },
  {
    icon: '💪',
    label: 'Bumped protein target to 185g/day',
    detail: 'You\'ve been undereating it 3 weeks running (avg 168g vs 180 target)',
    ago: '18m ago',
  },
  {
    icon: '📈',
    label: 'Increased push-day volume +8%',
    detail: 'HRV recovered (52 → 58 avg this week), on schedule for week 5 of program',
    ago: '18m ago',
  },
]

// ── Today snapshot
export interface SnapshotMetric {
  value: string | number
  unit: string
  delta: string
  trend: 'up' | 'down' | 'flat'
}

export const snapshot: Record<'sleep' | 'steps' | 'weight' | 'hrv' | 'streak', SnapshotMetric> = {
  sleep:  { value: 7.4,    unit: 'h',    delta: '+0.3h vs avg',          trend: 'up' },
  steps:  { value: '8,247', unit: '',     delta: 'on pace · 10k goal',    trend: 'flat' },
  weight: { value: 172.4,  unit: 'lbs',  delta: '−2.1 lbs / 30d',        trend: 'down' },
  hrv:    { value: 58,     unit: 'ms',   delta: '+4ms vs avg',           trend: 'up' },
  streak: { value: 12,     unit: 'days', delta: 'logged',                trend: 'flat' },
}

// ── Active concerns (from latest blood work, drive weekly planning)
export interface Concern {
  label: string
  value: string
  target: string
  severity: 'warn' | 'danger'
  constraint: string
}

export const activeConcerns: Concern[] = [
  {
    label: 'LDL high',
    value: '148 mg/dL',
    target: '<130',
    severity: 'warn',
    constraint: 'Saturated fat <20g/day · butter → olive oil · red meat ≤2x/week',
  },
  {
    label: 'Vit D borderline',
    value: '32 ng/mL',
    target: '>30',
    severity: 'warn',
    constraint: 'Continue 2k IU/day supplement + sunlight exposure',
  },
]

// ── Weekly plan (current week awaiting approval — drafted Saturday)
export interface Meal {
  name: string
  cal: number
  protein: number
  detail: string
}

export interface DayPlan {
  day: string
  date: string
  workout: string | null
  workoutDetail?: string
  workoutExercises?: { name: string; sets: string; load: string; notes?: string }[]
  meals: { breakfast: Meal; lunch: Meal; dinner: Meal; snacks: Meal }
  totalCal: number
  totalProtein: number
  isToday?: boolean
}

export const weeklyPlan: DayPlan[] = [
  {
    day: 'Mon', date: 'May 11',
    workout: 'Push',
    workoutDetail: 'Bench 4×6, OHP 3×8, Incline DB 3×10, Tri+Lat raises',
    workoutExercises: [
      { name: 'Bench press', sets: '4 × 6', load: '185 lbs', notes: 'Add 5 lbs vs last session' },
      { name: 'Overhead press', sets: '3 × 8', load: '105 lbs' },
      { name: 'Incline DB press', sets: '3 × 10', load: '50s' },
      { name: 'Tricep pushdown', sets: '3 × 12', load: '70 lbs', notes: 'Superset' },
      { name: 'Lateral raises', sets: '3 × 15', load: '15s', notes: 'Superset with above' },
    ],
    meals: {
      breakfast: { name: 'Overnight oats + berries', cal: 480, protein: 28, detail: '½ cup oats, Greek yogurt, mixed berries, almonds' },
      lunch:     { name: 'Chipotle bowl', cal: 680, protein: 62, detail: 'Double chicken, brown rice, fajita peppers, salsa, no cheese' },
      dinner:    { name: 'Olive-oil-poached salmon', cal: 720, protein: 50, detail: '6oz salmon, roasted sweet potato 200g, large salad with EVOO' },
      snacks:    { name: 'Protein + apple', cal: 320, protein: 38, detail: 'Greek yogurt + almonds (3pm), apple post-workout' },
    },
    totalCal: 2200, totalProtein: 178,
  },
  {
    day: 'Tue', date: 'May 12',
    workout: 'Pull',
    workoutDetail: 'Pull-ups 4×8, Rows 3×8, Lat pulldown 3×12, Curls + face pulls',
    workoutExercises: [
      { name: 'Pull-ups', sets: '4 × 8', load: 'BW' },
      { name: 'Barbell row', sets: '3 × 8', load: '155 lbs' },
      { name: 'Lat pulldown', sets: '3 × 12', load: '120 lbs' },
      { name: 'DB curls', sets: '3 × 12', load: '30s', notes: 'Superset' },
      { name: 'Face pulls', sets: '3 × 15', load: '50 lbs', notes: 'Superset with above' },
    ],
    meals: {
      breakfast: { name: 'Greek yogurt parfait', cal: 460, protein: 38, detail: '2 cups Greek yogurt, granola, blueberries, honey' },
      lunch:     { name: 'Grilled chicken salad', cal: 620, protein: 58, detail: 'Romaine, grilled chicken 6oz, chickpeas, cucumber, lemon-EVOO' },
      dinner:    { name: 'Chicken thigh + quinoa', cal: 740, protein: 56, detail: 'Boneless thigh 6oz, quinoa 200g cooked, roasted broccoli' },
      snacks:    { name: 'Protein + nuts', cal: 320, protein: 35, detail: 'Whey shake + 1oz almonds + 1 banana' },
    },
    totalCal: 2200, totalProtein: 187,
  },
  {
    day: 'Wed', date: 'May 13',
    workout: 'Legs',
    workoutDetail: 'Squat 4×6, RDL 3×8, Lunges 3×10/leg, Calf raises 4×15',
    workoutExercises: [
      { name: 'Back squat', sets: '4 × 6', load: '225 lbs' },
      { name: 'Romanian deadlift', sets: '3 × 8', load: '195 lbs' },
      { name: 'Walking lunges', sets: '3 × 10/leg', load: '40s' },
      { name: 'Calf raises', sets: '4 × 15', load: '180 lbs' },
    ],
    meals: {
      breakfast: { name: 'Veggie omelette + toast', cal: 510, protein: 32, detail: '3 eggs, spinach, tomato, mushroom, 2 slices sprouted toast' },
      lunch:     { name: 'Turkey burrito bowl', cal: 690, protein: 55, detail: '6oz ground turkey, brown rice, beans, avocado, salsa' },
      dinner:    { name: 'Tofu stir-fry + jasmine rice', cal: 700, protein: 42, detail: '8oz extra-firm tofu, mixed veggies, low-sodium soy, ginger' },
      snacks:    { name: 'Cottage cheese + fruit', cal: 300, protein: 36, detail: 'Cottage cheese 1 cup, sliced peach, walnuts' },
    },
    totalCal: 2200, totalProtein: 165,
  },
  {
    day: 'Thu', date: 'May 14',
    workout: null,
    meals: {
      breakfast: { name: 'Oatmeal + protein', cal: 460, protein: 32, detail: '½ cup oats with whey scoop, banana, peanut butter' },
      lunch:     { name: 'Turkey + avocado wrap', cal: 580, protein: 48, detail: 'Whole-grain tortilla, turkey 6oz, avocado, spinach, mustard' },
      dinner:    { name: 'Olive-oil-poached salmon', cal: 660, protein: 48, detail: 'Same as Mon — repeat for grocery efficiency' },
      snacks:    { name: 'Greek yogurt + berries', cal: 200, protein: 24, detail: 'Lower today — rest day, smaller calorie target' },
    },
    totalCal: 1900, totalProtein: 152,
  },
  {
    day: 'Fri', date: 'May 15',
    workout: 'Full body',
    workoutDetail: 'Trap bar deadlift 4×5, DB press 3×10, Pull-ups 3×AMRAP, Plank',
    workoutExercises: [
      { name: 'Trap bar deadlift', sets: '4 × 5', load: '275 lbs' },
      { name: 'DB bench press', sets: '3 × 10', load: '60s' },
      { name: 'Pull-ups', sets: '3 × AMRAP', load: 'BW' },
      { name: 'Plank', sets: '3 × 60s', load: 'BW' },
    ],
    meals: {
      breakfast: { name: 'Pancakes (protein) + fruit', cal: 540, protein: 36, detail: 'Kodiak Cakes mix, blueberries, sugar-free syrup' },
      lunch:     { name: 'Salmon poké bowl', cal: 660, protein: 50, detail: 'Brown rice, raw salmon 5oz, edamame, cucumber, sesame, ponzu' },
      dinner:    { name: 'Chicken parm (lighter)', cal: 700, protein: 60, detail: 'Baked chicken 6oz, marinara, ¼ cup mozz, side zucchini noodles' },
      snacks:    { name: 'Protein + nuts', cal: 300, protein: 33, detail: 'Whey shake + 1oz almonds' },
    },
    totalCal: 2200, totalProtein: 179,
  },
  {
    day: 'Sat', date: 'May 16',
    workout: 'Cardio (zone 2)',
    workoutDetail: '45 min easy bike or walk · zone 2 HR · low impact',
    workoutExercises: [
      { name: 'Zone 2 cardio', sets: '45 min', load: 'easy bike or walk', notes: 'Keep HR in zone 2 (~125-145)' },
    ],
    isToday: true,
    meals: {
      breakfast: { name: 'Veggie omelette + toast', cal: 480, protein: 30, detail: '3 eggs, peppers, onion, sprouted toast' },
      lunch:     { name: 'Chipotle bowl', cal: 680, protein: 62, detail: 'Same template as Mon' },
      dinner:    { name: 'Olive-oil-poached salmon', cal: 720, protein: 50, detail: 'Final salmon serving for the week' },
      snacks:    { name: 'Yogurt + berries', cal: 320, protein: 38, detail: 'Greek yogurt + frozen berries + almonds' },
    },
    totalCal: 2200, totalProtein: 180,
  },
  {
    day: 'Sun', date: 'May 17',
    workout: null,
    meals: {
      breakfast: { name: 'Breakfast burrito', cal: 540, protein: 38, detail: 'Whole-grain wrap, 3 eggs, black beans, salsa, avocado' },
      lunch:     { name: 'Chicken Caesar (light)', cal: 580, protein: 56, detail: 'Romaine, grilled chicken, parm, anchovy, lemon-EVOO dressing' },
      dinner:    { name: 'Pizza night (controlled)', cal: 750, protein: 36, detail: '2 slices thin-crust + large salad — flexed weekly treat' },
      snacks:    { name: 'Protein + fruit', cal: 330, protein: 32, detail: 'Whey shake + apple, evening' },
    },
    totalCal: 2200, totalProtein: 162,
  },
]

export function todayPlan(): DayPlan | null {
  return weeklyPlan.find((d) => d.isToday) ?? null
}

export function weekTotals() {
  const days = weeklyPlan.length
  const totalCal = weeklyPlan.reduce((s, d) => s + d.totalCal, 0)
  const totalProtein = weeklyPlan.reduce((s, d) => s + d.totalProtein, 0)
  const workoutDays = weeklyPlan.filter((d) => d.workout).length
  return {
    avgCal: Math.round(totalCal / days),
    avgProtein: Math.round(totalProtein / days),
    workoutDays,
    deficitVsMaintain: 2700 - Math.round(totalCal / days),
  }
}

export const weekStrategy = `Continue the cut at ~500 cal/day deficit. Saturated fat aggressively reduced (your LDL is the priority signal). Protein bumped to 185g/day to fix the under-hitting we saw the last 3 weeks. Push volume +8% — HRV recovered, you're on schedule for week 5 of the program. One flexed Sunday treat (pizza) keeps the cut sustainable.`

// ── Sage's swaps (biomarker-driven changes vs. her default plan)
export interface Swap {
  day: string
  change: string
  why: string
}

export const swaps: Swap[] = [
  {
    day: 'Mon, Thu, Sat',
    change: 'Olive-oil-poached salmon (instead of butter-poached)',
    why: 'LDL flagged · saturated fat ceiling 18g/day',
  },
  {
    day: 'Wed lunch',
    change: 'Ground turkey burrito (instead of ground beef)',
    why: 'LDL flagged · red meat capped at 2x/week (Fri & Sun)',
  },
  {
    day: 'Fri dinner',
    change: 'Lighter chicken parm — reduced mozzarella from 1 cup to ¼',
    why: 'LDL flagged · would have put you 6g over saturated fat ceiling',
  },
  {
    day: 'Daily',
    change: 'Bumped Greek yogurt + nut snacks (high protein density)',
    why: 'Protein under-hit by 12g/day for 3 weeks running',
  },
]

// ── Shopping list (aggregated from weekly plan)
export interface ShopItem {
  name: string
  qty: string
  category: string
}

export const shoppingList: ShopItem[] = [
  // Proteins
  { name: 'Wild salmon fillets', qty: '24 oz (3 servings)', category: 'Proteins' },
  { name: 'Chicken breast', qty: '2 lbs', category: 'Proteins' },
  { name: 'Chicken thighs (boneless)', qty: '12 oz', category: 'Proteins' },
  { name: 'Ground turkey 93/7', qty: '1 lb', category: 'Proteins' },
  { name: 'Eggs', qty: '2 dozen', category: 'Proteins' },
  { name: 'Greek yogurt (plain, 2%)', qty: '32 oz tub', category: 'Proteins' },
  { name: 'Cottage cheese', qty: '16 oz', category: 'Proteins' },
  { name: 'Extra-firm tofu', qty: '14 oz', category: 'Proteins' },
  // Carbs
  { name: 'Steel-cut oats', qty: '1 lb bag', category: 'Carbs & Grains' },
  { name: 'Brown rice (cooked)', qty: '4 cups (or 1 lb dry)', category: 'Carbs & Grains' },
  { name: 'Quinoa', qty: '1 lb', category: 'Carbs & Grains' },
  { name: 'Sweet potatoes', qty: '4 medium', category: 'Carbs & Grains' },
  { name: 'Sprouted whole-grain bread', qty: '1 loaf', category: 'Carbs & Grains' },
  // Produce
  { name: 'Spinach + romaine mix', qty: '2 boxes', category: 'Produce' },
  { name: 'Mixed berries (frozen)', qty: '32 oz bag', category: 'Produce' },
  { name: 'Bananas', qty: '6', category: 'Produce' },
  { name: 'Apples', qty: '4', category: 'Produce' },
  { name: 'Avocado', qty: '3', category: 'Produce' },
  { name: 'Broccoli', qty: '2 crowns', category: 'Produce' },
  // Pantry
  { name: 'Extra-virgin olive oil', qty: '500ml (replenish)', category: 'Pantry' },
  { name: 'Almonds (raw)', qty: '8 oz', category: 'Pantry' },
  { name: 'Whey protein', qty: 'restock if low', category: 'Pantry' },
  { name: 'Black beans (canned, low-sodium)', qty: '2 cans', category: 'Pantry' },
]

export const shoppingEstimateUsd = 94

// ── Blood work
export interface Marker {
  name: string
  latest: number
  unit: string
  range: string
  status: 'good' | 'warn' | 'danger'
  history: number[]
  trendNote: string
}

export const bloodwork = {
  drawnAt: 'April 12, 2026',
  drawnBy: 'Quest Diagnostics',
  markers: [
    { name: 'LDL Cholesterol',     latest: 148, unit: 'mg/dL', range: '<130',     status: 'warn' as const, history: [110, 128, 141, 148], trendNote: 'Up 38pts in 12mo' },
    { name: 'HDL Cholesterol',     latest: 52,  unit: 'mg/dL', range: '>40',      status: 'good' as const, history: [48, 50, 51, 52],     trendNote: 'Steady, on the right side' },
    { name: 'Triglycerides',       latest: 88,  unit: 'mg/dL', range: '<150',     status: 'good' as const, history: [90, 85, 92, 88],     trendNote: 'Solid' },
    { name: 'Hemoglobin A1C',      latest: 5.4, unit: '%',     range: '<5.7',     status: 'good' as const, history: [5.5, 5.4, 5.4, 5.4], trendNote: 'No glucose drift' },
    { name: 'Vitamin D',           latest: 32,  unit: 'ng/mL', range: '30-100',   status: 'warn' as const, history: [24, 28, 30, 32],     trendNote: 'Just over the floor — sun + 2k IU/day worked' },
    { name: 'Total Testosterone',  latest: 640, unit: 'ng/dL', range: '264-916',  status: 'good' as const, history: [610, 605, 625, 640], trendNote: 'Trending up since strength block' },
    { name: 'TSH',                 latest: 2.1, unit: 'mIU/L', range: '0.4-4.5',  status: 'good' as const, history: [2.0, 1.9, 2.2, 2.1], trendNote: 'Thyroid stable' },
    { name: 'CRP (inflammation)',  latest: 0.8, unit: 'mg/L', range: '<3.0',     status: 'good' as const, history: [0.6, 0.9, 0.7, 0.8], trendNote: 'Low — recovery is good' },
  ] satisfies Marker[],
  pastDraws: [
    { date: 'Apr 12, 2026', notes: 'Annual physical · Quest' },
    { date: 'Jan 8, 2026',  notes: 'Quarterly check-in · Quest' },
    { date: 'Oct 5, 2025',  notes: 'Quarterly check-in · LabCorp' },
    { date: 'Jul 14, 2025', notes: 'Quarterly check-in · Quest' },
  ],
  sageRead: 'LDL is up 38 points across 4 draws — ~12% per panel. Strongest correlation in your food log: saturated fat averaged 32g/day this quarter (vs 18g in the prior year). Recommend swapping butter → olive oil for cooking and reducing red meat to 2x/week. Re-test in 90 days. Everything else is in good shape and trending the right direction.',
}

// ── Trends
export interface SeriesTrend {
  values: number[]
  label: string
  summary: string
  unit?: string
  targetLine?: number
}
export interface BarTrend {
  weeklyCounts: number[]
  label: string
  summary: string
}

export const trends = {
  weight: {
    values: [177.2, 176.8, 175.9, 175.1, 174.6, 173.8, 172.9, 172.4],
    label: 'Weight, last 8 weeks',
    summary: '−4.8 lbs in 8 weeks · on pace for 168 by Jul 1',
    unit: 'lbs',
  } satisfies SeriesTrend,
  sleep: {
    values: [6.8, 7.0, 6.5, 7.4, 7.2, 7.6, 7.4, 7.4],
    label: 'Sleep, last 8 weeks',
    summary: '7.2h average · best week was 7.6h',
    unit: 'h',
  } satisfies SeriesTrend,
  hrv: {
    values: [54, 56, 52, 51, 53, 56, 58, 58],
    label: 'HRV (morning), last 8 weeks',
    summary: 'Recovered from a dip in week 3 · trending up',
    unit: 'ms',
  } satisfies SeriesTrend,
  steps: {
    values: [9_240, 8_810, 11_450, 10_320, 9_870, 12_140, 10_580, 9_440],
    label: 'Daily steps, last 8 weeks (avg)',
    summary: 'Avg 10,232/day · hit 10k goal 5 of 7 days last week',
    unit: '',
    targetLine: STEPS_DAILY_TARGET,
  } satisfies SeriesTrend,
  activeCal: {
    values: [410, 380, 520, 460, 440, 580, 470, 430],
    label: 'Active cal, last 8 weeks (avg/day)',
    summary: 'Spike on weeks 3 + 6 = travel weeks (more walking)',
    unit: '',
  } satisfies SeriesTrend,
  workouts: {
    weeklyCounts: [3, 4, 4, 3, 4, 5, 4, 4],
    label: 'Workouts/week, last 8 weeks',
    summary: 'Avg 3.9/week · target is 4',
  } satisfies BarTrend,
}

// ── Steps summary
export const stepsSummary = {
  weekAvg: 10_232,
  daysHitGoal: 5,
  daysInWeek: 7,
  longestStreak: 18,
  todayProgress: 8_247,
}

// ── Goals
export interface Goal {
  label: string
  progress: number
  status: 'on-track' | 'off-track' | 'at-risk'
  detail: string
  sageNarrative: string
}

export const goals: Goal[] = [
  {
    label: 'Cut to 168 lbs by Jul 1',
    progress: 0.69,
    status: 'on-track',
    detail: '−2.1 lbs / 30d · 4.4 lbs to go',
    sageNarrative: 'On pace at ~0.5 lb/week. Current ~500 cal deficit is sustainable. If weight stalls 2 weeks in a row, I\'ll bump deficit to 600.',
  },
  {
    label: 'LDL under 130 by next draw',
    progress: 0.0,
    status: 'off-track',
    detail: 'Trending wrong · this week\'s plan addresses it',
    sageNarrative: 'LDL has gone 110→128→141→148 across 4 panels. This week I cut sat fat from 32g/day average down to 18g, swapped butter→olive oil, capped red meat at 2x/week. Expecting a 15-25 pt drop by next quarterly draw if you stick to plan.',
  },
  {
    label: 'Bench 225 × 5 by Q3',
    progress: 0.78,
    status: 'on-track',
    detail: 'At 205 × 5 · adding 5 lbs / 2 sessions',
    sageNarrative: 'Linear progression is holding at +5 lbs every other push session. At current pace you hit 225×5 in week 7 of Q3 — comfortably ahead of deadline.',
  },
  {
    label: 'Sleep 7.5h average',
    progress: 0.99,
    status: 'on-track',
    detail: '7.4h 30-day · within margin',
    sageNarrative: 'You\'re effectively at goal. Don\'t over-optimize this; the variation week-to-week is noise. Watch for a sleep debt only if HRV drops 3 days in a row.',
  },
]

// ── Helpers shared across modules
export function buildSparklinePath(values: number[], width = 200, height = 40): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** Y-coordinate of a horizontal target line within the same scaled space. */
export function sparklineTargetY(values: number[], target: number, height = 40): number {
  const min = Math.min(...values, target)
  const max = Math.max(...values, target)
  const range = max - min || 1
  return height - ((target - min) / range) * (height - 4) - 2
}

export function statusClass(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return 'bg-success/15 text-success'
  if (status === 'warn')   return 'bg-warn/15 text-warn'
  return 'bg-danger/15 text-danger'
}

export function statusIcon(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return '✓'
  if (status === 'warn')   return '⚠'
  return '✕'
}

export function trendArrow(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up')   return '↑'
  if (trend === 'down') return '↓'
  return '·'
}

export function goalToneClass(status: string): string {
  if (status === 'on-track')  return 'bg-success'
  if (status === 'off-track') return 'bg-danger'
  return 'bg-warn'
}
