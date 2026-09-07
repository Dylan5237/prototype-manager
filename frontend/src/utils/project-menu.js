function cloneNode(node) {
  return { ...node, children: Array.isArray(node?.children) ? node.children.map(cloneNode) : [] }
}

export function menuNodePath(ancestors = [], node) {
  return [...ancestors, node].map(item => item?.key).filter(Boolean).join('/')
}

export function menuNodeLabelPath(ancestors = [], node) {
  return [...ancestors, node].map(item => item?.label).filter(Boolean).join(' / ')
}

export function walkProjectMenu(nodes = [], visitor, ancestors = []) {
  for (const node of nodes || []) {
    visitor(node, ancestors)
    walkProjectMenu(node.children || [], visitor, [...ancestors, node])
  }
}

export function findMenuByPath(menuConfig, path) {
  let result = null
  walkProjectMenu(menuConfig?.items || [], (node, ancestors) => {
    if (!result && menuNodePath(ancestors, node) === path) result = { node, ancestors }
  })
  return result
}

export function listMenuLeaves(menuConfig) {
  const leaves = []
  walkProjectMenu(menuConfig?.items || [], (node, ancestors) => {
    if (!node.children?.length) leaves.push({ node, ancestors, path: menuNodePath(ancestors, node) })
  })
  return leaves
}

export function normalizeMenuConfigForBindings(menuConfig, bindings = []) {
  const normalized = { ...(menuConfig || {}), items: Array.isArray(menuConfig?.items) ? menuConfig.items.map(cloneNode) : [] }
  const representedPaths = new Set()
  walkProjectMenu(normalized.items, (node, ancestors) => representedPaths.add(menuNodePath(ancestors, node)))
  for (const binding of bindings) {
    const path = String(binding?.menu_path || '').trim()
    if (!path || representedPaths.has(path)) continue
    const segments = path.split('/').filter(Boolean)
    let nodes = normalized.items
    const built = []
    segments.forEach((key, index) => {
      let node = nodes.find(item => item.key === key)
      if (!node) {
        node = { key, label: index === segments.length - 1 ? (binding.prototype_name || key) : key, children: [] }
        nodes.push(node)
      }
      node.children = Array.isArray(node.children) ? node.children : []
      built.push(node)
      representedPaths.add(built.map(item => item.key).join('/'))
      nodes = node.children
    })
  }
  return normalized
}

export function findFirstBoundMenu(menuConfig, bindings = []) {
  const boundPaths = new Set(bindings.map(binding => binding?.menu_path).filter(Boolean))
  return listMenuLeaves(menuConfig).find(item => boundPaths.has(item.path)) || null
}
