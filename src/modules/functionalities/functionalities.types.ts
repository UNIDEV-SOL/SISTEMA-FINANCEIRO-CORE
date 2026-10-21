export interface FunctionalityNode {
  id: string;
  code: string;
  label: string;
  path: string | null;
  icon: string | null;
  order: number;
  parentId: string | null;
  apiPaths: string[];
  protectReads: boolean;
  active: boolean;
  profileCount: number;
  children: FunctionalityNode[];
}
