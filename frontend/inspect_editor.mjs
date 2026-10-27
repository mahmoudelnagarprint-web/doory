import { readFileSync } from 'fs';
import { join } from 'path';
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const editorKey = Object.entries(manifest).find(([,c])=>c.file.includes('editor-') && c.name==='minus'? false : c.file.startsWith('assets/editor-'))?.[0];
console.log('key', editorKey);
// Find actual editor entry
const entryKey = Object.entries(manifest).find(([,c])=>c.name==='minus'?false: c.isEntry && c.file.includes('editor') )?.[0];
console.log('entry', entryKey);
const keys = Object.keys(manifest);
const editorKeys = keys.filter(k=>manifest[k].file.match(/^assets\/editor-[\w-]+\.js$/));
console.log(editorKeys);
const key = editorKeys[0];
const ch = manifest[key];
console.log('editor key', key);
console.log('imports', ch.imports);
ch.imports.forEach(k=>{
  const m = manifest[k];
  console.log(' ', k, '->', m?.file);
});
