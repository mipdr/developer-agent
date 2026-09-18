import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

export interface AgentEvents {
  /** A tool the agent is about to run (name + raw input). */
  onTool: (name: string, input: unknown) => void;
}

export interface AgentResult {
  text: string;
  sessionId: string;
  costUsd: number;
  metrics?: {
    durationMs: number;
    durationApiMs: number;
    numTurns: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    status: 'success' | 'error';
  };
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
  let metrics: AgentResult['metrics'] | undefined;
  // The SDK only throws "process exited with code N"; the real error goes to the
  // child's stderr. Capture it so we can log it (docker logs) and surface it.
  const errLines: string[] = [];

  const response = query({
    prompt: opts.prompt,
    options: {
      cwd: opts.cwd,
      resume: opts.sessionId,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['user', 'project'], // 'project' is required to load CLAUDE.md + project skills
      stderr: (data) => {
        errLines.push(data);
        process.stderr.write(data); // -> docker logs
      },
    },
  });

  try {
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
        const resultMsg = msg as SDKResultMessage;
        sessionId = resultMsg.session_id;
        costUsd = resultMsg.total_cost_usd ?? 0;
        text = resultMsg.subtype === 'success' ? resultMsg.result : `⚠️ ${resultMsg.subtype}\n${resultMsg.errors?.join('\n') || ''}`;

        // Extract metrics from the result message
        metrics = {
          durationMs: resultMsg.duration_ms ?? 0,
          durationApiMs: resultMsg.duration_api_ms ?? 0,
          numTurns: resultMsg.num_turns ?? 0,
          inputTokens: resultMsg.usage?.input_tokens ?? 0,
          outputTokens: resultMsg.usage?.output_tokens ?? 0,
          cacheReadTokens: resultMsg.usage?.cache_read_input_tokens ?? 0,
          cacheCreationTokens: resultMsg.usage?.cache_creation_input_tokens ?? 0,
          status: resultMsg.subtype === 'success' ? 'success' : 'error',
        };
      }
    }
  } catch (e: any) {
    const detail = errLines.join('').trim();
    console.error('runPrompt failed:', e?.message, detail);
    throw new Error(detail ? `${e?.message ?? e}\n\n${detail}` : String(e?.message ?? e));
  }

  return { text, sessionId, costUsd, metrics };
}
