import type { DiffNode, ChangeType, MergeType } from '../types';

export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  const isArrayA = Array.isArray(a);
  const isArrayB = Array.isArray(b);
  if (isArrayA !== isArrayB) return false;

  if (isArrayA) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

export function getLabel(item: any, fallback: string): string {
  if (item && typeof item === 'object') {
    return item.name || item.label || item.title || item.code || fallback;
  }
  return fallback;
}

function getValueType(v: any): string {
  if (v === null || v === undefined) return 'primitive';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return 'primitive';
}

function createLeaf(
  key: string,
  label: string,
  path: string,
  hotfixChange: ChangeType,
  mainChange: ChangeType,
  mergeType: MergeType,
  baseValue: any,
  mainValue: any,
  hotfixValue: any
): DiffNode {
  const eqBaseMain = deepEqual(baseValue, mainValue);
  const isAuto = mergeType === 'auto';
  return {
    key,
    label,
    path,
    hotfixChange,
    mainChange,
    mergeType,
    baseValue,
    mainValue,
    hotfixValue,
    resolution: isAuto ? (eqBaseMain ? 'hotfix' : 'main') : undefined,
    resolvedValue: mergeType === 'unchanged' || isAuto ? (eqBaseMain ? hotfixValue : mainValue) : undefined,
  };
}

export function diff3(base: any, main: any, hotfix: any): DiffNode {
  return diff3Any(base, main, hotfix, '', 'root', '根节点');
}

function diff3Any(base: any, main: any, hotfix: any, path: string, key: string, label: string): DiffNode {
  const baseNil = base === undefined || base === null;
  const mainNil = main === undefined || main === null;
  const hotfixNil = hotfix === undefined || hotfix === null;

  // 双方都删除了
  if (!baseNil && mainNil && hotfixNil) {
    return createLeaf(key, label, path, 'removed', 'removed', 'auto', base, undefined, undefined);
  }

  // 只有 hotfix 新增
  if (baseNil && mainNil && !hotfixNil) {
    return createLeaf(key, label, path, 'added', 'unchanged', 'auto', undefined, undefined, hotfix);
  }

  // 只有 main 新增
  if (baseNil && !mainNil && hotfixNil) {
    return createLeaf(key, label, path, 'unchanged', 'added', 'auto', undefined, main, undefined);
  }

  const baseType = getValueType(base);
  const mainType = getValueType(main);
  const hotfixType = getValueType(hotfix);

  const isArray = !baseNil ? Array.isArray(base) : !mainNil ? Array.isArray(main) : Array.isArray(hotfix);
  const isObject = !isArray && (baseType === 'object' || mainType === 'object' || hotfixType === 'object');

  if (isArray) {
    return diff3Array(base || [], main || [], hotfix || [], path, key, label);
  }
  if (isObject) {
    return diff3Object(base || {}, main || {}, hotfix || {}, path, key, label);
  }

  return diff3Primitive(base, main, hotfix, path, key, label);
}

function diff3Primitive(base: any, main: any, hotfix: any, path: string, key: string, label: string): DiffNode {
  const eqBaseMain = deepEqual(base, main);
  const eqBaseHotfix = deepEqual(base, hotfix);
  const eqMainHotfix = deepEqual(main, hotfix);

  let hotfixChange: ChangeType = 'unchanged';
  let mainChange: ChangeType = 'unchanged';

  if (!eqBaseMain) {
    mainChange = base === undefined && main !== undefined ? 'added' : main === undefined && base !== undefined ? 'removed' : 'modified';
  }
  if (!eqBaseHotfix) {
    hotfixChange = base === undefined && hotfix !== undefined ? 'added' : hotfix === undefined && base !== undefined ? 'removed' : 'modified';
  }

  let mergeType: MergeType;
  if (eqBaseMain && eqBaseHotfix) {
    mergeType = 'unchanged';
  } else if (eqBaseMain || eqBaseHotfix || eqMainHotfix) {
    mergeType = 'auto';
  } else {
    mergeType = 'conflict';
  }

  return createLeaf(key, label, path, hotfixChange, mainChange, mergeType, base, main, hotfix);
}

function arrayToMap(arr: any[]): Record<string, any> {
  return arr.reduce((acc, item) => {
    if (item && typeof item === 'object' && item.id) {
      acc[item.id] = item;
    }
    return acc;
  }, {} as Record<string, any>);
}

function hasIdArray(arr: any[]): boolean {
  return arr.length > 0 && arr.every((i) => i && typeof i === 'object' && 'id' in i);
}

function diff3Array(base: any[], main: any[], hotfix: any[], path: string, key: string, label: string): DiffNode {
  const useId = hasIdArray(base) || hasIdArray(main) || hasIdArray(hotfix);

  if (useId) {
    const bMap = arrayToMap(base);
    const mMap = arrayToMap(main);
    const hMap = arrayToMap(hotfix);
    const allIds = new Set([...Object.keys(bMap), ...Object.keys(mMap), ...Object.keys(hMap)]);
    const children: DiffNode[] = [];

    for (const id of allIds) {
      const bVal = bMap[id];
      const mVal = mMap[id];
      const hVal = hMap[id];
      const childPath = `${path}[id=${id}]`;
      const itemLabel = getLabel(mVal || hVal || bVal, id);
      const childNode = diff3Any(bVal, mVal, hVal, childPath, id, itemLabel);
      children.push(childNode);
    }

    let mergeType: MergeType = 'unchanged';
    if (children.some((c) => c.mergeType === 'conflict')) mergeType = 'conflict';
    else if (children.some((c) => c.mergeType !== 'unchanged')) mergeType = 'auto';

    return {
      key,
      label,
      path,
      hotfixChange: 'unchanged',
      mainChange: 'unchanged',
      mergeType,
      baseValue: base,
      mainValue: main,
      hotfixValue: hotfix,
      children,
    };
  }

  // 按索引比较
  const maxLen = Math.max(base.length, main.length, hotfix.length);
  const children: DiffNode[] = [];
  for (let i = 0; i < maxLen; i++) {
    const childNode = diff3Any(base[i], main[i], hotfix[i], `${path}[${i}]`, String(i), `[${i}]`);
    children.push(childNode);
  }

  let mergeType: MergeType = 'unchanged';
  if (children.some((c) => c.mergeType === 'conflict')) mergeType = 'conflict';
  else if (children.some((c) => c.mergeType !== 'unchanged')) mergeType = 'auto';

  return {
    key,
    label,
    path,
    hotfixChange: 'unchanged',
    mainChange: 'unchanged',
    mergeType,
    baseValue: base,
    mainValue: main,
    hotfixValue: hotfix,
    children,
  };
}

function diff3Object(base: any, main: any, hotfix: any, path: string, key: string, label: string): DiffNode {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(main), ...Object.keys(hotfix)]);
  const children: DiffNode[] = [];

  for (const k of allKeys) {
    const bVal = base[k];
    const mVal = main[k];
    const hVal = hotfix[k];
    const childPath = path ? `${path}.${k}` : k;
    const childLabel = getLabel(mVal !== undefined ? mVal : hVal !== undefined ? hVal : bVal, k);
    const childNode = diff3Any(bVal, mVal, hVal, childPath, k, childLabel);
    children.push(childNode);
  }

  let mergeType: MergeType = 'unchanged';
  if (children.some((c) => c.mergeType === 'conflict')) mergeType = 'conflict';
  else if (children.some((c) => c.mergeType !== 'unchanged')) mergeType = 'auto';

  return {
    key,
    label,
    path,
    hotfixChange: 'unchanged',
    mainChange: 'unchanged',
    mergeType,
    baseValue: base,
    mainValue: main,
    hotfixValue: hotfix,
    children,
  };
}

export function countConflicts(node: DiffNode): number {
  // 只统计叶子节点的未解决冲突
  if (!node.children || node.children.length === 0) {
    return node.mergeType === 'conflict' && !node.resolution ? 1 : 0;
  }
  return node.children.reduce((sum, child) => sum + countConflicts(child), 0);
}

export function resolveAll(node: DiffNode, resolution: 'main' | 'hotfix') {
  if (node.mergeType === 'conflict') {
    node.resolution = resolution;
    node.resolvedValue = resolution === 'main' ? node.mainValue : node.hotfixValue;
  }
  if (node.children) {
    for (const child of node.children) {
      resolveAll(child, resolution);
    }
  }
}

export function buildMergedResult(node: DiffNode): any {
  if (!node.children || node.children.length === 0) {
    if (node.mergeType === 'conflict') {
      if (node.resolution === 'main') return node.mainValue;
      if (node.resolution === 'hotfix') return node.hotfixValue;
      if (node.resolution === 'custom') return node.resolvedValue;
      return undefined;
    }
    return node.resolvedValue;
  }

  const isArray = Array.isArray(node.baseValue) || Array.isArray(node.mainValue) || Array.isArray(node.hotfixValue);
  if (isArray) {
    const result: any[] = [];
    for (const child of node.children) {
      const childMerged = buildMergedResult(child);
      if (childMerged !== undefined) {
        result.push(childMerged);
      }
    }
    return result;
  }

  const result: any = {};
  for (const child of node.children) {
    const childMerged = buildMergedResult(child);
    if (childMerged !== undefined) {
      result[child.key] = childMerged;
    }
  }
  return result;
}

export interface FlatDiffItem {
  id: string;
  label: string;
  path: string;
  pathLabels: string[];
  node: DiffNode;
}

function isContainerNode(node: DiffNode): boolean {
  if (!node.children || node.children.length === 0) return false;
  // entities, fields, nodes, methods, params 等纯数组/对象容器视为容器
  const containerKeys = ['entities', 'fields', 'processes', 'nodes', 'dictionaries', 'forms', 'methods', 'params'];
  return containerKeys.includes(node.key);
}

export function collectLeafChanges(
  node: DiffNode,
  result: FlatDiffItem[] = [],
  parentPathLabels: string[] = []
): FlatDiffItem[] {
  if (node.mergeType === 'unchanged') return result;

  const currentLabels = [...parentPathLabels];
  if (!isContainerNode(node) && node.key !== 'root') {
    currentLabels.push(node.label);
  }

  const isLeaf = !node.children || node.children.length === 0;
  if (isLeaf) {
    result.push({
      id: node.path || node.key,
      label: node.label,
      path: node.path || node.key,
      pathLabels: currentLabels.length ? currentLabels : [node.label],
      node,
    });
  } else if (node.children) {
    for (const child of node.children) {
      collectLeafChanges(child, result, currentLabels);
    }
  }
  return result;
}
