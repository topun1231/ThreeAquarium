import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),evidence=path.join(root,'evidence'),results={};
for(const name of ['browser','complete','ui','setup','full','soak']){
 const log=fs.readFileSync(path.join(evidence,`audit-${name}.log`),'utf8'),match=log.match(/### Result\r?\n([^\r\n]+)/);assert.ok(match,`missing ${name} result`);const data=JSON.parse(match[1]);assert.ok(!data.failure,JSON.stringify(data));assert.equal(data.errors.length,0);assert.ok(!data.checks?.some(c=>typeof c==='object'&&!c.pass));results[name]=data;
 fs.writeFileSync(path.join(evidence,`audit-${name}.json`),JSON.stringify(data,null,2));
}
const tests=fs.readFileSync(path.join(evidence,'audit-tests.txt'),'utf8');assert.match(tests,/# pass 29/);assert.match(tests,/# fail 0/);
const report={date:'2026-10-10',nodeTests:29,browserChecks:Object.values(results).reduce((n,d)=>n+(d.checks?.length||0),0),soak:results.soak,assets:JSON.parse(fs.readFileSync(path.join(evidence,'audit-assets.json')))};
fs.writeFileSync(path.join(evidence,'audit-summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({nodeTests:report.nodeTests,browserChecks:report.browserChecks,errors:0}));
