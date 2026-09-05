import assert from 'node:assert/strict';
import { chunk, truncate, parseSkillDescription, summarizeTool } from './util.js';

// chunk: splits on the boundary, never loses characters, never returns []
assert.deepEqual(chunk('abcde', 2), ['ab', 'cd', 'e']);
assert.deepEqual(chunk('', 4000), ['']);
assert.equal(chunk('x'.repeat(9000), 4000).join(''), 'x'.repeat(9000));

// truncate: adds ellipsis only past the limit
assert.equal(truncate('short', 10), 'short');
assert.equal(truncate('abcdef', 4), 'abc…');

// frontmatter description extraction
assert.equal(parseSkillDescription('---\nname: x\ndescription:  deploy the app \n---\n'), 'deploy the app');
assert.equal(parseSkillDescription('no frontmatter here'), '');

// tool summary picks the most useful field and truncates
assert.equal(summarizeTool('Bash', { command: 'git status' }), '🔧 Bash git status');
assert.equal(summarizeTool('Read', { file_path: '/a/b.ts' }), '🔧 Read /a/b.ts');
assert.ok(summarizeTool('Bash', { command: 'x'.repeat(500) }).length <= 200);

console.log('ok');
