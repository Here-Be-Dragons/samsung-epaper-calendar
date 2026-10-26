import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseConfigText, calendarsFromFile, displayEntriesFromFile } from '../src/configFile.mjs';
import { buildThemePlan } from '../src/themes.mjs';

// The YAML examples in the docs are real config: they must load.
const files = ['README.md', 'docs/CONFIGURATION.md', 'themes/README.md', 'config/config.example.yaml'];
const env = { PERSONAL_ICAL_URL: 'https://example.invalid/a.ics', KITCHEN_PIN: '123456' };

function blocks(file) {
  const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  if (file.endsWith('.yaml')) return [text];
  return [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]).filter((y) => /^(calendars|displays|themes):/m.test(y)); // not the Home Assistant automation examples
}

for (const file of files) {
  test(`the YAML examples in ${file} load`, () => {
    for (const yaml of blocks(file)) {
      const data = parseConfigText(yaml, { env, file });
      if (data.calendars) assert.ok(calendarsFromFile(data.calendars, { file }).length > 0);
      if (data.displays) assert.ok(displayEntriesFromFile(data.displays, { file }).length > 0);
      if (data.themes) buildThemePlan(data.themes, `${file}: themes`);
    }
  });
}

test('the commented themes example in the example config loads when uncommented', () => {
  const text = fs.readFileSync(new URL('../config/config.example.yaml', import.meta.url), 'utf8');
  const lines = text.split('\n'), start = lines.findIndex((l) => l.startsWith('# themes:'));
  assert.ok(start > 0);
  const yaml = lines.slice(start).filter((l) => l.startsWith('#')).map((l) => l.replace(/^# ?/, '')).join('\n');
  const { themes } = parseConfigText(yaml, { env, file: 'config.example.yaml' });
  buildThemePlan(themes, 'themes');
});
