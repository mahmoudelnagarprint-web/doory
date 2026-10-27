import { readFileSync } from 'fs';
const report = JSON.parse(readFileSync('dist/bundle-report.json','utf8'));
console.log(JSON.stringify(report.routes.find(r=>r.name==='/local/:id (editor)'), null, 2));
