# Process Cleanup Cronjob

## Overview

This feature implements an automated daily cronjob that identifies and terminates stale processes spawned by the Claude Agent SDK during testing or agent query execution.

## How It Works

The cleanup script (`cleanup-processes.sh`) runs daily at 2:00 AM and performs the following:

1. **Scans for processes** matching specific patterns related to Claude Agent SDK
2. **Identifies stale processes** based on age threshold (default: 24 hours)
3. **Safely terminates** processes using graceful SIGTERM, followed by SIGKILL if needed
4. **Logs all actions** for audit trail and debugging

## Safety Features

- **Process Pattern Matching**: Only targets specific Claude SDK-related processes
- **Main Process Protection**: Never terminates the main bot process (npm start, tsx bot.ts)
- **Age-based Filtering**: Only terminates processes older than the configured threshold
- **Graceful Termination**: Always tries SIGTERM first, waits 5 seconds before SIGKILL
- **Comprehensive Logging**: All actions are logged to `/var/log/process-cleanup.log`
- **Dry-run Mode**: Test the script without actually terminating processes

## Configuration

The script can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_AGE_HOURS` | `24` | Processes older than this will be terminated |
| `DRY_RUN` | `false` | When `true`, only logs what would be done |
| `LOG_FILE` | `/var/log/process-cleanup.log` | Path to the log file |

## Targeted Process Patterns

The script looks for processes matching these patterns:

- `claude-code` - Claude Code CLI processes
- `claude-agent-sdk` - Agent SDK processes
- `tsx.*test` - Test processes started by tsx
- `node.*test` - Test processes started by node

## Schedule

By default, the cronjob runs daily at 2:00 AM. This can be modified in the Dockerfile:

```dockerfile
RUN echo "0 2 * * * /usr/local/bin/cleanup-processes.sh >> /var/log/process-cleanup.log 2>&1" > /etc/cron.d/process-cleanup
```

## Manual Execution

To manually run the cleanup script:

```bash
# Inside the container
/usr/local/bin/cleanup-processes.sh

# In dry-run mode (recommended for testing)
DRY_RUN=true /usr/local/bin/cleanup-processes.sh

# With custom age threshold (e.g., 12 hours)
MAX_AGE_HOURS=12 /usr/local/bin/cleanup-processes.sh
```

## Viewing Logs

Check the cleanup activity:

```bash
# Inside the container
tail -f /var/log/process-cleanup.log

# Or from docker compose
docker compose exec agent tail -f /var/log/process-cleanup.log
```

## Testing

A test script is included to verify the cleanup functionality:

```bash
# Inside the container
/app/test-cleanup.sh
```

## Troubleshooting

### Cron not running

Check if cron service is active:
```bash
service cron status
```

### No processes being cleaned up

1. Check the log file for details: `cat /var/log/process-cleanup.log`
2. Run in dry-run mode to see what would be cleaned: `DRY_RUN=true /usr/local/bin/cleanup-processes.sh`
3. Verify processes exist: `ps aux | grep -E "claude|tsx|node"`

### Processes still running after cleanup

The script may need adjustment if:
- Process patterns don't match your environment
- Processes are being recreated faster than cleanup runs
- Consider reducing `MAX_AGE_HOURS` for more aggressive cleanup

## Implementation Details

Files modified/added:
- `cleanup-processes.sh` - Main cleanup script
- `Dockerfile` - Added cron, procps packages and cronjob configuration
- `entrypoint.sh` - Starts cron daemon on container startup
- `test-cleanup.sh` - Test script for verification
- `PROCESS_CLEANUP.md` - This documentation
