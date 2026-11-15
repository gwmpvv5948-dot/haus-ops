const pages = ['Übersicht', 'Sicherheit', 'Lüftung', 'Rollos', 'Klima'];
const colors = ['--sand', '--red', '--pink', '--purple', '--sand'];
const levels = ['Aus', 'Low', '1', '2', 'Max'];
const climate = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const icon = path => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
const doorIcon = 'M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16m-4-9h.1';
const windowIcon = 'M5 21V10a7 7 0 0 1 14 0v11ZM5 13h14M12 3v18';
const fanIcon = 'M12 10c-3-3-3-7 0-8 4-1 5 3 2 8m-4 2c-4-1-8 1-7 4 1 4 5 4 8-2m3-2c5-1 8 2 7 5-2 3-6 2-8-3M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0';
const valid = entity => entity && !['unknown', 'unavailable'].includes(entity.state);
const band = (title, color) => `<h2 class="band" style="--band:var(${color})">${title}</h2>`;
const segments = colors => `<span class="segments" aria-hidden="true">${colors.map(color =>
  `<i${color ? ` style="background:var(${color})"` : ''}></i>`).join('')}</span>`;

class HausOps extends HTMLElement {
  page = 0;
  demoLevel = 1;
  demoPosition = 100;
  demoLocked = false;
  demoSwitches = [false, false];
  demoEnd = Date.now() + 441000;
  demoStart = Date.now();
  busy = false;

  set hass(value) { this.ha = value; this.render(); }
  set panel(value) { this.config = value?.config; this.render(); }
  get demo() { return this.hasAttribute('demo'); }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${new URL('./haus-ops.css', import.meta.url)}">
        <div class="stage"><div class="frame">
          <div class="brand">LCARS 77</div>
          <header><span class="rail"></span><strong>HAUS-OPS</strong><time></time><span class="cap"></span></header>
          <nav aria-label="Ansichten">${pages.map((page, i) => `<button data-page="${i}" style="background:var(${colors[i]})">${page}</button>`).join('')}<p>82873.4</p></nav>
          <main></main><div class="heel"></div>
          <footer><span class="rail">${this.demo ? 'Demo · System bereit' : 'System bereit'}</span><span class="cap"></span></footer>
        </div><div class="notice" role="status"></div></div>`;
      this.shadowRoot.addEventListener('click', event => this.click(event));
    }
    this.resize = new ResizeObserver(() => {
      this.style.setProperty('--scale', Math.min(this.clientWidth / 800, this.clientHeight / 480));
    });
    this.resize.observe(this);
    this.render();
    this.tick();
    this.clock = setInterval(() => { this.tick(); this.render(); }, 1000);
  }

  disconnectedCallback() {
    this.resize?.disconnect();
    clearInterval(this.clock);
    clearTimeout(this.noticeTimeout);
  }

  state(id) { return this.ha?.states?.[id]; }

  accesses() {
    if (this.demo) return ['Garagentor', 'Garagentür', 'Türschloss', 'Haustür', 'CA Fenster', 'KU Fenster', 'Terrasse', 'AZ Fenster']
      .map((name, index) => ({ name, lock: index === 2, open: index === 2 && !this.demoLocked }));
    return (this.config?.access ?? []).map(({ name, entity }) => {
      const lock = entity?.startsWith('lock.');
      const state = this.state(entity)?.state;
      return { name, entity, lock, open: lock ? ({ locked: false, unlocked: true, open: true })[state]
        : ({ on: true, off: false })[state] };
    });
  }

  temperatures() {
    const rooms = this.demo ? [
      ['Schlafzimmer', 19.4, 5], ['Wohnzimmer', 21.1, 2], ['Bad', 19.9, 4], ['Flur', 18.4, 49]
    ].map(([name, value, age]) => ({ name, value, age: age + Math.floor((Date.now() - this.demoStart) / 60000) }))
      : (this.config?.climate ?? []).map(({ name, entity }) => {
        const reading = this.state(entity);
        const raw = valid(reading) ? Number(reading.state) : NaN;
        const value = reading?.attributes?.unit_of_measurement === '°F' ? (raw - 32) * 5 / 9 : raw;
        const date = Date.parse(reading?.last_reported || reading?.last_updated);
        const age = Number.isFinite(value) && Number.isFinite(date) ? Math.max(0, Math.floor((Date.now() - date) / 60000)) : null;
        return { name, value, age };
      });
    return rooms.map(room => ({ ...room, display: Number.isFinite(room.value) ? `${climate.format(room.value)}°` : '—',
      mark: Number.isFinite(room.value) ? Math.min(100, Math.max(0, (room.value - 15) * 10)) : null,
      stale: room.age !== null && room.age >= 30 }));
  }

  get vent() { return this.state(this.config?.ventilation?.entity); }
  get options() { return this.config?.ventilation?.options ?? []; }
  get level() { return this.demo ? this.demoLevel : this.options.indexOf(this.vent?.state); }
  get timer() { return this.state(this.config?.timer); }
  get cover() { return this.state(this.config?.cover); }

  get remaining() {
    if (this.demo) return Math.max(0, Math.ceil((this.demoEnd - Date.now()) / 1000));
    if (this.timer?.state === 'paused') {
      return (this.timer.attributes.remaining || '0:00:00').split(':').reduce((total, part) => total * 60 + Number(part), 0) || 0;
    }
    if (this.timer?.state !== 'active') return 0;
    return Math.max(0, Math.ceil((Date.parse(this.timer.attributes.finishes_at) - Date.now()) / 1000)) || 0;
  }

  tick() {
    const clock = this.shadowRoot?.querySelector('time');
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString('de-DE');
    const seconds = this.remaining;
    const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    this.shadowRoot.querySelectorAll('[data-countdown]').forEach(node => { node.textContent = formatted; });
    this.shadowRoot.querySelectorAll('[data-timer-bar] i').forEach((node, index, all) => {
      const duration = this.demo ? this.demoDuration ?? 600 : (this.timer?.attributes?.duration || '0:10:00')
        .split(':').reduce((total, part) => total * 60 + Number(part), 0);
      node.style.background = index < Math.ceil(seconds / (duration || 600) * all.length) ? 'var(--peach)' : '';
    });
  }

  render() {
    const main = this.shadowRoot?.querySelector('main');
    if (!main) return;
    const accesses = this.accesses();
    const open = accesses.filter(item => item.open);
    const complete = accesses.length > 0 && accesses.every(item => item.open !== undefined);
    const alarm = open.length ? `${open.length} offen` : complete ? 'Alles gesichert' : 'Status unvollständig';
    const accessLabel = item => item.open === undefined ? 'Keine Daten' : item.lock
      ? (item.open ? 'Entriegelt' : 'Verriegelt') : (item.open ? 'Offen' : 'Geschlossen');
    const rooms = this.temperatures();
    const level = this.level;
    const blind = this.cover;
    const rawPosition = blind?.attributes?.current_position;
    const position = this.demo ? this.demoPosition : !valid(blind) ? null
      : Number.isFinite(rawPosition) ? Math.min(100, Math.max(0, rawPosition))
        : blind.state === 'closed' ? 0 : null;
    const blindLabel = this.demo ? (position ? 'Geöffnet' : 'Geschlossen')
      : ({ opening: 'Fährt auf', closing: 'Fährt ab', open: 'Offen', closed: 'Geschlossen' })[blind?.state] ?? 'Keine Daten';
    const devices = this.demo ? ['TV Strom', 'Schreibtisch'].map((name, i) => ({ name, on: this.demoSwitches[i], ready: true }))
      : (this.config?.switches ?? []).map(({ name, entity }) => ({
        name, on: this.state(entity)?.state === 'on', ready: valid(this.state(entity))
      }));
    const deviceLabel = device => device.ready ? (device.on ? 'An' : 'Aus') : 'Keine Daten';
    const coverButtons = `<div class="actions">${['ab', 'auf'].map((action, index) =>
      `<button data-action="cover:${index}" ${this.demo || valid(blind) ? '' : 'disabled'}><span aria-hidden="true">${index ? '↑' : '↓'}</span> Alle ${action}</button>`).join('')}</div>`;
    let layout;
    switch (this.page) {
      case 0:
        layout = `<div class="overview">
          <section>${band('Sicherheit', '--red')}<button class="summary" data-page="1">
            <strong class="big ${open.length ? 'bad' : ''}">${alarm}</strong>
            <span>${open.length ? escape(open[0].name) + ' ' + accessLabel(open[0]) : 'Zugänge'}</span>
            ${segments(accesses.map(item => item.open === undefined ? null : item.open ? '--red' : '--purple'))}
          </button></section>
          <section>${band('Hauslüftung', '--pink')}<button class="summary" data-page="2">
            <span class="row"><strong class="big">${level >= 0 ? 'Stufe ' + levels[level] : 'Keine Daten'}</strong><span>◷ <span data-countdown></span></span></span>
            ${segments(levels.map((_, i) => i === level ? '--peach' : null))}
            <span class="small">Aus · Low · 1 · 2 · Max</span>
          </button></section>
          <section class="roll-summary"><button class="band" style="--band:var(--purple)" data-page="3">Rollos</button>
            ${coverButtons}<span class="small">${blindLabel}${devices.map(device => ' · ' + escape(device.name) + ' ' + deviceLabel(device)).join('')}</span>
          </section>
          <section>${band('Klima · Quartiere', '--sand')}<button class="summary" data-page="4">
            ${rooms.map(room => `<span class="row"><span>${escape(room.name)} ${room.stale ? '<small class="warn">· Still</small>' : ''}</span><strong>${room.display}</strong></span>`).join('') || 'Keine Daten'}
          </button></section></div>`;
        break;
      case 1:
        layout = `<section class="detail">${band('Sicherheit · Zugänge', '--red')}
          <div class="security-status ${open.length ? 'alarm' : ''}">${open.length
            ? 'Alarmstufe Gelb · ' + open.map(item => escape(item.name) + ' ' + accessLabel(item)).join(' · ')
            : alarm}</div>
          <div class="tiles">${accesses.map((item, index) => `<button style="background:${item.open === undefined ? 'var(--pink)' : item.open ? 'var(--red)' : 'var(--pink)'}" data-action="access:${index}" ${item.lock && item.open === undefined ? 'disabled' : ''}>
            ${icon(item.lock ? (item.open ? 'M7 11V7a5 5 0 0 1 9-3m-9 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm5 5h.1' : 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zm7 5h.1') : /fenster/i.test(item.name) ? windowIcon : doorIcon)}
            <span><strong>${escape(item.name)}</strong><small>${accessLabel(item)}</small></span></button>`).join('')}</div></section>`;
        break;
      case 2:
        layout = `<section class="detail">${band('Hauslüftung · Stufe', '--pink')}
          <div class="levels">${levels.map((name, i) => `<button data-action="vent:${i}" aria-pressed="${i === level}" ${this.demo || (valid(this.vent) && this.vent.attributes.options?.includes(this.options[i])) ? '' : 'disabled'}>${icon(fanIcon + (i === 0 ? 'M3 3l18 18' : ''))}<span>${name}</span></button>`).join('')}</div>
          ${band('Stoßlüftung · Timer', '--peach')}<div class="timer-row"><strong class="big" data-countdown></strong>
          <div data-timer-bar>${segments(Array(20).fill(null))}</div>
          <div class="actions">${['+10 min', 'Stop'].map((label, i) => `<button data-action="timer:${i}" ${this.demo || valid(this.timer) ? '' : 'disabled'}>${label}</button>`).join('')}</div></div></section>`;
        break;
      case 3:
        layout = `<section class="detail"><div class="cover-grid"><section>${band('Rollos · Alle Räume', '--purple')}${coverButtons}${band('Stromkreise', '--peach')}
            <div class="actions devices">${devices.map((device, i) => `<button data-action="switch:${i}" aria-pressed="${device.on}" ${device.ready ? '' : 'disabled'}>${escape(device.name)} · ${deviceLabel(device)}</button>`).join('')}</div></section>
          <section>${band('Position', '--purple')}<div class="window" aria-hidden="true"><div class="slats"></div></div><div class="cover-info">${position === null ? blindLabel : `${100 - position} % zu`}</div></section></div></section>`;
        break;
      case 4:
        layout = `<section class="detail">${band('Klima · Raumtemperaturen', '--sand')}
          ${rooms.map(room => `<div class="climate-row" style="--room-color:var(${room.value < 19 ? '--blue' : room.value < 21 ? '--purple' : '--peach'})"><div>${escape(room.name)}${room.stale ? `<br><small class="warn">Sensor still · vor ${room.age} min</small>` : room.age !== null ? `<br><small>Vor ${room.age} min</small>` : ''}</div>
          <div>${segments(Array.from({ length: 20 }, (_, i) => i < Math.round((room.mark ?? 0) / 5) ? (i < 8 ? '--blue' : i < 13 ? '--purple' : '--peach') : null))}<div class="numbers"><span>15°</span><span>20°</span><span>25°</span></div></div><strong>${room.display}</strong></div>`).join('') || 'Keine Daten'}</section>`;
        break;
    }
    this.shadowRoot.querySelector('footer .rail').textContent = [
      this.demo ? 'Demo' : '', level >= 0 ? 'Lüftung Stufe ' + levels[level] : 'Haus-Ops'
    ].filter(Boolean).join(' · ');
    const slats = main.querySelector('.slats');
    if (this.layout !== layout) {
      const focused = this.shadowRoot.activeElement;
      const action = main.contains(focused) && focused.dataset.action;
      main.innerHTML = layout;
      if (slats && main.querySelector('.slats')) main.querySelector('.slats').replaceWith(slats);
      if (action) [...main.querySelectorAll('[data-action]')].find(node => node.dataset.action === action)?.focus({ preventScroll: true });
      this.layout = layout;
    }
    main.querySelector('.slats')?.style.setProperty('--closed', position === null ? '0%' : `${100 - position}%`);
    this.shadowRoot.querySelectorAll('nav button').forEach((button, i) => button.setAttribute('aria-current', i === this.page));
    this.tick();
  }

  notify(text) {
    const notice = this.shadowRoot.querySelector('.notice');
    notice.textContent = text;
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => { notice.textContent = ''; }, 3000);
  }

  call(entity_id, service, data = {}) {
    return this.ha.callService(entity_id.split('.')[0], service, { entity_id, ...data });
  }

  async click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.page !== undefined) {
      this.page = Number(button.dataset.page);
      this.render();
      this.shadowRoot.querySelector('nav [aria-current=true]')?.focus({ preventScroll: true });
      return;
    }
    if (this.busy || !button.dataset.action) return;
    const [kind, index] = button.dataset.action.split(':');
    const i = Number(index);
    this.busy = true;
    try {
      switch (kind) {
        case 'access': {
          const item = this.accesses()[i];
          if (!item.lock) { this.notify('Sensor, nur Anzeige'); break; }
          if (this.demo) this.demoLocked = !this.demoLocked;
          else await this.call(item.entity, item.open ? 'lock' : 'unlock');
          break;
        }
        case 'vent':
          if (this.demo) this.demoLevel = i;
          else await this.call(this.config.ventilation.entity, 'select_option', { option: this.options[i] });
          break;
        case 'timer': {
          const seconds = this.remaining + 600;
          if (this.demo) {
            this.demoDuration = seconds;
            this.demoEnd = i ? 0 : Date.now() + seconds * 1000;
          } else {
            await this.call(this.config.timer, i ? 'cancel' : 'start', i ? {} : { duration: seconds });
          }
          break;
        }
        case 'cover':
          if (this.demo) this.demoPosition = i ? 100 : 0;
          else await this.call(this.config.cover, i ? 'open_cover' : 'close_cover');
          break;
        case 'switch':
          if (this.demo) this.demoSwitches[i] = !this.demoSwitches[i];
          else await this.call(this.config.switches[i].entity, 'toggle');
          break;
      }
    } catch {
      this.notify('Aktion fehlgeschlagen · Home Assistant prüfen');
    } finally {
      this.busy = false;
      this.render();
    }
  }
}

customElements.define('haus-ops', HausOps);
