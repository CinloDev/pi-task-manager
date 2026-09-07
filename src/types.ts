export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export interface Subtask {
  id: string;
  title: string;
  status: TaskStatus;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  tag?: string;
  note?: string;
  owner?: string;
  commit?: string;
  risk?: "low" | "medium" | "high";
  blockedReason?: string;
  subtasks?: Subtask[];
}

export interface Phase {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  target?: string;
  lead?: string;
  tasks: Task[];
}

export interface TodoItem {
  id: string;
  text: string;
  priority: "P0" | "P1" | "P2" | "P3";
  done: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author?: string;
  date?: string;
}

export interface GitState {
  branch: string;
  commits: GitCommit[];
  syncStatus: string;
}

export interface TreeItem {
  name: string;
  depth: number;
  type: "file" | "dir";
}

export interface CodeGraphNode {
  id: string;
  label: string;
  files?: string[];
  taskIds?: string[];
  details?: string;
}

export interface CodeGraphEdge {
  from: string;
  to: string;
  label?: string;
  details?: string;
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

export interface ProjectMeta {
  projectName: string;
  version: string;
  branch: string;
  commit?: string;
  syncStatus?: string;
  harness?: string;
  harnessRole?: string;
  description?: string;
  lastUpdated: string;
  labels?: {
    es?: Record<string, string>;
    [lang: string]: Record<string, string> | undefined;
  };
  features?: {
    git?: boolean;
    tree?: boolean;
    codegraph?: boolean;
    help?: boolean;
  };
  history?: Array<{
    timestamp: string;
    completed: number;
    total: number;
  }>;
}

export interface TokenCategories {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface AgentTokenUsage {
  agent: string;
  model?: string;
  models?: string[];
  total: number;
  cost?: number;
  sessions?: number;
  messages?: number;
  evidence?: "measured" | "derived" | "estimated";
  confidence?: number;
  categories: TokenCategories;
}

export interface TokenUsageState {
  hasData: boolean;
  schemaVersion: string;
  updatedAt: string;
  source: string;
  scope?: string;
  root?: string;
  totals: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    cost?: number;
  };
  byAgent: AgentTokenUsage[];
}

export interface TaskManagerState {
  schemaVersion: string;
  meta: ProjectMeta;
  phases: Phase[];
  todos: TodoItem[];
  git: GitState;
  tree: TreeItem[];
  codegraph: CodeGraph;
  tokenUsage?: TokenUsageState;
}
