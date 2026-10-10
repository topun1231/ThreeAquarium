export const SAVE_KEY = 'aquarium.three.migration.v1';
export function stableSeed(id) { let n=2166136261; for(const c of id){ n^=c.charCodeAt(0); n=Math.imul(n,16777619); } return n>>>0; }
export function validateProgress(value, tankId) {
  if(!value || value.version!==1 || value.tankId!==tankId) throw new Error('进度版本或鱼缸不匹配，原进度未改动');
  for(const key of ['camera','target']) if(!Array.isArray(value[key]) || value[key].length!==3 || !value[key].every(x=>Number.isFinite(x)&&Math.abs(x)<100)) throw new Error('视角数据无效，原进度未改动');
  if(!['Auto','Rest','Walk','Graze','Groom','RoutineSwim','EscapeSwim'].includes(value.action)) throw new Error('动作数据无效');
  return {version:1,tankId,camera:[...value.camera],target:[...value.target],action:value.action};
}
export function attributeArray(buffer, descriptor) {
  if(!descriptor || !descriptor.count) return null;
  const {offset,count,size,type}=descriptor;
  if(!Number.isInteger(offset)||offset<0||offset%4||!Number.isInteger(count)||count<0||!Number.isInteger(size)||size<1||size>4||offset+count*size*4>buffer.byteLength) throw new Error('资产数据范围不正确');
  if(!['uint','float'].includes(type))throw new Error('不支持的资产数据类型');
  return new (type==='uint'?Uint32Array:Float32Array)(buffer,offset,count*size);
}
