import { readFileSync } from 'fs';
import { join } from 'path';
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const entry = Object.entries(manifest).find(([,c])=>c.name==='minus');
console.log(entry);
