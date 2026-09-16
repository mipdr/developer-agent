#!/bin/bash
#
# Process Cleanup Script for Claude Agent SDK
#
# This script identifies and terminates stale processes that were started
# by the Claude Agent SDK for testing or agent queries but are no longer needed.
#
# Safety features:
# - Only targets specific process patterns to avoid killing critical processes
# - Identifies processes by age (older than 24 hours)
# - Logs all actions for audit trail
# - Uses graceful termination (SIGTERM) first, then SIGKILL if needed

set -euo pipefail

# Configuration
LOG_FILE="${LOG_FILE:-/var/log/process-cleanup.log}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-24}"
DRY_RUN="${DRY_RUN:-false}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Process Cleanup Script Started ==="
log "Configuration: MAX_AGE_HOURS=$MAX_AGE_HOURS, DRY_RUN=$DRY_RUN"

# Calculate the cutoff time in seconds since epoch
CUTOFF_TIME=$(($(date +%s) - (MAX_AGE_HOURS * 3600)))
log "Cutoff time: $(date -d "@$CUTOFF_TIME" '+%Y-%m-%d %H:%M:%S')"

# Counter for terminated processes
TERMINATED_COUNT=0
FAILED_COUNT=0

# Function to check if a process should be cleaned up
should_cleanup_process() {
    local pid=$1
    local cmd=$2
    local start_time=$3

    # Skip if the process is the main bot process (npm start or tsx src/bot.ts)
    if echo "$cmd" | grep -qE "npm start|tsx.*bot\.ts"; then
        return 1
    fi

    # Target patterns for cleanup:
    # - Claude SDK agent processes (claude-code, @anthropic-ai/claude-agent-sdk)
    # - Child processes spawned by the SDK (tsx, node with specific patterns)
    # - Test-related processes
    if echo "$cmd" | grep -qE "claude-code|claude-agent-sdk|tsx.*test|node.*test"; then
        # Check if process is older than MAX_AGE_HOURS
        if [ "$start_time" -lt "$CUTOFF_TIME" ]; then
            return 0
        fi
    fi

    return 1
}

# Function to terminate a process
terminate_process() {
    local pid=$1
    local cmd=$2

    if [ "$DRY_RUN" = "true" ]; then
        log "[DRY-RUN] Would terminate PID $pid: $cmd"
        return 0
    fi

    log "Terminating PID $pid: $cmd"

    # Try graceful termination first
    if kill -TERM "$pid" 2>/dev/null; then
        # Wait up to 5 seconds for process to exit
        for i in {1..5}; do
            if ! kill -0 "$pid" 2>/dev/null; then
                log "Process $pid terminated gracefully"
                return 0
            fi
            sleep 1
        done

        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            log "Process $pid did not terminate gracefully, sending SIGKILL"
            if kill -KILL "$pid" 2>/dev/null; then
                log "Process $pid force killed"
                return 0
            fi
        fi
    else
        log "Failed to terminate PID $pid (may have already exited)"
        return 1
    fi
}

# Scan for processes
log "Scanning for stale processes..."

# Use ps to get process information
# Format: PID,START_TIME,COMMAND
# We need to parse the start time and convert it to epoch seconds
while IFS= read -r line; do
    # Parse ps output: PID ELAPSED CMD
    PID=$(echo "$line" | awk '{print $1}')
    ELAPSED=$(echo "$line" | awk '{print $2}')
    CMD=$(echo "$line" | cut -d' ' -f3-)

    # Skip header
    if [ "$PID" = "PID" ]; then
        continue
    fi

    # Convert ELAPSED (format: [[DD-]HH:]MM:SS or SSSSS) to seconds
    ELAPSED_SECONDS=0
    if echo "$ELAPSED" | grep -q '-'; then
        # Format: DD-HH:MM:SS
        DAYS=$(echo "$ELAPSED" | cut -d'-' -f1)
        HMS=$(echo "$ELAPSED" | cut -d'-' -f2)
        HOURS=$(echo "$HMS" | cut -d':' -f1)
        MINUTES=$(echo "$HMS" | cut -d':' -f2)
        SECONDS=$(echo "$HMS" | cut -d':' -f3)
        ELAPSED_SECONDS=$((DAYS * 86400 + HOURS * 3600 + MINUTES * 60 + SECONDS))
    elif echo "$ELAPSED" | grep -q ':'; then
        # Format: HH:MM:SS or MM:SS
        if [ "$(echo "$ELAPSED" | tr -cd ':' | wc -c)" -eq 2 ]; then
            # HH:MM:SS
            HOURS=$(echo "$ELAPSED" | cut -d':' -f1)
            MINUTES=$(echo "$ELAPSED" | cut -d':' -f2)
            SECONDS=$(echo "$ELAPSED" | cut -d':' -f3)
            ELAPSED_SECONDS=$((HOURS * 3600 + MINUTES * 60 + SECONDS))
        else
            # MM:SS
            MINUTES=$(echo "$ELAPSED" | cut -d':' -f1)
            SECONDS=$(echo "$ELAPSED" | cut -d':' -f2)
            ELAPSED_SECONDS=$((MINUTES * 60 + SECONDS))
        fi
    else
        # Plain seconds
        ELAPSED_SECONDS=$ELAPSED
    fi

    # Calculate start time
    START_TIME=$(($(date +%s) - ELAPSED_SECONDS))

    # Check if process should be cleaned up
    if should_cleanup_process "$PID" "$CMD" "$START_TIME"; then
        log "Found stale process: PID=$PID, Age=${ELAPSED}, CMD=$CMD"
        if terminate_process "$PID" "$CMD"; then
            ((TERMINATED_COUNT++)) || true
        else
            ((FAILED_COUNT++)) || true
        fi
    fi
done < <(ps -eo pid,etime,args --no-headers 2>/dev/null || echo "")

log "=== Process Cleanup Complete ==="
log "Summary: Terminated=$TERMINATED_COUNT, Failed=$FAILED_COUNT"

# Exit with error if any terminations failed
if [ "$FAILED_COUNT" -gt 0 ]; then
    exit 1
fi

exit 0
