import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LabStage = 'distill' | 'dataset-validation' | 'smoke' | 'train' | 'convert' | 'model-eval' | 'router' | 'hybrid-eval';
export type LabStatus = {
  actor: 'codex' | 'gemini';
  stage: LabStage;
  state: 'pending' | 'running' | 'passed' | 'failed';
  current?: number;
  total?: number;
  message: string;
  metrics?: Record<string, number | string>;
  updatedAt: string;
};

export function writeLabStatus(root: string, status: Omit<LabStatus, 'updatedAt'>): LabStatus {
  const full = { ...status, updatedAt: new Date().toISOString() };
  const path = join(root, 'finetune', 'out', '06b', 'status.json');
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(full, null, 2), 'utf8');
  renameSync(tmp, path);
  appendFileSync(join(dirname(path), 'events.jsonl'), `${JSON.stringify(full)}\n`, 'utf8');
  return full;
}
