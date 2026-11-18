import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath } from '../lib/safe-redirect';

test('same-site paths are kept', () => {
  assert.equal(safeNextPath('/arenas/mezzeh-arena'), '/arenas/mezzeh-arena');
  assert.equal(safeNextPath('/?q=1'), '/?q=1');
});

test('anything that could leave the site falls back to /', () => {
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'evil', '', null, undefined, '/a\nb']) {
    assert.equal(safeNextPath(bad as string), '/', String(bad));
  }
});
