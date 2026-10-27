import { readFileSync } from 'fs';
import { join } from 'path';
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const editorKey = Object.entries(manifest).find(([,c])=>/^assets\/editor-[\w-]+\.js$/.test(c.file))[0];
const ch = manifest[editorKey];
console.log('editor key', editorKey);
console.log('file', ch.file);
console.log('imports', ch.imports);
const imports = ch.imports || [];
imports.forEach(k => {
  const m = manifest[k];
  if(m) console.log(k, '->', m.file);
});
