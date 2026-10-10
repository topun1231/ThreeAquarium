const STATE = {Rest:'休息', Walk:'行走', Climb:'攀爬', Graze:'摄食', Groom:'清洁', Hide:'躲藏', RoutineSwim:'短游', EscapeSwim:'弹尾'};
export const BREED_SECONDS = 120;
export const BREED_HUNGER = 0.55;
export const BREED_STRESS = 0.4;
export const HUNGRY_MARK = 0.6;

export function colonyTick(colony, agents, dt, {limit = 50, seconds = BREED_SECONDS} = {}) {
  const progress0 = Number(colony?.progress) || 0;
  const progress = Math.max(0, Math.min(1, progress0));
  if (!agents.length || !(dt > 0)) return {colony:{progress}, born:false, ready:false, hunger:1, stress:0};
  const hunger = agents.reduce((sum, agent) => sum + agent.data.Needs.Hunger, 0) / agents.length;
  const stress = agents.reduce((sum, agent) => sum + agent.data.Needs.Stress, 0) / agents.length;
  const ready = hunger < BREED_HUNGER && stress < BREED_STRESS;
  if (agents.length >= limit) return {colony:{progress}, born:false, ready, hunger, stress, full:true};
  const next = ready ? Math.min(1, progress + dt / seconds) : Math.max(0, progress - dt / (seconds * 2));
  return {colony:{progress:next}, born:next >= 1, ready, hunger, stress, full:false};
}

export function careSummary(agents, selectedId = null, colony = null) {
  if (!agents.length) return '缸里还没有虾。注水并照料后，吃饱的虾会抱卵。';
  const counts = new Map();
  const eating = [];
  let hungry = 0, maxHunger = 0;
  agents.forEach((agent, index) => {
    const state = agent.data.ExecutionState;
    counts.set(state, (counts.get(state) || 0) + 1);
    if (state === 'Graze') eating.push(index + 1);
    const hunger = agent.data.Needs.Hunger;
    if (hunger >= HUNGRY_MARK) hungry += 1;
    if (hunger > maxHunger) maxHunger = hunger;
  });
  const parts = [...counts.entries()].map(([state, count]) => `${STATE[state] || state} ${count}`);
  let text = parts.join(' · ');
  text += hungry ? ` · 偏饿 ${hungry} 只，最高 ${Math.round(maxHunger * 100)}%` : ' · 没有明显饥饿';
  text += eating.length ? ` · 正在吃：${eating.join('、')} 号` : ' · 现在没有虾在吃';
  const progress = Math.max(0, Math.min(1, Number(colony?.progress) || 0));
  if (agents.length >= 50) text += ' · 虾群已满（50）';
  else if (progress >= 1) text += ' · 有虾即将出生';
  else if (progress > 0.02) text += ` · 抱卵 ${Math.round(progress * 100)}%`;
  else text += hungry ? ' · 吃饱后才会抱卵' : ' · 照料稳定后会抱卵';
  const selected = selectedId ? agents.find(agent => agent.data.CreatureId === selectedId) : null;
  if (selected) {
    const needs = selected.data.Needs;
    const index = agents.indexOf(selected) + 1;
    text += `\n选中 ${index} 号 · ${STATE[selected.data.ExecutionState] || selected.data.ExecutionState} · 饥饿 ${Math.round(needs.Hunger * 100)}% · 压力 ${Math.round(needs.Stress * 100)}% · 疲劳 ${Math.round(needs.Fatigue * 100)}%`;
  }
  return text;
}

const BOX = {min:[-0.58, 0, -0.28], max:[0.58, 0.62, 0.28]};
const component = (value, index) => index === 0 ? value.x : index === 1 ? value.y : value.z;
export function tankEntry(origin, direction, maxDistance = 4) {
  if (!origin || !direction) return null;
  let near = 0, far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const start = component(origin, axis), delta = component(direction, axis);
    if (Math.abs(delta) < 1e-8) { if (start < BOX.min[axis] || start > BOX.max[axis]) return null; continue; }
    let enter = (BOX.min[axis] - start) / delta, exit = (BOX.max[axis] - start) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    near = Math.max(near, enter); far = Math.min(far, exit);
    if (near > far) return null;
  }
  if (far < 0) return null;
  const distance = near >= 0 ? near : far;
  return {x:origin.x + direction.x * distance, y:origin.y + direction.y * distance, z:origin.z + direction.z * distance};
}
