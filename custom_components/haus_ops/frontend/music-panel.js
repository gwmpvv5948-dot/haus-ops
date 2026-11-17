const defaults = {
  esszimmer: 'media_player.sonos_move',
  arbeitszimmer: 'media_player.arbeitszimmer',
  radio: 'script.radio_esszimmer',
  selection: 'input_select.musik_raum',
  favorite_radioeins: '',
  favorite_deutschlandfunk: '',
  favorite_fluxfm: '',
  favorite_fokus: '',
};
const rooms = ['esszimmer', 'arbeitszimmer'];
const names = ['Esszimmer', 'Arbeitszimmer'];
const favorites = [
  ['favorite_radioeins', 'Radioeins'], ['favorite_deutschlandfunk', 'Deutschlandfunk'],
  ['favorite_fluxfm', 'FluxFM'], ['favorite_fokus', 'Fokus'],
];
export const musicFields = Object.entries(defaults).slice(0,4).map(([key, id], index) =>
  ['music.' + key, [...names, 'Radio-Shortcut (Helfer oder Script)', 'Raumauswahl'][index],
    key === 'radio' ? ['input_button', 'script'] : [id.split('.')[0]]]).concat(
    favorites.map(([key,label]) => ['music.' + key, 'Favorit · ' + label, ['script','input_button']]));
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);
const band = (title, color) => `<h2 class="band" style="--band:var(--${color})">${escape(title)}</h2>`;
const available = state => state && !['unknown','unavailable'].includes(state.state);
const supported = (state, bit) => available(state) && Boolean(state.attributes.supported_features & bit);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
const controls = [
  ['Shuffle','shuffle',32768], ['Zurück','previous',16], ['Wiedergabe','play',0],
  ['Weiter','next',32], ['Repeat','repeat',262144],
];
const transportIcon = action => {
  const paths = {
    play: 'M8 3v18l15-9z',
    pause: 'M7 4h4v16H7zm7 0h4v16h-4z',
    previous: 'M22 5v14l-9-7zM11 5v14l-9-7z',
    next: 'M2 5v14l9-7zM13 5v14l9-7z',
  };
  return `<svg class="music-transport-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[action]}"/></svg>`;
};
const demoStates = [
  {state:'playing',attributes:{media_title:'Radioeins',media_artist:'Live-Stream · RBB',source:'Radio',volume_level:.07,supported_features:1048588}},
  {state:'paused',attributes:{media_title:'Says',volume_level:.14,media_duration:420,media_position:45,supported_features:1392620}},
];
const equalizer = (count, playing) => `<span aria-hidden="true" class="music-eq ${playing ? 'playing' : ''}">${Array.from({length:count},(_,i)=>
  `<i style="--length:${.3+(i*17%61)/100}s;--height:${25+i*29%76}%"></i>`).join('')}</span>`;
const groupMembers = state => state?.attributes?.group_members ?? [];

export class MusicPanel {
  constructor(panel) {
    this.panel = panel;
    try { this.localRoom = localStorage.getItem('haus-ops.music-room'); } catch {}
  }

  id(key) { return key?.startsWith('media_player.') ? key : this.panel.config?.music?.[key] || defaults[key]; }

  roomList() {
    if (this.panel.demo) return rooms.map((id,index)=>({id,name:names[index]}));
    this.panel.circuits.load();
    const registry = this.panel.circuits.registry;
    const sonos = new Set((registry?.entities ?? []).filter(entry=>entry.platform==='sonos' && !entry.disabled_by)
      .map(entry=>entry.entity_id));
    for (const [id,state] of Object.entries(this.panel.ha?.states ?? {})) {
      if (id.startsWith('media_player.') && Array.isArray(state.attributes?.group_members)) sonos.add(id);
    }
    for (const key of rooms) {
      const id = this.id(key);
      if (this.panel.state(id)) sonos.add(id);
    }
    return [...sonos].filter(id=>id.startsWith('media_player.')).sort().map(id=>({
      id,name:this.panel.state(id)?.attributes?.friendly_name ?? id,
    }));
  }

  leaderId(player, fallback) { return groupMembers(player)[0] || fallback; }
  players() { return this.panel.demo ? demoStates : this.roomList().map(room => this.panel.state(room.id)); }
  selected() {
    const list = this.roomList();
    const selection = this.panel.state(this.id('selection'));
    const value = this.pendingRoom ?? this.localRoom ?? (available(selection) ? selection.state : undefined);
    return Math.max(0,list.findIndex(room=>room.id===value || room.id===this.id(value)));
  }
  grouped(players) { return groupMembers(players[this.selected()]).length > 1; }

  loadFavorites(entity, ready) {
    this.sonosFavorites ??= new Map();
    const cache = this.sonosFavorites.get(entity);
    if (!ready || !this.panel.ha?.callWS || cache?.loading || cache?.until > Date.now()) return cache;
    const result = {...cache, loading:true};
    this.sonosFavorites.set(entity,result);
    const browse = (type,id='') => this.panel.ha.callWS({
      type:'media_player/browse_media',entity_id:entity,media_content_type:type,media_content_id:id,
    });
    browse('favorites').then(async root => {
      const children = root.children ?? [];
      const folders = children.filter(item=>item.media_content_type==='favorites_folder' && item.can_expand);
      const pages = await Promise.allSettled(folders.map(item=>browse(item.media_content_type,item.media_content_id)));
      const entries = [...children,...pages.flatMap(page=>page.status==='fulfilled'?page.value.children ?? []:[])];
      result.items = [...new Map(entries.filter(item=>item.can_play&&item.media_content_type==='favorite_item_id')
        .map(item=>[item.media_content_id,item])).values()];
      result.error = pages.some(page=>page.status==='rejected');
    }).catch(()=>{result.error=true;}).finally(()=>{
      result.loading = false;
      result.until = Date.now()+(result.error?30000:60000);
      this.panel.render();
    });
    return result;
  }

  view() {
    const list = this.roomList(), rooms = list.map(room=>room.id), names = list.map(room=>room.name);
    const players = this.players();
    const index = this.selected();
    const player = players[index];
    const grouped = this.grouped(players);
    const leader = this.panel.state(this.leaderId(player,rooms[index])) ?? player;
    const attrs = leader?.attributes ?? {};
    const ready = available(player) && available(leader);
    const playing = ready && leader.state === 'playing';
    const title = ready && leader.state !== 'idle' ? attrs.media_title || attrs.source : '';
    const duration = Number(attrs.media_duration) || 0;
    const live = Boolean(title) && !duration;
    const volume = this.volumes?.get(rooms[index])?.value ?? Math.round((player?.attributes?.volume_level ?? 0)*100);
    const muted = player?.attributes?.is_volume_muted && !this.volumes?.has(rooms[index]);
    const picture = typeof attrs.entity_picture === 'string' &&
      (/^\/(?!\/)/.test(attrs.entity_picture) || /^https:\/\//i.test(attrs.entity_picture)) ? attrs.entity_picture : '';
    const volumeReady = Boolean(supported(player,4));
    const flash = this.feedback?.until > Date.now() ? this.feedback : null;
    const standard = players.map((item,i) => !available(item) ? names[i] + ' nicht erreichbar'
      : names[i] + (item.state === 'playing' ? ' spielt ' + (item.attributes.media_title ?? '') : item.state === 'paused' ? ' pausiert' : ' in Ruhe')).join(' · ');
    const radio = this.id('radio');
    const sonos = this.loadFavorites(this.id(rooms[index]), !this.panel.demo && available(player));
    return {
      status: flash?.text ?? (standard + (grouped ? ' · Gruppe aktiv' : '')),
      tone: flash ? flash.error ? 'error' : 'ok' : players.some(item=>!available(item)) ? 'offline' : '',
      layout: `<section class="music-page">
        <section class="music-rooms">${band('Räume','--purple')}
          <div class="music-room-list">${players.map((item,i)=>`<div class="music-room-row"><button class="music-room" data-action="music-room:${encodeURIComponent(rooms[i])}" aria-pressed="${i===index}" ${available(item)?'':'data-offline'}>
            ${equalizer(4,item?.state==='playing')}<strong>${escape(names[i])}</strong>
            <small>${!available(item)?'Offline':item.state==='playing'?'Spielt':item.state==='paused'?'Pause':'Ruhe'}</small>
            <span>${escape(item?.attributes?.media_title || (!available(item) ? 'Keine Verbindung' : ''))}</span></button>
            <button class="music-room-play" data-action="music-room-play:${encodeURIComponent(rooms[i])}" aria-label="${escape(names[i])} ${item?.state==='playing'?'pausieren':'abspielen'}"
              ${supported(item,item?.state==='playing'?1:16384)?'':'disabled'}>${transportIcon(item?.state==='playing'?'pause':'play')}</button></div>`).join('')}
          </div>
          <div class="music-shortcut-heading">${band('Shortcut','--pink')}</div>
          <button class="music-radio ${flash?.radio?'flashing':''}" data-action="music-radio" ${this.panel.demo || available(this.panel.state(radio))?'':'disabled'}>Radio<small>in Küche</small></button>
          <button class="music-group" data-action="music-group" aria-expanded="${Boolean(this.groupEditor)}"
            ${available(player)?'':'disabled'}>Räume gruppieren</button>
          ${this.groupEditor?`<div class="music-group-members">${players.map((item,i)=>i===index?'':`<button data-action="music-member:${encodeURIComponent(rooms[i])}"
            aria-pressed="${groupMembers(player).includes(rooms[i])}" ${available(item)&&supported(player,524288)&&supported(item,524288)?'':'disabled'}>${groupMembers(player).includes(rooms[i])?'✓ ':''}${escape(names[i])}</button>`).join('')}
            <button data-action="music-leave" ${grouped?'':'disabled'}>Gewählten Raum lösen</button></div>`:''}

        </section>
        <section class="music-play">${band(`Wiedergabe · ${names[index]}${grouped?' · Gruppe':''}`,'--peach')}
          <div class="music-now">
            <div class="music-cover ${live?'live':''}">${picture?`<img src="${escape(picture)}" alt="">`:`<b>${escape(title || names[index])}</b>`}${equalizer(16,playing)}</div>
            <div class="music-meta"><strong>${escape(title || (ready?'Keine Wiedergabe':'Nicht erreichbar'))}</strong>
              <span>${escape(attrs.media_artist || attrs.media_album_name)}</span>
              <div><b>${escape(attrs.source || attrs.app_name || (live?'Stream':'Sonos'))}</b> <small>${escape(this.id(rooms[index]))}</small></div>
              ${live?`<small class="music-live ${playing?'playing':''}">● Live</small>`:duration?`<div class="music-progress" data-duration="${duration}"><span></span><progress max="${duration}"></progress><span>${clock(duration)}</span></div>`:''}
            </div>
          </div>
          <div class="music-controls ${live?'is-live':''}">${(live ? controls.slice(1,4) : controls).map(([label,action,bit])=>{
            const enabled = action==='play' ? ready && supported(leader,playing?1:16384) : !live && supported(leader,bit);
            const pressed = action==='shuffle' ? attrs.shuffle===true : action==='repeat' ? Boolean(attrs.repeat && attrs.repeat!=='off') : null;
            return `<button data-action="music-${action}" ${enabled?'':'disabled'} ${pressed===null?'':`aria-pressed="${pressed}"`}
              ${['play','previous','next'].includes(action)?`aria-label="${action==='play'&&playing?'Pause':live&&action==='previous'?'Vorheriger Sender':live&&action==='next'?'Nächster Sender':label}"`:''}>${['play','previous','next'].includes(action)?transportIcon(action==='play'&&playing?'pause':action):label}</button>`;
          }).join('')}</div>
          ${band('Lautstärke','--blue')}
          <div class="music-volume ${muted?'muted':''}">
            <button data-action="music-step:-5" aria-label="Leiser" ${volumeReady?'':'disabled'}>−</button>
            <div class="music-volume-segments">${Array.from({length:20},(_,i)=>`<button data-action="music-volume:${(i+1)*5}" aria-label="${(i+1)*5} Prozent" ${volumeReady?'':'disabled'} class="${volume>i*5?'active':''}" style="--segment-height:${30+i*70/19}%"><i></i></button>`).join('')}</div>
            <strong>${muted || !available(player)?'—':volume+'%'}</strong>
            <button data-action="music-step:5" aria-label="Lauter" ${volumeReady?'':'disabled'}>+</button>
            <button data-action="music-mute" aria-pressed="${Boolean(muted)}" ${supported(player,8)?'':'disabled'}>Mute</button>
          </div>
          ${band('Favoriten','--sand')}
          <div class="music-favorites"> ${this.panel.demo ? favorites.map(([,label])=>`<button disabled>${label}</button>`).join('')
            : sonos?.items?.length ? sonos.items.map(item=>`<button data-action="music-sonos:${encodeURIComponent(item.media_content_id)}" title="${escape(item.title)}" ${available(player)?'':'disabled'}>${escape(item.title)}</button>`).join('')
            : `<small>${!available(player)?'Raum offline':sonos?.loading?'Favoriten werden geladen …':sonos?.error?'Favoriten konnten nicht geladen werden':'Keine Sonos-Favoriten verfügbar'}</small>`}</div>
        </section></section>`,
    };
  }

  tick(root) {
    const progress = root.querySelector('.music-progress');
    if (!progress) return;
    const players = this.players();
    const selected = players[this.selected()];
    const player = this.panel.state(this.leaderId(selected,this.roomList()[this.selected()]?.id)) ?? selected;
    if (!player) return;
    const attributes = player.attributes;
    const since = Date.parse(attributes.media_position_updated_at);
    const elapsed = player.state === 'playing' && Number.isFinite(since) ? Math.max(0,(Date.now()-since)/1000) : 0;
    const position = Math.min(Number(progress.dataset.duration), Math.max(0,(Number(attributes.media_position)||0)+elapsed));
    progress.firstElementChild.textContent = clock(position);
    progress.querySelector('progress').value = position;
  }

  async select(index) {
    const key = this.roomList()[index]?.id;
    if (!key) return;
    this.localRoom = key;
    try { localStorage.setItem('haus-ops.music-room',key); } catch {}
    const helper = this.id('selection');
    if (!this.panel.state(helper)?.attributes?.options?.includes(key)) return;
    this.pendingRoom = key;
    try { await this.panel.call(helper,'select_option',{option:key}); }
    finally { this.pendingRoom = undefined; }
  }

  message(text, error = false, radio = false) {
    this.feedback = {text,error,radio,until:Date.now()+3500};
    this.panel.render();
  }

  async act(action, amount) {
    const panel = this.panel;
    const list = this.roomList(), rooms = list.map(room=>room.id), names = list.map(room=>room.name);
    const players = this.players();
    const index = this.selected();
    const selected = players[index];
    const grouped = this.grouped(players);
    const leader = this.leaderId(selected,rooms[index]);
    const attrs = (panel.state(leader) ?? selected)?.attributes ?? {};
    const targets = [index].filter(i=>available(players[i]));
    try {
      if (action === 'room') await this.select(rooms.indexOf(decodeURIComponent(amount)));
      else if (action === 'group') this.groupEditor = !this.groupEditor;
      else if (action === 'member' || action === 'leave') {
        if (!available(selected)) return;
        const member = action==='leave' ? rooms[index] : decodeURIComponent(amount);
        if (!rooms.includes(member) || !available(panel.state(member))) return;
        if (action==='leave' || groupMembers(selected).includes(member)) await panel.call(member,'unjoin');
        else await panel.call(leader,'join',{group_members:[member]});
      }
      else if (action === 'sonos') {
        const entity = this.id(rooms[index]);
        const favorite = this.sonosFavorites?.get(entity)?.items?.find(item=>encodeURIComponent(item.media_content_id)===amount);
        if (!favorite || !available(selected)) return;
        await panel.call(entity,'play_media',{media_content_type:favorite.media_content_type,media_content_id:favorite.media_content_id});
        this.message(favorite.title+' · '+names[index]);
      } else if (action === 'radio') {
        const radio = this.id('radio');
        if (!radio) return;
        if (!panel.demo) await panel.call(radio, radio.startsWith('input_button.') ? 'press' : 'turn_on');
        this.message(radio+' ausgelöst',false,true);
        await this.select(0);
      } else if (!panel.demo) {
        if (action === 'room-play') {
          const target = decodeURIComponent(amount);
          if (!rooms.includes(target) || !available(panel.state(target))) return;
          await panel.call(this.leaderId(panel.state(target),target), 'media_play_pause');
        } else if (action === 'volume' || action === 'step') {
          const previous = this.volumes?.get(rooms[index])?.value ?? Math.round((selected.attributes.volume_level ?? 0)*100);
          this.queueVolume(targets.map(i=>rooms[i]), Math.min(100,Math.max(0,action==='step'?previous+amount:amount)));
        } else if (action === 'mute') {
          this.cancelVolume(targets.map(i=>rooms[i]));
          const isMuted = !selected.attributes.is_volume_muted;
          await Promise.all(targets.filter(i=>supported(players[i],8)).map(i=>
            panel.call(this.id(rooms[i]),'volume_mute',{is_volume_muted:isMuted})));
        } else {
          const [service,data] = {
            play:['media_play_pause'], previous:['media_previous_track'], next:['media_next_track'],
            shuffle:['shuffle_set',{shuffle:!attrs.shuffle}],
            repeat:['repeat_set',{repeat:attrs.repeat && attrs.repeat!=='off'?'off':'all'}],
          }[action];
          await panel.call(leader,service,data);
        }
      }
    } catch {
      this.message('Musik · Aktion fehlgeschlagen',true);
    }
    panel.render();
  }

  cancelVolume(targets) {
    for (const target of targets) {
      const pending = this.volumes?.get(target);
      clearTimeout(pending?.timer);
      this.volumes?.delete(target);
    }
  }

  queueVolume(targets, value) {
    this.volumes ??= new Map();
    this.cancelVolume(targets);
    for (const id of targets) {
      const pending = {value};
      this.volumes.set(id,pending);
      pending.timer = setTimeout(async () => {
        const player = this.panel.state(id);
        try {
          if (!supported(player,4)) return;
          await this.panel.call(id,'volume_set',{volume_level:value/100});
          if (this.volumes.get(id)===pending && player.attributes.is_volume_muted && supported(player,8)) {
            await this.panel.call(id,'volume_mute',{is_volume_muted:false});
          }
        } catch {
          this.message('Musik · Lautstärke konnte nicht gesetzt werden',true);
        } finally {
          if (this.volumes.get(id)===pending) this.volumes.delete(id);
          this.panel.render();
        }
      },300);
    }
  }
}
