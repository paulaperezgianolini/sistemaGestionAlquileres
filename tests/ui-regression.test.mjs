import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appSource=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');

test('editor keeps stable form and submit button references across async saves',()=>{
  assert.match(appSource,/const editor=e\.currentTarget,submitButton=editor\.querySelector\('\[type="submit"\]'\)/);
  assert.match(appSource,/finally\{busy=false;submitButton\.disabled=false;\}/);
  assert.doesNotMatch(appSource,/finally\{busy=false;e\.currentTarget\.querySelector\('\[type="submit"\]'\)/);
});

test('every editor opening clears a stale disabled submit state',()=>{
  assert.match(appSource,/\$\('#editorForm'\)\.querySelector\('\[type="submit"\]'\)\.disabled=false;/);
});

test('access form keeps a stable reference before awaiting Supabase',()=>{
  assert.match(appSource,/const inviteForm=event\.currentTarget/);
  assert.match(appSource,/inviteForm\.reset\(\);await reloadData\(\)/);
  assert.doesNotMatch(appSource,/await setAccessInvite\([\s\S]*?event\.currentTarget\.reset\(\)/);
});
