import { Bot, InputFile } from 'grammy';
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, tmpdir } from 'node:os';
import * as session from './session.js';
import { runPrompt } from './agent.js';
import { chunk, truncate, parseSkillDescription, summarizeTool } from './util.js';
import * as browser from './browser.js';

const run = promisify(execFile);

const TOKEN = required('TELEGRAM_BOT_TOKEN');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Optional, for audio transcription
const ALLOWED = new Set(
  (process.env.ALLOWED_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);
const WORKSPACE = process.env.WORKSPACE_DIR ?? '/workspace';
const USER_SKILLS = join(homedir(), '.claude', 'skills');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const bot = new Bot(TOKEN);
const busy = new Set<number>();

// --- access control: silently ignore anyone not on the allowlist ---
bot.use(async (ctx, next) => {
  const id = ctx.from?.id;
  if (id && ALLOWED.has(String(id))) return next();
  console.warn(`ignored message from unlisted user ${id}`);
});

// --- helpers ---
async function reply(ctx: any, text: string): Promise<void> {
  for (const part of chunk(text || '(empty)', 4000)) await ctx.reply(part);
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
}

/** Pull `name`/`description` out of a SKILL.md frontmatter block. */
function readSkills(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return listDirs(dir)
    .map((name) => {
      const f = join(dir, name, 'SKILL.md');
      if (!existsSync(f)) return null;
      const desc = parseSkillDescription(readFileSync(f, 'utf8'));
      return `• *${name}* — ${truncate(desc, 120)}`;
    })
    .filter((x): x is string => x !== null);
}

// --- commands ---
const HELP = `*Dev agent — commands*

/projects — list repos in the workspace
/project <owner/repo | dirname> — switch to a repo (clones via gh if missing); resets the conversation
/skills — list global + project skills the agent can use
/context — show the active CLAUDE.md files (global + project)
/help — this message

*Usage:* pick a project with /project, then just send plain messages or voice messages — each becomes a prompt to the agent. The conversation is remembered per chat until you switch project.`;

bot.command('start', (ctx) =>
  ctx.reply('Dev agent online. /projects to list repos, /project <name> to pick one, then just talk or send voice messages. /help for all commands.'),
);

bot.command('help', (ctx) => reply(ctx, HELP));

bot.command('projects', (ctx) => {
  const dirs = listDirs(WORKSPACE);
  reply(ctx, dirs.length ? `Projects:\n${dirs.map((d) => `• ${d}`).join('\n')}` : 'No repos yet. `/project owner/name` to clone one.');
});

bot.command('project', async (ctx) => {
  const name = ctx.match.trim();
  if (!name) return void ctx.reply('Usage: /project <owner/repo | dirname>');
  const dir = join(WORKSPACE, name.split('/').pop()!);
  if (!existsSync(dir)) {
    await ctx.reply(`Cloning ${name}…`);
    try {
      await run('gh', ['repo', 'clone', name, dir]);
    } catch (e: any) {
      return void reply(ctx, `❌ clone failed:\n${e.stderr ?? e.message}`);
    }
  }
  session.setProject(ctx.chat.id, dir);
  await ctx.reply(`📂 Project set to ${dir}. Conversation reset.`);
});

bot.command('skills', (ctx) => {
  const st = session.get(ctx.chat.id);
  const global = readSkills(USER_SKILLS);
  const project = st ? readSkills(join(st.cwd, '.claude', 'skills')) : [];
  const parts = [
    global.length ? `*Global skills:*\n${global.join('\n')}` : '*Global skills:* none',
    project.length ? `*Project skills:*\n${project.join('\n')}` : '*Project skills:* none',
  ];
  reply(ctx, parts.join('\n\n'));
});

bot.command('context', (ctx) => {
  const st = session.get(ctx.chat.id);
  const files = [join(homedir(), '.claude', 'CLAUDE.md'), st && join(st.cwd, 'CLAUDE.md')].filter(
    (f): f is string => !!f && existsSync(f),
  );
  if (!files.length) return void ctx.reply('No CLAUDE.md loaded (global or project).');
  reply(ctx, files.map((f) => `*${f}:*\n${readFileSync(f, 'utf8')}`).join('\n\n---\n\n'));
});

// --- browser commands ---
bot.command('screenshot', async (ctx) => {
  const url = ctx.match.trim();
  if (!url) return void ctx.reply('Usage: /screenshot <url>');

  try {
    await ctx.reply(`📸 Capturing screenshot of ${url}...`);
    const screenshot = await browser.captureScreenshot(ctx.chat.id, url, { fullPage: false });
    await ctx.replyWithPhoto(new InputFile(screenshot), {
      caption: `Screenshot of ${url}`,
    });
  } catch (e: any) {
    await reply(ctx, `❌ Screenshot failed: ${e.message ?? String(e)}`);
  }
});

bot.command('browse', async (ctx) => {
  const url = ctx.match.trim();
  if (!url) return void ctx.reply('Usage: /browse <url>');

  try {
    await ctx.reply(`🌐 Navigating to ${url}...`);
    await browser.navigate(ctx.chat.id, url);
    const currentUrl = await browser.getCurrentUrl(ctx.chat.id);
    await ctx.reply(`✅ Navigated to: ${currentUrl}\n\nYou can now:\n• Send commands like "take a screenshot"\n• Ask the agent to interact with the page\n• Use /screenshot to capture the current page`);
  } catch (e: any) {
    await reply(ctx, `❌ Navigation failed: ${e.message ?? String(e)}`);
  }
});

bot.command('closebrowser', async (ctx) => {
  try {
    await browser.closeBrowserSession(ctx.chat.id);
    await ctx.reply('✅ Browser session closed.');
  } catch (e: any) {
    await reply(ctx, `❌ Failed to close browser: ${e.message ?? String(e)}`);
  }
});

// --- helper to process prompts (shared by text + voice) ---
async function processPrompt(ctx: any, prompt: string): Promise<void> {
  const chatId = ctx.chat.id;
  const st = session.get(chatId);
  if (!st) return void ctx.reply('Pick a project first: /projects then /project <name>.');
  if (busy.has(chatId)) return void ctx.reply('⏳ Still working on the previous request.');
  busy.add(chatId);

  const status = await ctx.reply('🤔 working…');
  const lines: string[] = [];
  let lastEdit = 0;
  const flush = async (force = false) => {
    if (!force && Date.now() - lastEdit < 2000) return;
    lastEdit = Date.now();
    try {
      await ctx.api.editMessageText(chatId, status.message_id, truncate(lines.slice(-12).join('\n'), 3500));
    } catch {
      /* ignore edit races / identical-content errors */
    }
  };

  try {
    const { text, sessionId, costUsd } = await runPrompt({
      prompt,
      cwd: st.cwd,
      sessionId: st.sessionId,
      events: {
        onTool: (name, input) => {
          lines.push(summarizeTool(name, input));
          void flush();
        },
      },
    });
    session.setSession(chatId, sessionId);
    await flush(true);
    await reply(ctx, text);
    await ctx.reply(`✅ done · $${costUsd.toFixed(3)}`);
  } catch (e: any) {
    await reply(ctx, `❌ ${e.message ?? String(e)}`);
  } finally {
    busy.delete(chatId);
  }
}

// --- free text = a prompt to the agent ---
bot.on('message:text', async (ctx) => {
  await processPrompt(ctx, ctx.message.text);
});

// --- voice/audio messages = transcribed then sent to agent ---
bot.on('message:voice', async (ctx) => {
  const st = session.get(ctx.chat.id);
  if (!st) return void ctx.reply('Pick a project first: /projects then /project <name>.');

  if (!OPENAI_API_KEY) {
    return void ctx.reply('⚠️ Audio transcription requires OPENAI_API_KEY environment variable to be set.');
  }

  let tempFile: string | null = null;

  try {
    await ctx.reply('🎤 Transcribing audio…');
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    // Download the audio file
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download audio file');

    // Save to temp file (Whisper API needs a file)
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    tempFile = join(tmpdir(), `tg-voice-${Date.now()}.ogg`);
    writeFileSync(tempFile, audioBuffer);

    // Transcribe using OpenAI Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');

    const transcribeResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.text();
      throw new Error(`Transcription failed: ${error}`);
    }

    const transcription = await transcribeResponse.json() as { text: string };
    const transcribedText = transcription.text.trim();

    if (!transcribedText) {
      return void ctx.reply('⚠️ Could not transcribe audio - no speech detected.');
    }

    // Show the transcribed text
    await ctx.reply(`📝 Transcribed: "${transcribedText}"`);

    // Process the transcribed text as a prompt
    await processPrompt(ctx, transcribedText);

  } catch (e: any) {
    await ctx.reply(`❌ Audio processing failed: ${e.message ?? String(e)}`);
  } finally {
    // Clean up temp file
    if (tempFile) {
      try {
        unlinkSync(tempFile);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
});

bot.catch((err) => console.error('bot error', err));
bot.start({ onStart: (b) => console.log(`@${b.username} polling`) });
