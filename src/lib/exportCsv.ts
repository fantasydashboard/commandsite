// CSV export for dashboard sections.
//
// Per-section on purpose, not one "download this page" button. The sections have
// different grains (one row per guest, per month, per milestone), so a combined
// file would either be an unpivotable flat blob or a workbook nobody opens. More
// importantly, a page-level download would export real congregant names every
// time someone just wanted the monthly counts. Keeping the exports separate
// keeps the PII one deliberate.

/** Escapes one cell. Quotes anything containing a comma, quote, or newline, and
 *  doubles inner quotes, per RFC 4180. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // A leading =, +, - or @ makes Excel and Sheets treat the cell as a formula.
  // Real church data hits this (names like "-Ana", phone strings starting "+1"),
  // so prefix with an apostrophe to force text. This is CSV injection defence as
  // much as a formatting fix: an exported cell should never execute anywhere.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export interface CsvColumn<T> {
  header: string
  value: (row: T) => unknown
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))
  // CRLF + a UTF-8 BOM so Excel opens accented names (Bênçãos, Téllez) correctly
  // instead of mojibake. Sheets handles both fine.
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'
}

/** Slug for a filename part: lowercase, dashes, no punctuation. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Builds a filename that records WHAT the data is, WHICH scope produced it, and
 * WHEN. Without the scope, a file pulled under the Brazilian lens is
 * indistinguishable from a church-wide one a week later.
 */
export function exportFilename(parts: { client: string; dataset: string; scope?: string; date?: string }): string {
  const date = parts.date ?? new Date().toISOString().slice(0, 10)
  const bits = [slug(parts.client), slug(parts.dataset)]
  if (parts.scope && parts.scope !== 'all') bits.push(slug(parts.scope))
  bits.push(date)
  return `${bits.join('-')}.csv`
}

/** Triggers a browser download. No network round trip: the data is already in
 *  the page, so building the file client-side keeps it off any server log. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick; revoking synchronously can cancel the download in
  // some browsers before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Convenience: build and download in one call. */
export function exportCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  parts: { client: string; dataset: string; scope?: string },
): void {
  downloadCsv(exportFilename(parts), toCsv(rows, columns))
}
