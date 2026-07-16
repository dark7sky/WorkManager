const DAY_MS = 24 * 60 * 60 * 1000

export const CHANGELOG_SUMMARY_AGE_DAYS = 7

// Splits a timestamp-sorted changelog list into recent items (shown in full) and
// older items (grouped by year-month for AI-assisted summarization).
export function splitChangelogByAge(updates, now = new Date(), ageDays = CHANGELOG_SUMMARY_AGE_DAYS) {
  const cutoff = now.getTime() - ageDays * DAY_MS
  const recent = [], older = []
  for (const update of updates || []) {
    const time = new Date(update.timestamp).getTime()
    if (Number.isFinite(time) && time < cutoff) older.push(update)
    else recent.push(update)
  }
  return { recent, older }
}

export function groupChangelogByMonth(entries) {
  const groups = new Map()
  for (const entry of entries || []) {
    const time = new Date(entry.timestamp)
    if (Number.isNaN(time.getTime())) continue
    const period = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}`
    if (!groups.has(period)) groups.set(period, [])
    groups.get(period).push(entry)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([period, items]) => ({ period, entries: items }))
}

export function changelogSummaryCacheKey(groups) {
  return groups.map(g => `${g.period}:${g.entries.length}:${g.entries[0]?.id || ''}`).join('|')
}
