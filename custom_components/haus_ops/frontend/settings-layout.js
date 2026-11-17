/** Drag fallback for kiosks that report touchscreen gestures as mouse input. */
export function bindSettingsScroll(surface, horizontal = () => false) {
  let drag;
  let suppressClick = false;
  const finish = event => {
    if (drag?.id !== event.pointerId) return;
    if (surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    surface.classList.remove('settings-dragging');
    drag = undefined;
  };
  surface.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (event.button !== 0 || !event.isPrimary) return;
    // Preserve caret placement, selection, sliders and native select menus.
    if (event.target.closest('input, textarea, select, option, [contenteditable]')) return;
    const sideways = horizontal();
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY,
      left:surface.scrollLeft, top:surface.scrollTop, sideways};
  });
  surface.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const delta = drag.sideways ? drag.x - event.clientX : drag.y - event.clientY;
    if (!suppressClick && Math.abs(delta) < 8) return;
    if (!suppressClick) {
      suppressClick = true;
      surface.setPointerCapture(event.pointerId);
      surface.classList.add('settings-dragging');
    }
    if (event.cancelable) event.preventDefault();
    if (drag.sideways) surface.scrollLeft = drag.left + delta;
    else surface.scrollTop = drag.top + delta;
  }, {passive:false});
  for (const type of ['pointerup','pointercancel','lostpointercapture']) surface.addEventListener(type, finish);
  surface.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, {capture:true});
}

/** Keep the full form intact while offering large, touch-friendly section controls. */
export function setupSettingsLayout(dialog) {
  const fields = dialog.querySelector('.fields');
  const sections = [...fields.children].filter(element => element.tagName === 'FIELDSET');
  const navigation = dialog.querySelector('.settings-sections');
  const savedSection = dialog.dataset.section;
  bindSettingsScroll(fields);
  bindSettingsScroll(navigation, () => matchMedia('(max-width: 900px)').matches);
  const select = index => {
    sections.forEach((section, item) => { section.hidden = item !== index; });
    [...navigation.children].forEach((button, item) => {
      if (item === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    fields.scrollTop = 0;
    dialog.dataset.section = String(index);
  };
  sections.forEach((section, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = section.querySelector('legend').textContent;
    button.addEventListener('click', () => select(index));
    navigation.append(button);
  });
  select(Math.min(sections.length - 1, Number(savedSection) || 0));
  // Whole checkbox rows are touch targets; long service names wrap inside them.
  dialog.querySelectorAll('label').forEach(label => {
    if (label.querySelector('input[type="checkbox"]')) label.classList.add('settings-toggle');
  });
  dialog.querySelectorAll('input:not([type]), input[type="text"], textarea').forEach(input => {
    input.autocapitalize = 'none';
    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
  });
  // Bring validation failures into view even when their section is currently hidden.
  dialog.querySelector('form').addEventListener('invalid', event => {
    const index = sections.findIndex(section => section.contains(event.target));
    if (index !== -1) select(index);
  }, true);
  // Follow the visible viewport when a tablet's on-screen keyboard opens.
  const viewport = window.visualViewport;
  const fit = () => {
    dialog.style.setProperty('--settings-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    dialog.style.setProperty('--settings-viewport-top', `${viewport?.offsetTop ?? 0}px`);
  };
  viewport?.addEventListener('resize', fit);
  viewport?.addEventListener('scroll', fit);
  fit();
  dialog.addEventListener('close', () => {
    viewport?.removeEventListener('resize', fit);
    viewport?.removeEventListener('scroll', fit);
  }, {once:true});
}
