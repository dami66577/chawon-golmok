// 화면 약속 시험: 계산(sim.js)이 내보내는 사건과 선물 종류를 화면(main.js)이 빠짐없이 다루는지 본다.
// (1.0에서 선물 종류가 바뀌었는데 화면이 옛 종류만 알아서 재료 선물 때 멈췄던 일이 다시 없게)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sim = readFileSync(new URL('../sim.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
// 화면이 일부러 따로 안 다루는 사건 (그 자리에서 버튼이 직접 처리한다)
const QUIET = new Set(['annexChanged', 'equipPlaced', 'hired', 'idea', 'layoutChanged']);

test('계산이 내보내는 사건은 모두 화면이 다룬다', () => {
  const emitted = new Set([...sim.matchAll(/type: '([a-zA-Z]+)'/g)].map((m) => m[1]));
  const handled = new Set([...main.matchAll(/e\.type === '([a-zA-Z]+)'/g)].map((m) => m[1]));
  const missing = [...emitted].filter((t) => !handled.has(t) && !QUIET.has(t));
  assert.deepEqual(missing, [], `화면이 모르는 사건: ${missing.join(', ')}`);
});

test('단골 선물 종류는 모두 화면에 글이 있다', () => {
  const kinds = new Set([...sim.matchAll(/\['ingredient', 'ingredient', 'clue', 'gold'\]|gift\.kind = '([a-z]+)'/g)].map((m) => m[1]).filter(Boolean));
  for (const k of ['ingredient', 'clue', 'gold', 'ideas', ...kinds]) assert.ok(main.includes(`e.kind === '${k}'`), `선물 '${k}'`);
});
