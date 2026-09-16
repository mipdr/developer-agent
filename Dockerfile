FROM node:24-bookworm-slim

# git + GitHub CLI (the Agent SDK bundles its own Claude Code binary, so no separate install)
# Also install cron and procps for process cleanup cronjob
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates gnupg cron procps \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Setup process cleanup cronjob
COPY cleanup-processes.sh /usr/local/bin/cleanup-processes.sh
RUN chmod +x /usr/local/bin/cleanup-processes.sh

# Configure cron to run cleanup daily at 2 AM
RUN echo "0 2 * * * /usr/local/bin/cleanup-processes.sh >> /var/log/process-cleanup.log 2>&1" > /etc/cron.d/process-cleanup \
  && chmod 0644 /etc/cron.d/process-cleanup \
  && crontab /etc/cron.d/process-cleanup

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
