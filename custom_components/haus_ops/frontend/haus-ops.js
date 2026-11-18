import {loadPVActual,pvDayView,bindPVDay} from './pv-day-panel.js?v=1.6.48';
import { setupSettingsLayout } from './settings-layout.js?v=1.6.48';
import { MobileNotifications } from './mobile-notifications.js?v=1.6.48';
import { nightDisplayOff } from './display-night.js?v=1.6.48';
import {loadPV,pvView} from './pv-panel.js?v=1.6.48';
import { LightPanel } from './light-panel.js?v=1.6.48';
import { CircuitsPanel } from './circuits-panel.js?v=1.6.48';
import { OverviewPanel, overviewFields } from './overview-panel.js?v=1.6.48';
import { MusicPanel, musicFields } from './music-panel.js?v=1.6.48';
import { WaterPanel, waterFields } from './water-panel.js?v=1.6.48';
import { energyFields, energyView } from './energy-panel.js?v=1.6.48';
import { ClimatePanel, roomNames } from './climate-panel.js';
const antonio = new FontFace('Antonio', `url("${new URL('./Antonio.ttf', import.meta.url).href}")`, {
  weight: '400 700',
  display: 'swap',
});
document.fonts.add(antonio);

const energyPageIndex = 6;
const waterPageIndex = 7;
const musicPageIndex = 8;
const circuitsPageIndex = 10;
const navigation = [
  [0, 'Übersicht', '01-47', '--sand'],
  [circuitsPageIndex, 'Stromkreise', '03-318', '--purple'],
  [energyPageIndex, 'Energie', '02-112', '--sand'],
  [waterPageIndex, 'Wasser', '03-309', '--blue'],
  [9, 'Licht', '10-301', '--sand'],
  [musicPageIndex, 'Musik', '04-415', '--pink'],
  [1, 'Sicherheit', '05-88', '--red'],
  [2, 'Lüftung', '06-260', '--pink'],
  [3, 'Rollos', '07-384', '--purple'],
  [4, 'Klima', '08-517', '--sand'],
  [5, 'Garten', '09-642', '--pink'],
];
const redAlarmLabel = 'Roter Alarm';
const redAlarmFile = 'red_alert.mp3';
const soundSlots = [
  ['beep1', 'Beep 1', 'beep1.mp3'],
  ['error', 'Ohne Funktion', 'error.mp3'],
  ['beep2', 'Beep 2', 'computer_work_beep.mp3'],
  ['beep3', 'Beep 3', 'beep3.mp3'],
  ['beep4', 'Beep 4', ''],
  ['beep5', 'Beep 5', 'beep5.mp3'],
  ['beep6', 'Beep 6', 'beep6.mp3'],
  ['red', redAlarmLabel, redAlarmFile],
  ['yellow', 'Yellow Alert', 'yellow_alert.mp3'],
  ['warp', 'Warp Sound · Energiekern', 'warp_core_loop.wav'],
];
const validSoundName = value => /^[^/\\?#]+\.(mp3|wav|ogg|m4a)$/i.test(value);
const dashboardVolumePreference = 'haus-ops.dashboard-volume';
const touchSoundPreference = 'haus-ops.touch-sounds';
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
  circuits = new CircuitsPanel(this);
  lightsPanel = new LightPanel(this);
  water = new WaterPanel(this);
  overview = new OverviewPanel(this);
  music = new MusicPanel(this);
  climatePanel = new ClimatePanel(this);

  set hass(value) { this.ha = value; this.settings.load(value); this.render(); }
  set panel(value) { this.yamlConfig = value?.config; this.render(); }
  get config() { return this.savedConfig ?? this.yamlConfig; }
  get demo() { return this.hasAttribute('demo'); }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${new URL('./haus-ops.css?v=1.6.48', import.meta.url)}">
        <div class="stage"><div class="frame">
          <div class="brand">LCARS 77</div>
          <header><span class="rail"></span><span class="overview-data" aria-hidden="true" hidden></span><span class="overview-rail" aria-hidden="true" hidden></span><strong>HAUS-OPS</strong><time></time><span class="cap"></span></header>
          <nav aria-label="Ansichten"><div class="nav-scroll">
            ${navigation.map(([page, name, code, color]) =>
              `<button data-page="${page}" style="background:var(${color})"><small aria-hidden="true">${code}</small><span>${name}</span></button>`
            ).join('')}
          </div><p data-frequency hidden></p></nav>
          <main></main><div class="alarm-layer" hidden></div><div class="heel"><button data-settings aria-label="82873.4 – Konfiguration" hidden>82873.4</button><button data-nav-spacer aria-label="82873.4 – Konfiguration, Administrator erforderlich">82873.4</button></div>
          <footer><span class="rail">${this.demo ? 'Demo · System bereit' : 'System bereit'}</span><span class="cap"></span></footer>
        </div><div class="notice" role="status"></div></div>`;
      this.shadowRoot.addEventListener('click', event => this.click(event));
      this.bindNavigationSwipe();
    }
    this.blindInputEvents = new AbortController();
    const options = {signal:this.blindInputEvents.signal};
    const settingsButton = this.shadowRoot.querySelector('[data-settings]');
    let settingsTouch;
    settingsButton.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      settingsTouch = {id:event.pointerId,x:event.clientX,y:event.clientY};
    },options);
    settingsButton.addEventListener('pointerup', event => {
      const touch = settingsTouch;
      settingsTouch = undefined;
      if (!touch || touch.id !== event.pointerId ||
          Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>12) return;
      event.preventDefault();
      this.settings.open();
    },options);
    settingsButton.addEventListener('pointercancel', () => { settingsTouch = undefined; },options);
    const recordActivity = () => {
      this.lastDisplayActivity = performance.now();
      this.updateDisplayBrightness(false);
    };
    recordActivity();
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'wheel', 'click']) {
      window.addEventListener(type, recordActivity, {...options, capture:true, passive:true});
    }
    this.shadowRoot.addEventListener('pointermove', event => {
      if (event.buttons) recordActivity();
    }, {...options, capture:true, passive:true});

    this.bindLightMouseScroll(options);
    this.bindOverviewDimmer(options);
    this.bindWarningHold(options);
    this.shadowRoot.addEventListener('pointerdown', event => {
      if (event.target.matches('[data-light-range]:enabled')) this.lightDrag = event.pointerId;
      if (!event.target.matches('[data-blind-position]:enabled') || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      this.draggingBlind = event.pointerId;
      event.target.setPointerCapture(event.pointerId);
      event.target.closest('.blind-window').classList.add('dragging');
      this.moveBlindDrag(event);
    }, options);
    for (const name of ['pointerup', 'pointercancel']) {
      window.addEventListener(name, event => {
        if (this.lightDrag === event.pointerId) requestAnimationFrame(() => {
          this.lightDrag = undefined;
          this.render();
        });
      }, options);
    }
    this.shadowRoot.addEventListener('pointermove', event => {
      if (this.draggingBlind === event.pointerId) this.moveBlindDrag(event);
    }, options);
    for (const name of ['pointerup','pointercancel','lostpointercapture']) {
      this.shadowRoot.addEventListener(name, event => {
        if (this.draggingBlind !== event.pointerId) return;
        delete this.draggingBlind;
        event.target.closest('.blind-window')?.classList.remove('dragging');
        if (name === 'pointerup') {
          this.moveBlindDrag(event);
          void this.setBlindPosition(event.target);
        } else this.render();
      }, options);
    }
    this.shadowRoot.addEventListener('input', event => {
      if (event.target.matches('[data-light-range]')) {
        event.target.closest('[data-light-column]').style.setProperty('--level', event.target.value+'%');
      }
      if (event.target.matches('[data-blind-position]')) this.previewBlindPosition(event.target);
    }, options);
    this.shadowRoot.addEventListener('change', event => {
      if (event.target.matches('[data-light-range]')) {
        const {dataset,value} = event.target;
        this.lightsPanel.act('level',dataset.lightRange,value)
          .catch(()=>this.notify('Licht konnte nicht eingestellt werden')).finally(()=>this.render());
      }
      if (event.target.matches('[data-blind-position]')) void this.setBlindPosition(event.target);
    }, options);
    try { this.blindSelection = localStorage.getItem('haus-ops.blind-selection') || 'all'; } catch {}
    this.resize = new ResizeObserver(() => {
      const width = this.clientWidth;
      const height = this.clientHeight;
      if (!width || !height) return;
      // Switch at the midpoint between the two landscape aspect ratios.
      const tallLandscape = width / height < (800 / 480 + 1920 / 1200) / 2;
      const layoutHeight = tallLandscape ? 500 : 480;
      this.toggleAttribute('data-tall-landscape', tallLandscape);
      const scale = Math.min(width / 800, height / layoutHeight);
      if (scale <= 0) return;
      this.style.setProperty('--scale', scale);
      this.style.setProperty('--stage-width', (width / scale) + 'px');
      this.style.setProperty('--stage-height', (height / scale) + 'px');
    });
    this.resize.observe(this);
    const navigationViewport = this.shadowRoot.querySelector('.nav-scroll');
    this.navigationResize = new ResizeObserver(() => {
      const height = navigationViewport.clientHeight;
      const count = Math.max(1,Math.floor((height+3)/57));
      navigationViewport.style.setProperty('--nav-block', ((height-(count-1)*3)/count)+'px');
    });
    this.navigationResize.observe(navigationViewport);
    this.render();
    this.tick();
    this.lightDataClock = setInterval(() => this.updateLightData(), 160);
    this.overviewDataClock = setInterval(() => this.updateOverviewData(),700);
    this.clock = setInterval(() => { this.tick(); this.render(); }, 1000);
  }

  yellowWarnings() {
    this.yellowMuted ??= new Map();
    return (this.config?.yellow_alerts ?? []).flatMap(id => {
      const state = this.state(id);
      if (!['on','off'].includes(state?.state)) {
        this.yellowMuted.delete(id);
        return [];
      }
      const muted = this.yellowMuted.get(id);
      const status = state.state === 'off' ? 'quittiert'
        : muted?.since === state.last_changed && muted.until > Date.now() ? 'stumm' : 'neu';
      return [{id,name:state.attributes.friendly_name || id, since:state.last_changed,status}];
    });
  }

  warningView(warnings) {
    const selected = warnings.find(item=>item.id===this.selectedWarning) ?? warnings[0];
    const time = item => new Date(item.since).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    return `<section class="yellow-warnings">
      <strong data-warning="${selected.status}">${selected.status==='neu'?'Alarmstufe Gelb':'Gelb · '+selected.status}</strong>
      <div>${escape(selected.name)}</div><small>Quelle ${escape(selected.id)} · ${selected.status==='neu'?'Gemeldet':'Seit'} ${escape(time(selected))}</small>
      <div class="yellow-actions">
        <button data-warning-hold="${escape(selected.id)}" ${selected.status==='quittiert'?'disabled':''}>Quittieren <small>1,2 s halten</small></button>
        <button data-action="yellow-mute:${escape(selected.id)}" ${selected.status!=='neu'?'disabled':''}>Stumm 30 min</button>
        <button data-action="yellow-details:${escape(selected.id)}">Details</button>
      </div><h2 class="band">Warnungen</h2>
      <div class="yellow-queue">${warnings.map(item=>`<button data-action="yellow-select:${escape(item.id)}" data-warning="${item.status}"
        aria-pressed="${selected===item}"><span>${escape(item.name)}</span><b>${item.status} · ${escape(time(item))}</b></button>`).join('')}</div>
    </section>`;
  }

  bindWarningHold(options) {
    const root = this.shadowRoot;
    const cancel = () => {
      clearTimeout(this.warningHold?.timer);
      this.warningHold?.button.classList.remove('holding');
      this.warningHold = undefined;
    };
    const start = (button, pointer) => {
      if (!button || this.warningHold) return;
      const id = button.dataset.warningHold;
      const since = this.state(id)?.last_changed;
      button.classList.add('holding');
      const timer = setTimeout(async () => {
        cancel();
        if (!button.isConnected || this.state(id)?.state !== 'on' || this.state(id)?.last_changed !== since) return;
        try {
          await this.call(id,'turn_off');
          this.selectedWarning = this.yellowWarnings().find(item=>item.id!==id && item.status==='neu')?.id ?? id;
        } catch { this.notify('Quittieren fehlgeschlagen'); }
        this.render();
      },1200);
      this.warningHold = {button,pointer,timer};
    };
    root.addEventListener('pointerdown',event => {
      const button = event.target.closest('[data-warning-hold]:enabled');
      if (!button || event.button!==0 || !event.isPrimary) return;
      button.setPointerCapture(event.pointerId);
      start(button,event.pointerId);
    },options);
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      root.addEventListener(type,event=>{ if (this.warningHold?.pointer===event.pointerId) cancel(); },options);
    }
    root.addEventListener('keydown',event=>{
      if (![' ','Enter'].includes(event.key)) return;
      const button = event.target.closest('[data-warning-hold]:enabled');
      if (!button) return;
      event.preventDefault();
      if (!event.repeat) start(button,undefined);
    },options);
    root.addEventListener('keyup',event=>{ if ([' ','Enter'].includes(event.key)) cancel(); },options);
    root.addEventListener('focusout',event=>{ if (event.target===this.warningHold?.button) cancel(); },options);
    window.addEventListener('blur',cancel,options);
    options.signal.addEventListener('abort',cancel,{once:true});
  }

  bindOverviewDimmer(options) {
    const main = this.shadowRoot.querySelector('main');
    main.addEventListener('pointerdown', event => {
      const button = event.target.closest('[data-overview-dimmer]:enabled');
      if (!button || !event.isPrimary || event.button !== 0) return;
      this.overviewLightDrag = {button, pointer:event.pointerId, start:event.clientX};
      button.setPointerCapture(event.pointerId);
    }, options);
    main.addEventListener('pointermove', event => {
      const drag = this.overviewLightDrag;
      if (drag?.pointer !== event.pointerId || (drag.value === undefined && Math.abs(event.clientX-drag.start)<6)) return;
      const box = drag.button.getBoundingClientRect();
      drag.value = Math.round(100 * Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)));
      drag.button.style.setProperty('--fill',drag.value+'%');
      drag.button.dataset.bright = String(drag.value >= 55);
      drag.button.querySelector('.ops-light-status').textContent = drag.value ? drag.value+' %' : 'Aus';
    }, options);
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      main.addEventListener(type, event => {
        const drag = this.overviewLightDrag;
        if (drag?.pointer !== event.pointerId) return;
        this.overviewLightDrag = undefined;
        if (drag.value === undefined) return;
        if (type === 'pointerup') {
          drag.button.dataset.swiped = '';
          this.layout = undefined;
          setTimeout(()=>delete drag.button.dataset.swiped,0);
          this.overview.act('brightness',drag.button.dataset.action.slice('ops-toggle:'.length),Math.round(drag.value/10)*10)
            .catch(()=>this.notify('Licht konnte nicht eingestellt werden')).finally(()=>this.render());
        } else {
          this.layout = undefined;
          this.render();
        }
      }, options);
    }
  }

  bindLightMouseScroll(options) {
    const main = this.shadowRoot.querySelector('main');
    let drag;
    let suppressClick = false;
    main.addEventListener('wheel', event => {
      const bank = event.target.closest('.light-columns');
      if (!bank || event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || bank.scrollWidth <= bank.clientWidth) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bank.clientWidth : 1;
      bank.scrollLeft += event.deltaY * unit;
    }, {...options, passive:false});
    main.addEventListener('pointerdown', event => {
      suppressClick = false;
      const bank = event.target.closest('.light-columns');
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('input') ||
          !bank || bank.scrollWidth <= bank.clientWidth) return;
      drag = {bank, id:event.pointerId, x:event.clientX, left:bank.scrollLeft};
    }, options);
    main.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId || !(event.buttons & 1)) return;
      const delta = event.clientX - drag.x;
      if (!suppressClick && Math.abs(delta) < 6) return;
      if (!suppressClick) {
        main.setPointerCapture(event.pointerId);
        suppressClick = true;
      }
      const scale = drag.bank.getBoundingClientRect().width / drag.bank.offsetWidth;
      if (scale) drag.bank.scrollLeft = drag.left - delta / scale;
    }, options);
    for (const name of ['pointerup','pointercancel','lostpointercapture']) {
      main.addEventListener(name, event => {
        if (drag?.id === event.pointerId) drag = undefined;
      }, options);
    }
    main.addEventListener('click', event => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.stopPropagation();
    }, {...options, capture:true});
  }

  bindNavigationSwipe() {
    const navigation = this.shadowRoot.querySelector('.nav-scroll');
    let gesture;
    let suppressClick = false;
    navigation.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      gesture = { id: event.pointerId, y: event.clientY, top: navigation.scrollTop };
    });
    navigation.addEventListener('pointermove', event => {
      if (gesture?.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { endDrag(event); return; }
      const scale = navigation.getBoundingClientRect().height / navigation.clientHeight;
      const delta = (gesture.y - event.clientY) / scale;
      if (!suppressClick && Math.abs(delta) < 6) return;
      if (!suppressClick) {
        suppressClick = true;
        navigation.setPointerCapture(event.pointerId);
        navigation.classList.add('dragging');
      }
      navigation.scrollTop = gesture.top + delta;
    });
    const endDrag = event => {
      if (gesture?.id !== event.pointerId) return;
      gesture = undefined;
      if (!navigation.classList.contains('dragging')) return;
      const [first, second] = navigation.children;
      const step = second.offsetTop - first.offsetTop;
      const top = Math.round(navigation.scrollTop / step) * step;
      navigation.classList.remove('dragging');
      navigation.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      navigation.addEventListener(type, endDrag);
    }
    navigation.addEventListener('click', event => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true });
  }

  updateLightData() {
    if (this.page !== 9 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cells = this.shadowRoot.querySelectorAll('.light-data i');
    for (let index = 0; index < 3 && cells.length; index++) {
      cells[Math.floor(Math.random() * cells.length)].textContent = String(Math.floor(Math.random() * 900000) + 100000);
    }
  }

  updateOverviewData() {
    if (this.page !== 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cell = this.shadowRoot.querySelector('.overview-data');
    if (cell) cell.textContent = String(1000 + Math.floor(Math.random()*9000));
  }

  disconnectedCallback() {
    clearInterval(this.overviewDataClock);
    this.pageEntry = undefined;
    this.animatedPage = undefined;
    cancelAnimationFrame(this.rotorFrame);
    this.rotorFrame = undefined;
    clearInterval(this.lightDataClock);
    this.blindInputEvents?.abort();
    this.draggingBlind = undefined;
    this.stopWarpSound();
    this.resize?.disconnect();
    this.navigationResize?.disconnect();
    clearInterval(this.clock);
    clearTimeout(this.noticeTimeout);
  }

  state(id) { return this.ha?.states?.[id]; }

  accesses() {
    if (this.demo) return ['Garagentor', 'Garagentür', 'Türschloss', 'Haustür', 'CA Fenster', 'KU Fenster', 'Terrasse', 'AZ Fenster']
      .map((name, index) => ({ name, lock: index === 2, open: index === 2 && !this.demoLocked }));
    return (this.config?.access ?? []).map(({ name, entity }) => {
      const lock = entity?.startsWith('lock.');
      const reading = this.state(entity);
      const state = reading?.state;
      return { name, entity, lock, changed: reading?.last_changed, open: lock ? ({ locked: false, unlocked: true, open: true })[state]
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
    clock.textContent = offline ? 'Offline' : new Date().toLocaleTimeString('de-DE');
    const seconds = this.remaining;
    const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    this.shadowRoot.querySelectorAll('[data-countdown]').forEach(node => { node.textContent = formatted; });
    this.shadowRoot.querySelectorAll('[data-timer-bar] i').forEach((node, index, all) => {
      const duration = this.demo ? this.demoDuration ?? 600 : (this.timer?.attributes?.duration || '0:10:00')
        .split(':').reduce((total, part) => total * 60 + Number(part), 0);
      node.style.background = index < Math.ceil(node.closest('.ops-timer') ? seconds / 900 : seconds / (duration || 600) * all.length) ? 'var(--peach)' : '';
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
      const status = !available ? 'Keine Verbindung' : movement ? 'Fährt '+movement : position === 100 ? 'Offen'
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
        `<div class="blind-position ${blind.available ? '' : 'unavailable'}" data-selected="${all || blind === selected}">
          <div class="blind-window"><span data-slats="${blind.key}"></span>
            <input type="range" min="0" max="100" value="${blind.position ?? 0}" data-blind-position="${blind.key}"
              aria-label="${escape(blind.name)} · Öffnung in Prozent"
              ${blind.available && (blind.features & 4) ? '' : 'disabled'}></div>
          <button data-action="blind-frame:${blind.key}" aria-pressed="${all || blind === selected}">
            <strong>${escape(blind.name)}</strong><small>${blind.position === null ? 'Keine Daten' : `${blind.position} % offen`}</small>
          </button>
        </div>`).join('')}</div>
    </section></div>`;
  }

  moveBlindDrag(event) {
    const input = event.target;
    const bounds = input.getBoundingClientRect();
    input.value = String(Math.round(100 * Math.max(0, Math.min(1, (bounds.bottom - event.clientY) / bounds.height))));
    this.previewBlindPosition(input);
  }

  previewBlindPosition(input) {
    const position = input.valueAsNumber;
    const frame = input.closest('.blind-position');
    frame.querySelector('[data-slats]').style.height = `${100 - position}%`;
    const overviewPosition = frame.querySelector('[data-overview-position]');
    if (overviewPosition) overviewPosition.textContent = `${position} %`;
    else frame.querySelector('small').textContent = `${position} % offen`;
  }

  async setBlindPosition(input) {
    const blind = this.blinds().find(item => item.key === input.dataset.blindPosition);
    const position = input.valueAsNumber;
    this.draggingBlind = undefined;
    try {
      if (!blind?.available || !(blind.features & 4) || !Number.isFinite(position)) return;
      if (this.demo) this.demoBlinds[blind.index] = position;
      else await this.call(blind.entity, 'set_cover_position', {position});
    } catch {
      this.notify('Rolloposition konnte nicht gesetzt werden');
    } finally {
      this.render();
    }
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

  canToggleOverviewBlind(blind) {
    return blind.available && blind.position !== null && Boolean(blind.features & (blind.position > 0 ? 2 : 1));
  }

  async moveBlinds(index, selection = this.selectedBlind()) {
    const [, service, feature] = blindCommands[index];
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
    const overviewAlarm = this.overview.alarm();
    const warnings = this.yellowWarnings();
    const newWarnings = warnings.filter(item=>item.status==='neu');
    const warningActive = newWarnings.length > 0;
    const newKeys = new Set(newWarnings.map(item=>item.id+'/'+item.since));
    const incomingWarning = [...newKeys].some(key=>!this.previousWarnings?.has(key));
    this.previousWarnings = newKeys;
    if (this.config?.yellow_alerts?.length && overviewAlarm.level !== 'rot') {
      overviewAlarm.level = warnings.length ? 'gelb' : 'normal';
      overviewAlarm.reasons = warnings.map(item=>item.name).join(' · ');
      overviewAlarm.count = warnings.length;
    }
    const yellowQuiet = overviewAlarm.level==='gelb' && warnings.length>0 && !warningActive;
    if (incomingWarning && overviewAlarm.level==='gelb') {
      this.selectedWarning = newWarnings[0].id;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.animate([{filter:'brightness(1.75) sepia(.7)'},{filter:'none'}],{duration:420});
      }
    }
    if (overviewAlarm.level !== this.previousAlarmLevel) {
      this.previousAlarmLevel = overviewAlarm.level;
      if (overviewAlarm.level === 'gelb' || overviewAlarm.level === 'rot') this.page = 1;
    }
    const now = performance.now();
    const standbyBlocked = overviewAlarm.level !== 'normal' || this.settings.dialog?.open;
    if (standbyBlocked) this.lastDisplayActivity = now;
    const standby = !standbyBlocked && now - this.lastDisplayActivity >= 60000;
    if (standby && this.page !== 0) {
      this.page = 0;
      this.pvOpen = false;
      this.pageEntry = undefined;
      this.animatedPage = 0;
      this.shadowRoot.querySelector('.frame').getAnimations({subtree:true})
        .filter(animation=>animation.id==='haus-ops-page-entry')
        .forEach(animation=>animation.cancel());
    }
    this.updateDisplayBrightness(standby);
    const lightView = this.page === 9 ? this.lightsPanel.view() : null;
    const circuits = this.page === circuitsPageIndex ? this.circuits.view() : null;
    const music = this.page === musicPageIndex ? this.music.view() : null;
    const water = this.page === waterPageIndex ? this.water.view() : null;
    this.syncWarpSound(this.page === energyPageIndex && this.engineeringMode && !this.pvOpen);
    if (this.page === energyPageIndex && this.pvOpen) { void loadPV(this); if(this.pvOpen==='day') void loadPVActual(this); }
    const energy = this.page === energyPageIndex ? (this.pvOpen ? (this.pvOpen==='day'?pvDayView(this):pvView(this)) : energyView(this, this.engineeringMode)) : null;
    const canConfigure = Boolean(this.ha?.user?.is_admin);
    this.shadowRoot.querySelector('[data-settings]').hidden = !canConfigure || Boolean(energy);
    this.shadowRoot.querySelector('[data-nav-spacer]').hidden = canConfigure || Boolean(energy);
    const frequency = this.shadowRoot.querySelector('[data-frequency]');
    frequency.hidden = !energy?.hz;
    frequency.textContent = energy?.hz ?? '';
    const accesses = this.accesses();
    const open = accesses.filter(item => item.open);
    const complete = accesses.length > 0 && accesses.every(item => item.open !== undefined);
    const accessLabel = item => item.open === undefined ? 'Keine Daten' : item.lock
      ? (item.open ? 'Entriegelt' : 'Verriegelt') : (item.open ? 'Offen' : 'Geschlossen');
    const roomReadings = this.temperatures();
    const rooms = [...roomReadings.filter(room=>!roomNames.includes(room.name)),
      ...roomNames.map((name,index)=>{
        const room = this.climatePanel.room(index);
        return Number.isFinite(room.current)
          ? {name,value:room.current,stale:room.stale,display:climate.format(room.current)+'°'}
          : roomReadings.find(reading=>reading.name===name) ?? {name,value:NaN,display:'—'};
      })];
    const level = this.level;
    const voltage = !this.demo && Number.isFinite(this.volts) ? `${this.volts.toLocaleString('de-DE')} V` : '';
    const devices = this.demo ? ['TV Strom', 'Schreibtisch'].map((name, i) => ({ name, on: this.demoSwitches[i], ready: true }))
      : (this.config?.switches ?? []).map(({ name, entity }) => ({
        name, on: this.state(entity)?.state === 'on', ready: valid(this.state(entity))
      }));
    const deviceLabel = device => device.ready ? (device.on ? 'An' : 'Aus') : 'Keine Daten';
    if (this.ha) this.syncAlarmSound(yellowQuiet ? 'normal' : overviewAlarm.level, overviewAlarm.acknowledged);
    if (overviewAlarm.level !== 'rot') this.alarmDetailsPage = undefined;
    const hasAlarm = overviewAlarm.level !== 'normal';
    const alarm = overviewAlarm.level === 'rot' ? redAlarmLabel
      : overviewAlarm.level === 'gelb' ? yellowQuiet ? (warnings.some(item=>item.status==='stumm') ? 'Gelb · stumm' : 'Gelb · quittiert') : 'Alarmstufe Gelb'
      : complete && !open.length ? 'Gesichert' : 'Kein aktiver Alarm';
    let layout;
    switch (this.page) {
      case 0:
        layout = this.overview.render({accesses, complete, alarm, rooms, level, levels,
          escape, overviewAlarm, energy:energyView(this,false,true)});
        break;
      case 9:
        layout = lightView.layout;
        break;
      case 1:
        if (warnings.length && overviewAlarm.level !== 'rot') {
          layout = this.warningView(warnings);
          break;
        }
        layout = `<section class="detail">${band('Sicherheit · Zugänge', '--red')}
          <div class="security-status" data-alert="${overviewAlarm.level}" role="status">${alarm}
            ${hasAlarm && overviewAlarm.reasons ? ' · ' + escape(overviewAlarm.reasons) : ''}</div>
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
      case circuitsPageIndex:
        layout = circuits.layout;
        break;
      case musicPageIndex:
        layout = music.layout;
        break;
      case waterPageIndex:
        layout = water.layout;
        break;
      case 5:
        layout = `<section class="detail">${band('Garten', '--pink')}<p>Gartenansicht noch ohne Inhalte</p></section>`;
        break;
    }
    const alert = overviewAlarm.level;
    const showAlarm = alert === 'rot' && !overviewAlarm.acknowledged && this.page !== this.alarmDetailsPage;
    const alarmLayer = this.shadowRoot.querySelector('.alarm-layer');
    const alarmMarkup = showAlarm ? `<section class="ops-alarm-overlay"><div class="ops-red-bars" aria-hidden="true">${'<i></i>'.repeat(5)}</div>
        <strong>${redAlarmLabel}</strong>
        <p>${escape(overviewAlarm.reasons)}</p><button data-action="ops-ack">Quittieren</button>
        <button data-alarm-details data-page="${overviewAlarm.leak ? 7 : 1}">Details</button>
        <div class="ops-red-bars reverse" aria-hidden="true">${'<i></i>'.repeat(5)}</div></section>` : '';
    if (this.alarmMarkup !== alarmMarkup) {
      alarmLayer.innerHTML = alarmMarkup;
      this.alarmMarkup = alarmMarkup;
    }
    alarmLayer.hidden = !showAlarm;
    this.shadowRoot.querySelector('main').inert = showAlarm;
    const frame = this.shadowRoot.querySelector('.frame');
    frame.toggleAttribute('data-overview', this.page === 0);
    frame.querySelectorAll('.overview-data,.overview-rail').forEach(node => { node.hidden = this.page !== 0 || alert === 'gelb'; });
    const appearance = yellowQuiet ? 'gelb-ruhig' : alert;
    const entering = this.pageEntry?.page === this.page && appearance === frame.dataset.alert;
    if (!entering) this.pageEntry = undefined;
    const startYellowPulse = appearance === 'gelb' &&
      (incomingWarning || frame.dataset.alert !== 'gelb');
    frame.dataset.alert = appearance;
    if (appearance !== 'gelb' || startYellowPulse) {
      frame.getAnimations().filter(animation=>animation.id==='haus-ops-yellow-pulse').forEach(animation=>animation.cancel());
    }
    if (startYellowPulse && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const pulse = frame.animate([
        {filter:'brightness(1)'},{filter:'brightness(.45)',offset:.5},{filter:'brightness(1)'},
      ],{duration:2200,iterations:3,easing:'ease-in-out'});
      pulse.id = 'haus-ops-yellow-pulse';
    }
    frame.toggleAttribute('data-yellow-warnings', warnings.length > 0);
    frame.toggleAttribute('data-security-alert', alert === 'gelb' &&
      (open.length > 0 || /tür|tor|fenster|schloss/i.test(overviewAlarm.reasons)));
    const climatePage = this.page === 4;
    this.shadowRoot.querySelector('.frame').classList.toggle('climate-page', climatePage);
    this.shadowRoot.querySelector('header strong').textContent = alert === 'rot' ? (overviewAlarm.acknowledged ? redAlarmLabel + ' · quittiert' : redAlarmLabel)
      : alert === 'gelb' ? ('Alarmstufe Gelb · ' + (yellowQuiet
        ? warnings.some(item=>item.status==='stumm')
          ? `${warnings.filter(item=>item.status==='stumm').length} stumm · ${warnings.filter(item=>item.status==='quittiert').length} quittiert`
          : `${warnings.length} quittiert`
        : `${overviewAlarm.count} ${overviewAlarm.count === 1 ? 'Meldung' : 'Meldungen'}`)) : this.page === 9 ? 'Licht' : circuits ? 'Stromkreise' : music ? 'Musik' : water ? 'Wasser' : energy ? 'Energie' : climatePage ? 'Klima' : this.page === 3 ? 'Rollos' : 'HAUS-OPS';
    this.shadowRoot.querySelector('footer .rail').textContent = [
      this.demo ? 'Demo' : '', level >= 0 ? 'Lüftung Stufe ' + levels[level] : 'Haus-Ops'
    ].filter(Boolean).join(' · ');
    const footer = this.shadowRoot.querySelector('footer .rail');
    const blinds = [0,3].includes(this.page) ? this.blinds() : [];
    if (lightView) footer.textContent = lightView.status;
    if (circuits) footer.textContent = circuits.status;
    footer.classList.toggle('blind-error', Boolean(energy?.warning) || blinds.some(blind => !blind.available));
    footer.classList.toggle('water-alarm', Boolean(water?.alarm));
    footer.classList.toggle('water-stale', Boolean(water?.stale && !water?.alarm));
    footer.dataset.musicTone = music?.tone ?? '';
    if (this.page === 0) footer.textContent = alert !== 'normal'
      ? overviewAlarm.reasons || alarm
      : `Übersicht · ${this.overview.favoriteLights().filter(light=>light.on).length} Lichter an · Lüftung ${levels[level] ?? '—'} · Kein Alarm`;
    if (music) footer.textContent = music.status;
    if (water) footer.textContent = water.status;
    if (energy) footer.textContent = energy.status;
    if (this.page === 3 && blinds.length) {
      const moving = blinds.filter(blind => blind.available && blind.movement);
      const status = (moving.length ? moving : blinds.filter(blind => blind.available)).map(blind =>
        `${blind.name} ${blind.movement ? `fährt ${blind.movement}${blind.position === null ? '' : ` ${100 - blind.position} %`}` : blind.status}`);
      footer.textContent = [...blinds.filter(blind => !blind.available).map(blind => `${blind.name} keine Verbindung`),
        ...(!moving.length && status.length ? ['Bereit'] : []), ...status].join(' · ');
    }
    const flows = [...main.querySelectorAll('[data-energy-flow]')];
    const slats = this.animatedPage === this.page ? [...main.querySelectorAll('[data-slats]')] : [];
    if (!entering && this.layout !== layout && water && main.querySelector('.water-page')) {
      this.water.update(main, layout);
      this.layout = layout;
    }
    if (!entering && this.layout !== layout && energy && this.engineeringMode && main.querySelector('.engineering')) {
      const template = document.createElement('template');
      template.innerHTML = layout;
      for (const selector of ['.eng-data', '.eng-details', '.eng-bottom']) {
        main.querySelector(selector).replaceWith(template.content.querySelector(selector));
      }
      for (const node of main.querySelectorAll('[data-eng-motion]')) {
        const next = template.content.querySelector(`[data-eng-motion="${node.dataset.engMotion}"]`);
        node.setAttribute('class', next.getAttribute('class'));
        if (node.matches('svg')) node.style.setProperty('--period', next.style.getPropertyValue('--period'));
        else node.querySelector('span').textContent = next.querySelector('span').textContent;
      }
      this.layout = layout;
    }
    const dragging = [0,3].includes(this.page) && this.draggingBlind !== undefined;
    if (!entering && !dragging && !(this.page === 1 && this.warningHold) && !(this.page === 0 && this.overviewLightDrag) && !(lightView && this.lightDrag !== undefined) && this.layout !== layout) {
      const focused = this.shadowRoot.activeElement;
      const action = main.contains(focused) && focused.dataset.action;
      const focusedBlind = main.contains(focused) && focused.dataset.blindPosition;
      const modeFocused = main.contains(focused) && focused.hasAttribute('data-energy-mode');
      const lightScroll = [...main.querySelectorAll('.light-columns,.light-rooms')].map(node=>node.scrollLeft);
      const previousMetrics = [...main.querySelectorAll('[data-light-metric]')].map(node=>Number(node.textContent));
      const rotor = this.page === 0 ? main.querySelector('.ops-fan') : null;
      const lightData = main.querySelector('.light-data');
      const musicRoomScroll = main.querySelector('.music-room-list')?.scrollTop;
      main.innerHTML = layout;
      if (musicRoomScroll !== undefined && main.querySelector('.music-room-list')) main.querySelector('.music-room-list').scrollTop = musicRoomScroll;
      const nextRotor = rotor && main.querySelector('.ops-fan');
      if (nextRotor) {
        rotor.querySelector('text').textContent = nextRotor.querySelector('text').textContent;
        rotor.querySelectorAll('[data-fan-segment]').forEach((segment,index)=>{
          segment.setAttribute('stroke',nextRotor.querySelectorAll('[data-fan-segment]')[index].getAttribute('stroke'));
        });
        nextRotor.replaceWith(rotor);
      }
      if (lightData && lightView) main.querySelector('.light-data').replaceWith(lightData);
      main.querySelectorAll('.light-columns,.light-rooms').forEach((node,index)=>{ node.scrollLeft = lightScroll[index] ?? 0; });
      if (lightView) {
        this.lightsPanel.animateMetrics(main,previousMetrics);
        if (this.lightsPanel.sceneWave) {
          this.lightsPanel.sceneWave = false;
          this.lightsPanel.animateBank(main,130);
        }
      }
      flows.forEach(node => {
        const next = main.querySelector(`[data-energy-flow="${node.dataset.energyFlow}"]`);
        if (!next) return;
        node.style.setProperty('--share', next.style.getPropertyValue('--share'));
        node.title = next.title;
        node.textContent = next.textContent;
        next.replaceWith(node);
      });
      slats.forEach(node => main.querySelector(`[data-slats="${node.dataset.slats}"]`)?.replaceWith(node));
      if (focusedBlind) main.querySelector(`[data-blind-position="${focusedBlind}"]`)?.focus({preventScroll:true});
      if (modeFocused) main.querySelector('[data-energy-mode]')?.focus({ preventScroll: true });
      if (action) [...main.querySelectorAll('[data-action]')].find(node => node.dataset.action === action)?.focus({ preventScroll: true });
      this.layout = layout;
    }
    if (!dragging) blinds.forEach(blind => {
      const input = main.querySelector(`[data-blind-position="${blind.key}"]`);
      if (input) {
        input.value = blind.position ?? 0;
        if (this.page === 3) input.closest('.blind-position').querySelector('small').textContent =
          blind.position === null ? 'Keine Daten' : `${blind.position} % offen`;
      }
      main.querySelector(`[data-slats="${blind.key}"]`)
      ?.style.setProperty('height', `${blind.position === null ? 0 : 100 - blind.position}%`);
    });
    this.shadowRoot.querySelectorAll('nav [data-page]').forEach(button =>
      button.setAttribute('aria-current', Number(button.dataset.page) === this.page));
    this.updateOverviewRotor(main,level);
    this.tick();
    if (music) this.music.tick(main);
    if (this.pvOpen==='day') bindPVDay(this,main);
    if (this.animatedPage !== this.page) {
      this.animatedPage = this.page;
      this.animatePage(main);
    }
  }

  updateOverviewRotor(main, level) {
    this.rotorTarget = [0,120,260,430,700][level] ?? 0;
    if (this.rotorFrame) return;
    const fan = main.querySelector('.ops-fan');
    if (this.page !== 0 || !fan || !this.rotorTarget || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rotor = fan.querySelector('.ops-rotor');
    const marker = fan.querySelector('.ops-fan-marker');
    let previous = performance.now();
    let angle = this.rotorAngle ?? 0;
    let velocity = 0;
    const spin = now => {
      if (this.page !== 0 || !fan.isConnected || !this.isConnected) {
        this.rotorFrame = undefined;
        return;
      }
      const dt = Math.min(.1,(now-previous)/1000);
      previous = now;
      velocity += (this.rotorTarget-velocity)*Math.min(1,dt*1.5);
      angle = (angle + velocity*dt)%360;
      this.rotorAngle = angle;
      if (this.rotorTarget === 0 && velocity < .1) {
        marker.setAttribute('visibility','hidden');
        this.rotorFrame = undefined;
        return;
      }
      rotor.setAttribute('transform',`rotate(${angle} 60 60)`);
      marker.setAttribute('visibility','visible');
      marker.setAttribute('transform',`rotate(${Math.round(angle/15)*15} 60 60)`);
      this.rotorFrame = requestAnimationFrame(spin);
    };
    this.rotorFrame = requestAnimationFrame(spin);
  }

  animatePage(main) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frame = this.shadowRoot.querySelector('.frame');
    frame.getAnimations({ subtree: true }).filter(animation => animation.id === 'haus-ops-page-entry')
      .forEach(animation => animation.cancel());
    const entry = {page:this.page};
    const animations = [];
    this.pageEntry = entry;
    const animate = (element, keyframes, duration, delay = 0) => {
      const animation = element.animate(keyframes, {duration, delay, easing:'ease-out', fill:'backwards'});
      animation.id = 'haus-ops-page-entry';
      animations.push(animation.finished);
    };
    frame.querySelectorAll(':scope > header .rail, :scope > header .overview-rail:not([hidden]), :scope > footer .rail').forEach(rail => {
      animate(rail, [{transform:'scaleX(0)', transformOrigin:'left'},
        {transform:'scaleX(1)', transformOrigin:'left'}], this.page === 0 ? 700 : 800);
    });
    if (this.page === 9) this.lightsPanel.animateBank(main,60);
    const wheel = main.querySelector('.circuits-wheel');
    if (wheel) {
      const radius = Math.min(wheel.clientWidth, wheel.clientHeight) / 2;
      animate(wheel, [
        {clipPath:'circle(0px at center)'},
        {clipPath:`circle(${radius}px at center)`},
      ], 900, 100);
    }
    const cards = main.querySelector('.ops-overview')?.children ?? main.firstElementChild?.children ?? [];
    Array.from(cards).forEach((card, index) => {
      animate(card, [{opacity:0, transform:this.page === 0 ? 'translateY(8px)' : 'translateX(-7px)'}, {opacity:1, transform:'none'}],
        this.page === 0 ? 600 : 650, Math.min(index, 5) * (this.page === 0 ? 100 : 65));
    });
    Promise.allSettled(animations).then(() => {
      if (this.pageEntry !== entry) return;
      this.pageEntry = undefined;
      if (this.isConnected) this.render();
    });
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

  get activeDisplayBrightness() {
    const action = this.config?.display_brightness_action;
    try {
      const value = localStorage.getItem('haus-ops.display-brightness.' + action);
      if (value !== null && Number.isFinite(Number(value))) return Math.max(5,Math.min(100,Number(value)));
    } catch {}
    return 50;
  }

  get controlsDisplayBrightness() {
    try { return localStorage.getItem('haus-ops.brightness-control') === 'on'; } catch { return false; }
  }

  updateDisplayBrightness(standby) {
    if (!this.controlsDisplayBrightness) return;
    if (this.displayStandby && !standby) this.brightnessRetryAt = 0;
    this.displayStandby = standby;
    const action = this.config?.display_brightness_action;
    if (!/^shell_command\.[a-z0-9_]+$/.test(action ?? '') || !this.ha) return;
    this.circuits.load();
    const night = standby && nightDisplayOff(new Date(), this.ha.states, this.circuits.registry, this.config?.display_night_lights, this.ha.config?.time_zone || 'Europe/Berlin');
    this.displayBrightnessTarget = {action,value:standby ? (night ? 0 : 10) : this.activeDisplayBrightness};
    void this.sendDisplayBrightness();
  }

  async sendDisplayBrightness() {
    if (this.brightnessSending || Date.now() < (this.brightnessRetryAt ?? 0)) return;
    this.brightnessSending = true;
    try {
      while (this.isConnected && this.displayBrightnessTarget) {
        const target = this.displayBrightnessTarget;
        const key = target.action + '/' + target.value;
        // Reassert after a minute in case an external idle process changed the backlight.
        if (this.displayBrightnessApplied === key && Date.now() - (this.brightnessAppliedAt || 0) < 60000) break;
        const result = await this.ha.callWS({
          type:'call_service',domain:'shell_command',service:target.action.split('.')[1],
          service_data:{brightness:target.value},return_response:true,
        });
        if (result?.response?.returncode !== undefined && result.response.returncode !== 0) throw new Error('SSH fehlgeschlagen');
        this.displayBrightnessApplied = key;
        this.brightnessAppliedAt = Date.now();
      }
    } catch {
      this.brightnessRetryAt = Date.now() + 10000;
    } finally {
      this.brightnessSending = false;
    }
  }

  get dashboardVolume() {
    try {
      const stored = localStorage.getItem(dashboardVolumePreference);
      if (stored !== null && Number.isFinite(Number(stored))) return Math.min(100, Math.max(0, Number(stored)));
    } catch {}
    return 100;
  }

  applyDashboardVolume() {
    const level = this.dashboardVolume / 100;
    if (this.alarmAudio) this.alarmAudio.volume = level;
    if (this.warpAudio) this.warpAudio.volume = level * .22;
    this.touchAudio?.forEach(audio => { audio.volume = level * .22; });
  }

  get touchSoundsEnabled() {
    try { return localStorage.getItem(touchSoundPreference) !== 'off'; }
    catch { return true; }
  }

  soundUrl(kind) {
    const filename = this.config?.sounds?.[kind] || soundSlots.find(([key]) => key === kind)?.[2];
    if (kind === 'beep1' && ['beep1.mp3','computerbeep_1.mp3'].includes(filename)) {
      return new URL('./sounds/beep1.mp3?v=1.6.48', import.meta.url).href;
    }
    if (kind === 'error' && filename === 'error.mp3') {
      return new URL('./sounds/error.mp3?v=1.6.48', import.meta.url).href;
    }
    if (kind === 'red' && filename === redAlarmFile) {
      return new URL('./sounds/' + redAlarmFile, import.meta.url).href;
    }
    if (kind === 'yellow' && filename === 'yellow_alert.mp3') {
      return new URL('./sounds/yellow_alert.mp3?v=2', import.meta.url).href;
    }
    if (kind === 'warp' && ['warp_core_loop.wav', 'warp_core.wav', 'warp_core.mp3'].includes(filename)) {
      return new URL('./sounds/warp_core_loop.wav?v=1.6.48', import.meta.url).href;
    }
    if (['beep3', 'beep5', 'beep6'].includes(kind) && filename === kind + '.mp3') {
      return new URL('./sounds/' + filename, import.meta.url).href;
    }
    return filename && validSoundName(filename)
      ? '/local/haus-ops/sounds/' + encodeURIComponent(filename)
      : '';
  }

  get yellowAlarmSilent() {
    return nightDisplayOff(new Date(), this.ha?.states,
      this.circuits.registry, this.config?.display_night_lights,
      this.ha?.config?.time_zone || 'Europe/Berlin');
  }

  syncAlarmSound(level, acknowledged) {
    if (level === 'gelb' && this.yellowAlarmSilent) level = 'normal';
    const kind = level === 'rot' && acknowledged ? undefined : {rot:'red', gelb:'yellow'}[level];
    const url = kind && this.soundUrl(kind);
    const next = url && this.touchSoundsEnabled ? url : '';
    const interval = level === 'rot' ? 30000 : 60000;
    const now = Date.now();
    if (this.alarmSoundUrl === next && this.alarmSoundLevel === level) {
      if (next && !this.pendingAlarmSound && now >= this.nextAlarmSoundAt && this.alarmAudio.paused) {
        this.pendingAlarmSound = true;
        this.playPendingAlarm();
      }
      return;
    }
    this.alarmSoundLevel = level;
    this.alarmSoundInterval = interval;
    this.alarmAudio?.pause();
    this.alarmSoundUrl = next;
    this.pendingAlarmSound = Boolean(next);
    if (!next) return;
    this.alarmAudio ??= new Audio();
    this.alarmAudio.volume = this.dashboardVolume / 100;
    this.alarmAudio.src = next;
    this.playPendingAlarm();
  }

  playPendingAlarm() {
    if (this.alarmSoundLevel === 'gelb' && this.yellowAlarmSilent) {
      this.pendingAlarmSound = false;
      this.alarmAudio?.pause();
      return false;
    }
    if (!this.pendingAlarmSound) return false;
    const url = this.alarmSoundUrl;
    const level = this.alarmSoundLevel;
    this.pendingAlarmSound = false;
    this.nextAlarmSoundAt = Date.now() + this.alarmSoundInterval;
    this.alarmAudio.currentTime = 0;
    this.lastBeep?.pause();
    this.alarmAudio.play().catch(error => {
      if (this.alarmSoundUrl === url && this.alarmSoundLevel === level && error.name === 'NotAllowedError') {
        this.pendingAlarmSound = true;
      }
    });
    return true;
  }

  playTouchSound(kind) {
    const url = this.soundUrl(kind);
    if (!this.touchSoundsEnabled || !url) return;
    this.touchAudio ??= new Map();
    if (!this.touchAudio.has(url)) this.touchAudio.set(url, new Audio(url));
    const audio = this.touchAudio.get(url);
    if (kind.startsWith('beep') || kind === 'error') {
      this.lastBeep?.pause();
      this.lastBeep = audio;
    }
    audio.volume = .22 * this.dashboardVolume / 100;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  stopWarpSound() {
    this.warpAudio?.pause();
    this.warpAudio = undefined;
    this.warpSoundUrl = undefined;
  }

  syncWarpSound(open) {
    const url = open && this.touchSoundsEnabled ? this.soundUrl('warp') : '';
    if (!url) {
      this.stopWarpSound();
      return;
    }
    if (this.warpSoundUrl === url) return;
    this.stopWarpSound();
    this.warpSoundUrl = url;
    this.warpAudio = new Audio(url);
    this.warpAudio.loop = true;
    this.warpAudio.volume = .22 * this.dashboardVolume / 100;
    this.warpAudio.play().catch(() => {});
  }

  async click(event) {
    if (event.target.closest('[data-nav-spacer]')) {
      this.notify('Einstellungen benötigen einen Home-Assistant-Administrator.');
      return;
    }
    if (event.target.closest('.ops-blind-windows [data-blind-position]')) return;

    const playedAlarm = this.playPendingAlarm();
    const button = event.target.closest('button, .circuits-wheel path[data-action^="circuit-room:"]') ??
      event.target.closest('[data-pv-card]')?.querySelector('[data-pv-open]') ??
      event.target.closest('[data-card-page]')?.querySelector('button[data-page]');
    if (button?.hasAttribute('data-swiped')) return;
    if (!button || button.disabled || !button.matches('[data-page], [data-action], [data-settings], [data-energy-mode], [data-pv-open], [data-pv-back], [data-pv-day], [data-pv-daily], [data-pv-week], [data-pv-date], [data-pv-day-shift]')) {
      const interactive = event.target.closest('a, input, select, textarea, label, summary, [contenteditable], .pv-daily-chart, [data-blind-position], [data-overview-dimmer], [data-warning-hold]');
      if (!interactive && !playedAlarm && this.alarmAudio?.paused !== false) this.playTouchSound('error');
      return;
    }
    const beeps = soundSlots.map(([kind]) => kind).filter(kind => kind.startsWith('beep') && this.soundUrl(kind));
    if (!playedAlarm && beeps.length && this.alarmAudio?.paused !== false) this.playTouchSound(beeps[Math.floor(Math.random() * beeps.length)]);
    if (button.hasAttribute('data-settings')) { this.settings.open(); return; }
    if(button.matches('[data-pv-daily], [data-pv-week], [data-pv-date], [data-pv-day-shift]')) {
      this.pvOpen=button.hasAttribute('data-pv-week')?true:'day';
      if(button.dataset.pvDate!==undefined)this.pvDayIndex=Number(button.dataset.pvDate);
      if(button.dataset.pvDayShift!==undefined)this.pvDayIndex=Math.min(6,Math.max(0,(this.pvDayIndex||0)+Number(button.dataset.pvDayShift)));
      this.render();
      return;
    }
    if (button.matches('[data-pv-open], [data-pv-back], [data-pv-day]')) {
      this.pvOpen = !button.hasAttribute('data-pv-back');
      if (button.dataset.pvDay !== undefined) this.pvSelected = Number(button.dataset.pvDay);
      this.render();
      const selector = button.dataset.pvDay !== undefined
        ? `[data-pv-day="${button.dataset.pvDay}"]`
        : this.pvOpen ? '[data-pv-back]' : '[data-pv-open]';
      this.shadowRoot.querySelector(selector)?.focus({preventScroll:true});
      return;
    }
    if (button.hasAttribute('data-energy-mode')) {
      this.engineeringMode = !this.engineeringMode;
      this.render();
      this.shadowRoot.querySelector('[data-energy-mode]')?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.page !== undefined) {
      this.page = Number(button.dataset.page);
      this.pvOpen = false;
      this.alarmDetailsPage = button.hasAttribute('data-alarm-details') ? this.page : undefined;
      this.render();
      this.shadowRoot.querySelector('nav [aria-current=true]')?.focus({ preventScroll: true });
      return;
    }
    if (!button.dataset.action) return;
    if (button.dataset.action.startsWith('music-')) {
      const [action, value] = button.dataset.action.slice(6).split(':');
      await this.music.act(action, ['sonos','room','room-play','member'].includes(action) ? value : Number(value));
      return;
    }
    const step = /^climate-(plus|minus|cancel):(\d+)$/.exec(button.dataset.action);
    if (step) {
      this.climatePanel.change(Number(step[2]), {plus:1,minus:-1,cancel:0}[step[1]]);
      return;
    }
    if (this.busy) return;
    const [kind, index, value] = button.dataset.action.split(':');
    const i = Number(index);
    this.busy = true;
    try {
      if (kind.startsWith('yellow-')) {
        const warning = this.yellowWarnings().find(item=>item.id===index);
        if (!warning) return;
        this.selectedWarning = index;
        if (kind === 'yellow-mute' && warning.status==='neu') {
          this.yellowMuted.set(index,{since:warning.since,until:Date.now()+1800000});
          this.selectedWarning = this.yellowWarnings().find(item=>item.status==='neu')?.id ?? index;
        }
        if (kind === 'yellow-details') this.dispatchEvent(new CustomEvent('hass-more-info',{
          detail:{entityId:index},bubbles:true,composed:true,
        }));
        return;
      }
      if (kind.startsWith('light-')) {
        await this.lightsPanel.act(kind.slice(6),index,value);
        return;
      }
      if (kind.startsWith('circuit-')) {
        await this.circuits.act(kind.slice(8), [index, value]);
        return;
      }
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
        case 'ops-lock': {
          const unlocked = this.accesses().filter(item=>item.lock && item.open===true);
          if (this.demo) this.demoLocked = true;
          else await Promise.all(unlocked.map(item=>this.call(item.entity,'lock')));
          break;
        }
        case 'ops-camera': {
          const entityId = this.config?.overview?.camera;
          if (entityId?.startsWith('camera.')) this.dispatchEvent(new CustomEvent('hass-more-info',{
            detail:{entityId},bubbles:true,composed:true,
          }));
          break;
        }
        case 'ops-pv':
          this.page = energyPageIndex;
          this.pvOpen = true;
          break;
        case 'ops-blind': {
          const blind = this.blinds().find(item=>item.key===index);
          if (blind && this.canToggleOverviewBlind(blind)) await this.moveBlinds(blind.position>0?0:2,blind.key);
          break;
        }
        case 'ops-blind-stop':
          await this.moveBlinds(1,'all');
          break;
        case 'ops-toggle':
        case 'ops-brightness':
        case 'ops-off':
        case 'ops-ack':
          await this.overview.act(kind.slice(4), index, value === undefined ? undefined : Number(value));
          break;
        case 'ops-timer':
        case 'timer': {
          const seconds = kind === 'ops-timer' ? Math.min(10800,this.remaining+900) : this.remaining+600;
          if (this.demo) {
            this.demoDuration = seconds;
            this.demoEnd = i ? 0 : Date.now() + seconds * 1000;
          } else {
            await this.call(this.config.timer, i ? 'cancel' : 'start', i ? {} : { duration: seconds });
          }
          break;
        }
        case 'cover':
          if (this.demo) await this.moveBlinds(i ? 2 : 0,'all');
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
  ['Wasser', waterFields],
  ['Übersicht und Licht', overviewFields],
  ['Musik', musicFields],
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
  constructor(panel) { this.panel = panel; this.mobile = new MobileNotifications(this); }

  async load(hass) {
    if (!hass?.callWS || this.loading) return;
    this.loading = true;
    try {
      const { value } = await hass.callWS({ type: 'frontend/get_system_data', key: settingsKey });
      this.panel.savedConfig = value ?? undefined;
      if (hass.user?.is_admin) await this.mobile.load(hass);
      this.panel.render();
    } catch {
      this.panel.notify('HAUS-OPS-Konfiguration konnte nicht geladen werden');
    }
  }

  open() {
    const panel = this.panel;
    if (!panel.ha?.user?.is_admin) {
      panel.notify('Einstellungen benötigen einen Home-Assistant-Administrator.');
      return;
    }
    if (this.dialog?.open) return;
    const config = panel.config ?? {};
    const circuitSelection = config.circuits?.selectionSaved
      ? config.circuits.include ?? []
      : panel.circuits.structure().flatMap(floor => floor.rooms.flatMap(room => room.items.map(item => item.id)));
    const circuitSelectionPending = !config.circuits?.selectionSaved && config.circuits?.labelOnly && !panel.circuits.registry;
    const existing = key => {
      const [group, index] = key.split('.');
      const field = config[group];
      if (['energy', 'water', 'music', 'overview'].includes(group)) return field?.[index];
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
    this.dialog.setAttribute('aria-labelledby', 'settings-title');
    this.dialog.innerHTML = `<link rel="stylesheet" href="${new URL('./settings.css?v=1.6.48', import.meta.url)}">
    <form><header class="settings-header"><h2 id="settings-title">HAUS-OPS konfigurieren</h2><p>Bereich wählen · Änderungen mit OK speichern</p></header>
    <nav class="settings-sections" aria-label="Einstellungsbereiche"></nav><div class="fields">
      <fieldset><legend>Display</legend><label><span><input type="checkbox" name="touch-sounds" ${panel.touchSoundsEnabled ? 'checked' : ''}> Star-Trek-Töne auf diesem Display</span></label>
        <label>Dashboard-Lautstärke <output for="dashboard-volume">${panel.dashboardVolume} %</output>
          <input id="dashboard-volume" type="range" name="dashboard-volume" min="0" max="100" value="${panel.dashboardVolume}">
        </label>
        <label>SSH-Aktion für die Display-Helligkeit
          <input name="display-brightness-action" value="${escape(config.display_brightness_action)}" placeholder="shell_command.walldisplay_helligkeit" spellcheck="false">
        </label>
        <label><span><input type="checkbox" name="brightness-control" ${panel.controlsDisplayBrightness?'checked':''}> Helligkeitsautomatik auf diesem Walldisplay aktivieren</span></label>
        <label>Helligkeit bei Benutzung <output for="display-brightness">50 %</output>
          <input id="display-brightness" name="display-brightness" type="range" min="5" max="100" step="1" value="50" disabled>
        </label>
        <small>Nach 60 Sekunden ohne Bedienung wird auf 5 % gedimmt. Zwischen 22 und 6 Uhr geht das Display aus, sobald alle EG-Leuchten aus sind. Alarme verhindern Standby und Nachtmodus. Bei Berührung wird die hier gespeicherte Helligkeit wiederhergestellt. Die Einstellung gilt für diesen Browser.</small>
        <label>EG-Leuchten für Nachtmodus (optional, eine Entität pro Zeile)
          <textarea name="display-night-lights" rows="5" placeholder="Leer: alle HA-Leuchten in der Etage Erdgeschoss / EG">${escape((config.display_night_lights ?? []).join('\n'))}</textarea>
        </label>
        <small>Eine ausgefüllte Liste ersetzt die automatische Etagenzuordnung. Auch Lichtschalter (switch) sind möglich. Alle müssen AUS melden. Der SSH-Befehl muss 0 % zulassen.</small>
        ${soundSlots.map(([key,label,defaultFile]) => `<label>${label}<input name="sound-${key}" value="${escape(config.sounds?.[key] ?? defaultFile)}" placeholder="Dateiname, z. B. beep.mp3" spellcheck="false"></label>`).join('')}</fieldset>
      <fieldset><legend>Lichtszenen</legend>
        ${[['off','Alle aus'],['evening','Abendlicht'],['film','Film'],['hell','Hell']].map(([key,label])=>
          `<label>${label}<input name="light-scene-${key}" value="${escape(config.light_scenes?.[key])}" placeholder="${escape(panel.lightsPanel.sceneId(key))}" spellcheck="false"></label>`).join('')}
      </fieldset>
      <fieldset><legend>Wetterstandort</legend>
        <label>Breitengrad (−90 bis 90)<input name="weather-latitude" inputmode="decimal" value="${escape(config.weather_location?.latitude)}"></label>
        <label>Längengrad (−180 bis 180)<input name="weather-longitude" inputmode="decimal" value="${escape(config.weather_location?.longitude)}"></label>
        <p>Open-Meteo erhält diese Koordinaten für die PV-Wettervorschau. Beide Felder leer lassen, um den Wetterabruf auszuschalten.</p>
      </fieldset>
      <fieldset><legend>Gelbe Warnungen</legend>
        <label>Eine alert.*-Entität pro Zeile
          <textarea name="yellow-alerts" rows="5" spellcheck="false" autocapitalize="none">${escape(config.yellow_alerts?.join('\n'))}</textarea>
        </label>
      </fieldset>
      ${this.mobile.fields()}
      <fieldset><legend>Lichter in der Übersicht</legend>
        <label>Bis zu sechs Entitäts-IDs, eine pro Zeile
          <textarea name="overview-lights" rows="6" spellcheck="false" autocapitalize="none">${escape((config.overview_lights ?? panel.overview.favoriteLights().map(light=>light.id)).join('\n'))}</textarea>
        </label>
      </fieldset>
      <fieldset><legend>Leuchten im Dashboard</legend>
        <label>Eine Entitäts-ID pro Zeile. Ergänze oder entferne Leuchten direkt in der Liste.
          <textarea name="light-selection" rows="8" spellcheck="false" autocapitalize="none">${escape((config.light_selection_saved ? config.lights : panel.lightsPanel.lights().map(light=>light.id)).join('\n'))}</textarea>
        </label>
        <button type="button" data-fill-entities="light-selection">Fehlende Entitäten hinzufügen</button>
      </fieldset>
      <fieldset><legend>Stromkreise</legend>
        <label>Eine Schalter- oder Leuchten-ID pro Zeile. Ergänze oder entferne Entitäten direkt in der Liste.
          <textarea name="circuit-include" rows="8" spellcheck="false" autocapitalize="none" ${circuitSelectionPending ? 'disabled' : ''}>${escape(circuitSelection.join('\n'))}</textarea>
        </label>
        <button type="button" data-fill-entities="circuit-include" ${circuitSelectionPending ? 'disabled' : ''}>Fehlende Entitäten hinzufügen</button>
        ${circuitSelectionPending ? '<p>Für die bisherige Label-Auswahl muss die HA-Registry geladen sein. Öffne die Einstellungen danach erneut.</p>' : ''}
        <label>Geschützte Entitäten (eine ID pro Zeile)<textarea name="circuit-protected" rows="5" spellcheck="false" autocapitalize="none">${escape(config.circuits?.protected?.join('\n'))}</textarea></label>
        <label>Leistungssensoren (Schalter = Sensor, kommagetrennt)<input name="circuit-power" value="${escape(Object.entries(config.circuits?.power ?? {}).map(pair => pair.join(' = ')).join(', '))}" spellcheck="false"></label>
      </fieldset>
      ${entityFields.map(([title, fields]) => `<fieldset><legend>${title}</legend>${fields.map(([key, label, , caption]) =>
        `<label>${caption ?? label}<input name="${key}" value="${escape(existing(key))}" placeholder="Entitäts-ID" spellcheck="false" autocapitalize="none"></label>`).join('')}
        ${title === 'Wasser' ? `<label>Dauerfluss · Minuten<input type="number" min="1" max="1440" name="water-leak-minutes" value="${escape(config.water?.leak_minutes ?? 30)}"></label>
          <label>Dauerfluss · Liter<input type="number" min="1" max="100000" name="water-leak-liters" value="${escape(config.water?.leak_liters ?? 300)}"></label>` : ''}
        ${title === 'Rollos und Strom' ? blindFields.map(([key, label]) =>
          `<label>Anzeigename · ${label}<input name="blind-name.${key}" maxlength="24" value="${escape(config.blinds?.find(item => item.key === key)?.name || label)}"></label>`).join('') +
          blindCommands.slice(3).map(([label], index) =>
            `<label>${label} · % geschlossen<input type="number" min="0" max="100" name="blind-preset.${index}" value="${escape(config.blind_presets?.[index] ?? [0, 50, 80][index])}"></label>`).join('') : ''}
        ${title === 'Lüftung' ? '<p>Stufensteuerung über Trafo-Helfer</p>' : ''}</fieldset>`).join('')}
      </div><p role="status"></p><div class="controls"><button type="button" data-cancel>Abbrechen</button><button type="submit">OK</button></div></form>`;
    setupSettingsLayout(this.dialog);
    const form = this.dialog.querySelector('form');
    const brightnessControl = form.elements.namedItem('brightness-control');
    brightnessControl.onchange = () => {
      try {
        localStorage.setItem('haus-ops.brightness-control',brightnessControl.checked?'on':'off');
        panel.lastDisplayActivity = performance.now();
        panel.updateDisplayBrightness(false);
      } catch { form.querySelector('[role=status]').textContent = 'Browsereinstellung konnte nicht gespeichert werden.'; }
    };
    const brightness = form.querySelector('input[name="display-brightness"]');
    const brightnessAction = config.display_brightness_action;
    const brightnessKey = 'haus-ops.display-brightness.' + brightnessAction;
    if (/^shell_command\.[a-z0-9_]+$/.test(brightnessAction ?? '')) {
      brightness.disabled = false;
      let stored;
      try { stored = localStorage.getItem(brightnessKey); } catch {}
      if (stored !== null && stored !== undefined && Number.isFinite(Number(stored))) {
        brightness.value = String(Math.max(5, Math.min(100, Number(stored))));
      }
    }
    const brightnessOutput = form.querySelector('output[for="display-brightness"]');
    brightnessOutput.textContent = brightness.value + ' %';
    brightness.oninput = () => { brightnessOutput.textContent = brightness.value + ' %'; };
    brightness.onchange = () => {
      const value = Number(brightness.value);
      try {
        localStorage.setItem(brightnessKey,String(value));
        panel.lastDisplayActivity = performance.now();
        panel.updateDisplayBrightness(false);
        form.querySelector('[role=status]').textContent = 'Helligkeit bei Benutzung gespeichert.';
      } catch {
        form.querySelector('[role=status]').textContent = 'Helligkeit konnte in diesem Browser nicht gespeichert werden.';
      }
    };
    form.elements.namedItem('dashboard-volume').oninput = event => {
      form.querySelector('output[for="dashboard-volume"]').textContent = event.target.value + ' %';
    };
    form.querySelectorAll('[data-fill-entities]').forEach(button => {
      button.onclick = () => {
        const field = form.elements.namedItem(button.dataset.fillEntities);
        const ids = new Set(field.value.split(/[\s,]+/).filter(Boolean));
        const discovered = panel.overview.discoveredLights();
        if (field.name === 'circuit-include') {
          discovered.push(...Object.keys(panel.ha?.states ?? {}).filter(id => id.startsWith('switch.')).sort());
        }
        const missing = discovered.filter(id => !ids.has(id));
        if (missing.length) {
          const separator = field.value && !field.value.endsWith('\n') ? '\n' : '';
          field.value += separator + missing.join('\n');
          field.scrollTop = field.scrollHeight;
        }
        form.querySelector('[role=status]').textContent = missing.length
          ? `${missing.length} Entitäten ergänzt.` : 'Alle erkannten Entitäten sind bereits enthalten.';
      };
    });
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
    const next = { energy: {}, overview: {}, music: {}, water: {
      leak_minutes: Number(data.get('water-leak-minutes')) || 30,
      leak_liters: Number(data.get('water-leak-liters')) || 300,
    }, ventilation: this.panel.config?.ventilation, blinds: blindFields.map(([key, label]) => ({ key, name: data.get(`blind-name.${key}`)?.trim() || label })),
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
        else if (['energy', 'water', 'music', 'overview'].includes(group)) next[group][index] = entity;
        else if (group === 'blinds') next.blinds.find(blind => blind.key === index).entity = entity;
        else if (index !== undefined) next[group].push({ name, entity });
        else next[group] = entity;
      }
    }
    const list = name => [...new Set(data.get(name).split(',').map(id => id.trim()).filter(Boolean))];
    next.circuits = {
      ...this.panel.config?.circuits,
      ...(data.has('circuit-include') ? {
        selectionSaved: true,
        include: [...new Set(data.get('circuit-include').split(/[\s,]+/).filter(Boolean))],
      } : {}),
      protected: [...new Set(data.get('circuit-protected').split(/[\s,]+/).filter(Boolean))],
      power: {},
    };
    const circuit = id => /^(switch|light)\.[a-z0-9_]+$/.test(id);
    if ([...(next.circuits.include ?? []), ...next.circuits.protected].some(id => !circuit(id))) {
      status.textContent = 'Stromkreise · Bitte IDs mit switch. oder light. eingeben.';
      return;
    }
    for (const assignment of list('circuit-power')) {
      const [id, sensor, extra] = assignment.split('=').map(part => part.trim());
      if (!circuit(id) || !/^sensor\.[a-z0-9_]+$/.test(sensor) || extra !== undefined) {
        status.textContent = 'Stromkreise · Format: switch.schalter = sensor.leistung';
        return;
      }
      next.circuits.power[id] = sensor;
    }
    next.lights = [...new Set(data.get('light-selection').split(/[\s,]+/).filter(Boolean))];
    next.light_selection_saved = true;
    if (next.lights.some(id => !circuit(id))) {
      status.textContent = 'Leuchtenfilter · Bitte IDs mit light. oder switch. eingeben.';
      return;
    }
    const latitude = data.get('weather-latitude').trim().replace(',', '.');
    const longitude = data.get('weather-longitude').trim().replace(',', '.');
    if (latitude || longitude) {
      const lat = Number(latitude), lon = Number(longitude);
      if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) {
        status.textContent = 'Wetterstandort · Bitte gültigen Breiten- und Längengrad eintragen.';
        return;
      }
      next.weather_location = {latitude:lat,longitude:lon};
    }
    next.yellow_alerts = [...new Set(data.get('yellow-alerts').split(/[\s,]+/).filter(Boolean))];
    if (next.yellow_alerts.some(id => !/^alert\.[a-z0-9_]+$/.test(id) || !this.panel.ha.states[id])) {
      status.textContent = 'Gelbe Warnungen · Bitte vorhandene alert.*-Entitäten eingeben.';
      return;
    }
    next.overview_lights = [...new Set(data.get('overview-lights').split(/[\s,]+/).filter(Boolean))];
    if (next.overview_lights.length > 6 || next.overview_lights.some(id => !circuit(id))) {
      status.textContent = 'Übersicht · Bitte bis zu sechs IDs mit light. oder switch. eingeben.';
      return;
    }
    next.light_scenes = {};
    next.light_rated = this.panel.config?.light_rated;
    for (const key of ['off','evening','film','hell']) {
      const id = data.get('light-scene-'+key).trim();
      if (!id) continue;
      if (!/^(scene|script)\.[a-z0-9_]+$/.test(id) || !this.panel.ha.states[id]) {
        status.textContent = 'Lichtszenen · Bitte eine vorhandene Szene oder ein Skript eingeben.';
        return;
      }
      next.light_scenes[key] = id;
    }
    next.display_night_lights = [...new Set(data.get('display-night-lights').split(/[\s,;]+/).filter(Boolean))];
    if (next.display_night_lights.some(id => !/^(light|switch)\.[a-z0-9_]+$/.test(id) || !this.panel.ha.states[id])) {
      status.textContent = 'Nachtmodus · Bitte vorhandene light- oder switch-Entitäten eingeben.';
      return;
    }
    next.display_brightness_action = data.get('display-brightness-action').trim();
    if (next.display_brightness_action && !/^shell_command\.[a-z0-9_]+$/.test(next.display_brightness_action)) {
      status.textContent = 'Display-Helligkeit · Bitte eine shell_command-Aktion eingeben.';
      return;
    }
    next.sounds = {};
    for (const [key, label] of soundSlots) {
      const filename = data.get('sound-' + key)?.trim();
      if (!filename) continue;
      if (!validSoundName(filename)) {
        status.textContent = label + ' · Bitte nur einen Audiodateinamen eingeben.';
        return;
      }
      next.sounds[key] = filename;
    }
    let mobileConfig;
    try { mobileConfig = this.mobile.configFromForm(data, next); }
    catch (error) { status.textContent = error.message; return; }
    submit.disabled = true;
    try {
      await this.mobile.save(this.panel.ha, mobileConfig);
      await this.panel.ha.callWS({ type: 'frontend/set_system_data', key: settingsKey, value: next });
      try { localStorage.setItem(touchSoundPreference, data.has('touch-sounds') ? 'on' : 'off'); } catch {}
      try { localStorage.setItem(dashboardVolumePreference, data.get('dashboard-volume')); } catch {}
      this.panel.applyDashboardVolume();
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
