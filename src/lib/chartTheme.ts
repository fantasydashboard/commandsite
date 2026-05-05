/**
 * Centralised chart.js styling for CommandSite modules.
 *
 * Pulls color tokens from CSS variables so per-client theme overrides
 * apply automatically. Defines a default options template + helpers to
 * build branded line/area datasets without each module re-doing the
 * color/gradient/tooltip wiring.
 */
import type { ChartOptions, ScriptableContext } from 'chart.js'

// ── Color helpers ───────────────────────────────────────────────────────
// CSS vars are defined as space-separated rgb triples (see main.css). We
// read them off :root at runtime so theme overrides cascade through.

function readCssVar(name: string): string {
  if (typeof document === 'undefined') return '0 0 0'
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || '0 0 0'
}

export function rgb(varName: string, alpha = 1): string {
  return `rgb(${readCssVar(varName)} / ${alpha})`
}

// Convenience accessors for the brand palette.
export const chartColors = {
  brand: (a = 1) => rgb('--color-brand', a),
  accent: (a = 1) => rgb('--color-accent', a),
  // Stable structural colors (not CSS-var based — these don't theme).
  ink: '#0F172A',
  inkMuted: '#64748B',
  inkDisabled: '#94A3B8',
  divider: '#E2E8F0',
  gridSoft: 'rgba(15, 23, 42, 0.06)',
}

// Multi-series default palette. Use in order for charts with >1 dataset.
// Discipline: brand + accent first (the two CommandSite logo colors), then
// neutral status colors only when more series are needed.
export function seriesPalette(): string[] {
  return [
    chartColors.brand(),       // deep blue (brand)
    chartColors.accent(),      // sky blue (accent)
    chartColors.brand(0.55),   // muted brand
    chartColors.accent(0.55),  // muted accent
    '#94A3B8',                 // slate (neutral fallback)
    '#475569',                 // slate-darker
  ]
}

// ── Dataset builders ────────────────────────────────────────────────────

/**
 * Build a line dataset with a soft brand-colored area fill underneath.
 * The fill fades top → transparent so charts don't look heavy.
 */
export function brandAreaDataset(
  label: string,
  data: number[],
  opts?: { color?: string; alpha?: number },
) {
  const color = opts?.color ?? chartColors.brand()
  const alpha = opts?.alpha ?? 0.18
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: (ctx: ScriptableContext<'line'>) => {
      const chart = ctx.chart
      const { ctx: c, chartArea } = chart
      if (!chartArea) return color
      const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
      // Best-effort: convert "rgb(r g b / a)" → matching with alpha override.
      const top = color.replace(/\/\s*[\d.]+\s*\)$/, ` / ${alpha})`)
      const mid = color.replace(/\/\s*[\d.]+\s*\)$/, ` / ${alpha * 0.4})`)
      const bot = color.replace(/\/\s*[\d.]+\s*\)$/, ' / 0)')
      grad.addColorStop(0, top.includes('/') ? top : `${color}30`)
      grad.addColorStop(0.6, mid.includes('/') ? mid : `${color}10`)
      grad.addColorStop(1, bot.includes('/') ? bot : `${color}00`)
      return grad
    },
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBorderColor: color,
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderWidth: 2,
    fill: true,
    tension: 0.35,
  }
}

// ── Default options templates ───────────────────────────────────────────

/**
 * Polished line-chart defaults. Apply by spreading: `{ ...lineDefaults(), ... }`
 * Hides legend (most CommandSite charts don't need one — labels are in card
 * headers); pass `legend: true` if you do.
 */
export function lineDefaults(opts?: { legend?: boolean; yMin?: number }): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: opts?.legend
        ? {
            display: true,
            position: 'bottom',
            labels: {
              color: chartColors.inkMuted,
              font: { size: 11 },
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              padding: 12,
            },
          }
        : { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#fff',
        titleFont: { size: 11, weight: 'bold' },
        bodyColor: '#E2E8F0',
        bodyFont: { size: 11 },
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        borderColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { display: false, drawTicks: false },
        border: { display: false },
        ticks: {
          color: chartColors.inkDisabled,
          font: { size: 10 },
          autoSkip: true,
          maxTicksLimit: 10,
          padding: 6,
        },
      },
      y: {
        beginAtZero: true,
        min: opts?.yMin,
        grid: { color: chartColors.gridSoft, drawTicks: false },
        border: { display: false },
        ticks: {
          color: chartColors.inkDisabled,
          font: { size: 10 },
          precision: 0,
          padding: 8,
        },
      },
    },
  }
}

/**
 * Same shape but for bar charts. Bars are intentionally chunky + rounded
 * so the chart reads as styled, not stock chart.js.
 */
export function barDefaults(opts?: { legend?: boolean; stacked?: boolean }): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Per-dataset styling overrides for the chunkier look.
    // Rounding is dropped when stacked — rounding every segment makes
    // the stack look like floating pills with gaps.
    datasets: {
      bar: {
        borderRadius: opts?.stacked ? 0 : 8,
        borderSkipped: false,
        // share-of-category for each bar; share-of-axis-slot for the group
        barPercentage: 0.85,
        categoryPercentage: 0.75,
      },
    },
    plugins: {
      legend: opts?.legend
        ? {
            display: true,
            position: 'bottom',
            labels: {
              color: chartColors.inkMuted,
              font: { size: 11 },
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              padding: 12,
            },
          }
        : { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#fff',
        bodyColor: '#E2E8F0',
        padding: 10,
        cornerRadius: 6,
      },
    },
    scales: {
      x: {
        stacked: opts?.stacked ?? false,
        grid: { display: false, drawTicks: false },
        border: { display: false },
        ticks: {
          color: chartColors.inkDisabled,
          font: { size: 10 },
          padding: 6,
        },
      },
      y: {
        stacked: opts?.stacked ?? false,
        beginAtZero: true,
        grid: { color: chartColors.gridSoft, drawTicks: false },
        border: { display: false },
        ticks: {
          color: chartColors.inkDisabled,
          font: { size: 10 },
          precision: 0,
          padding: 8,
        },
      },
    },
  }
}
