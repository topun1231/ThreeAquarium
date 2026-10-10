import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.bin':'application/octet-stream','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'three-aquarium',version:1}));return;}
 try{
  const url=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(url.includes('\0')||url.includes('\\'))throw new Error('invalid path');
  let file;const candidates=[path.join(root,'dist',url==='/'?'index.html':url)];if(url.startsWith('/assets/'))candidates.push(path.join(root,'public',url));
  for(const candidate of candidates){const resolved=path.resolve(candidate);const allowed=['dist','public'].some(dir=>resolved.startsWith(path.join(root,dir)+path.sep));if(!allowed)continue;try{if((await stat(resolved)).isFile()){file=resolved;break;}}catch{}}
  if(!file){res.writeHead(404).end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-cache');
  const gzip=/gzip/.test(req.headers['accept-encoding']||'')&&/\.(json|bin|js|css|html)$/.test(file);
  if(gzip){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');}
  if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(file);await pipeline(...(gzip?[stream,createGzip({level:1}),res]:[stream,res]));
 }catch(e){if(!res.headersSent)res.writeHead(400).end('Bad request');else res.destroy();}
});
server.listen(5173,'127.0.0.1',()=>console.log('Aquarium: http://127.0.0.1:5173'));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
