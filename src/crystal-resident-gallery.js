import {appearance} from './crystal-traits.js';

// Both rehousing pickers identify the resident before showing a transfer for confirmation.
export function createResidentGallery(gallery, {namesFor, tankName, portrait, radioGroup}) {
  const rows = new Map();
  let now = 0;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const row = rows.get(entry.target.dataset.resident);
      if (entry.isIntersecting && row?.card === entry.target) portrait(row.image, row.record, now, row.fallback);
    }
  }, {root:gallery, rootMargin:'50px'});

  function clear() {
    observer.disconnect();
    rows.clear();
    gallery.replaceChildren();
  }
  function render(records, state) {
    const focused = gallery.contains(document.activeElement) && document.activeElement.value;
    const scroll = gallery.scrollTop;
    clear();
    now = state.now;
    const names = namesFor(state);
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      const card = document.createElement('label');
      card.dataset.resident = record.id;
      card.innerHTML = '<input><span class="space-photo"><img alt="" hidden><small>正在准备近照</small></span>'+
        '<strong></strong><small class="space-identity"></small><span class="space-note"></span>';
      const box = card.querySelector('input'), image = card.querySelector('img'), fallback = card.querySelector('.space-photo small');
      box.type = radioGroup ? 'radio' : 'checkbox';
      if (radioGroup) box.name = radioGroup;
      box.value = record.id;
      const label = names.get(record.id);
      card.querySelector('strong').textContent = label;
      card.querySelector('.space-identity').textContent = [tankName(record.tank), appearance(record),
        record.adultAt > now && '幼虾', record.protected && '已收藏'].filter(Boolean).join(' · ');
      const note = card.querySelector('.space-note');
      note.hidden = !record.observation;
      note.textContent = record.observation || '';
      rows.set(record.id, {card, record, box, image, fallback, label});
      fragment.append(card);
      observer.observe(card);
    }
    gallery.append(fragment);
    gallery.scrollTop = scroll;
    if (focused) rows.get(focused)?.box.focus({preventScroll:true});
  }
  return {rows, render, clear};
}
