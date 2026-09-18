# Metrics Documentation

The dev-agent exposes Prometheus metrics on port 9091 (configurable via `METRICS_PORT` environment variable).

## Endpoints

- `GET /metrics` - Prometheus metrics in text format
- `GET /health` - Health check endpoint (returns `{"status": "ok"}`)

## Available Metrics

### Claude API Metrics

#### `dev_agent_claude_api_requests_total`
**Type:** Counter
**Labels:** `project`, `user_id`, `status` (success/error)
**Description:** Total number of Claude API requests

#### `dev_agent_claude_api_cost_usd_total`
**Type:** Counter
**Labels:** `project`, `user_id`
**Description:** Total cost of Claude API requests in USD

#### `dev_agent_claude_api_latency_seconds`
**Type:** Histogram
**Labels:** `project`, `user_id`
**Buckets:** 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300
**Description:** Claude API response latency in seconds (total execution time)

#### `dev_agent_claude_api_tokens_total`
**Type:** Counter
**Labels:** `project`, `user_id`, `type` (input/output/cache_read/cache_creation)
**Description:** Total number of tokens processed by Claude API

#### `dev_agent_claude_api_response_length_chars`
**Type:** Histogram
**Labels:** `project`, `user_id`
**Buckets:** 100, 500, 1000, 2000, 5000, 10000, 20000, 50000
**Description:** Claude API response length in characters

#### `dev_agent_claude_api_turns`
**Type:** Histogram
**Labels:** `project`, `user_id`
**Buckets:** 1, 2, 3, 5, 10, 20, 50, 100
**Description:** Number of conversation turns per request

### Tool Execution Metrics

#### `dev_agent_tool_executions_total`
**Type:** Counter
**Labels:** `project`, `user_id`, `tool_name`
**Description:** Total number of tool executions

### Telegram Bot Metrics

#### `dev_agent_telegram_messages_total`
**Type:** Counter
**Labels:** `user_id`, `message_type` (text/command)
**Description:** Total number of Telegram messages received

#### `dev_agent_active_conversations`
**Type:** Gauge
**Description:** Number of currently active conversations (being processed)

### Session Metrics

#### `dev_agent_sessions_active`
**Type:** Gauge
**Description:** Number of active Claude sessions (chats with ongoing conversations)

### Node.js Default Metrics

The agent also exports standard Node.js metrics with the `dev_agent_` prefix:

- `dev_agent_process_cpu_user_seconds_total` - User CPU time
- `dev_agent_process_cpu_system_seconds_total` - System CPU time
- `dev_agent_process_resident_memory_bytes` - Resident memory size
- `dev_agent_process_heap_bytes` - Heap size
- `dev_agent_nodejs_eventloop_lag_seconds` - Event loop lag
- And more...

## Example Prometheus Queries

### Cost Analysis
```promql
# Total cost by project
sum by (project) (dev_agent_claude_api_cost_usd_total)

# Cost rate per hour by user
rate(dev_agent_claude_api_cost_usd_total[1h]) * 3600

# Average cost per request
rate(dev_agent_claude_api_cost_usd_total[5m]) / rate(dev_agent_claude_api_requests_total{status="success"}[5m])
```

### Performance Analysis
```promql
# 95th percentile API latency by project
histogram_quantile(0.95, sum by (project, le) (rate(dev_agent_claude_api_latency_seconds_bucket[5m])))

# Average response length
rate(dev_agent_claude_api_response_length_chars_sum[5m]) / rate(dev_agent_claude_api_response_length_chars_count[5m])

# Request rate by status
sum by (status) (rate(dev_agent_claude_api_requests_total[5m]))
```

### Token Usage
```promql
# Total tokens by type
sum by (type) (dev_agent_claude_api_tokens_total)

# Token rate by type
sum by (type) (rate(dev_agent_claude_api_tokens_total[5m]))

# Cache hit ratio
sum(rate(dev_agent_claude_api_tokens_total{type="cache_read"}[5m]))
/
sum(rate(dev_agent_claude_api_tokens_total{type=~"input|cache_read"}[5m]))
```

### Tool Usage
```promql
# Top 10 most used tools
topk(10, sum by (tool_name) (dev_agent_tool_executions_total))

# Tool execution rate by project
sum by (project, tool_name) (rate(dev_agent_tool_executions_total[5m]))
```

### User Activity
```promql
# Messages per user
sum by (user_id) (dev_agent_telegram_messages_total)

# Active users (users who sent messages in last 24h)
count(sum by (user_id) (increase(dev_agent_telegram_messages_total[24h])) > 0)

# Message rate by type
sum by (message_type) (rate(dev_agent_telegram_messages_total[5m]))
```

## Integration with Self-Hosting Monitoring Stack

To integrate with a Prometheus/Grafana stack:

1. Ensure the dev-agent service is on the same Docker network as Prometheus
2. Add a scrape job to Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'dev-agent'
    static_configs:
      - targets: ['dev-agent:9091']  # Use service name if on same network
```

3. Restart Prometheus to apply the configuration
4. Import or create Grafana dashboards using the metrics above

## Label Cardinality Notes

- `user_id`: Low cardinality (limited to allowed users)
- `project`: Medium cardinality (number of repositories in workspace)
- `tool_name`: Low-medium cardinality (limited set of Claude SDK tools)
- `status`: Very low cardinality (success/error)
- `type`: Very low cardinality (input/output/cache_read/cache_creation)
- `message_type`: Very low cardinality (text/command)

All labels are carefully chosen to maintain low cardinality and avoid high-cardinality explosions that could impact Prometheus performance.
