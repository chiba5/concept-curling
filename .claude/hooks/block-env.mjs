import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const p = String(input.tool_input?.file_path ?? '').replaceAll('\\', '/');
if (/(^|\/)\.env($|\.(?!example$))/.test(p)) {
  console.error('.env へのアクセスはプロジェクト方針でブロックされています');
  process.exit(2); // exit 2 = ツール呼び出しをブロック
}
