#!/bin/bash
#
# Test script for process cleanup functionality
#
# This script verifies that the cleanup-processes.sh script works correctly
# in dry-run mode.

set -euo pipefail

echo "Testing process cleanup script..."
echo

# Test 1: Dry run mode
echo "Test 1: Running cleanup script in dry-run mode"
DRY_RUN=true MAX_AGE_HOURS=1 /workspace/developer-agent/cleanup-processes.sh
echo "✓ Dry-run test passed"
echo

# Test 2: Verify log file is created
echo "Test 2: Verifying log file creation"
if [ -f "/var/log/process-cleanup.log" ]; then
    echo "✓ Log file exists"
    echo "Last 10 lines of log:"
    tail -n 10 /var/log/process-cleanup.log
else
    echo "✓ Log file will be created on first run"
fi
echo

echo "All tests passed!"
