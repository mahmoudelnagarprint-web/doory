import { readFileSync, writeFileSync } from 'fs';
const path='src/editor/strings.ts';
let content=readFileSync(path,'utf8');
content=content.replace(/  collage: \{[\s\S]*?\n  \},\n  ctx: \{/,'  },\n  ctx: {');
writeFileSync(path,content);
