import { energyFields, energyView } from './energy-panel.js';
import { ClimatePanel, roomNames } from './climate-panel.js';
const energyPageIndex = 6;
const pages = ['Übersicht', 'Sicherheit', 'Lüftung', 'Rollos', 'Klima', 'Garten'];
const managerLinks = [['Wasser', '/wassermanager', '--blue']];
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

  settings = new HausOpsSettings(this);
  climatePanel = new ClimatePanel(this);

  set hass(value) { this.ha = value; this.settings.load(value); this.render(); }
  set panel(value) { this.yamlConfig = value?.config; this.render(); }
  get config() { return this.savedConfig ?? this.yamlConfig; }
  get demo() { return this.hasAttribute('demo'); }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${new URL('./haus-ops.css', import.meta.url)}">
        <div class="stage"><div class="frame">
          <div class="brand">LCARS 77</div>
          <header><span class="rail"></span><strong>HAUS-OPS</strong><time></time><span class="cap"></span></header>
          <nav aria-label="Ansichten"><div class="nav-scroll">
            ${pages.slice(0,5).map((page, i) => `<button data-page="${i}" style="background:var(${colors[i]})">${page}</button>`).flatMap((button, i) => i === 0 ? [button, '<button data-page="6" style="background:var(--sand)">Energie</button>'] : [button]).join('')}
            ${managerLinks.map(([name, url, color]) => `<a href="${url}" style="background:var(${color})">${name}</a>`).join('')}
            <button data-page="5" style="background:var(--pink)">Garten</button>
          </div><button data-settings aria-label="82873.4 – Konfiguration" hidden>82873.4</button><p data-nav-spacer>82873.4</p><p data-frequency hidden></p></nav>
          <main></main><div class="heel"></div>
          <footer><span class="rail">${this.demo ? 'Demo · System bereit' : 'System bereit'}</span><span class="cap"></span></footer>
        </div><div class="notice" role="status"></div></div>`;
      this.shadowRoot.addEventListener('click', event => this.click(event));
      this.bindNavigationSwipe();
    }
    try { this.blindSelection = localStorage.getItem('haus-ops.blind-selection') || 'all'; } catch {}
    this.resize = new ResizeObserver(() => {
      this.style.setProperty('--scale', Math.min(this.clientWidth / 800, this.clientHeight / 480));
    });
    this.resize.observe(this);
    this.render();
    this.tick();
    this.clock = setInterval(() => { this.tick(); this.render(); }, 1000);
  }

  bindNavigationSwipe() {
    const navigation = this.shadowRoot.querySelector('.nav-scroll');
    let gesture;
    let suppressClick = false;
    navigation.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (event.pointerType === 'touch' && event.isPrimary) {
        gesture = { id: event.pointerId, y: event.clientY };
      }
    });
    navigation.addEventListener('pointercancel', () => { gesture = undefined; });
    navigation.addEventListener('pointerup', event => {
      if (gesture?.id !== event.pointerId) return;
      const delta = gesture.y - event.clientY;
      gesture = undefined;
      const scale = navigation.getBoundingClientRect().height / navigation.clientHeight;
      if (Math.abs(delta) < 24 * scale) return;
      suppressClick = true;
      const [first, second] = navigation.children;
      const step = second.offsetTop - first.offsetTop;
      const blocks = Math.max(1, Math.round(Math.abs(delta) / (step * scale)));
      navigation.scrollTo({
        top: (Math.round(navigation.scrollTop / step) + Math.sign(delta) * blocks) * step,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
    navigation.addEventListener('click', event => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true });
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
        : ({ on: true, off: false, open: true, closed: false, opening: true, closing: true })[state] };
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

  get vent() { return this.state(trafo.entity); }
  get volts() {
    return valid(this.vent) && this.vent.state.trim() ? Number(this.vent.state) : NaN;
  }
  get level() {
    if (this.demo) return this.demoLevel;
    if (Number.isFinite(this.volts)) return trafo.volts.findIndex(volts => Math.abs(volts - this.volts) < 0.05);
    return this.legacyVent?.options?.indexOf(this.state(this.legacyVent.entity)?.state) ?? -1;
  }
  get legacyVent() { return this.config?.ventilation; }
  canSetLevel(index) {
    return this.demo || valid(this.state(trafo.buttons[index]))
      || Boolean(this.legacyVent?.options?.[index] && valid(this.state(this.legacyVent.entity)));
  }
  get timer() { return this.state(this.config?.timer); }
  get cover() { return this.state(this.config?.cover); }

  coverTarget(index) {
    return (index ? this.config?.cover_up : this.config?.cover_down) || this.config?.cover;
  }

  coverService(entity, index) {
    switch (entity.split('.')[0]) {
      case 'cover': return index ? 'open_cover' : 'close_cover';
      case 'button':
      case 'input_button': return 'press';
      case 'script':
      case 'scene':
      case 'switch': return 'turn_on';
      default: return null;
    }
  }

  canMoveCover(index) {
    const entity = this.coverTarget(index);
    return this.demo || Boolean(entity && valid(this.state(entity)) && this.coverService(entity, index));
  }

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
    const offline = this.page === 4 && !this.demo && this.ha?.connection?.connected === false;
    clock.classList.toggle('offline', offline);
    clock.textContent = offline ? 'Offline' : new Date().toLocaleTimeString('de-DE', this.page === 4
      ? {hour:'2-digit', minute:'2-digit'} : undefined);
    const seconds = this.remaining;
    const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    this.shadowRoot.querySelectorAll('[data-countdown]').forEach(node => { node.textContent = formatted; });
    this.shadowRoot.querySelectorAll('[data-timer-bar] i').forEach((node, index, all) => {
      const duration = this.demo ? this.demoDuration ?? 600 : (this.timer?.attributes?.duration || '0:10:00')
        .split(':').reduce((total, part) => total * 60 + Number(part), 0);
      node.style.background = index < Math.ceil(seconds / (duration || 600) * all.length) ? 'var(--peach)' : '';
    });
  }

  blindSelection = 'all';
  demoBlinds = [100, 60, 0];

  blinds() {
    return blindFields.map(([key, label, , , fallback], index) => {
      const configured = this.config?.blinds?.find(item => item.key === key);
      const entity = configured?.entity || fallback;
      const state = this.state(entity);
      const available = this.demo || (this.ha?.connection?.connected !== false && valid(state));
      const raw = state?.attributes?.current_position;
      const position = this.demo ? this.demoBlinds[index] : !available ? null
        : Number.isFinite(raw) ? Math.max(0, Math.min(100, raw))
        : state.state === 'closed' ? 0 : null;
      const movement = ({ opening: 'auf', closing: 'ab' })[state?.state];
      const status = !available ? 'Keine Verbindung' : position === 100 ? 'Offen'
        : position === 0 ? 'Zu' : position === null ? 'Keine Position' : `${position} % offen`;
      return { key, name: configured?.name || label, entity, available, position, movement, status,
        features: this.demo ? 15 : state?.attributes?.supported_features ?? 0, index };
    });
  }

  selectedBlind() {
    const helper = this.state(this.config?.blind_selection || 'input_select.rollo_auswahl');
    const selection = this.pendingBlindSelection ?? (valid(helper) && helper.attributes?.options?.length
      ? helper.state : this.blindSelection);
    return this.blinds().some(blind => blind.key === selection) ? selection : 'all';
  }

  renderBlinds(devices) {
    const blinds = this.blinds();
    const selection = this.selectedBlind();
    const all = selection === 'all';
    const selected = blinds.find(blind => blind.key === selection);
    const targets = blinds.filter(blind => all || blind === selected);
    const enabled = feature => targets.some(blind => blind.available && (blind.features & feature));
    return `<div class="blind-page"><section>
      ${band('Fenster wählen', '--purple')}
      <div class="blind-select">
        ${[{key:'all',name:'Alle',status:'3 Fenster'}, ...blinds].map(blind =>
          `<button data-action="blind-select:${blind.key}" aria-pressed="${selection === blind.key}"><strong>${escape(blind.name)}</strong><small>${blind.status}</small></button>`).join('')}
      </div>
      ${band('Steuerung · ' + escape(selected?.name ?? 'Alle Fenster'), '--peach')}
      <div class="blind-controls">
        ${blindCommands.slice(0, 3).map(([label, , feature, movement, arrow], index) =>
          `<button data-action="blind-command:${index}" class="${movement && targets.some(blind => blind.movement === movement) ? 'moving' : ''}" ${enabled(feature) ? '' : 'disabled'}>${arrow ? `<span aria-hidden="true">${arrow}</span>` : ''}${label}</button>`).join('')}
      </div>
      <div class="blind-presets">${blindCommands.slice(3).map(([label, , feature], index) =>
        `<button data-action="blind-command:${index + 3}" ${enabled(feature) ? '' : 'disabled'}>${label}</button>`).join('')}</div>
      ${band('Stromkreise', '--pink')}
      <div class="blind-power">${devices.map((device, i) =>
        `<button data-action="switch:${i}" aria-pressed="${device.on}" ${device.ready ? '' : 'disabled'}>${escape(device.name)} · ${device.ready ? device.on ? 'An' : 'Aus' : 'Keine Daten'}</button>`).join('')}</div>
    </section><section>
      ${band('Position', '--purple')}
      <div class="blind-windows">${blinds.map(blind =>
        `<button data-action="blind-frame:${blind.key}" aria-pressed="${all || blind === selected}" class="${blind.available ? '' : 'unavailable'}">
          <span class="blind-window"><span data-slats="${blind.key}"></span></span>
          <strong>${escape(blind.name)}</strong><small>${blind.position === null ? 'Keine Daten' : `${100 - blind.position} %`}</small>
        </button>`).join('')}</div>
    </section></div>`;
  }

  async selectBlind(key) {
    this.blindSelection = key;
    try { localStorage.setItem('haus-ops.blind-selection', key); } catch {}
    const helper = this.config?.blind_selection || 'input_select.rollo_auswahl';
    const options = this.state(helper)?.attributes?.options;
    const option = key === 'all' && options?.includes('alle') ? 'alle' : key;
    if (!options?.includes(option)) return;
    this.pendingBlindSelection = key;
    this.render();
    try { await this.call(helper, 'select_option', { option }); }
    finally { this.pendingBlindSelection = undefined; }
  }

  async moveBlinds(index) {
    const [, service, feature] = blindCommands[index];
    const selection = this.selectedBlind();
    const targets = this.blinds().filter(blind => (selection === 'all' || selection === blind.key)
      && blind.available && (blind.features & feature));
    const configured = this.config?.blind_presets?.[index - 3];
    const closed = configured === undefined ? [0, 50, 80][index - 3] : Number(configured);
    const position = Math.round(100 - Math.max(0, Math.min(100, closed)));
    if (this.demo) {
      targets.forEach(blind => {
        if (index !== 1) this.demoBlinds[blind.index] = index === 0 ? 0 : index === 2 ? 100 : position;
      });
      return;
    }
    const ids = [...new Set(targets.map(blind => blind.entity))];
    if (ids.length) await this.ha.callService('cover', service,
      { entity_id: ids, ...(index >= 3 ? { position } : {}) });
  }

  render() {
    const main = this.shadowRoot?.querySelector('main');
    if (!main) return;
    const energy = this.page === energyPageIndex ? energyView(this) : null;
    const canConfigure = Boolean(this.ha?.user?.is_admin);
    this.shadowRoot.querySelector('[data-settings]').hidden = !canConfigure || Boolean(energy);
    this.shadowRoot.querySelector('[data-nav-spacer]').hidden = canConfigure || Boolean(energy);
    const frequency = this.shadowRoot.querySelector('[data-frequency]');
    frequency.hidden = !energy;
    frequency.textContent = energy?.hz ?? '';
    const accesses = this.accesses();
    const open = accesses.filter(item => item.open);
    const complete = accesses.length > 0 && accesses.every(item => item.open !== undefined);
    const alarm = open.length ? `${open.length} offen` : complete ? 'Gesichert' : 'Status unvollständig';
    const accessLabel = item => item.open === undefined ? 'Keine Daten' : item.lock
      ? (item.open ? 'Entriegelt' : 'Verriegelt') : (item.open ? 'Offen' : 'Geschlossen');
    const rooms = this.temperatures();
    const level = this.level;
    const voltage = !this.demo && Number.isFinite(this.volts) ? `${this.volts.toLocaleString('de-DE')} V` : '';
    const ventLabel = level >= 0 ? 'Stufe ' + levels[level] : voltage || 'Keine Daten';
    const blind = this.cover;
    const blindLabel = this.demo ? (this.demoPosition ? 'Geöffnet' : 'Geschlossen')
      : ({ opening: 'Fährt auf', closing: 'Fährt ab', open: 'Offen', closed: 'Geschlossen' })[blind?.state] ?? 'Keine Daten';
    const devices = this.demo ? ['TV Strom', 'Schreibtisch'].map((name, i) => ({ name, on: this.demoSwitches[i], ready: true }))
      : (this.config?.switches ?? []).map(({ name, entity }) => ({
        name, on: this.state(entity)?.state === 'on', ready: valid(this.state(entity))
      }));
    const deviceLabel = device => device.ready ? (device.on ? 'An' : 'Aus') : 'Keine Daten';
    const coverButtons = `<div class="actions">${['ab', 'auf'].map((action, index) =>
      `<button data-action="cover:${index}" ${this.canMoveCover(index) ? '' : 'disabled'}><span aria-hidden="true">${index ? '↑' : '↓'}</span> Alle ${action}</button>`).join('')}</div>`;
    let layout;
    switch (this.page) {
      case 0:
        layout = `<div class="overview">
          <section style="gap:5px">${band('Sicherheit', '--red')}<button class="summary" data-page="1">
            <strong class="big ${open.length ? 'alarm' : ''}" style="min-height:46px;display:flex;align-items:center;${open.length ? 'color:var(--red)' : ''}">${alarm}</strong>
            <span style="min-height:20px;line-height:20px">${open.length ? escape(open[0].name) + ' ' + accessLabel(open[0]) : 'Zugänge'}</span>
            ${segments(accesses.map(item => item.open === undefined ? null : item.open ? '--red' : '--purple'))}
          </button></section>
          <section style="gap:5px">${band('Hauslüftung', '--pink')}
            <button class="summary vent-open" style="flex:0 0 auto;min-height:46px" data-page="2"><span class="row vent-summary"><strong class="big">${ventLabel}</strong></span></button>
            <span style="min-height:20px;line-height:20px">Aus · Low · 1 · 2 · Max</span>
            <div class="segments vent-controls" role="group" aria-label="Lüftungsstufen">${levels.map((name, i) =>
              `<button data-action="vent:${i}" aria-label="${name}" aria-pressed="${i === level}" ${this.canSetLevel(i) ? '' : 'disabled'} style="background:${i === level && i > 0 ? 'var(--peach)' : '#262626'};min-width:0;flex:1;height:14px;border-radius:1px;padding:0"></button>`).join('')}</div>
          </section>
          <section class="roll-summary"><button class="band" style="--band:var(--purple)" data-page="3">Rollos</button>
            ${coverButtons}<span class="small">${blindLabel}${devices.map(device => ' · ' + escape(device.name) + ' ' + deviceLabel(device)).join('')}</span>
          </section>
          <section>${band('Klima · Quartiere', '--sand')}<button class="summary" data-page="4">
            ${rooms.map(room => `<span class="row"><span>${escape(room.name)} ${room.stale ? '<small class="warn">· Still</small>' : ''}</span><strong style="color:var(${room.value < 19 ? '--blue' : room.value < 21 ? '--purple' : '--peach'})">${room.display}</strong></span>`).join('') || 'Keine Daten'}
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
        layout = `<section class="detail">${band(voltage ? 'Hauslüftung · ' + voltage : 'Hauslüftung · Stufe', '--pink')}
          <div class="levels">${levels.map((name, i) => `<button data-action="vent:${i}" aria-pressed="${i === level}" ${this.canSetLevel(i) ? '' : 'disabled'}>${icon(fanIcon + (i === 0 ? 'M3 3l18 18' : ''))}<span>${name}</span></button>`).join('')}</div>
          ${band('Stoßlüftung · Timer', '--peach')}<div class="timer-row"><strong class="big" data-countdown></strong>
          <div data-timer-bar>${segments(Array(20).fill(null))}</div>
          <div class="actions">${['+10 min', 'Stop'].map((label, i) => `<button data-action="timer:${i}" ${this.demo || valid(this.timer) ? '' : 'disabled'}>${label}</button>`).join('')}</div></div></section>`;
        break;
      case 3:
        layout = this.renderBlinds(devices);
        break;
      case 4:
        layout = this.climatePanel.render();
        break;
      case energyPageIndex:
        layout = energy.layout;
        break;
      case 5:
        layout = `<section class="detail">${band('Garten', '--pink')}<p>Gartenansicht noch ohne Inhalte</p></section>`;
        break;
    }
    const climatePage = this.page === 4;
    this.shadowRoot.querySelector('.frame').classList.toggle('climate-page', climatePage);
    this.shadowRoot.querySelector('header strong').textContent = energy ? 'Energie' : climatePage ? 'Klima' : this.page === 3 ? 'Rollos' : 'HAUS-OPS';
    this.shadowRoot.querySelector('footer .rail').textContent = [
      this.demo ? 'Demo' : '', level >= 0 ? 'Lüftung Stufe ' + levels[level] : 'Haus-Ops'
    ].filter(Boolean).join(' · ');
    const footer = this.shadowRoot.querySelector('footer .rail');
    const blinds = this.page === 3 ? this.blinds() : [];
    footer.classList.toggle('blind-error', Boolean(energy?.warning) || blinds.some(blind => !blind.available));
    if (energy) footer.textContent = energy.status;
    if (blinds.length) {
      const moving = blinds.filter(blind => blind.available && blind.movement);
      const status = (moving.length ? moving : blinds.filter(blind => blind.available)).map(blind =>
        `${blind.name} ${blind.movement ? `fährt ${blind.movement}${blind.position === null ? '' : ` ${100 - blind.position} %`}` : blind.status}`);
      footer.textContent = [...blinds.filter(blind => !blind.available).map(blind => `${blind.name} keine Verbindung`),
        ...(!moving.length && status.length ? ['Bereit'] : []), ...status].join(' · ');
    }
    const flows = [...main.querySelectorAll('[data-energy-flow]')];
    const slats = [...main.querySelectorAll('[data-slats]')];
    if (this.layout !== layout) {
      const focused = this.shadowRoot.activeElement;
      const action = main.contains(focused) && focused.dataset.action;
      main.innerHTML = layout;
      flows.forEach(node => {
        const next = main.querySelector(`[data-energy-flow="${node.dataset.energyFlow}"]`);
        if (!next) return;
        node.style.setProperty('--share', next.style.getPropertyValue('--share'));
        node.title = next.title;
        node.textContent = next.textContent;
        next.replaceWith(node);
      });
      slats.forEach(node => main.querySelector(`[data-slats="${node.dataset.slats}"]`)?.replaceWith(node));
      if (action) [...main.querySelectorAll('[data-action]')].find(node => node.dataset.action === action)?.focus({ preventScroll: true });
      this.layout = layout;
    }
    blinds.forEach(blind => main.querySelector(`[data-slats="${blind.key}"]`)
      ?.style.setProperty('height', `${blind.position === null ? 0 : 100 - blind.position}%`));
    this.shadowRoot.querySelectorAll('nav [data-page]').forEach(button =>
      button.setAttribute('aria-current', Number(button.dataset.page) === this.page));
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
    if (button.hasAttribute('data-settings')) { this.settings.open(); return; }
    if (button.dataset.page !== undefined) {
      this.page = Number(button.dataset.page);
      this.render();
      this.shadowRoot.querySelector('nav [aria-current=true]')?.focus({ preventScroll: true });
      return;
    }
    if (!button.dataset.action) return;
    const step = /^climate-(plus|minus|cancel):(\d+)$/.exec(button.dataset.action);
    if (step) {
      this.climatePanel.change(Number(step[2]), {plus:1,minus:-1,cancel:0}[step[1]]);
      return;
    }
    if (this.busy) return;
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
          else if (valid(this.state(trafo.buttons[i]))) await this.call(trafo.buttons[i], 'press');
          else if (this.canSetLevel(i)) await this.call(this.legacyVent.entity, 'select_option',
            { option: this.legacyVent.options[i] });
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
          else if (this.canMoveCover(i)) {
            const entity = this.coverTarget(i);
            await this.call(entity, this.coverService(entity, i));
          }
          break;
        case 'blind-select':
        case 'blind-frame':
          await this.selectBlind(index);
          break;
        case 'blind-command':
          await this.moveBlinds(i);
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

const trafo = {
  entity: 'number.trafocurrentvolt',
  buttons: ['input_button.trafo_button', 'input_button.trafo_button_80',
    'input_button.trafo_button_150', 'input_button.trafo_button_175', 'input_button.trafo_button_230'],
  volts: [0, 80, 150, 175, 230],
};
const settingsKey = 'haus_ops.entities';
const blindCommands = [
  ['Ab', 'close_cover', 2, 'ab', '↓'],
  ['Stop', 'stop_cover', 8],
  ['Auf', 'open_cover', 1, 'auf', '↑'],
  ['Offen', 'set_cover_position', 4],
  ['Halb', 'set_cover_position', 4],
  ['Schatten', 'set_cover_position', 4],
];
const blindFields = [
  ['wohnen', 'Wohnen', ['cover'], 'Rollo Wohnen', 'cover.rollo_wohnen'],
  ['kueche', 'Küche', ['cover'], 'Rollo Küche', 'cover.rollo_kueche'],
  ['terrasse', 'Terrasse', ['cover'], 'Rollo Terrasse', 'cover.rollo_terrasse'],
];
const entityFields = [
  ['Energie', energyFields],
  ['Sicherheit', [
    ['access.0', 'Garagentor', ['binary_sensor', 'cover']],
    ['access.1', 'Garagentür', ['binary_sensor']],
    ['access.2', 'Türschloss', ['lock', 'binary_sensor']],
    ['access.3', 'Haustür', ['binary_sensor']],
    ['access.4', 'CA Fenster', ['binary_sensor']],
    ['access.5', 'KU Fenster', ['binary_sensor']],
    ['access.6', 'Terrasse', ['binary_sensor']],
    ['access.7', 'AZ Fenster', ['binary_sensor']],
  ]],
  ['Lüftung', [
    ['timer', 'Stoßlüftungstimer', ['timer']],
  ]],
  ['Rollos und Strom', [
    ['cover_down', 'Alle Rollos ab', ['cover', 'button', 'input_button', 'script', 'scene', 'switch']],
    ['cover_up', 'Alle Rollos auf', ['cover', 'button', 'input_button', 'script', 'scene', 'switch']],
    ['cover', 'Cover-Gruppe für die Übersicht', ['cover']],
    ...blindFields.map(([key, ...field]) => [`blinds.${key}`, ...field]),
    ['blind_selection', 'Auswahl-Helfer (optional)', ['input_select']],
    ['switches.0', 'TV Strom', ['switch']],
    ['switches.1', 'Schreibtisch', ['switch']],
  ]],
  ...[...roomNames, 'Bad'].map((name, i) => [`Klima · ${name}`, [
    [`climate.${i}`, name, ['sensor'], 'Temperatursensor'],
    ...(!['Schlafzimmer','Bad'].includes(name) ? [
      [`thermostats.${i}`, name, ['climate'], 'Thermostat'],
      [`schedules.${i}`, name, ['sensor'], 'Zeitplan-Sensor'],
      [`valves.${i}`, name, ['number','sensor'], 'Ventile (kommagetrennt)'],
    ] : []),
  ]]),
  ['Klima · Heizungsaktionen', [
    ['override_script', 'Übersteuerung starten', ['script']],
    ['cancel_script', 'Übersteuerung beenden', ['script']],
  ]],
];
const isTemperature = entity => entity.attributes.device_class === 'temperature'
  || ['°C', '°F'].includes(entity.attributes.unit_of_measurement);

class HausOpsSettings {
  constructor(panel) { this.panel = panel; }

  async load(hass) {
    if (!hass?.callWS || this.loading) return;
    this.loading = true;
    try {
      const { value } = await hass.callWS({ type: 'frontend/get_system_data', key: settingsKey });
      this.panel.savedConfig = value ?? undefined;
      this.panel.render();
    } catch {
      this.panel.notify('HAUS-OPS-Konfiguration konnte nicht geladen werden');
    }
  }

  open() {
    const panel = this.panel;
    if (!panel.ha?.user?.is_admin || this.dialog?.open) return;
    const config = panel.config ?? {};
    const existing = key => {
      const [group, index] = key.split('.');
      const field = config[group];
      if (group === 'energy') return field?.[index];
      if (group === 'blinds') return field?.find(item => item.key === index)?.entity;
      if (group === 'valves') return field?.[roomNames[index]]?.join(', ');
      if (index !== undefined) {
        const label = entityFields.flatMap(([, fields]) => fields).find(([id]) => id === key)[1];
        return (field ?? []).find(item => item.name === label)?.entity ?? '';
      }
      return field;
    };
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'settings';
    this.dialog.innerHTML = `<style>
      .settings{box-sizing:border-box;width:min(680px,96vw);height:min(680px,94dvh);max-height:94dvh;padding:0;overflow:hidden;border:2px solid #ff995f;border-radius:16px;background:#121014;color:#ffe3cd;font:16px system-ui;text-transform:none}
      .settings form{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto auto}.settings .fields{overflow:auto;padding:0 18px}.settings::backdrop{background:#000b}.settings h2{margin:0;padding:14px 18px;color:#ff995f}.settings fieldset{margin:12px 0;border:1px solid #77617a;border-radius:10px;padding:10px}
      .settings legend{color:#cd9bd0;font-weight:700}.settings label{display:grid;gap:4px;margin-bottom:8px}.settings input{min-height:44px;width:100%;max-width:100%;background:#26212b;color:#fff;border:1px solid #a19aff;border-radius:6px;padding:6px;font:inherit}
      .settings .controls{background:#121014;padding:9px 18px;border-top:1px solid #77617a;display:flex;gap:8px;justify-content:flex-end}.settings button{min-height:48px;padding:0 14px;border-radius:8px}.settings [role=status]{color:#ffcc99;margin:0;padding:4px 18px}.settings [role=status]:empty{display:none}.settings [type=submit]{background:#ff995f;font-weight:800}
    </style><form><h2>HAUS-OPS konfigurieren</h2><div class="fields">
      ${entityFields.map(([title, fields]) => `<fieldset><legend>${title}</legend>${fields.map(([key, label, , caption]) =>
        `<label>${caption ?? label}<input name="${key}" value="${escape(existing(key))}" placeholder="Entitäts-ID" spellcheck="false" autocapitalize="none"></label>`).join('')}
        ${title === 'Rollos und Strom' ? blindFields.map(([key, label]) =>
          `<label>Anzeigename · ${label}<input name="blind-name.${key}" maxlength="24" value="${escape(config.blinds?.find(item => item.key === key)?.name || label)}"></label>`).join('') +
          blindCommands.slice(3).map(([label], index) =>
            `<label>${label} · % geschlossen<input type="number" min="0" max="100" name="blind-preset.${index}" value="${escape(config.blind_presets?.[index] ?? [0, 50, 80][index])}"></label>`).join('') : ''}
        ${title === 'Lüftung' ? '<p>Stufensteuerung über Trafo-Helfer</p>' : ''}</fieldset>`).join('')}
      </div><p role="status"></p><div class="controls"><button type="button" data-cancel>Abbrechen</button><button type="submit">OK</button></div></form>`;
    const form = this.dialog.querySelector('form');
    this.dialog.querySelector('[data-cancel]').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => this.dialog.remove(), { once: true });
    form.addEventListener('submit', event => {
      event.preventDefault();
      this.save(form);
    });
    panel.shadowRoot.append(this.dialog);
    this.dialog.showModal();
  }

  async save(form) {
    const data = new FormData(form);
    const submit = form.querySelector('[type=submit]');
    const status = form.querySelector('[role=status]');
    const next = { energy: {}, ventilation: this.panel.config?.ventilation, blinds: blindFields.map(([key, label]) => ({ key, name: data.get(`blind-name.${key}`)?.trim() || label })),
      blind_presets: [0, 50, 80].map((fallback, index) => {
        const value = data.get(`blind-preset.${index}`);
        return value ? Number(value) : fallback;
      }), access: [], switches: [], climate: [], thermostats: [], schedules: [], valves: {} };
    for (const [, fields] of entityFields) {
      for (const [key, name, domains] of fields) {
        const entity = data.get(key)?.trim();
        if (!entity) continue;
        const [group, index] = key.split('.');
        const ids = group === 'valves' ? entity.split(',').map(id => id.trim()).filter(Boolean) : [entity];
        if (!ids.length || ids.some(id => !domains.includes(id.split('.')[0]) || !this.panel.ha.states[id])) {
          status.textContent = `${name}: Bitte eine vorhandene passende Entitäts-ID eingeben.`;
          return;
        }
        if (group === 'valves') next.valves[name] = ids;
        else if (group === 'energy') next.energy[index] = entity;
        else if (group === 'blinds') next.blinds.find(blind => blind.key === index).entity = entity;
        else if (index !== undefined) next[group].push({ name, entity });
        else next[group] = entity;
      }
    }
    submit.disabled = true;
    try {
      await this.panel.ha.callWS({ type: 'frontend/set_system_data', key: settingsKey, value: next });
      this.panel.savedConfig = next;
      this.panel.render();
      this.dialog.close();
      this.panel.notify('Konfiguration gespeichert');
    } catch {
      status.textContent = 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
      submit.disabled = false;
    }
  }
}

customElements.define('haus-ops', HausOps);
