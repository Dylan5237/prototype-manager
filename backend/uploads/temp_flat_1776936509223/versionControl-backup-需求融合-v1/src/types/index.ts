export type ChangeType = 'unchanged' | 'added' | 'removed' | 'modified';
export type MergeType = 'unchanged' | 'auto' | 'conflict';
export type Resolution = 'main' | 'hotfix' | 'custom';

export interface DiffNode {
  key: string;
  label: string;
  path: string;
  hotfixChange: ChangeType;
  mainChange: ChangeType;
  mergeType: MergeType;
  baseValue?: any;
  mainValue?: any;
  hotfixValue?: any;
  resolvedValue?: any;
  resolution?: Resolution;
  children?: DiffNode[];
}

export interface BugFixItem {
  bugNo: string;
  version: string;
  desc: string;
  status: '研发中' | '研发完成' | '已合并';
  operator: string;
  updateTime: string;
}
