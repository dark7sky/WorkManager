export const filterTrashItems = (items, { query = '', table = 'all' } = {}) => {
  const q = query.trim().toLowerCase()
  return items.filter(item => {
    const matchesTable = table === 'all' || item.table === table
    const matchesQuery = !q || `${item.title || ''} ${item.content || ''}`.toLowerCase().includes(q)
    return matchesTable && matchesQuery
  })
}

export const trashTables = items => [...new Set(items.map(item => item.table))]
