export const deriveTagColorMap = (items = []) =>
  Object.fromEntries(items.filter(item => item.color).map(item => [item.tag, item.color]))
