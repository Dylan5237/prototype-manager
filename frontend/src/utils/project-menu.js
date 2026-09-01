/**
 * Add read-only menu entries for legacy bindings that are not represented in
 * menu_config. This only normalizes the response in memory; it never writes the
 * project record back to the server.
 */
export function normalizeMenuConfigForBindings(menuConfig, bindings = []) {
  const normalized = {
    ...(menuConfig || {}),
    items: Array.isArray(menuConfig?.items)
      ? menuConfig.items.map(group => ({
        ...group,
        children: Array.isArray(group.children) ? [...group.children] : []
      }))
      : []
  }
  const representedPaths = new Set(
    normalized.items.flatMap(group => (group.children || []).map(item => `${group.key}/${item.key}`))
  )

  for (const binding of bindings) {
    const path = String(binding?.menu_path || '').trim()
    if (!path || representedPaths.has(path)) continue
    const segments = path.split('/').filter(Boolean)
    if (!segments.length) continue
    const groupKey = segments.shift()
    const itemKey = segments.join('/') || `bound-${groupKey}`
    let group = normalized.items.find(item => item.key === groupKey)
    if (!group) {
      group = { key: groupKey, label: groupKey, children: [] }
      normalized.items.push(group)
    }
    group.children = Array.isArray(group.children) ? group.children : []
    if (!group.children.some(item => `${group.key}/${item.key}` === path)) {
      group.children.push({
        key: itemKey,
        label: binding.prototype_name || itemKey
      })
    }
    representedPaths.add(path)
  }

  return normalized
}

/**
 * Resolve the first menu entry that already has a project-prototype binding.
 * Menu order is the product-facing order; binding row order is not stable enough
 * to define the default landing page.
 */
export function findFirstBoundMenu(menuConfig, bindings = []) {
  const boundPaths = new Set(
    bindings
      .map(binding => binding?.menu_path)
      .filter(Boolean)
  )

  for (const group of menuConfig?.items || []) {
    for (const item of group.children || []) {
      const path = `${group.key}/${item.key}`
      if (boundPaths.has(path)) return { group, item }
    }
  }

  return null
}
