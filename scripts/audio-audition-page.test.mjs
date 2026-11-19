import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAudioPreviewCatalog } from '../apps/web/audio-preview-catalog.mjs';

test('the old audition page redirects through the game and contains no standalone player', async () => {
  const html=await readFile(new URL('../apps/web/public/audio-candidates/2026-11-12-v1/index.html',import.meta.url),'utf8');
  assert.match(html,/url=\/\?preview=effects&amp;tab=audio/);
  assert.doesNotMatch(html,/<(?:audio|script)\b/);
});

test('audition catalog covers the runtime and candidate directories with unique URLs', () => {
  const catalog=buildAudioPreviewCatalog(),groups=Object.groupBy(catalog,track=>track.group);
  assert.equal(new Set(catalog.map(track=>track.url)).size,catalog.length);
  assert.ok(groups.candidate.length>=55);
  assert.ok(groups.effects.length+groups.music.length>=132);
  assert.ok(groups.candidate.some(track=>track.id==='M22'&&track.channel==='music'&&track.sources.length>0));
  assert.equal(catalog.filter(track=>track.channel==='music').length,18);
  assert.ok(groups.effects.some(track=>track.id==='control-tap'&&track.license==='CC0 1.0'));
  assert.equal(groups.effects.filter(track=>track.id.startsWith('setup-ratchet-')&&track.license==='CC BY 4.0').length,3);
  assert.ok(groups.effects.some(track=>track.id==='paper-turn-4'&&track.url.includes('/v2/')));
});
