import { query } from '@anthropic-ai/claude-agent-sdk';

export interface AgentEvents {
  /** A tool the agent is about to run (name + raw input). */
  onTool: (name: string, input: unknown) => void;
}

export interface AgentResult {
  text: string;
  sessionId: string;
  costUsd: number;
}

/**
 * Run one turn against Claude Code. Resumes `sessionId` when given so the
 * conversation stays stateful across Telegram messages.
 */
export async function runPrompt(opts: {
  prompt: string;
  cwd: string;
  sessionId?: string;
  events: AgentEvents;
}): Promise<AgentResult> {
  let sessionId = opts.sessionId ?? '';
  let text = '';
  let costUsd = 0;

  const response = query({
    prompt: opts.prompt,
    options: {
      cwd: opts.cwd,
      resume: opts.sessionId,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['user', 'project'], // 'project' is required to load CLAUDE.md + project skills
    },
  });

  for await (const msg of response) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      sessionId = msg.session_id;
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content as Array<Record<string, unknown>>) {
        if (block.type === 'tool_use') {
          opts.events.onTool(String(block.name), block.input);
        }
      }
    } else if (msg.type === 'result') {
      sessionId = msg.session_id;
      costUsd = msg.total_cost_usd ?? 0;
      text = msg.subtype === 'success' ? msg.result : `⚠️ ${msg.subtype}\n${msg.errors.join('\n')}`;
    }
  }

  return { text, sessionId, costUsd };
}
