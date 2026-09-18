import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Collect default Node.js metrics (CPU, memory, etc.)
collectDefaultMetrics({ register, prefix: 'dev_agent_' });

// Claude API metrics
export const claudeApiRequests = new Counter({
  name: 'dev_agent_claude_api_requests_total',
  help: 'Total number of Claude API requests',
  labelNames: ['project', 'user_id', 'status'] as const,
  registers: [register],
});

export const claudeApiCost = new Counter({
  name: 'dev_agent_claude_api_cost_usd_total',
  help: 'Total cost of Claude API requests in USD',
  labelNames: ['project', 'user_id'] as const,
  registers: [register],
});

export const claudeApiLatency = new Histogram({
  name: 'dev_agent_claude_api_latency_seconds',
  help: 'Claude API response latency in seconds',
  labelNames: ['project', 'user_id'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const claudeApiTokens = new Counter({
  name: 'dev_agent_claude_api_tokens_total',
  help: 'Total number of tokens processed by Claude API',
  labelNames: ['project', 'user_id', 'type'] as const, // type: input, output, cache_read, cache_creation
  registers: [register],
});

export const claudeApiResponseLength = new Histogram({
  name: 'dev_agent_claude_api_response_length_chars',
  help: 'Claude API response length in characters',
  labelNames: ['project', 'user_id'] as const,
  buckets: [100, 500, 1000, 2000, 5000, 10000, 20000, 50000],
  registers: [register],
});

export const claudeApiTurns = new Histogram({
  name: 'dev_agent_claude_api_turns',
  help: 'Number of conversation turns per request',
  labelNames: ['project', 'user_id'] as const,
  buckets: [1, 2, 3, 5, 10, 20, 50, 100],
  registers: [register],
});

// Tool execution metrics
export const toolExecutions = new Counter({
  name: 'dev_agent_tool_executions_total',
  help: 'Total number of tool executions',
  labelNames: ['project', 'user_id', 'tool_name'] as const,
  registers: [register],
});

// Telegram bot metrics
export const telegramMessages = new Counter({
  name: 'dev_agent_telegram_messages_total',
  help: 'Total number of Telegram messages received',
  labelNames: ['user_id', 'message_type'] as const, // message_type: text, command
  registers: [register],
});

export const activeConversations = new Gauge({
  name: 'dev_agent_active_conversations',
  help: 'Number of currently active conversations',
  registers: [register],
});

// Session metrics
export const sessionsActive = new Gauge({
  name: 'dev_agent_sessions_active',
  help: 'Number of active sessions',
  registers: [register],
});

/**
 * Helper function to extract project name from working directory path
 */
export function getProjectName(cwd: string): string {
  const parts = cwd.split('/');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Record metrics for a completed Claude API request
 */
export function recordClaudeApiMetrics(params: {
  project: string;
  userId: string;
  status: 'success' | 'error';
  costUsd: number;
  latencySeconds: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  responseLength: number;
  numTurns: number;
}) {
  const labels = { project: params.project, user_id: params.userId };

  claudeApiRequests.inc({ ...labels, status: params.status });
  claudeApiCost.inc(labels, params.costUsd);
  claudeApiLatency.observe(labels, params.latencySeconds);
  claudeApiTokens.inc({ ...labels, type: 'input' }, params.inputTokens);
  claudeApiTokens.inc({ ...labels, type: 'output' }, params.outputTokens);

  if (params.cacheReadTokens !== undefined) {
    claudeApiTokens.inc({ ...labels, type: 'cache_read' }, params.cacheReadTokens);
  }
  if (params.cacheCreationTokens !== undefined) {
    claudeApiTokens.inc({ ...labels, type: 'cache_creation' }, params.cacheCreationTokens);
  }

  claudeApiResponseLength.observe(labels, params.responseLength);
  claudeApiTurns.observe(labels, params.numTurns);
}

/**
 * Record tool execution
 */
export function recordToolExecution(project: string, userId: string, toolName: string) {
  toolExecutions.inc({ project, user_id: userId, tool_name: toolName });
}

/**
 * Record Telegram message
 */
export function recordTelegramMessage(userId: string, messageType: 'text' | 'command') {
  telegramMessages.inc({ user_id: userId, message_type: messageType });
}
