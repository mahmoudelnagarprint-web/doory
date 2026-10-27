import { readFileSync } from 'fs';
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const editorKey = 'src/editor/index.tsx';
const entry = manifest[editorKey];
console.log('imports count', entry.imports.length);
const collageRefs = entry.imports.filter(k => manifest[k]?.file?.includes('collage'));
console.log('collage imports', collageRefs);
for (const k of entry.imports) {
  const m = manifest[k];
  if (m && m.file) {
    if (m.file.includes('collage') || m.file.includes('Collage')) {
      console.log(k, m.file);
    }
  }
}
