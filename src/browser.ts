import { chromium, Browser, Page, BrowserContext } from 'playwright';

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: number;
}

// Store browser sessions per chat
const sessions = new Map<number, BrowserSession>();

// Cleanup interval - close browsers idle for more than 5 minutes
const IDLE_TIMEOUT = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [chatId, session] of sessions.entries()) {
    if (now - session.lastUsed > IDLE_TIMEOUT) {
      session.browser.close().catch(console.error);
      sessions.delete(chatId);
      console.log(`Closed idle browser for chat ${chatId}`);
    }
  }
}, 60 * 1000); // Check every minute

/**
 * Get or create a browser session for a chat.
 */
export async function getBrowserSession(chatId: number): Promise<BrowserSession> {
  let session = sessions.get(chatId);

  if (session) {
    session.lastUsed = Date.now();
    return session;
  }

  // Create new session
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  session = {
    browser,
    context,
    page,
    lastUsed: Date.now(),
  };

  sessions.set(chatId, session);
  console.log(`Created new browser session for chat ${chatId}`);

  return session;
}

/**
 * Close a browser session for a specific chat.
 */
export async function closeBrowserSession(chatId: number): Promise<void> {
  const session = sessions.get(chatId);
  if (session) {
    await session.browser.close();
    sessions.delete(chatId);
    console.log(`Closed browser session for chat ${chatId}`);
  }
}

/**
 * Navigate to a URL and capture a screenshot.
 */
export async function captureScreenshot(
  chatId: number,
  url: string,
  options?: { fullPage?: boolean; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
): Promise<Buffer> {
  const session = await getBrowserSession(chatId);

  await session.page.goto(url, {
    waitUntil: options?.waitUntil ?? 'networkidle',
    timeout: 30000,
  });

  // Wait a bit for any animations or lazy loading
  await session.page.waitForTimeout(1000);

  const screenshot = await session.page.screenshot({
    type: 'png',
    fullPage: options?.fullPage ?? false,
  });

  return screenshot;
}

/**
 * Execute JavaScript in the page context and return the result.
 */
export async function executeScript(chatId: number, script: string): Promise<any> {
  const session = await getBrowserSession(chatId);
  return await session.page.evaluate(script);
}

/**
 * Get the current page HTML.
 */
export async function getPageContent(chatId: number): Promise<string> {
  const session = await getBrowserSession(chatId);
  return await session.page.content();
}

/**
 * Get the current page URL.
 */
export async function getCurrentUrl(chatId: number): Promise<string> {
  const session = sessions.get(chatId);
  return session ? session.page.url() : '';
}

/**
 * Click an element on the page.
 */
export async function clickElement(chatId: number, selector: string): Promise<void> {
  const session = await getBrowserSession(chatId);
  await session.page.click(selector);
  session.lastUsed = Date.now();
}

/**
 * Type text into an input field.
 */
export async function typeText(chatId: number, selector: string, text: string): Promise<void> {
  const session = await getBrowserSession(chatId);
  await session.page.fill(selector, text);
  session.lastUsed = Date.now();
}

/**
 * Navigate to a URL without taking a screenshot.
 */
export async function navigate(chatId: number, url: string): Promise<void> {
  const session = await getBrowserSession(chatId);
  await session.page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  session.lastUsed = Date.now();
}
