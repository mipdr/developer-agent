#!/bin/sh
set -e

# Let git push/pull use the GitHub token (for clones + Claude's own git pushes).
if [ -n "$GH_TOKEN" ]; then
  gh auth setup-git 2>/dev/null || true
fi

exec npm start
