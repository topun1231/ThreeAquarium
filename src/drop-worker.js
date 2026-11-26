import {createDropWorld,dropSignature} from './drop-physics.js';
const shapes=new Map();
let simulation=null,ready=null,timer=null,prepared=null,queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(()=>handle(data));};
async function handle(data){
  try {
    if(data.warm&&simulation){self.postMessage({request:data.request,done:true,warm:true});return;}
    const signature=dropSignature(data);
    if(data.warm&&ready&&prepared?.signature===signature){
      self.postMessage({request:data.request,done:true,warm:true});return;
    }
    clearTimeout(timer);simulation?.dispose();simulation=null;
    if(ready&&prepared?.signature===signature){simulation=ready;ready=null;}
    else{
      ready?.dispose();ready=null;
      // Build the unstepped template in one frame so prewarming at another pose cannot change the fall.
      const bodies=data.bodies.map(body=>({...body,position:[0,0,0],rotation:{x:0,y:0,z:0,w:1}}));
      simulation=await createDropWorld({...data,bodies},shapes,prepared);
    }
    if(prepared?.signature!==signature)prepared=simulation.snapshot();
    if(data.warm){ready=simulation;simulation=null;self.postMessage({request:data.request,done:true,warm:true});return;}
    simulation.release(data.bodies);
    let steps=1;
    const tick=()=>{
      const started=performance.now();
      try {
        let frame;
        for(let i=0;i<steps;i++){frame=simulation.step();if(frame.done)break;}
        self.postMessage({...frame,request:data.request});
        if(frame.done){simulation.dispose();simulation=null;}
        else{const delay=steps*1000/120;steps=4;timer=setTimeout(tick,Math.max(0,delay-(performance.now()-started)));}
      }catch(e){simulation?.dispose();simulation=null;self.postMessage({request:data.request,error:e.message});}
    };
    tick();
  }catch(e){simulation?.dispose();simulation=null;self.postMessage({request:data.request,error:e.message});}
}
