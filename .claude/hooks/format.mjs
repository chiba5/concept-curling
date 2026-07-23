import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const p = String(input.tool_input?.file_path ?? '');
if (p && /\.(ts|tsx|mjs|json|css|html)$/.test(p) && existsSync(p)) {
  try {
    execFileSync('npx', ['prettier', '--write', p], { stdio: 'ignore', shell: true });
  } catch {
    // 整形失敗はセッションを止めない
  }
}
