import { Bot } from 'grammy';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import * as session from './session.js';
import { runPrompt } from './agent.js';
import { chunk, truncate, parseSkillDescription, summarizeTool } from './util.js';

const run = promisify(execFile);

const TOKEN = required('TELEGRAM_BOT_TOKEN');
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

*Usage:* pick a project with /project, then just send plain messages — each becomes a prompt to the agent. The conversation is remembered per chat until you switch project.`;

bot.command('start', (ctx) =>
  ctx.reply('Dev agent online. /projects to list repos, /project <name> to pick one, then just talk. /help for all commands.'),
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

// --- free text = a prompt to the agent ---
bot.on('message:text', async (ctx) => {
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
      prompt: ctx.message.text,
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
});

bot.catch((err) => console.error('bot error', err));
bot.start({ onStart: (b) => console.log(`@${b.username} polling`) });
