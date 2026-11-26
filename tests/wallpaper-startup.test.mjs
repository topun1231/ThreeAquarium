import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('登录时本机端口暂时返回其他页面，服务就绪后复用原端口', {skip:process.platform !== 'win32',timeout:25000}, async t=>{
  let checks=0;
  const server=createServer((req,res)=>{
    assert.equal(req.url,'/api/wallpaper/health');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({service:++checks===1?'other':'three-aquarium-wallpaper'}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>server.close());
  const script=fileURLToPath(new URL('../tools/start-wallpaper.ps1',import.meta.url));
  const launcher=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Port',String(server.address().port)],{windowsHide:true,stdio:'ignore'});
  t.after(()=>{if(launcher.exitCode===null)launcher.kill();});
  const [code]=await once(launcher,'exit');
  assert.equal(code,0);
  assert.equal(checks,2);
});

test('登录启动时复用开发服务，它退出后在同一端口接手', {skip:process.platform !== 'win32',timeout:30000}, async t=>{
  let checks=0;
  const existing=createServer((req,res)=>{
    assert.equal(req.url,'/api/wallpaper/health');
    checks++;
    res.writeHead(200,{'Content-Type':'application/json','Connection':'close'});
    res.end('{"service":"three-aquarium-wallpaper"}',()=>existing.close());
  });
  existing.listen(0,'127.0.0.1');await once(existing,'listening');
  t.after(()=>existing.close());
  const port=existing.address().port;
  const script=fileURLToPath(new URL('../tools/start-wallpaper.ps1',import.meta.url));
  const command=`
    function node.exe { Write-Output "START $args"; $global:LASTEXITCODE=0 }
    & $env:AQUARIUM_TEST_LAUNCHER -Port ${port} -AtLogon
    exit $LASTEXITCODE`;
  const launcher=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{
    env:{...process.env,AQUARIUM_TEST_LAUNCHER:script},windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(launcher.exitCode===null)launcher.kill();});
  let output='';
  for(const stream of [launcher.stdout,launcher.stderr])stream.on('data',data=>{output+=data;});
  const [code]=await once(launcher,'close');
  assert.equal(code,0,output);
  assert.equal(checks,1,output);
  assert.deepEqual(output.match(/^START .+$/gm),[`START node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`]);
});

test('独立壁纸服务限制连续重试，正常退出或中断立即结束', {skip:process.platform !== 'win32'}, async()=>{
  const socket=createServer();
  socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  const script=fileURLToPath(new URL('../tools/start-wallpaper.ps1',import.meta.url));
  for(const [exits,expected,waits] of [[[1,1,7],7,[2,4]],[[1,0],0,[2]],[[130],130,[]],[[-1073741510],-1073741510,[]]]){
    const command=`
      $global:results=@(${exits.join(',')})
      $global:attempt=0
      function node.exe { Write-Output 'SERVICE_START'; $global:LASTEXITCODE=$global:results[$global:attempt]; $global:attempt++ }
      function Start-Sleep([int]$Seconds) { Write-Output "RETRY_WAIT=$Seconds" }
      & $env:AQUARIUM_TEST_LAUNCHER -Port ${port}
      exit $LASTEXITCODE`;
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{
      env:{...process.env,AQUARIUM_TEST_LAUNCHER:script},encoding:'utf8',windowsHide:true,timeout:30000});
    assert.ifError(result.error);
    assert.equal(result.status|0,expected,result.stderr);
    assert.equal(result.stdout.match(/SERVICE_START/g)?.length,exits.length);
    assert.deepEqual([...result.stdout.matchAll(/RETRY_WAIT=(\d+)/g)].map(m=>Number(m[1])),waits);
  }
});

test('login startup is opt-in, repeatable and preserves a foreign shortcut', {skip:process.platform !== 'win32'}, async t => {
  const sandbox = await mkdtemp(join(tmpdir(), 'aquarium startup '));
  t.after(() => rm(sandbox, {recursive:true, force:true}));
  const folder = join(sandbox, 'Startup');
  const script = fileURLToPath(new URL('../tools/start-wallpaper.ps1', import.meta.url));
  const configure = choice => spawnSync('powershell.exe', [
    '-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-ConfigureStartup','-StartupFolder',folder,
  ], {input:choice+'\r\n', windowsHide:true, encoding:'utf8',timeout:15000});
  const choose = choice => {
    const result=configure(choice);
    assert.equal(result.status,0,result.error?.message || result.stderr);
  };
  choose('');
  assert.deepEqual(await readdir(sandbox),[]);
  choose('1');
  const link = join(folder,'ThreeAquarium Wallpaper 5174.lnk');
  const first = await readFile(link);
  choose('1');
  assert.deepEqual(await readFile(link),first);
  choose('2');
  choose('2');
  assert.deepEqual(await readdir(folder),[]);
  await writeFile(link,'unrelated file');
  for (const choice of ['1','2']) {
    assert.notEqual(configure(choice).status,0);
    assert.equal(await readFile(link,'utf8'),'unrelated file');
  }
});
