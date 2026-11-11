// Backups share the browser quota with the live game; compress without changing JSON exports.
export async function writeCrystalBackup(storage,key,value){
 const json=JSON.stringify(value);
 if(json.length>16*1024*1024)throw new Error('备份过大，请先导出进度');
 if(typeof CompressionStream==='undefined'){storage.setItem(key,json);return;}
 const data=new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
 storage.setItem(key,'gzip:'+btoa(binary));
}
export async function readCrystalBackup(storage,key){
 const raw=storage.getItem(key);if(!raw)return null;
 if(!raw.startsWith('gzip:'))return JSON.parse(raw);
 const bytes=Uint8Array.from(atob(raw.slice(5)),c=>c.charCodeAt(0));
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024)throw new Error('备份解压后过大');chunks.push(value);}}finally{await reader.cancel();}
 return JSON.parse(await new Blob(chunks).text());
}
