export const TEAM_MEMBERS_KEY = 'wm-team-members-v1'

export const normalizeTeamMembers = members => [...new Set((members || [])
  .map(name => String(name ?? '').trim())
  .filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'ko'))

export const loadTeamMembers = storage => {
  try {
    return normalizeTeamMembers(JSON.parse(storage.getItem(TEAM_MEMBERS_KEY) || '[]'))
  } catch {
    return []
  }
}

export const saveTeamMembers = (storage, members) => {
  const normalized = normalizeTeamMembers(members)
  storage.setItem(TEAM_MEMBERS_KEY, JSON.stringify(normalized))
  return normalized
}

export const addTeamMember = (members, name) => normalizeTeamMembers([...members, name])

export const removeTeamMember = (members, name) => normalizeTeamMembers(members.filter(member => member !== name))
