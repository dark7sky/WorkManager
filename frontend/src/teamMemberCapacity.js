export const TEAM_MEMBER_CAPACITY_KEY = 'wm-team-member-capacity-v1'
export const DEFAULT_TEAM_MEMBER_DAILY_CAPACITY = 3
const MIN_TEAM_MEMBER_DAILY_CAPACITY = 1
const MAX_TEAM_MEMBER_DAILY_CAPACITY = 9

export const normalizeTeamMemberDailyCapacity = value => {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_TEAM_MEMBER_DAILY_CAPACITY
  return Math.max(MIN_TEAM_MEMBER_DAILY_CAPACITY, Math.min(MAX_TEAM_MEMBER_DAILY_CAPACITY, Math.round(number)))
}

export const normalizeTeamMemberCapacities = capacities => Object.fromEntries(
  Object.entries(capacities && typeof capacities === 'object' ? capacities : {})
    .map(([name, limit]) => [String(name ?? '').trim(), normalizeTeamMemberDailyCapacity(limit)])
    .filter(([name]) => Boolean(name)),
)

export const loadTeamMemberCapacities = storage => {
  try {
    return normalizeTeamMemberCapacities(JSON.parse(storage.getItem(TEAM_MEMBER_CAPACITY_KEY) || '{}'))
  } catch {
    return {}
  }
}

export const saveTeamMemberCapacities = (storage, capacities) => {
  const normalized = normalizeTeamMemberCapacities(capacities)
  storage.setItem(TEAM_MEMBER_CAPACITY_KEY, JSON.stringify(normalized))
  return normalized
}

export const saveTeamMemberCapacity = (storage, capacities, name, limit) => {
  const normalizedName = String(name ?? '').trim()
  if (!normalizedName) return normalizeTeamMemberCapacities(capacities)
  return saveTeamMemberCapacities(storage, {
    ...(capacities && typeof capacities === 'object' ? capacities : {}),
    [normalizedName]: normalizeTeamMemberDailyCapacity(limit),
  })
}
