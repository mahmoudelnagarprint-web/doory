import { readFileSync, writeFileSync } from 'fs';
const path='src/editor/strings.ts';
const lines=readFileSync(path,'utf8').split('\n');
let start=-1, end=-1;
for(let i=0;i<lines.length;i++){
  if(lines[i].includes('  collage: {')){
    start=i;
  }
  if(start>=0 && lines[i].trim()==='},' && lines[i+1] && lines[i+1].includes('  ctx: {')){
    end=i;
    break;
  }
}
if(start>=0 && end>=0){
  const newLines=[...lines.slice(0,start), ...lines.slice(end+1)];
  writeFileSync(path,newLines.join('\n'));
  console.log('removed', start, end);
}else{
  console.log('not found');
}
