import {Vector2} from 'three';

// Corners in the 1536 × 1024 window illustration, measured from the top left.
const calendarFace = {x:1385, y:277, right:[112,-14], down:[6,101]};
const clockFace = {x:1432, y:427, right:[76,3], down:[-7,93]};
const weekdays = '日一二三四五六';

function paintCard(ctx,face,width,height,paint){
  ctx.save();
  ctx.transform(face.right[0]/width,face.right[1]/width,face.down[0]/height,face.down[1]/height,face.x,face.y);
  paint(ctx,width,height);
  ctx.restore();
}

function printDate(ctx,date){
  ctx.fillStyle='#f9edcc';ctx.fillRect(0,0,300,220);
  ctx.fillStyle='#96503a';ctx.fillRect(0,0,300,52);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#fff2d4';ctx.font='bold 30px "Microsoft YaHei", sans-serif';
  ctx.fillText(date.getFullYear()+' 年  '+(date.getMonth()+1)+' 月',150,27);
  ctx.fillStyle='#422f28';ctx.font='bold 120px Georgia, serif';
  ctx.fillText(String(date.getDate()),150,113);
  ctx.fillStyle='#674431';ctx.font='bold 30px "Microsoft YaHei", sans-serif';
  ctx.fillText('星期'+weekdays[date.getDay()],150,192);
}

function printDial(ctx){
  ctx.fillStyle='#a8a57c';ctx.fillRect(0,0,200,200);
  ctx.translate(100,100);
  ctx.beginPath();ctx.arc(0,0,94,0,Math.PI*2);ctx.fillStyle='#896648';ctx.fill();
  ctx.beginPath();ctx.arc(0,0,89,0,Math.PI*2);ctx.fillStyle='#f6e8c4';ctx.fill();
  ctx.fillStyle='#534233';
  for(let i=0;i<60;i++){
    ctx.save();ctx.rotate(i*Math.PI/30);
    if(i%5===0)ctx.fillRect(-2,-84,4,9);
    else ctx.fillRect(-.85,-83,1.7,4);
    ctx.restore();
  }
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 23px Georgia, serif';
  for(const [digit,x,y] of [['12',0,-60],['3',64,0],['6',0,63],['9',-64,0]])ctx.fillText(digit,x,y);
}

export function createWallAlmanac(map){
  const canvas=document.createElement('canvas');
  canvas.width=map.image.width;canvas.height=map.image.height;
  const ink=canvas.getContext('2d',{willReadFrequently:true});
  ink.drawImage(map.image,0,0);
  const calendarPaper=ink.getImageData(1380,258,130,126);
  // Leave the original masking tape in front of both printed faces.
  ink.beginPath();ink.rect(0,0,canvas.width,canvas.height);
  for(const [ax,ay,bx,by,cx,cy,dx,dy] of [[1432,247,1459,244,1462,268,1434,273],[1460,406,1485,409,1482,434,1457,432]]){
    ink.moveTo(ax,ay);ink.lineTo(bx,by);ink.lineTo(cx,cy);ink.lineTo(dx,dy);ink.closePath();
  }
  ink.clip('evenodd');
  paintCard(ink,clockFace,200,200,printDial);
  map.image=canvas;
  const angles={value:new Vector2()};
  let lastMinute,printedDay;
  function update(now=Date.now()){
    const minute=Math.floor(now/60000);
    if(minute===lastMinute)return;
    lastMinute=minute;
    const date=new Date(now), day=date.getFullYear()*10000+(date.getMonth()+1)*100+date.getDate();
    if(day!==printedDay){
      // Start each page on the same paper so antialiased tape and borders never accumulate ink.
      ink.putImageData(calendarPaper,1380,258);
      paintCard(ink,calendarFace,300,220,()=>printDate(ink,date));
      map.needsUpdate=true;
      printedDay=day;
    }
    const minutes=date.getMinutes();
    angles.value.set((date.getHours()%12+minutes/60)*Math.PI/6,minutes*Math.PI/30);
  }
  update();
  return {angles,update};
}

// Use the same dial and local time on the wall and in the water reflection.
export const wallClockGLSL = `
uniform vec2 aqClockAngles;
float handInk(vec2 p,float angle,float tip,float tail,float width,float aa){
  vec2 axis=vec2(sin(angle),-cos(angle));
  float d=length(p-axis*clamp(dot(p,axis),-tail,tip));
  return 1.-smoothstep(width-aa,width+aa,d);
}
vec3 wallClock(vec2 uv,vec3 paper,float blur){
  vec2 pixel=vec2(uv.x,1.-uv.y)*vec2(1536.,1024.)-vec2(${clockFace.x}.,${clockFace.y}.);
  vec2 p=inverse(mat2(${clockFace.right.map(n=>n+'.')},${clockFace.down.map(n=>n+'.')}))*pixel-.5;
  float aa=clamp(max(fwidth(p.x),fwidth(p.y))*.60+blur,.002,.09);
  if(dot(p,p)>.24)return paper;
  float hands=max(handInk(p,aqClockAngles.x,.235,.04,.022,aa),handInk(p,aqClockAngles.y,.356,.04,.014,aa));
  return mix(paper,vec3(.051,.039,.029),hands);
}`;
