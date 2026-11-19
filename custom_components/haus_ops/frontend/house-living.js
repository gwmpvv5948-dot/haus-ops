import {normalizeHouseName} from './house-model.js?v=1.6.63&r=18';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function livingLampLayout(lamps,config={}) {
 const used=new Set();
 return lamps.map((lamp,index)=>{
  const n=normalizeHouseName(lamp.name),candidate=config.lamps?.[lamp.id];
  const custom=candidate&&['kugel','stehlampe','streifen','decke','kommode','schrank','tischlampe'].includes(candidate.type)&&Number.isFinite(candidate.x)&&candidate.x>=70&&candidate.x<=1210&&Number.isFinite(candidate.y)&&candidate.y>=140&&candidate.y<=600?candidate:null;
  let slot=custom || (/fado/.test(n)?{type:'kugel',x:/tv|essen/.test(n)?1160:130,y:/tv|essen/.test(n)?512:510}:/stehlampe/.test(n)?{type:'stehlampe',x:800,y:420}:/fernseh|^tv$|tvlicht/.test(n)?{type:'streifen',x:324,y:564}:/eztisch|esszimmer/.test(n)?{type:'decke',x:970,y:210}:/wztisch|decken/.test(n)?{type:'decke',x:520,y:210}:null);
  if(!slot)slot={type:lamp.type,x:470+(index%4)*125,y:lamp.type==='decke'?210:510};
  const key=slot.x+':'+slot.y;
  if(used.has(key))slot={...slot,x:Math.min(1190,slot.x+40)};
  used.add(slot.x+':'+slot.y);
  return {...lamp,...slot};
 });
}
export function livingSonos(registry={},states={},configured=[]) {
 const devices=new Map((registry.devices??[]).map(d=>[d.id,d]));
 const areas=new Map((registry.areas??[]).map(a=>[a.area_id,a]));
 const floors=new Map((registry.floors??[]).map(f=>[f.floor_id,f]));
 const entries=(registry.entities??[]).filter(e=>e.entity_id.startsWith('media_player.')&&!e.disabled_by&&(e.platform==='sonos'||Array.isArray(states[e.entity_id]?.attributes?.group_members)));
 const players=entries.filter(e=>{
  if(configured.length)return configured.includes(e.entity_id);
  const area=areas.get(e.area_id??devices.get(e.device_id)?.area_id),level=floors.get(area?.floor_id)?.level;
  return Number.isFinite(level)?level===0:['wohnzimmer','esszimmer','kuche','wohnesszimmer','wohnundesszimmer'].includes(normalizeHouseName(area?.name));
 }).map(e=>{
  const s=states[e.entity_id],leader=states[s?.attributes?.group_members?.[0]];
  const available=!!s&&!['unknown','unavailable'].includes(s.state);
  const playing=available&&(s.state==='playing'||leader?.state==='playing');
  const raw=s?.attributes?.volume_level??leader?.attributes?.volume_level;
  return {id:e.entity_id,playing,available,volume:Number.isFinite(raw)?Math.max(.1,Math.min(1,raw)):.5};
 });
 return (configured.length?configured.map(id=>players.find(p=>p.id===id)??{id,playing:false,available:false,volume:.5}):players.sort((a,b)=>Number(b.playing)-Number(a.playing)||Number(b.available)-Number(a.available))).slice(0,2);
}
export function acousticWave(progress,volume,strong) {
 const p=Math.max(0,Math.min(1,progress));
 return {radius:8+(1-(1-p)**3)*(200+volume*420),opacity:(strong?.75:.45)*(1-p)**1.3*(.5+volume*.5),width:(strong?3.2:1.6)*(1-p*.6)};
}
export function livingMarkup(room,config={}) {
 if(!room)return '';
 const lamps=livingLampLayout(room.lamps,config);
 const effects=lamps.map(l=>`<g class="house-lamp-light" data-house-glow="${esc(l.id)}"><ellipse cx="${l.x}" cy="${l.y+(l.type==='decke'?230:0)}" rx="${l.type==='kugel'?85:l.type==='streifen'?95:130}" ry="${l.type==='kugel'?85:l.type==='streifen'?45:170}" fill="url(#house-halo)"/>${['decke','stehlampe'].includes(l.type)?`<path d="M${l.x-12} ${l.y}L${l.x-125} 600H${l.x+125}L${l.x+12} ${l.y}Z" fill="url(#house-cone)" opacity=".5"/>`:''}</g>`).join('');
 const glyphs=lamps.map(l=>{
  const {x,y}=l;let glyph;
  if(l.type==='kugel')glyph=`<circle class="house-bulb" cx="${x}" cy="${y}" r="15"/><path d="M${x-5} ${y+16}h10"/>`;
  else if(l.type==='streifen'||l.type==='kommode')glyph=`<path class="house-bulb" d="M${x-60} ${y}h120" stroke-width="4" stroke-linecap="round"/>`;
  else glyph=`<path d="M${x} ${l.type==='stehlampe'?y:140}V${l.type==='stehlampe'?600:y} ${l.type==='stehlampe'?`m-18 0h36`:''}"/><path class="house-bulb" d="M${x-22} ${y}l8-18h28l8 18Z"/>`;
  return `<g class="house-lamp" data-house-lamp="${esc(l.id)}" data-house-lamp-type="${l.type}" data-house-owner="living" role="button" tabindex="0" data-action="house-light:${esc(l.id)}"><title>${esc(l.name)}</title><rect class="house-lamp-hit" x="${x-100}" y="${y-88}" width="200" height="176" fill="transparent" stroke="none" pointer-events="all"/>${glyph}</g>`;
 }).join('');
 return `<g class="house-living" clip-path="url(#house-room-living)" aria-label="Wohn- und Esszimmer · Möbel, Licht und Sonos"><g transform="translate(618 530) scale(${216/1140} ${100/460}) translate(-70 -140)">
 <rect x="70" y="140" width="1140" height="460" fill="#ff9966" opacity=".055"/>
 ${effects}<g data-living-waves pointer-events="none"></g>
 <g class="living-furniture"><path d="M90 600v-74h80v74m-80-25h80m-80-25h80 M260 600v-36h160v36m-80-36v36 M480 600v-34h70v34m-78-34h86 M570 600v-40q0-14 14-14h126q14 0 14 14v40m-154-39v-44q0-10-10-10h-10q-10 0-10 10v83m162-40V430q0-10 10-10h10q10 0 10 10v170 M900 520h140v12H900Zm14 12v68m112-68v68 M867 600v-42h32m-32 0v-35 M1042 558h32v42m0-42v-35 M1120 600v-70h80v70m-80-35h80"/>
 <path d="M820 150V600" stroke-dasharray="6 8" opacity=".35"/></g>
 ${[0,1].map((i)=>`<g data-living-speaker="${i}" class="living-speaker"><rect x="${i?390:200}" y="${i?516:466}" width="${i?26:28}" height="${i?46:134}" rx="5" fill="#1d1d2b"/><circle class="living-tweeter" cx="${i?403:214}" cy="${i?526:482}" r="2"/>${(i?[547]:[505,552]).map(y=>`<circle class="living-membrane" cx="${i?403:214}" cy="${y}" r="${i?8:9}"/>`).join('')}</g>`).join('')}
 <g class="living-fixtures">${glyphs}</g><g data-living-notes pointer-events="none"></g>
 </g></g>`;
}
const NS='http://www.w3.org/2000/svg';
export class LivingAcoustics {
 constructor(){this.waves=[];this.notes=[];this.beat=0;}
 update(svg,players=[]) {
  if(this.svg!==svg){this.destroy();this.svg=svg;this.waveLayer=svg.querySelector('[data-living-waves]');this.noteLayer=svg.querySelector('[data-living-notes]');this.lastBeat=0;this.lastNote=0;}
  this.players=players;
  [0,1].forEach(i=>svg.querySelector(`[data-living-speaker="${i}"]`)?.classList.toggle('playing',!!players[i]?.playing));
  if(!this.frame&&this.waveLayer)this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 create(tag,attrs,parent){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n;}
 tick(now){
  this.frame=0;
  if(!this.svg?.isConnected){this.destroy();return;}
  const active=(this.players??[]).map((p,i)=>({...p,i})).filter(p=>p.playing);
  if(!document.hidden&&active.length){
   if(now-this.lastBeat>=60000/112/2){this.lastBeat=now;const strong=this.beat++%2===0;
    active.forEach(p=>{if(this.waves.length>=30)return;const x=p.i?403:214,y=p.i?547:505;
     const node=this.create('circle',{cx:x,cy:y,r:8,fill:'none',stroke:p.i?'#9999ff':'#99ccff','stroke-dasharray':strong?'none':'3 7'},this.waveLayer);
     this.waves.push({node,born:now,volume:p.volume,strong});
    });
   }
   const vol=active.reduce((s,p)=>s+p.volume,0)/active.length;
   if(this.notes.length<7&&now-this.lastNote>1300-vol*600){this.lastNote=now;const p=active[Math.floor(Math.random()*active.length)],x=p.i?403:214,y=p.i?510:460;
    const node=this.create('g',{fill:['#ffcc99','#cc99cc','#ff9966','#99ccff'][Math.floor(Math.random()*4)]},this.noteLayer);
    const double=Math.random()>.5;
    this.create('ellipse',{cx:-5,cy:0,rx:6.5,ry:4.6,transform:'rotate(-22)'},node);
    this.create('path',{d:double?'M0 0v-26l20-5v26h-2v-22L2-23V0Z':'M0 0v-28h2q17 8 7 20q6-11-7-15V0Z'},node);
    if(double)this.create('ellipse',{cx:15,cy:-5,rx:6.5,ry:4.6,transform:'rotate(-22 15 -5)'},node);
    this.notes.push({node,born:now,life:4200+Math.random()*1600,x,y,vx:(25+Math.random()*50)*(Math.random()<.8?1:-1),vy:30+Math.random()*35,scale:.85+Math.random()*.5,turn:Math.random()*30-15});
   }
  }else this.lastBeat=now;
  this.waves=this.waves.filter(w=>{const p=(now-w.born)/2600;if(p>=1){w.node.remove();return false;}const s=acousticWave(p,w.volume,w.strong);w.node.setAttribute('r',s.radius);w.node.setAttribute('opacity',s.opacity);w.node.setAttribute('stroke-width',s.width);return true;});
  this.notes=this.notes.filter(n=>{const age=now-n.born,p=age/n.life,t=age/1000,y=n.y-n.vy*t;if(p>=1||y<150){n.node.remove();return false;}n.node.setAttribute('transform',`translate(${n.x+n.vx*t*.8+Math.sin(t*2)*10} ${y}) rotate(${n.turn*t}) scale(${n.scale})`);n.node.setAttribute('opacity',Math.min(.9,age/400*.9,(1-p)*2.7));return true;});
  this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 destroy(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;for(const n of [...this.waves,...this.notes])n.node.remove();this.waves=[];this.notes=[];this.svg=null;}
}
