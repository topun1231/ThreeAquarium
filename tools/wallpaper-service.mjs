import {mkdir, open, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {homedir, tmpdir} from 'node:os';
import path from 'node:path';
import {wallpaperJournalBrood,wallpaperFamilyKey,wallpaperBroodTag,wallpaperLayoutTag,wallpaperMealTag,wallpaperNamesTag,wallpaperNeighbourTags,wallpaperRoomKey,wallpaperSceneryTag} from '../src/wallpaper-layout.js';
import {applyBreedingAction} from '../src/crystal-breeding.js';
import {isWallpaperScreen,wallpaperEntry,wallpaperStill} from '../src/wallpaper-entry.js';

// Fixed 3×2 transparent GIF. The downloaded file can recognise the player without reading a save.
const readyImage=Buffer.from('R0lGODlhAwACAIAAAAAAAAAAACH5BAEAAAAALAAAAAADAAIAAAgGAAEIHBgQADs=','base64');
const framedReadyImage=Buffer.from('R0lGODdhBAACAIEAAAAAAAAAAAAAAAAAACwAAAAABAACAAAIBwABCBwoMCAAOw==','base64');

function hatchSummary(session, occupants, room, scenery) {
  const state=session.Breeding;
  if(!Array.isArray(state?.batches) || !Array.isArray(state.individuals))return {};
  const due=[...state.batches.filter(b=>b.status==='planned' || b.status==='formed').map(b=>b.hatchAt),
    ...state.individuals.filter(r=>r.legacy && r.soldAt===null && r.legacyHatchAt!=null).map(r=>r.legacyHatchAt)];
  const index=wallpaperJournalBrood(session,occupants);
  if(!due.length && index<0)return {};
  // Use the same clock, shared ID sequence and reserved places as the desktop.
  const future=due.length ? applyBreedingAction(state,{type:'advance'},Math.max(state.now,...due)) : state;
  const arrivals=new Map();
  for(const baby of future.individuals.slice(state.individuals.length)){
    if(baby.tank!==room)continue;
    const at=baby.adultAt-state.growthMs+(baby.legacy?0:state.stageMs.hatch);
    if(!arrivals.has(at))arrivals.set(at,[]);
    arrivals.get(at).push(baby);
  }
  const ids=[...occupants], shrimp={...session.Colony?.shrimp};
  const hatches=[...arrivals].sort(([a],[b])=>a-b).map(([at,babies])=>{
    for(const baby of babies){ids.push(baby.id);shrimp[baby.id]={name:baby.name};}
    return [at,wallpaperLayoutTag(session.Tank,ids,scenery),wallpaperNamesTag({Colony:{shrimp}}),ids.length];
  });
  const batch=future.batches[index];
  const broodHeader={complete:'X-Aquarium-Grown-Brood',hatched:'X-Aquarium-Hatched-Brood'}[state.batches[index]?.status] ?? 'X-Aquarium-Pending-Brood';
  return {
    ...(hatches.length ? {'X-Aquarium-Hatches':JSON.stringify(hatches)} : {}),
    ...(batch && broodHeader==='X-Aquarium-Pending-Brood' ? {'X-Aquarium-Hatch-At':String(batch.hatchAt)} : {}),
    ...(batch ? {[broodHeader]:(index+1)+'/'+batch.size,'X-Aquarium-Family-Key':wallpaperFamilyKey(batch)} : {}),
  };
}

function summaryHeaders(copy) {
  const room = copy.game.session.BreedingRooms?.activeId ?? 'main';
  const tank = copy.game.session.Tank;
  const name = copy.game.session.Colony?.shrimp?.[copy.followId]?.name;
  const occupants=copy.game.creatures.map(c=>c?.CreatureId);
  const scenery=wallpaperSceneryTag(tank);
  const roomKey=wallpaperRoomKey(copy.game.session,room);
  return {
    ...(roomKey ? {'X-Aquarium-Room-Key':roomKey} : {}),
    'X-Aquarium-Room': ['main','breeding','breeding-2','breeding-3'].includes(room) ? room : 'unknown',
    'X-Aquarium-Framing': copy.framing==='whole-room' ? 'whole-room' : 'whole-tank',
    'X-Aquarium-Shrimp': String(copy.game.creatures.length),
    'X-Aquarium-Layout': wallpaperLayoutTag(tank,occupants,scenery),
    'X-Aquarium-Neighbours': JSON.stringify(wallpaperNeighbourTags(copy.game.session)),
    ...hatchSummary(copy.game.session,occupants,room,scenery),
    'X-Aquarium-Broods': wallpaperBroodTag(copy.game.session),
    'X-Aquarium-Names': wallpaperNamesTag(copy.game.session),
    ...(copy.game.pellet ? {'X-Aquarium-Feeding':'1','X-Aquarium-Meal':wallpaperMealTag(copy.game.pellet)} : {}),
    ...(typeof tank.Environment?.LightOn==='boolean' ? {'X-Aquarium-Light':tank.Environment.LightOn?'on':'off'} : {}),
    ...(Array.isArray(tank.Hardscape) ? {'X-Aquarium-Hardscape':String(tank.Hardscape.length)} : {}),
    ...(Array.isArray(tank.Plants) && (!tank.Flora || Array.isArray(tank.Flora)) ? {'X-Aquarium-Plants':String(tank.Plants.length+(tank.Flora?.length || 0))} : {}),
    ...(copy.followId ? {'X-Aquarium-Follow':encodeURIComponent((typeof name==='string' && name ? name : copy.followId).slice(0,128).toWellFormed())} : {}),
  };
}

function lastDesktopHeaders(loaded) {
  if(!loaded)return {};
  return {
    'X-Aquarium-Last-Desktop-Room':loaded.room,
    ...(loaded.roomKey ? {'X-Aquarium-Last-Desktop-Room-Key':loaded.roomKey} : {}),
    'X-Aquarium-Last-Desktop-Layout':loaded.layout,
    'X-Aquarium-Last-Desktop-Neighbours':loaded.neighbours,
    'X-Aquarium-Last-Desktop-Contact':loaded.at,
    'X-Aquarium-Last-Desktop-Modified':loaded.modified,
    ...(loaded.light ? {'X-Aquarium-Last-Desktop-Light':loaded.light} : {}),
    ...(loaded.count!=null ? {'X-Aquarium-Last-Desktop-Shrimp':loaded.count} : {}),
  };
}

function versionHeaders({ino,size,mtimeNs}) {
  return {ETag:'"' + ino + '-' + size + '-' + mtimeNs + '"',
    'Last-Modified':new Date(Number(mtimeNs / 1000000n)).toUTCString()};
}

export async function engineLauncher(entry,folders=[
  path.join(homedir(),'.three-aquarium','wallpaper'),
  path.join(tmpdir(),'three-aquarium-wallpaper')
]){
  if(!/[^\x00-\x7f]/.test(entry))return entry;
  // The host restricts navigation outside its entry folder. A junction keeps the original HTML and still together.
  const directory=await realpath(path.dirname(entry));
  const name=createHash('sha256').update(directory).digest('hex');
  const file=path.basename(entry);
  for(const folder of folders){
    const relay=path.join(folder,name);
    const launchPath=path.join(relay,file);
    if(/[^\x00-\x7f]/.test(launchPath))continue;
    try {
      await mkdir(folder,{recursive:true,mode:0o700});
      await symlink(directory,relay,'junction');
      return launchPath;
    } catch(error){
      if(error.code==='EEXIST' && await realpath(relay).catch(()=>null)===directory)return launchPath;
    }
  }
  throw Object.assign(Error('No writable ASCII launcher path'),{code:'WALLPAPER_ENTRY_PATH'});
}

async function applyWindowsWallpaper(entry,previewWindow,size,monitor=0){
  const shell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const script=fileURLToPath(new URL('./open-wallpaper.ps1',import.meta.url));
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Entry',await engineLauncher(entry)];
  if(previewWindow)args.push('-PreviewWindow',previewWindow);
  if(previewWindow && size)args.push('-WindowWidth',String(size[0]),'-WindowHeight',String(size[1]));
  if(!previewWindow && monitor)args.push('-MonitorIndex',String(monitor));
  await promisify(execFile)(shell,args,{windowsHide:true,timeout:10000});
}

async function writeDesktopEntry(entry,port,copy,windowPreview=false,screen){
  const template=await readFile(new URL('../wallpaper/index.html',import.meta.url),'utf8');
  const preview=wallpaperStill(copy);
  const temp=entry+'.'+randomUUID()+'.tmp';
  try {
    await writeFile(temp,wallpaperEntry(template,'http://127.0.0.1:'+port,preview,windowPreview,screen),{flag:'wx',mode:0o600});
    await rename(temp,entry);
  } finally {await rm(temp,{force:true});}
}

// One explicitly published local copy per game port. Never open the browser save.
export function wallpaperService(directory = path.join(process.env.LOCALAPPDATA || homedir(), 'ThreeAquarium', 'wallpaper'), applyDesktop=process.platform==='win32'?applyWindowsWallpaper:null, previewWindow=applyDesktop===applyWindowsWallpaper?applyWindowsWallpaper:null) {
  let cachedSummary;
  let lastWrite=Promise.resolve();
  // Keep the playable copy and its optional offline launcher in publication order.
  function commit(change){
    const result=lastWrite.then(change);
    lastWrite=result.catch(()=>{});
    return result;
  }
  const loadedByPort=new Map();
  const loadedScreensByPort=new Map();
  const requestedByPort=new Map();
  const previewedByPort=new Map();
  const failedByPort=new Map();
  const publishedByPort=new Map(),waitersByPort=new Map();
  function waitForPublish(port,res){
    let waiters=waitersByPort.get(port);
    if(!waiters)waitersByPort.set(port,waiters=new Set());
    return new Promise(resolve=>{
      const timer=setTimeout(finish,5000);
      function finish(){
        clearTimeout(timer);
        res.removeListener('close',finish);
        waiters.delete(finish);
        if(!waiters.size)waitersByPort.delete(port);
        resolve();
      }
      waiters.add(finish);
      res.once('close',finish);
    });
  }
  return async (req, res, next) => {
    const health = req.url === '/api/wallpaper/health';
    const wait = req.url === '/api/wallpaper/wait';
    const probe=req.url.split('?',1)[0]==='/api/wallpaper/ready.gif';
    const selectMonitor=req.url==='/api/wallpaper/apply-monitor';
    const apply=req.url==='/api/wallpaper/apply' || selectMonitor;
    const preview=req.url==='/api/wallpaper/preview';
    if (!health && !wait && !probe && !apply && !preview && req.url !== '/api/wallpaper') return next();
    const port = req.socket.localPort;
    const allowedHosts = ['127.0.0.1', 'localhost', '[::1]'].map(host => host + ':' + port);
    const host = req.headers.host;
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !allowedHosts.includes(host)) {
      res.writeHead(403).end(); return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Aquarium-Service','three-aquarium-wallpaper');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if(probe){
      if(req.method!=='GET'){res.writeHead(405).end();return;}
      const framed=new URLSearchParams(req.url.split('?',2)[1]).get('launcher')==='frame';
      res.writeHead(200,{'Content-Type':'image/gif','Cross-Origin-Resource-Policy':'cross-origin'}).end(framed?framedReadyImage:readyImage);
      return;
    }
    if(req.headers.origin && req.headers.origin !== 'http://' + host || req.headers['sec-fetch-site'] === 'cross-site'){
      res.writeHead(403).end(); return;
    }
    const file = path.join(directory, port + '.json');
    const entryPath=(windowPreview,screen)=>path.join(directory,port+(windowPreview?'-preview.html':screen?'-desktop-'+screen+'.html':'-desktop.html'));
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (health) {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({service:'three-aquarium-wallpaper'}));
      return;
    }
    try {
      if(wait){
        if(req.method!=='GET'){res.writeHead(405).end();return;}
        const expected=req.headers['if-none-match'];
        if(!expected){res.writeHead(400).end();return;}
        const before=publishedByPort.get(port);
        let tag;
        try {tag=versionHeaders(await stat(file,{bigint:true})).ETag;}
        catch(error){if(error.code!=='ENOENT' || expected!=='*')throw error;}
        // A rename can complete while stat still reports the previous file.
        if(!res.destroyed && (expected==='*' ? !tag : tag===expected) && publishedByPort.get(port)===before)await waitForPublish(port,res);
        if(!res.destroyed)res.writeHead(204).end();
        return;
      }
      if(apply || preview){
        const launch=preview?previewWindow:applyDesktop;
        if(!launch){res.writeHead(404).end();return;}
        if(req.method!=='POST'){res.writeHead(405).end();return;}
        if(req.headers.origin!=='http://'+host || !req.headers['if-match']){res.writeHead(403).end();return;}
        const index=req.headers['x-aquarium-monitor'];
        if(selectMonitor ? !/^[1-9]\d{0,9}$/.test(index) || Number(index)>=2147483647 : index!==undefined){res.writeHead(400).end();return;}
        const screen=preview ? undefined : String(selectMonitor?Number(index)+1:1);
        const entry=entryPath(preview,screen);
        let size;
        const requested=req.headers['x-aquarium-preview-size'];
        if(preview && requested!==undefined){
          if(!/^[1-9]\d{0,2}x[1-9]\d{0,2}$/.test(requested)){res.writeHead(400).end();return;}
          size=requested.split('x').map(Number);
          if(size[0]>800 || size[1]>600){res.writeHead(400).end();return;}
        }
        const current=await commit(async()=>{
          const handle=await open(file,'r');
          try {
            if(req.headers['if-match']!==versionHeaders(await handle.stat({bigint:true})).ETag)return false;
            await writeDesktopEntry(entry,port,JSON.parse(await handle.readFile('utf8')),preview,screen);
            return true;
          } finally {await handle.close();}
        });
        if(!current){res.writeHead(412).end();return;}
        try {await launch(entry,preview?'ThreeAquariumPreview-'+port:undefined,size,selectMonitor?Number(index):0);}
        catch(error){
          if(error.code==='WALLPAPER_ENTRY_PATH'){res.writeHead(422).end();return;}
          if(error.code===4 && selectMonitor){res.writeHead(409,{'X-Aquarium-Monitor-Missing':'1'}).end();return;}
          if(error.code!==3)throw error;
          res.writeHead(409).end();return;
        }
        res.writeHead(204).end();return;
      }
      if(applyDesktop){
        res.setHeader('X-Aquarium-Can-Apply','1');
        res.setHeader('X-Aquarium-Can-Select-Monitor','1');
        res.setHeader('X-Aquarium-Desktop-Screens','');
      }
      if(previewWindow)res.setHeader('X-Aquarium-Can-Preview','1');
      if (req.method === 'GET' || req.method === 'HEAD') {
        res.setHeader('X-Aquarium-Can-Wait','1');
        const handle = await open(file, 'r');
        try {
          const version=versionHeaders(await handle.stat({bigint:true}));
          const tag=version.ETag;
          const screen=req.headers['x-aquarium-desktop-screen'];
          const screenReports=loadedScreensByPort.get(port);
          res.setHeader('ETag',tag);
          res.setHeader('Last-Modified',version['Last-Modified']);
          const acknowledges=req.method==='GET' && req.headers['x-aquarium-loaded']==='desktop' && req.headers['if-none-match']===tag;
          if(req.method==='GET' && req.headers['x-aquarium-loaded']==='preview' && req.headers['if-none-match']===tag)previewedByPort.set(port,tag);
          const summary=req.headers['x-aquarium-summary']==='1';
          // A full read starts the switch. Only the matching post-render poll confirms it.
          if(req.method==='GET' && !summary && req.headers['if-none-match']!==tag &&
             (req.headers['x-aquarium-player']==='desktop' || req.headers['x-aquarium-loaded']==='desktop')){
            requestedByPort.set(port,tag);
          }
          const verify=summary && req.headers['x-aquarium-verify-copy']==='1';
          if ((acknowledges || (summary && (verify || req.headers['if-none-match']!==tag))) && cachedSummary?.tag!==tag) {
            const bytes=await handle.readFile();
            try {
              const copy=JSON.parse(bytes.toString('utf8'));
              cachedSummary = {tag, digest:createHash('sha256').update(bytes).digest('hex'), headers:summaryHeaders(copy), previewJpeg:wallpaperStill(copy)};
            } catch {
              // The complete file was read. Only this exact version can be offered for replacement.
              cachedSummary={tag,unreadable:true};
            }
          }
          if((summary || acknowledges) && cachedSummary?.tag===tag && cachedSummary.unreadable){res.writeHead(422).end();return;}
          if(verify)res.setHeader('X-Aquarium-Copy-SHA256',cachedSummary.digest);
          if(req.method==='HEAD' && req.headers['x-aquarium-load-failed']==='desktop' && req.headers['if-none-match']===tag){
            failedByPort.set(port,tag);
            if(screenReports?.get(screen)===tag)screenReports.delete(screen);
          }
          if(acknowledges){
            const count=req.headers['x-aquarium-desktop-shrimp'];
            const brood=req.headers['x-aquarium-desktop-brood'];
            const population=/^(0|[1-9]\d?)$/.test(count) && Number(count)<=50 ? count : null;
            const expected=cachedSummary.headers['X-Aquarium-Pending-Brood'] ?? cachedSummary.headers['X-Aquarium-Hatched-Brood'] ?? cachedSummary.headers['X-Aquarium-Grown-Brood'];
            const confirmed=brood && brood===expected &&
              Number(population)>=Number(brood.split('/')[1]) ? brood : null;
            loadedByPort.set(port,{tag,room:cachedSummary.headers['X-Aquarium-Room'],roomKey:cachedSummary.headers['X-Aquarium-Room-Key'],layout:cachedSummary.headers['X-Aquarium-Layout'],neighbours:cachedSummary.headers['X-Aquarium-Neighbours'],light:cachedSummary.headers['X-Aquarium-Light'],modified:version['Last-Modified'],at:new Date().toISOString(),
              count:population,brood:confirmed,adult:!!confirmed && req.headers['x-aquarium-desktop-adult-brood']===confirmed});
            if(isWallpaperScreen(screen) && await stat(entryPath(false,screen)).then(info=>info.isFile(),()=>false)){
              const reports=loadedScreensByPort.get(port) ?? new Map();
              reports.set(screen,tag);loadedScreensByPort.set(port,reports);
            }
            failedByPort.delete(port);
          }
          if(summary){
            if(previewedByPort.get(port)===tag)res.setHeader('X-Aquarium-Preview-Loaded','1');
            const loaded=loadedByPort.get(port);
            const screens=[...(loadedScreensByPort.get(port)??[])].filter(([,version])=>version===tag).map(([id])=>id);
            const failed=failedByPort.get(port)===tag && !screens.length;
            res.setHeader('X-Aquarium-Desktop-Loaded',loaded?.tag===tag && !failed?'1':'0');
            res.setHeader('X-Aquarium-Desktop-Screens',screens.sort((a,b)=>Number(a)-Number(b)).join(','));
            if(requestedByPort.get(port)===tag)res.setHeader('X-Aquarium-Desktop-Requested','1');
            if(loaded?.tag===tag && !failed && loaded.count)res.setHeader('X-Aquarium-Desktop-Shrimp',loaded.count);
            if(loaded?.tag===tag && !failed && loaded.brood){
              res.setHeader('X-Aquarium-Desktop-Brood',loaded.brood);
              if(loaded.adult)res.setHeader('X-Aquarium-Desktop-Adult-Brood',loaded.brood);
            }
            if(failed)res.setHeader('X-Aquarium-Desktop-Load-Failed','1');
            for(const [key,value] of Object.entries(lastDesktopHeaders(loaded)))res.setHeader(key,value);
          }
          if (req.headers['if-none-match'] === tag) { res.writeHead(304).end(); return; }
          if (summary) {
            for (const [key,value] of Object.entries(cachedSummary.headers)) res.setHeader(key,value);
            if (req.method === 'GET') {
              res.setHeader('Content-Type','application/json');
              res.setHeader('X-Aquarium-Summary','1');
              res.end(JSON.stringify({previewJpeg:cachedSummary.previewJpeg}));
              return;
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(req.method === 'GET' ? await handle.readFile() : undefined);
        } finally { await handle.close(); }
        return;
      }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      if (req.headers.origin !== 'http://' + host || req.headers['content-type'] !== 'application/json') {
        res.writeHead(403).end(); return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const value = JSON.parse(bytes.toString());
      if (value?.previewJpeg !== undefined && (typeof value.previewJpeg !== 'string' || value.previewJpeg.length > 90000 ||
          !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value.previewJpeg))) {
        res.writeHead(400).end(); return;
      }
      if (value?.version !== 4 || value.game?.session?.Tank?.Setup?.Filled !== true ||
          !Array.isArray(value.game.creatures) || value.view?.version !== 1 ||
          ![value.view.camera,value.view.target].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) {
        res.writeHead(400).end(); return;
      }
      if (value.followId !== undefined && (typeof value.followId !== 'string' || !value.followId || value.followId.length > 128 ||
          !value.game.creatures.some(c=>c?.CreatureId===value.followId))) {
        res.writeHead(400).end(); return;
      }
      const headers=summaryHeaders(value);
      await mkdir(directory, {recursive:true});
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, bytes, {flag:'wx',mode:0o600});
        Object.assign(headers,versionHeaders(await stat(temporary,{bigint:true})));
        const saved=await commit(async()=>{
          const expected=req.headers['if-match'], first=req.headers['if-none-match']==='*';
          if(expected || first){
            let current;
            try {current=versionHeaders(await stat(file,{bigint:true})).ETag;}
            catch(error){if(error.code!=='ENOENT')throw error;}
            if((expected && expected!==current) || (first && current))return false;
          }
          await rename(temporary, file);
          publishedByPort.set(port,headers.ETag);
          for(const wake of waitersByPort.get(port)??[])wake();
          const screenPrefix=port+'-desktop-';
          const entries=await readdir(directory).catch(()=>{headers['X-Aquarium-Entry-Stale']='1';return [];});
          for(const name of entries){
            const windowPreview=name===port+'-preview.html';
            const screen=name.startsWith(screenPrefix) && name.endsWith('.html') ? name.slice(screenPrefix.length,-5) : undefined;
            if(!windowPreview && name!==port+'-desktop.html' && !isWallpaperScreen(screen))continue;
            const entry=entryPath(windowPreview,screen);
            try {
              await writeDesktopEntry(entry,port,value,windowPreview,screen);
            } catch {
              // The copy is committed. Keep refreshing the other launcher if one fails.
              headers['X-Aquarium-Entry-Stale']='1';
            }
          }
          return true;
        });
        if(!saved){res.writeHead(412).end();return;}
      } finally { await rm(temporary, {force:true}); }
      Object.assign(headers,lastDesktopHeaders(loadedByPort.get(port)));
      res.writeHead(204,headers).end();
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : error instanceof SyntaxError ? 400 : 500).end();
    }
  };
}
