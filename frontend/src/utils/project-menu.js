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
