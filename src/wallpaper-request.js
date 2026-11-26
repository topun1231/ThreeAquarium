export function startWallpaperRequest(playback,signal) {
  signal?.throwIfAborted();
  const controller=new AbortController();
  let timer;
  function renew(){
    clearTimeout(timer);
    timer=setTimeout(()=>controller.abort(),15000);
  }
  renew();
  const abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});
  const unsubscribe=playback?.onSuspensionChange(suspended=>{if(suspended)controller.abort();});
  function read(response,format){
    if(!response.body)return response[format]();
    // Restart the idle timeout on headers and each chunk, including for large tank snapshots.
    renew();
    const body=response.body.pipeThrough(new TransformStream({
      transform(chunk,out){renew();out.enqueue(chunk);}
    }));
    return new Response(body,{headers:response.headers})[format]();
  }
  return {signal:controller.signal,read,finish(){clearTimeout(timer);unsubscribe?.();signal?.removeEventListener('abort',abort);}};
}
