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
  if (!path) return null
  let result = null
  walkProjectMenu(menuConfig?.items || [], (node, ancestors) => {
    if (!result && menuNodePath(ancestors, node) === path) result = { node, ancestors }
  })
  return result
}

export function findMenuByNodeId(menuConfig, nodeId) {
  if (nodeId == null || nodeId === '') return null
  let result = null
  walkProjectMenu(menuConfig?.items || [], (node, ancestors) => {
    if (!result && String(node.id) === String(nodeId)) result = { node, ancestors }
  })
  return result
}

export function readRouteQueryValue(value) {
  if (value == null || value === '') return ''
  const joined = Array.isArray(value)
    ? value.filter(part => part != null && part !== '').map(String).join('/')
    : String(value)
  let current = joined
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      current = decoded
    } catch {
      break
    }
  }
  return current
}

export function buildProjectWorkspaceQuery({ prototypeId, menuPath } = {}) {
  const query = {}
  if (prototypeId != null && prototypeId !== '') query.prototypeId = String(prototypeId)
  if (menuPath) query.menuPath = String(menuPath)
  return query
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right)
}

export function resolveRequestedProjectMenu({ menuConfig, bindings = [], prototypeId, menuPath } = {}) {
  const requestedPrototypeId = readRouteQueryValue(prototypeId)
  const requestedMenuPath = readRouteQueryValue(menuPath)
  const requested = Boolean(requestedPrototypeId || requestedMenuPath)

  const bindingByPrototype = requestedPrototypeId
    ? bindings.find(item => sameId(item.prototype_id, requestedPrototypeId))
    : null
  const bindingByPath = requestedMenuPath
    ? bindings.find(item => item.menu_path === requestedMenuPath)
    : null
  const binding = bindingByPrototype || bindingByPath

  const target = findMenuByPath(menuConfig, binding?.menu_path || requestedMenuPath)
    || (binding?.node_id != null ? findMenuByNodeId(menuConfig, binding.node_id) : null)

  if (target) {
    return { target: { node: target.node, ancestors: target.ancestors, path: menuNodePath(target.ancestors, target.node) }, binding, requested, fallback: false }
  }
  if (requested) {
    return { target: null, binding, requested, fallback: false }
  }

  const firstBound = findFirstBoundMenu(menuConfig, bindings)
  if (firstBound) {
    return {
      target: firstBound,
      binding: bindings.find(item => item.menu_path === firstBound.path) || null,
      requested: false,
      fallback: true
    }
  }
  return { target: null, binding: null, requested: false, fallback: false }
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
