export async function saveAlbumCard(card, portraitUrl) {
  const image = new Image();
  if (!portraitUrl) throw Error('个体影像暂不可用，请再试一次。');
  image.src = portraitUrl;
  try { await image.decode(); }
  catch { throw Error('个体影像未能打开，请再试一次。'); }

  const canvas = document.createElement('canvas');
  canvas.width = 864;
  const ctx = canvas.getContext('2d');
  const noteLines=[];
  if(card.intent){
    ctx.font='20px sans-serif';
    let line='';
    const characters = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(card.intent), part => part.segment)
      : Array.from(card.intent);
    for(const segment of characters){
      if(line && ctx.measureText(line+segment).width>792){noteLines.push(line);line='';}
      line+=segment;
    }
    if(line)noteLines.push(line);
  }
  const showResult=!!card.result || !noteLines.length;
  const lastNoteLine=548+(noteLines.length-1)*28;
  const resultTitle=noteLines.length?lastNoteLine+44:510;
  const lastLine=showResult?resultTitle+38:lastNoteLine;
  canvas.height=lastLine+32+(card.race?48:0);
  const ink = '#342e2b', muted = '#695f56';
  function label(value, x, y, font, colour, width) {
    ctx.font = font; ctx.fillStyle = colour; ctx.fillText(value, x, y, width);
  }
  ctx.fillStyle = '#faf4e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label('水晶虾 · 家族相册', 36, 42, '18px sans-serif', muted, 480);
  ctx.textAlign = 'right';
  label('第 ' + card.number + ' 窝', 828, 42, '18px sans-serif', muted, 220);
  ctx.textAlign = 'left';
  label(card.name, 36, 105, 'bold 44px serif', ink, 792);

  const field = ctx.createLinearGradient(36, 128, 478, 363);
  field.addColorStop(0, '#667473'); field.addColorStop(1, '#3d4e53');
  ctx.fillStyle = field; ctx.fillRect(36, 128, 442, 238);
  ctx.drawImage(image, 53, 128, 408, 238);
  label(card.appearance, 506, 164, 'bold 21px sans-serif', ink, 320);
  card.traits.forEach(([name, value], i) => {
    const y = 221 + i * 55;
    label(name, 506, y, '18px sans-serif', muted, 84);
    ctx.fillStyle = '#d7cdbb'; ctx.fillRect(583, y-8, 166, 5);
    if (Number.isFinite(value)) {
      ctx.fillStyle = '#97684c'; ctx.fillRect(583, y-8, 166 * Math.max(0, Math.min(9, value)) / 9, 5);
    }
    ctx.textAlign = 'right';
    label(Number.isFinite(value) ? String(Number(value.toFixed(2))) : '—', 826, y, '19px sans-serif', ink, 64);
    ctx.textAlign = 'left';
  });
  label('母虾', 36, 409, '17px sans-serif', muted, 60);
  label(card.mother, 108, 409, '21px sans-serif', ink, 718);
  label('公虾', 36, 448, '17px sans-serif', muted, 60);
  label(card.father, 108, 448, '21px sans-serif', ink, 718);
  ctx.fillStyle = '#d7cdbb'; ctx.fillRect(36, 475, 792, 1);
  if(noteLines.length){
    label('配对时的留话',36,510,'17px sans-serif',muted,792);
    noteLines.forEach((line,i)=>label(line,36,548+i*28,'20px sans-serif',ink,792));
  }
  if(showResult){
    label('这只代表虾的选育结果', 36, resultTitle, '17px sans-serif', muted, 792);
    label(card.result || '这一窝没有指定选育目标', 36, resultTitle+38, 'bold 20px sans-serif', ink, 792);
  }
  if (card.race) label(card.race, 36, lastLine+48, 'bold 20px sans-serif', ink, 792);

  const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw Error('纪念图生成失败，请再试一次。');
  const url = URL.createObjectURL(png);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = '家族相册-第' + card.number + '窝-' + card.name.replace(/[<>:"/\\|?*]/g, '＿') + '.png';
    link.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
