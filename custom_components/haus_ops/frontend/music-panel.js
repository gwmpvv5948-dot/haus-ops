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
  ['Shuffle','shuffle',32768], ['◀◀','previous',16], ['▶','play',0],
  ['▶▶','next',32], ['Repeat','repeat',262144],
];
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

  id(key) { return this.panel.config?.music?.[key] || defaults[key]; }
  players() { return this.panel.demo ? demoStates : rooms.map(room => this.panel.state(this.id(room))); }
  selected() {
    const selection = this.panel.state(this.id('selection'));
    const value = this.pendingRoom ?? (available(selection) ? selection.state : this.localRoom);
    return Math.max(0, rooms.indexOf(value));
  }
  grouped(players) {
    return groupMembers(players[0]).includes(this.id(rooms[1])) ||
      groupMembers(players[1]).includes(this.id(rooms[0]));
  }

  view() {
    const players = this.players();
    const index = this.selected();
    const player = players[index];
    const grouped = this.grouped(players);
    const leader = grouped ? players[0] : player;
    const attrs = leader?.attributes ?? {};
    const ready = available(player) && available(leader);
    const playing = ready && leader.state === 'playing';
    const title = ready && leader.state !== 'idle' ? attrs.media_title || attrs.source : '';
    const duration = Number(attrs.media_duration) || 0;
    const live = Boolean(title) && !duration;
    const volume = this.volumes?.get(index)?.value ?? Math.round((player?.attributes?.volume_level ?? 0)*100);
    const muted = player?.attributes?.is_volume_muted && !this.volumes?.has(index);
    const picture = typeof attrs.entity_picture === 'string' &&
      (/^\/(?!\/)/.test(attrs.entity_picture) || /^https:\/\//i.test(attrs.entity_picture)) ? attrs.entity_picture : '';
    const volumeReady = Boolean(supported(player,4));
    const flash = this.feedback?.until > Date.now() ? this.feedback : null;
    const standard = players.map((item,i) => !available(item) ? names[i] + ' nicht erreichbar'
      : names[i] + (item.state === 'playing' ? ' spielt ' + (item.attributes.media_title ?? '') : item.state === 'paused' ? ' pausiert' : ' in Ruhe')).join(' · ');
    const radio = this.id('radio');
    return {
      status: flash?.text ?? (standard + (grouped ? ' · Gruppe aktiv' : '')),
      tone: flash ? flash.error ? 'error' : 'ok' : players.some(item=>!available(item)) ? 'offline' : '',
      layout: `<section class="music-page">
        <section class="music-rooms">${band('Räume','--purple')}
          ${players.map((item,i)=>`<div class="music-room-row"><button class="music-room" data-action="music-room:${i}" aria-pressed="${i===index}" ${available(item)?'':'data-offline'}>
            ${equalizer(4,item?.state==='playing')}<strong>${names[i]}</strong>
            <small>${!available(item)?'Offline':item.state==='playing'?'Spielt':item.state==='paused'?'Pause':'Ruhe'}</small>
            <span>${escape(item?.attributes?.media_title || (!available(item) ? 'Keine Verbindung' : ''))}</span></button>
            <button class="music-room-play" data-action="music-room-play:${i}" aria-label="${names[i]} ${item?.state==='playing'?'pausieren':'abspielen'}"
              ${supported(item,item?.state==='playing'?1:16384)?'':'disabled'}>${item?.state==='playing'?'❚❚':'▶'}</button></div>`).join('')}
          ${band('Shortcut','--pink')}
          <button class="music-radio ${flash?.radio?'flashing':''}" data-action="music-radio" ${this.panel.demo || available(this.panel.state(radio))?'':'disabled'}>Radio<small>${escape(radio)}</small></button>
          <button class="music-group" data-action="music-group" aria-pressed="${grouped}"
            ${available(players[1]) && (grouped ? supported(players[1],524288) : supported(players[0],524288))?'':'disabled'}>${grouped?'Gruppe lösen':players.some(item=>!available(item))?'Verbinden · Raum offline':'Räume verbinden'}</button>
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
              ${action==='play'?`aria-label="${playing?'Pause':'Wiedergabe'}"`:''}>${action==='play'&&playing?'❚❚':live&&action==='previous'?'◀ Sender':live&&action==='next'?'Sender ▶':label}</button>`;
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
          <div class="music-favorites">${favorites.map(([key,label],i)=>{
            const id = this.id(key) || (i===0 ? radio : '');
            return `<button data-action="music-favorite:${i}" ${this.panel.demo || (id && available(this.panel.state(id)))?'':'disabled'}>${label}</button>`;
          }).join('')}</div>
        </section></section>`,
    };
  }

  tick(root) {
    const progress = root.querySelector('.music-progress');
    if (!progress) return;
    const players = this.players();
    const player = players[this.grouped(players) ? 0 : this.selected()];
    const attributes = player.attributes;
    const since = Date.parse(attributes.media_position_updated_at);
    const elapsed = player.state === 'playing' && Number.isFinite(since) ? Math.max(0,(Date.now()-since)/1000) : 0;
    const position = Math.min(Number(progress.dataset.duration), Math.max(0,(Number(attributes.media_position)||0)+elapsed));
    progress.firstElementChild.textContent = clock(position);
    progress.querySelector('progress').value = position;
  }

  async select(index) {
    const key = rooms[index];
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
    const players = this.players();
    const index = this.selected();
    const selected = players[index];
    const grouped = this.grouped(players);
    const leaderIndex = grouped ? 0 : index;
    const attrs = players[leaderIndex]?.attributes ?? {};
    const leader = this.id(rooms[leaderIndex]);
    const targets = (grouped ? [0,1] : [index]).filter(i=>available(players[i]));
    try {
      if (action === 'room') await this.select(amount);
      else if (action === 'radio' || action === 'favorite') {
        const radio = action === 'radio' ? this.id('radio')
          : this.id(favorites[amount][0]) || (amount === 0 ? this.id('radio') : '');
        if (!radio) return;
        if (!panel.demo) await panel.call(radio, radio.startsWith('input_button.') ? 'press' : 'turn_on');
        this.message(radio+' ausgelöst',false,true);
        await this.select(0);
      } else if (!panel.demo) {
        if (action === 'room-play') {
          const target = grouped ? 0 : amount;
          await panel.call(this.id(rooms[target]), 'media_play_pause');
        } else if (action === 'group') {
          await (grouped ? panel.call(this.id(rooms[1]),'unjoin')
            : panel.call(this.id(rooms[0]),'join',{group_members:[this.id(rooms[1])]}));
          this.message(grouped ? 'Gruppe gelöst' : 'Arbeitszimmer mit Esszimmer verbunden');
        } else if (action === 'volume' || action === 'step') {
          const previous = this.volumes?.get(index)?.value ?? Math.round((selected.attributes.volume_level ?? 0)*100);
          this.queueVolume(targets, Math.min(100,Math.max(0,action==='step'?previous+amount:amount)));
        } else if (action === 'mute') {
          this.cancelVolume(targets);
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
    for (const index of targets) {
      const pending = {value};
      this.volumes.set(index,pending);
      pending.timer = setTimeout(async () => {
        const player = this.players()[index];
        const id = this.id(rooms[index]);
        try {
          if (!supported(player,4)) return;
          await this.panel.call(id,'volume_set',{volume_level:value/100});
          if (this.volumes.get(index)===pending && player.attributes.is_volume_muted && supported(player,8)) {
            await this.panel.call(id,'volume_mute',{is_volume_muted:false});
          }
        } catch {
          this.message('Musik · Lautstärke konnte nicht gesetzt werden',true);
        } finally {
          if (this.volumes.get(index)===pending) this.volumes.delete(index);
          this.panel.render();
        }
      },300);
    }
  }
}
