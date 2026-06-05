const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const cmds = [
  ['test', 'node tests/mentionNotifications.test.cjs'],
  ['check-helper', 'node --check client/mobile/screens/chats/mentionNotifications.js'],
  ['check-chats', 'node --check client/mobile/screens/chats/chats_v5.js'],
  ['check-server', 'node --check server/gateway/apiGateway.js']
];
const out = [];
for (const [name, cmd] of cmds) {
  try {
    const stdout = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    out.push(`${name}: OK\n${stdout}`);
  } catch (e) {
    out.push(`${name}: FAIL exit=${e.status}\n${e.stdout || ''}\n${e.stderr || e.message}`);
  }
}
fs.writeFileSync(path.join(__dirname, 'verify-run-result.txt'), out.join('\n---\n'));
