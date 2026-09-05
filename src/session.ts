import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export interface ChatState {
  cwd: string;
  sessionId?: string;
}

const FILE = process.env.STATE_FILE ?? 'state.json';
const state: Record<string, ChatState> = load();

function load(): Record<string, ChatState> {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(): void {
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function get(chatId: number): ChatState | undefined {
  return state[chatId];
}

/** Point a chat at a project directory. Resets the conversation. */
export function setProject(chatId: number, cwd: string): void {
  state[chatId] = { cwd };
  save();
}

/** Remember the Claude session id so the next message resumes it. */
export function setSession(chatId: number, sessionId: string): void {
  const s = state[chatId];
  if (!s) return;
  s.sessionId = sessionId;
  save();
}
