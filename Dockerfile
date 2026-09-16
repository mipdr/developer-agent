FROM node:24-bookworm-slim

# git + GitHub CLI + Playwright dependencies
# The Agent SDK bundles its own Claude Code binary, so no separate install
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     git curl ca-certificates gnupg \
     libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
     libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
     libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
     libasound2 libatspi2.0-0 libxshmfence1 \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install Playwright browsers
RUN npx playwright install chromium --with-deps

COPY . .

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
