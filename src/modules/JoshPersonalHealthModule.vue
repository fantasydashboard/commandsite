<script setup lang="ts">
/**
 * Josh Personal — Health module (mocked v2: weekly cadence).
 *
 * Architecture this mock represents:
 *  - Sage drafts a NEW weekly plan every Saturday morning (Josh shops
 *    Saturday for meals starting Monday). Drafted plan awaits Josh's
 *    review/edit/approve before becoming the active week.
 *  - Each weekly plan reads ALL of Josh's data holistically: weight
 *    trend, sleep/HRV, last week's actuals (planned vs done), current
 *    blood work concerns, and active goals.
 *  - Blood work concerns become HARD CONSTRAINTS in the planning prompt
 *    (e.g. "LDL high → saturated fat <20g/day, swap butter→olive oil").
 *  - Sage shows the explicit SWAPS she made because of those concerns
 *    so Josh can see why each meal looks the way it does.
 *  - Daily view pulls today's slice from the active weekly plan.
 *
 * Demo state is locked to "Saturday morning, 18 minutes after Sage
 * drafted next week's plan" — the highest-information moment to show.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── DEMO TIME ANCHOR ──────────────────────────────────────────────────
// Locked to a specific Saturday morning so the "next week's plan ready"
// flow makes sense. Real version reads from `new Date()`.
const todayLabel = 'Saturday, May 9'
const nextWeekLabel = 'Mon May 11 - Sun May 17'

// ── SAGE ACTIVITY ─────────────────────────────────────────────────────
const sageActivity = [
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

// ── SNAPSHOT ──────────────────────────────────────────────────────────
const snapshot = {
  sleep: { value: 7.4, unit: 'h', delta: '+0.3h vs avg', trend: 'up' as const },
  steps: { value: '8,247', unit: '', delta: 'on pace · 10k goal', trend: 'flat' as const },
  weight: { value: 172.4, unit: 'lbs', delta: '−2.1 lbs / 30d', trend: 'down' as const },
  hrv: { value: 58, unit: 'ms', delta: '+4ms vs avg', trend: 'up' as const },
  streak: { value: 12, unit: 'days', delta: 'logged', trend: 'flat' as const },
}

// ── ACTIVE CONCERNS (from latest blood work, drive weekly planning) ──
const activeConcerns = [
  {
    label: 'LDL high',
    value: '148 mg/dL',
    target: '<130',
    severity: 'warn' as const,
    constraint: 'Saturated fat <20g/day · butter → olive oil · red meat ≤2x/week',
  },
  {
    label: 'Vit D borderline',
    value: '32 ng/mL',
    target: '>30',
    severity: 'warn' as const,
    constraint: 'Continue 2k IU/day supplement + sunlight exposure',
  },
]

// ── WEEKLY PLAN (the new draft, awaiting approval) ───────────────────
type Meal = { name: string; cal: number; protein: number; detail: string }
type DayPlan = {
  day: string
  date: string
  workout: string | null
  workoutDetail?: string
  meals: { breakfast: Meal; lunch: Meal; dinner: Meal; snacks: Meal }
  totalCal: number
  totalProtein: number
  isToday?: boolean
}

const weeklyPlan: DayPlan[] = [
  {
    day: 'Mon', date: 'May 11',
    workout: 'Push',
    workoutDetail: 'Bench 4×6, OHP 3×8, Incline DB 3×10, Tri+Lat raises',
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

const weekTotals = computed(() => {
  const days = weeklyPlan.length
  const totalCal = weeklyPlan.reduce((s, d) => s + d.totalCal, 0)
  const totalProtein = weeklyPlan.reduce((s, d) => s + d.totalProtein, 0)
  const workoutDays = weeklyPlan.filter((d) => d.workout).length
  return {
    avgCal: Math.round(totalCal / days),
    avgProtein: Math.round(totalProtein / days),
    workoutDays,
    deficitVsMaintain: 2700 - Math.round(totalCal / days), // assumes 2700 maintenance
  }
})

const weekStrategy = `Continue the cut at ~500 cal/day deficit. Saturated fat aggressively reduced (your LDL is the priority signal). Protein bumped to 185g/day to fix the under-hitting we saw the last 3 weeks. Push volume +8% — HRV recovered, you're on schedule for week 5 of the program. One flexed Sunday treat (pizza) keeps the cut sustainable.`

// ── SAGE'S SWAPS (biomarker-driven changes vs. her default plan) ─────
const swaps = [
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

// ── SHOPPING LIST (aggregated from weekly plan) ──────────────────────
type ShopItem = { name: string; qty: string; category: string }
const shoppingList: ShopItem[] = [
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

const shoppingByCategory = computed(() => {
  const grouped = new Map<string, ShopItem[]>()
  for (const item of shoppingList) {
    if (!grouped.has(item.category)) grouped.set(item.category, [])
    grouped.get(item.category)!.push(item)
  }
  return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }))
})

const shoppingChecked = ref<Set<string>>(new Set())
function toggleItem(name: string) {
  const next = new Set(shoppingChecked.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  shoppingChecked.value = next
}

// ── BLOOD WORK ──────────────────────────────────────────────────────
type Marker = {
  name: string
  latest: number
  unit: string
  range: string
  status: 'good' | 'warn' | 'danger'
  history: number[]
  trendNote: string
}
const bloodwork = {
  drawnAt: 'April 12, 2026',
  drawnBy: 'Quest Diagnostics',
  markers: [
    { name: 'LDL Cholesterol',  latest: 148, unit: 'mg/dL', range: '<130',     status: 'warn'   as const, history: [110, 128, 141, 148], trendNote: 'Up 38pts in 12mo' },
    { name: 'HDL Cholesterol',  latest: 52,  unit: 'mg/dL', range: '>40',      status: 'good'   as const, history: [48, 50, 51, 52],     trendNote: 'Steady, on the right side' },
    { name: 'Triglycerides',    latest: 88,  unit: 'mg/dL', range: '<150',     status: 'good'   as const, history: [90, 85, 92, 88],     trendNote: 'Solid' },
    { name: 'Hemoglobin A1C',   latest: 5.4, unit: '%',     range: '<5.7',     status: 'good'   as const, history: [5.5, 5.4, 5.4, 5.4], trendNote: 'No glucose drift' },
    { name: 'Vitamin D',        latest: 32,  unit: 'ng/mL', range: '30-100',   status: 'warn'   as const, history: [24, 28, 30, 32],     trendNote: 'Just over the floor — sun + 2k IU/day worked' },
    { name: 'Total Testosterone', latest: 640, unit: 'ng/dL', range: '264-916', status: 'good' as const, history: [610, 605, 625, 640], trendNote: 'Trending up since strength block' },
    { name: 'TSH',              latest: 2.1, unit: 'mIU/L', range: '0.4-4.5',  status: 'good'   as const, history: [2.0, 1.9, 2.2, 2.1], trendNote: 'Thyroid stable' },
    { name: 'CRP (inflammation)', latest: 0.8, unit: 'mg/L', range: '<3.0',    status: 'good'   as const, history: [0.6, 0.9, 0.7, 0.8], trendNote: 'Low — recovery is good' },
  ] satisfies Marker[],
}

// ── TRENDS ──────────────────────────────────────────────────────────
function buildSparklinePath(values: number[], width = 200, height = 40): string {
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
const trends = {
  weight: {
    values: [177.2, 176.8, 175.9, 175.1, 174.6, 173.8, 172.9, 172.4],
    label: 'Weight, last 8 weeks',
    summary: '−4.8 lbs in 8 weeks · on pace for 168 by Jul 1',
  },
  sleep: {
    values: [6.8, 7.0, 6.5, 7.4, 7.2, 7.6, 7.4, 7.4],
    label: 'Sleep, last 8 weeks',
    summary: '7.2h average · best week was 7.6h',
  },
  workouts: {
    weeklyCounts: [3, 4, 4, 3, 4, 5, 4, 4],
    label: 'Workouts/week, last 8 weeks',
    summary: 'Avg 3.9/week · target is 4',
  },
}

// ── GOALS ──────────────────────────────────────────────────────────
const goals = [
  { label: 'Cut to 168 lbs by Jul 1', progress: 0.69, status: 'on-track', detail: '−2.1 lbs / 30d · 4.4 lbs to go' },
  { label: 'LDL under 130 by next draw', progress: 0.0, status: 'off-track', detail: 'Trending wrong · this week\'s plan addresses it' },
  { label: 'Bench 225 × 5 by Q3', progress: 0.78, status: 'on-track', detail: 'At 205 × 5 · adding 5 lbs / 2 sessions' },
  { label: 'Sleep 7.5h average', progress: 0.99, status: 'on-track', detail: '7.4h 30-day · within margin' },
]

// ── HELPERS ──────────────────────────────────────────────────────────
function statusClass(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return 'bg-success/15 text-success'
  if (status === 'warn')   return 'bg-warn/15 text-warn'
  return 'bg-danger/15 text-danger'
}
function statusIcon(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return '✓'
  if (status === 'warn')   return '⚠'
  return '✕'
}
function trendArrow(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up')   return '↑'
  if (trend === 'down') return '↓'
  return '·'
}
function goalToneClass(status: string): string {
  if (status === 'on-track')  return 'bg-success'
  if (status === 'off-track') return 'bg-danger'
  return 'bg-warn'
}

// ── EXPANSION STATE for week grid ───────────────────────────────────
const expandedDay = ref<string | null>(null)
function toggleDay(day: string) {
  expandedDay.value = expandedDay.value === day ? null : day
}

// ── ASK SAGE ──────────────────────────────────────────────────────────
const chatOpen = ref(false)
const chatInput = ref('')
const samplePrompts = [
  'plan around 200g protein this week',
  'why is my LDL not dropping faster?',
  'i\'m sore tomorrow — should i swap workouts?',
  'log: ate 2 eggs + oatmeal + coffee for breakfast',
]
</script>

<template>
  <div class="space-y-5">
    <!-- ── Sage activity strip ──────────────────────────────────────── -->
    <section class="card overflow-hidden p-0 border border-brand/30">
      <div class="flex items-start gap-3 bg-brand/5 px-5 py-3 border-b border-brand/20">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand flex-shrink-0">
          <AssistantMark class="h-5 w-5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <span class="text-sm font-semibold text-ink">Sage's role on this page</span>
            <span class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span>🌿</span>
              <span>Health Coach</span>
            </span>
          </div>
          <p class="text-xs text-ink-muted leading-relaxed">
            Sage drafts your weekly meal + workout plan every Saturday before you shop, then adjusts daily as your data flows in. She filters everything through your current blood work concerns.
          </p>
        </div>
      </div>
      <div class="px-5 py-3 bg-surface-raised">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
          Sage's recent activity here
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="(a, i) in sageActivity"
            :key="i"
            class="flex items-start gap-2 text-xs"
          >
            <span class="text-base shrink-0 leading-none mt-0.5">{{ a.icon }}</span>
            <span class="flex-1 min-w-0">
              <span class="font-semibold text-ink">{{ a.label }}</span>
              <span class="text-ink-muted">  {{ a.detail }}</span>
            </span>
            <span class="text-[10px] text-ink-disabled shrink-0">{{ a.ago }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── HERO: Next week's plan ready for review ──────────────────── -->
    <section class="rounded-card border-2 border-brand/40 bg-brand/5 overflow-hidden">
      <div class="px-5 py-4 border-b border-brand/20 bg-brand/10">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="flex items-start gap-3">
            <AssistantMark class="h-6 w-6 text-brand mt-0.5" />
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
                Next week's plan ready
              </div>
              <h3 class="text-lg font-bold text-ink">{{ nextWeekLabel }}</h3>
              <p class="text-xs text-ink-muted mt-0.5">
                Sage drafted this 18 minutes ago. Review + edit before you head to the store.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">
              Regenerate
            </button>
            <button class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand">
              Review &amp; edit
            </button>
            <button class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">
              Approve · generate shopping list
            </button>
          </div>
        </div>
      </div>
      <div class="px-5 py-4 grid gap-4 sm:grid-cols-4">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Avg daily cal</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ weekTotals.avgCal.toLocaleString() }}</div>
          <div class="text-[11px] text-ink-muted">{{ weekTotals.deficitVsMaintain }} deficit</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Avg protein</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ weekTotals.avgProtein }}g</div>
          <div class="text-[11px] text-ink-muted">target 185g</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Workouts</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ weekTotals.workoutDays }} of 7</div>
          <div class="text-[11px] text-ink-muted">push/pull/legs/full</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Shopping list</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ shoppingList.length }} items</div>
          <div class="text-[11px] text-ink-muted">~$94 estimated</div>
        </div>
      </div>
      <div class="px-5 pb-4">
        <div class="rounded-card bg-surface-raised border border-brand/15 p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">
            Sage's strategy this week
          </div>
          <p class="text-sm text-ink leading-relaxed">{{ weekStrategy }}</p>
        </div>
      </div>
    </section>

    <!-- ── Today snapshot ───────────────────────────────────────────── -->
    <div>
      <div class="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 class="text-lg font-semibold text-ink">Today · {{ todayLabel }}</h2>
          <p class="text-xs text-ink-muted">Apple Watch + Apple Health, synced this morning.</p>
        </div>
        <button class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90">
          + Quick log
        </button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div class="card p-3">
          <div class="kpi-label">Sleep</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.sleep.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.sleep.unit }}</span></div>
          <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.sleep.trend) }} {{ snapshot.sleep.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">Steps</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.steps.value }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">{{ snapshot.steps.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">Weight</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.weight.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.weight.unit }}</span></div>
          <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.weight.trend) }} {{ snapshot.weight.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">HRV (morning)</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.hrv.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.hrv.unit }}</span></div>
          <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.hrv.trend) }} {{ snapshot.hrv.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">Streak</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.streak.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.streak.unit }}</span></div>
          <div class="text-[11px] text-ink-muted mt-0.5">{{ snapshot.streak.delta }}</div>
        </div>
      </div>
    </div>

    <!-- ── Active concerns (drives the weekly plan) ────────────────── -->
    <section class="card p-0 overflow-hidden border-warn/30">
      <header class="flex items-center justify-between gap-3 px-4 py-3 bg-warn/10 border-b border-warn/20">
        <div class="flex items-center gap-2">
          <span class="text-base">⚠️</span>
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-warn">
            Active concerns · driving this week's plan
          </span>
        </div>
        <span class="text-[11px] text-ink-muted">From blood work · {{ bloodwork.drawnAt }}</span>
      </header>
      <ul class="divide-y divide-divider">
        <li v-for="c in activeConcerns" :key="c.label" class="px-4 py-3 flex items-start gap-3">
          <span class="inline-flex items-center rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-bold tabular-nums shrink-0">
            {{ c.value }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-ink">{{ c.label }} <span class="text-ink-muted font-normal text-xs">· target {{ c.target }}</span></div>
            <div class="text-[12px] text-ink-muted mt-0.5">
              <strong class="text-ink">Sage's constraint:</strong> {{ c.constraint }}
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Weekly plan grid ─────────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">This week's plan</div>
          <div class="font-semibold text-ink mt-0.5">{{ nextWeekLabel }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Click any day to expand. Today highlighted.</div>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full text-xs min-w-[800px]">
          <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
            <tr>
              <th class="px-3 py-2 text-left w-20">Day</th>
              <th class="px-3 py-2 text-left">Workout</th>
              <th class="px-3 py-2 text-left">Breakfast</th>
              <th class="px-3 py-2 text-left">Lunch</th>
              <th class="px-3 py-2 text-left">Dinner</th>
              <th class="px-3 py-2 text-left">Snacks</th>
              <th class="px-3 py-2 text-right w-20">Cal · P</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <template v-for="d in weeklyPlan" :key="d.day">
              <tr
                class="cursor-pointer hover:bg-canvas/50"
                :class="d.isToday ? 'bg-brand/5' : ''"
                @click="toggleDay(d.day)"
              >
                <td class="px-3 py-2 font-semibold text-ink">
                  {{ d.day }}
                  <div class="text-[10px] font-normal text-ink-muted">{{ d.date }}</div>
                  <span v-if="d.isToday" class="inline-block mt-1 rounded-full bg-brand text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">today</span>
                </td>
                <td class="px-3 py-2">
                  <span v-if="d.workout" class="inline-flex items-center rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-semibold">
                    {{ d.workout }}
                  </span>
                  <span v-else class="text-ink-disabled text-[10px] uppercase tracking-wider">Rest</span>
                </td>
                <td class="px-3 py-2 text-ink truncate max-w-[160px]" :title="d.meals.breakfast.name">{{ d.meals.breakfast.name }}</td>
                <td class="px-3 py-2 text-ink truncate max-w-[160px]" :title="d.meals.lunch.name">{{ d.meals.lunch.name }}</td>
                <td class="px-3 py-2 text-ink truncate max-w-[160px]" :title="d.meals.dinner.name">{{ d.meals.dinner.name }}</td>
                <td class="px-3 py-2 text-ink-muted truncate max-w-[140px]" :title="d.meals.snacks.name">{{ d.meals.snacks.name }}</td>
                <td class="px-3 py-2 text-right tabular-nums text-ink">
                  {{ d.totalCal }}
                  <div class="text-[10px] text-ink-muted">{{ d.totalProtein }}g p</div>
                </td>
              </tr>
              <tr v-if="expandedDay === d.day" :class="d.isToday ? 'bg-brand/5' : 'bg-canvas/40'">
                <td colspan="7" class="px-4 py-3 text-xs text-ink-muted">
                  <div v-if="d.workoutDetail" class="mb-3">
                    <strong class="text-ink">Workout detail:</strong> {{ d.workoutDetail }}
                  </div>
                  <div class="grid sm:grid-cols-2 gap-3">
                    <div v-for="(meal, slot) in d.meals" :key="slot">
                      <div class="text-[10px] uppercase tracking-wider text-ink-muted mb-0.5">{{ slot }}</div>
                      <div class="text-ink font-semibold">{{ meal.name }}</div>
                      <div class="text-ink-muted text-[12px] leading-snug">{{ meal.detail }}</div>
                      <div class="text-[10px] text-ink-disabled mt-0.5">{{ meal.cal }} cal · {{ meal.protein }}g protein</div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Sage's swaps this week ──────────────────────────────────── -->
    <section class="card p-0 overflow-hidden border-brand/20">
      <header class="flex items-center gap-2 px-4 py-3 border-b border-brand/15 bg-brand/5">
        <AssistantMark class="h-4 w-4 text-brand" />
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          Sage's swaps this week · because of your active concerns
        </span>
      </header>
      <ul class="divide-y divide-divider">
        <li v-for="(s, i) in swaps" :key="i" class="px-4 py-3">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-brand mb-0.5">{{ s.day }}</div>
              <div class="text-sm text-ink font-semibold">{{ s.change }}</div>
            </div>
            <div class="text-[11px] text-ink-muted italic shrink-0 max-w-[280px] text-right">
              {{ s.why }}
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Shopping list ───────────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Shopping list</div>
          <div class="font-semibold text-ink mt-0.5">{{ shoppingList.length }} items · ~$94 estimated</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Auto-generated from this week's plan. Check off as you shop.</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand">
            Send to Notes
          </button>
          <button class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand">
            Email me
          </button>
        </div>
      </header>
      <div class="grid gap-4 md:grid-cols-2 px-4 py-4">
        <div v-for="group in shoppingByCategory" :key="group.category">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">{{ group.category }}</div>
          <ul class="space-y-1.5">
            <li
              v-for="item in group.items"
              :key="item.name"
              class="flex items-center gap-2 text-sm cursor-pointer"
              :class="shoppingChecked.has(item.name) ? 'text-ink-disabled line-through' : 'text-ink'"
              @click="toggleItem(item.name)"
            >
              <input
                type="checkbox"
                :checked="shoppingChecked.has(item.name)"
                class="h-3.5 w-3.5 rounded border-divider"
                @click.stop="toggleItem(item.name)"
              />
              <span class="flex-1">{{ item.name }}</span>
              <span class="text-[11px] text-ink-muted">{{ item.qty }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ── Blood work ──────────────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Blood work · full panel</div>
          <div class="font-semibold text-ink mt-0.5">Last drawn {{ bloodwork.drawnAt }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">via {{ bloodwork.drawnBy }} · concerns above already drive your plan</div>
        </div>
        <button class="rounded-md border border-brand text-brand bg-brand/5 px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">
          + Upload new panel
        </button>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
            <tr>
              <th class="px-4 py-2 text-left">Marker</th>
              <th class="px-4 py-2 text-left">Latest</th>
              <th class="px-4 py-2 text-left">Range</th>
              <th class="px-4 py-2 text-left">Last 4 panels</th>
              <th class="px-4 py-2 text-left">Trend</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <tr v-for="m in bloodwork.markers" :key="m.name" class="hover:bg-canvas/50">
              <td class="px-4 py-2 font-medium text-ink">{{ m.name }}</td>
              <td class="px-4 py-2">
                <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" :class="statusClass(m.status)">
                  <span>{{ statusIcon(m.status) }}</span>
                  <span>{{ m.latest }}</span>
                </span>
                <span class="ml-1.5 text-[11px] text-ink-muted">{{ m.unit }}</span>
              </td>
              <td class="px-4 py-2 text-xs text-ink-muted font-mono">{{ m.range }}</td>
              <td class="px-4 py-2">
                <svg :viewBox="`0 0 200 40`" class="h-6 w-32 text-brand">
                  <path :d="buildSparklinePath(m.history)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="text-[10px] text-ink-disabled font-mono mt-0.5">{{ m.history.join(' → ') }}</div>
              </td>
              <td class="px-4 py-2 text-[11px] text-ink-muted">{{ m.trendNote }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Trends ──────────────────────────────────────────────────── -->
    <div class="grid gap-4 md:grid-cols-3">
      <div v-for="(t, key) in trends" :key="key" class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">{{ t.label }}</div>
        <svg v-if="'values' in t" :viewBox="`0 0 200 40`" class="h-12 w-full text-brand mb-2">
          <path :d="buildSparklinePath(t.values)" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div v-else class="flex items-end gap-1 h-12 mb-2">
          <div
            v-for="(c, i) in t.weeklyCounts"
            :key="i"
            class="flex-1 bg-brand rounded-sm"
            :style="{ height: `${(c / 5) * 100}%` }"
            :title="`Week ${i + 1}: ${c} workouts`"
          />
        </div>
        <p class="text-xs text-ink-muted leading-snug">{{ t.summary }}</p>
      </div>
    </div>

    <!-- ── Goals ────────────────────────────────────────────────────── -->
    <section class="card p-4">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-3">Goals</div>
      <ul class="space-y-3">
        <li v-for="g in goals" :key="g.label">
          <div class="flex items-center justify-between gap-3 mb-1">
            <span class="text-sm font-medium text-ink">{{ g.label }}</span>
            <span class="text-[11px] text-ink-muted">{{ g.detail }}</span>
          </div>
          <div class="h-1.5 w-full bg-brand/10 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="goalToneClass(g.status)"
              :style="{ width: `${Math.max(g.progress * 100, 4)}%` }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Ask Sage floating chat ──────────────────────────────────── -->
    <button
      type="button"
      class="fixed bottom-6 right-6 z-40 rounded-full bg-brand text-white shadow-2xl px-4 py-3 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-2"
      @click="chatOpen = !chatOpen"
    >
      <AssistantMark class="h-4 w-4 text-white" />
      Ask Sage
    </button>
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="chatOpen"
        class="fixed bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] card p-4 shadow-2xl border-brand/30"
      >
        <div class="flex items-center gap-2 mb-3">
          <AssistantMark class="h-5 w-5 text-brand" />
          <span class="font-semibold text-ink">Ask Sage</span>
          <span class="ml-auto text-[10px] text-ink-muted uppercase tracking-wider">demo</span>
        </div>
        <div class="space-y-2 mb-3">
          <p class="text-xs text-ink-muted">Try:</p>
          <button
            v-for="p in samplePrompts"
            :key="p"
            type="button"
            class="block w-full text-left text-xs text-brand bg-brand/5 hover:bg-brand/10 rounded-md px-2 py-1.5"
            @click="chatInput = p"
          >{{ p }}</button>
        </div>
        <input
          v-model="chatInput"
          type="text"
          placeholder="ask sage anything…"
          class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
        <p class="text-[10px] text-ink-disabled mt-2">
          Real chat wires up after Phase 5. Phase 0+1 (Apple Health ingestion) is next on deck.
        </p>
      </div>
    </Transition>
  </div>
</template>
