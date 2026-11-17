/** Keep the full form intact while offering large, touch-friendly section controls. */
export function setupSettingsLayout(dialog) {
  const fields = dialog.querySelector('.fields');
  const sections = [...fields.children].filter(element => element.tagName === 'FIELDSET');
  const navigation = dialog.querySelector('.settings-sections');
  const savedSection = dialog.dataset.section;
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
