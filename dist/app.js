import { RADICALS, GROUPS } from './data.js';
import { STORAGE, INTERVALS, MAX_BACKUP_BYTES, dayKey, addDays, emptyProgress, loadProgress, saveProgress, mergeProgress, parseProgress, setKnown, recordAnswer, dailyPlan, dailyStats, exportProgress, importProgress } from './progress.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  repeat: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 8a7 7 0 0 1 12-3l2 2M4 17l2 2a7 7 0 0 0 12-3"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
let storageAvailable = true;
let progress = emptyProgress();
try {
  progress = loadProgress(localStorage);
} catch { storageAvailable = false; }
const known = new Set(Object.entries(progress.cards).filter(([, card]) => card.known).map(([id]) => Number(id)));

const state = { query: '', group: 'all', strokes: 0, onlyUnknown: false, page: 1, selected: 85, view: 'catalog' };
const PAGE_SIZE = 24;
let practice = progress.session;
if (practice?.kind === 'daily' && practice.date !== dayKey()) practice = null;
let practiceConfig = { group: 'all', count: 10, source: 'all' };
let toastTimer;
let lastDialogTrigger = null;

const plural = (n, forms) => forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];
const strokeText = n => `${n} ${plural(n, ['черта', 'черты', 'черт'])}`;
const keyText = n => `${n} ${plural(n, ['ключ', 'ключа', 'ключей'])}`;
const groupById = id => GROUPS.find(g => g.id === id);
const radicalById = id => RADICALS[id - 1];
const normalize = str => str.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/ё/g, 'е').replace(/v/g, 'u').trim();

function showToast(message) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

function syncKnown() {
  known.clear();
  Object.entries(progress.cards).filter(([, card]) => card.known).forEach(([id]) => known.add(Number(id)));
}

function storageNotice() {
  const notice = $('#storage-notice');
  notice.hidden = storageAvailable;
  notice.textContent = storageAvailable ? '' : 'Не удалось сохранить прогресс в браузере. До закрытия страницы скачай резервную копию в разделе «Прогресс». Прежние сохранённые данные не изменены.';
}

function persist() {
  progress.session = practice;
  try {
    progress = saveProgress(localStorage, progress);
    practice = progress.session;
    storageAvailable = true;
  } catch { storageAvailable = false; }
  syncKnown();
  storageNotice();
}

function markKnown(id, yes) {
  setKnown(progress, id, yes);
  persist();
}

const formatDay = day => new Intl.DateTimeFormat('ru', {day: 'numeric', month: 'long'}).format(new Date(`${day}T12:00:00`));
const dueLabel = day => day <= dayKey() ? 'Сегодня' : day === addDays(dayKey(), 1) ? 'Завтра' : formatDay(day);

function dailyHTML() {
  const stats = dailyStats(progress);
  const finished = stats.total === stats.completed;
  return `<div class="daily-copy"><p class="eyebrow">Небольшое занятие каждый день</p><h2>${finished ? 'На сегодня всё' : `${stats.total} ключей на сегодня`}</h2><p>${finished ? (stats.total ? `Готово: ${stats.completed} из ${stats.total}. ${stats.due ? 'Другие ключи по расписанию доступны в своей колоде.' : 'Вернись завтра за новой подборкой.'}` : stats.next ? `Ближайшее повторение — ${formatDay(stats.next)}.` : 'Все доступные ключи повторены.') : `Готово: ${stats.completed} из ${stats.total}. Сначала повторение, затем новые знаки.`}</p></div><div class="daily-actions"><button class="button primary" data-start-daily ${finished ? 'disabled' : ''}>${finished ? icon('check') + 'Занятие выполнено' : (stats.completed || (practice?.kind === 'daily' && practice.index < practice.ids.length) ? 'Продолжить занятие' : 'Начать занятие') + icon('arrow')}</button><a href="#progress">Расписание и прогресс</a></div>`;
}

function refreshDaily() {
  $$('[data-daily-summary]').forEach(el => { el.innerHTML = dailyHTML(); });
}

function filterRadicals() {
  const q = normalize(state.query);
  const numeric = q.match(/^#?(\d+)$/);
  const query = /^[a-z\s1-5]+$/.test(q) ? q.replace(/[1-5]/g, '') : q;
  return RADICALS.filter(r => {
    if (state.group !== 'all' && r.group !== state.group) return false;
    if (state.strokes && r.strokes !== state.strokes) return false;
    if (state.onlyUnknown && known.has(r.id)) return false;
    if (!q) return true;
    if (numeric) return r.id === Number(numeric[1]);
    const haystack = normalize([r.glyph, r.pinyin, r.meaning, ...r.variants].join(' '));
    return query.split(/\s+/).every(term => haystack.includes(term));
  });
}

function knownButton(r) {
  const learned = known.has(r.id);
  return `<button class="button full ${learned ? 'success' : 'primary'}" data-known="${r.id}" aria-pressed="${learned}">${icon(learned ? 'check' : 'book')}<span>${learned ? 'Знаю этот ключ' : 'Отметить: знаю'}</span></button>`;
}

function detailHTML(r, full = false) {
  const group = groupById(r.group);
  return `<div class="detail-panel">
    <div class="panel-label"><span>Крупным планом</span><strong>№ ${String(r.id).padStart(3, '0')}</strong></div>
    <div class="writing-grid"><span lang="zh">${r.glyph}</span></div>
    <h2 class="detail-title">${esc(r.meaning)}</h2><p class="detail-pinyin" lang="zh-Latn">${esc(r.pinyin)}</p>
    <div class="detail-facts"><span title="Количество черт в традиционной таблице Канси">${strokeText(r.strokes)}</span><span>${esc(group.name)}</span></div>
    ${r.variants.length ? `<section class="detail-section"><h3>Другие формы</h3><div class="variant-line" lang="zh">${r.variants.join('　')}</div>${full ? '<p class="small-note">Позиционные варианты и упрощённые формы.</p>' : ''}</section>` : ''}
    <section class="detail-section"><h3>Ассоциация для запоминания</h3><p>${esc(r.mnemonic)}</p></section>
    ${full && r.examples.length ? `<section class="detail-section"><h3>В составе знаков</h3><div class="example-list">${r.examples.map(e => `<div class="example-row"><span lang="zh">${e.glyph}</span><div><small lang="zh-Latn">${esc(e.pinyin)}</small><p>${esc(e.meaning)}</p></div></div>`).join('')}</div></section>` : ''}
    <div class="detail-actions">${knownButton(r)}${full ? '' : `<button class="icon-button" data-open="${r.id}" aria-label="Подробнее о ключе ${esc(r.meaning)}">${icon('expand')}</button>`}</div>
    ${progress.cards[r.id] ? `<p class="review-date">Следующее повторение: <strong>${dueLabel(progress.cards[r.id].due)}</strong></p>` : ''}
    ${full ? `<a class="reference-link" href="https://www.zdic.net/hans/${encodeURIComponent(r.glyph)}" target="_blank" rel="noopener noreferrer">Чтения и история знака в словаре Ханьдянь ↗</a><p class="small-note">Чтение — китайское. Число черт — по таблице Канси. Ассоциация придумана для запоминания.</p>` : '<p class="small-note">Резервная копия — в разделе «Прогресс»</p>'}
  </div>`;
}

function progressHTML() {
  return `<div class="progress-note"><div class="progress-line"><span>Отмечено знакомыми</span><strong>${known.size} / 214</strong></div><div class="progress-track" role="progressbar" aria-label="Знакомых ключей" aria-valuemin="0" aria-valuemax="214" aria-valuenow="${known.size}"><span style="width:${known.size / 214 * 100}%"></span></div><p class="small-note">Один верный ответ — начало. Закрепляй ключи в повторениях.</p><a class="reference-link" href="#progress">История и резервная копия →</a></div>`;
}

function catalogHTML() {
  return `<section aria-label="Каталог ключей">
    <section class="daily-banner" data-daily-summary aria-label="Занятие на сегодня">${dailyHTML()}</section>
    <div class="catalog-toolbar"><label class="searchbox">${icon('search')}<span class="sr-only">Поиск по иероглифу, номеру, значению или пиньиню</span><input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Знак, значение, пиньинь или номер…" value="${esc(state.query)}"><button class="clear-search" id="clear-search" type="button" aria-label="Очистить поиск" ${state.query ? '' : 'hidden'}>${icon('close')}</button></label><a class="button primary" href="#practice">${icon('book')}<span>Повторить ключи</span></a></div>
    <div class="category-list" role="group" aria-label="Смысловая группа"><button class="category ${state.group === 'all' ? 'active' : ''}" data-group="all" aria-pressed="${state.group === 'all'}">Все ключи <span class="category-count">214</span></button>${GROUPS.map(g => `<button class="category ${state.group === g.id ? 'active' : ''}" data-group="${g.id}" aria-pressed="${state.group === g.id}" title="${esc(g.full)}"><span class="category-glyph" lang="zh">${g.glyph}</span>${esc(g.name)}<span class="category-count">${RADICALS.filter(r => r.group === g.id).length}</span></button>`).join('')}</div>
    <div class="catalog-layout"><section class="catalog-results" aria-labelledby="results-title"><div class="results-head"><h2 id="results-title">${state.group === 'all' ? 'Все ключи' : groupById(state.group).name}<span id="result-count" class="results-count"></span></h2><div class="results-filters"><label class="learned-filter"><input id="unknown-only" type="checkbox" ${state.onlyUnknown ? 'checked' : ''}>Ещё не знаю</label><label><span class="sr-only">Фильтр по числу черт</span><select class="select" id="strokes"><option value="0">Любое число черт</option>${Array.from({length:17}, (_, i) => i + 1).map(n => `<option value="${n}" ${state.strokes === n ? 'selected' : ''}>${strokeText(n)}</option>`).join('')}</select></label></div></div><div id="results"></div></section>
    <aside class="catalog-aside" aria-label="Выбранный ключ"><div id="selected-detail">${detailHTML(radicalById(state.selected))}</div><div id="progress-summary">${progressHTML()}</div></aside></div>
    <div class="knowledge-bar"><span class="bar-glyph" lang="zh" aria-hidden="true">部</span><p><b>Ключ — подсказка к устройству иероглифа.</b> Он помогает искать знак в словаре, но не всегда объясняет его значение. <a href="#about">Как пользоваться</a></p></div>
  </section>`;
}

function renderResults() {
  const matches = filterRadicals();
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  state.page = Math.min(Math.max(state.page, 1), totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const page = matches.slice(start, start + PAGE_SIZE);
  $('#result-count').textContent = keyText(matches.length);
  if (!matches.length) {
    $('#results').innerHTML = `<div class="empty-state"><span class="empty-glyph" lang="zh" aria-hidden="true">無</span><h3>Ключи не найдены</h3><p>Попробуй другое слово, номер от 1 до 214 или сними фильтры.</p><button class="button" data-reset>Сбросить фильтры</button></div>`;
    return;
  }
  $('#results').innerHTML = `<div class="key-grid">${page.map(r => `<button class="key-card ${r.id === state.selected ? 'selected' : ''}" data-card="${r.id}" aria-label="Ключ ${r.id}: ${esc(r.meaning)}, ${esc(r.pinyin)}${known.has(r.id) ? ', изучен' : ''}"><span class="card-top"><span>№ ${String(r.id).padStart(3,'0')}</span><span class="known-mark" aria-hidden="true">${known.has(r.id) ? '✓' : ''}</span></span><span class="card-glyph" lang="zh">${r.glyph}</span><span class="card-pinyin" lang="zh-Latn">${esc(r.pinyin)}</span><span class="card-meaning">${esc(r.meaning)}</span></button>`).join('')}</div><div class="pagination"><p>${start + 1}–${Math.min(start + PAGE_SIZE, matches.length)} из ${matches.length} · Страница ${state.page} / ${totalPages}</p><div><button class="icon-button" data-page="prev" aria-label="Предыдущая страница" ${state.page <= 1 ? 'disabled' : ''}>${icon('left')}</button><button class="icon-button" data-page="next" aria-label="Следующая страница" ${state.page >= totalPages ? 'disabled' : ''}>${icon('right')}</button></div></div>`;
}

function refreshProgress() {
  refreshDaily();
  if (state.view === 'progress') {
    $('#app').innerHTML = learningProgressHTML();
    $('#import-progress').addEventListener('change', event => uploadProgress(event.target));
  }
  const target = $('#progress-summary');
  if (target) target.innerHTML = progressHTML();
  $$('[data-known]').forEach(button => {
    const r = radicalById(Number(button.dataset.known));
    const oldFocus = document.activeElement === button;
    const container = document.createElement('div');
    container.innerHTML = knownButton(r);
    const replacement = container.firstElementChild;
    button.replaceWith(replacement);
    if (oldFocus) replacement.focus({preventScroll:true});
  });
}

function setupCatalog() {
  renderResults();
  $('#search').addEventListener('input', event => {
    state.query = event.target.value;
    state.page = 1;
    $('#clear-search').hidden = !state.query;
    renderResults();
  });
  $('#clear-search').addEventListener('click', () => {
    state.query = '';
    state.page = 1;
    $('#search').value = '';
    $('#clear-search').hidden = true;
    $('#search').focus();
    renderResults();
  });
  $('#strokes').addEventListener('change', event => { state.strokes = Number(event.target.value); state.page = 1; renderResults(); });
  $('#unknown-only').addEventListener('change', event => { state.onlyUnknown = event.target.checked; state.page = 1; renderResults(); });
}

const dialog = document.createElement('dialog');
dialog.className = 'details-dialog';
dialog.setAttribute('aria-labelledby', 'dialog-key-title');
document.body.append(dialog);

function openDetail(id) {
  const r = radicalById(id);
  if (!r) return;
  state.selected = id;
  lastDialogTrigger = document.activeElement;
  const detail = $('#selected-detail');
  if (detail) detail.innerHTML = detailHTML(r);
  $$('[data-card]').forEach(card => card.classList.toggle('selected', Number(card.dataset.card) === id));
  dialog.innerHTML = `<div class="dialog-top"><span id="dialog-key-title">Ключ № ${id} · ${esc(groupById(r.group).name)}</span><button class="icon-button" data-close-dialog aria-label="Закрыть карточку">${icon('close')}</button></div><div class="dialog-body">${detailHTML(r,true)}</div>`;
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('dialog-open');
  dialog.scrollTop = 0;
  $('[data-close-dialog]', dialog).focus({preventScroll:true});
  history.replaceState(null, '', `#key-${id}`);
}

dialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  if (location.hash.startsWith('#key-')) history.replaceState(null,'',`#${state.view}`);
  const returnFocus = lastDialogTrigger?.isConnected ? lastDialogTrigger : $(`[data-card="${state.selected}"]`);
  returnFocus?.focus({preventScroll:true});
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

function practiceHTML() {
  return `<section class="practice-heading"><p class="eyebrow">От узнавания — к памяти</p><h1>Вспомни значение.</h1><p>Посмотри на знак, назови его значение и проверь себя.</p></section>
    <section class="daily-banner" data-daily-summary aria-label="Занятие на сегодня">${dailyHTML()}</section>
    <div class="practice-layout"><section class="practice-options" aria-label="Настройки тренировки"><h2>Своя колода</h2>
    <label class="field full-field">Смысловая группа<select class="select" id="practice-group"><option value="all">Все 214 ключей</option>${GROUPS.map(g => `<option value="${g.id}" ${practiceConfig.group === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}</select></label>
    <label class="field">За один раз<select class="select" id="practice-count">${[10, 20, 214].map(n => `<option value="${n}" ${practiceConfig.count === n ? 'selected' : ''}>${n === 214 ? 'Вся подборка' : n + ' карточек'}</option>`).join('')}</select></label>
    <label class="field">Какие ключи<select class="select" id="practice-source">${[['all','Все'],['due','Пора повторить'],['unknown','Ещё не знаю'],['known','Уже знаю']].map(([value, label]) => `<option value="${value}" ${practiceConfig.source === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <button class="button full-field" id="start-practice">Начать свою колоду${icon('arrow')}</button><p class="small-note">Ответы меняют расписание и здесь. Повтор в тот же день не увеличивает интервал.</p></section>
    <section class="practice-surface" aria-label="Карточки для повторения" id="practice-surface"></section></div>`;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function setupPractice() {
  $('#practice-group').addEventListener('change', e => { practiceConfig.group = e.target.value; if (!practice) renderPractice(); });
  $('#practice-count').addEventListener('change', e => { practiceConfig.count = Number(e.target.value); if (!practice) renderPractice(); });
  $('#practice-source').addEventListener('change', e => { practiceConfig.source = e.target.value; if (!practice) renderPractice(); });
  renderPractice();
}

function startDaily() {
  progress.daily = dailyPlan(progress);
  const {remaining} = dailyStats(progress);
  if (!remaining.length) { refreshDaily(); return; }
  if (!(practice?.kind === 'daily' && practice.date === dayKey() && practice.index < practice.ids.length)) {
    practice = makeSession(remaining, 'daily');
  }
  persist();
  if (state.view !== 'practice') location.hash = '#practice';
  else { renderPractice(); refreshDaily(); focusPractice(); }
}

function makeSession(ids, kind) {
  return {id: crypto.randomUUID(), kind, date: dayKey(), ids, index: 0, revealed: false, remembered: 0, repeat: []};
}

function focusPractice() {
  $('#practice-surface')?.scrollIntoView({behavior:'smooth', block:'start'});
  ($('#reveal-answer') || $('[data-answer="repeat"]'))?.focus({preventScroll:true});
}

function startPractice(onlyIds = null) {
  const pool = onlyIds || RADICALS.filter(r => (practiceConfig.group === 'all' || r.group === practiceConfig.group) &&
    (practiceConfig.source === 'all' || (practiceConfig.source === 'due' ? progress.cards[r.id]?.due <= dayKey() : practiceConfig.source === 'known' ? known.has(r.id) : !known.has(r.id)))).map(r => r.id);
  if (!pool.length) {
    showToast('В этой подборке нет ключей. Измени настройки колоды.');
    return;
  }
  practice = makeSession(shuffle(pool).slice(0, onlyIds ? onlyIds.length : practiceConfig.count), onlyIds ? 'retry' : 'custom');
  persist();
  renderPractice();
  refreshDaily();
  focusPractice();
}

function renderPractice() {
  const surface = $('#practice-surface');
  if (!surface) return;
  if (!practice) {
    const hasDaily = dailyStats(progress).remaining.length > 0;
    surface.innerHTML = `<div class="session-card practice-intro"><div class="practice-glyphs" lang="zh" aria-hidden="true">木 水 火</div><h2>Один знак. Одна мысль.</h2><p>Сначала попробуй вспомнить значение без подсказки. Затем открой ответ и честно оцени себя.</p><button class="button primary" ${hasDaily ? 'data-start-daily' : 'data-start-inline'}>${hasDaily ? 'Начать занятие на сегодня' : 'Начать свою колоду'}${icon('arrow')}</button></div>`;
    return;
  }
  if (practice.index >= practice.ids.length) {
    surface.innerHTML = `<div class="session-card"><p class="eyebrow">Тренировка завершена</p><div class="result-number">${practice.remembered}<small> / ${practice.ids.length}</small></div><h2>${practice.repeat.length ? 'Ещё немного практики.' : 'Все ключи вспомнились.'}</h2><p class="hint">${practice.repeat.length ? `К повторению: ${keyText(practice.repeat.length)}. Вернись к ним, пока образы свежи в памяти.` : 'Попробуй другую группу или вернись к этим знакам позже.'}</p><div class="result-actions">${practice.repeat.length ? `<button class="button primary" data-retry>${icon('repeat')}Повторить трудные</button>` : ''}<button class="button ${practice.repeat.length ? '' : 'primary'}" data-start-inline>Новая колода</button><a class="button" href="#catalog">К каталогу</a></div><p class="small-note" style="margin-top:20px">${storageAvailable ? 'Ответы сохранены. Даты повторений обновлены.' : 'Скачай резервную копию до закрытия страницы.'}<br><a href="#progress">Открыть расписание и историю</a></p></div>`;
    return;
  }
  const r = radicalById(practice.ids[practice.index]);
  surface.innerHTML = `<div class="session-meta"><span>${practice.kind === 'daily' ? 'Сегодня' : practice.kind === 'retry' ? 'Трудные ключи' : 'Своя колода'} · ${practice.index + 1} / ${practice.ids.length}</span><span>Вспомнил: ${practice.remembered}</span></div><div class="progress-track" role="progressbar" aria-label="Ход тренировки" aria-valuemin="0" aria-valuemax="${practice.ids.length}" aria-valuenow="${practice.index}"><span style="width:${practice.index / practice.ids.length * 100}%"></span></div><div class="session-card"><p class="eyebrow">Ключ № ${r.id} · ${strokeText(r.strokes)}</p><div class="writing-grid"><span lang="zh">${r.glyph}</span></div>${practice.revealed ? `<h2>${esc(r.meaning)}</h2><p class="detail-pinyin" lang="zh-Latn">${esc(r.pinyin)}</p><p class="hint">${esc(r.mnemonic)}</p><p class="small-note">Вспомнил: ${dueLabel(nextDue(r.id, true))}. Повторить: завтра.</p>` : '<p class="hint">Что означает этот ключ?</p>'}</div><div class="session-controls">${practice.revealed ? `<button class="button" data-answer="repeat">${icon('repeat')}Повторить</button><button class="button primary" data-answer="known">${icon('check')}Вспомнил</button>` : `<button class="button primary" id="reveal-answer">Показать ответ${icon('arrow')}</button>`}</div><p class="keyboard-note">${practice.revealed ? '<kbd>1</kbd> повторить · <kbd>2</kbd> вспомнил' : '<kbd>Пробел</kbd> — показать ответ'}</p>`;
}

function nextDue(id, remembered) {
  const preview = structuredClone(progress);
  recordAnswer(preview, id, remembered, 'preview');
  return preview.cards[id].due;
}

function revealAnswer() {
  if (!practice || practice.index >= practice.ids.length) return;
  practice.revealed = true;
  persist();
  renderPractice();
  $('[data-answer="repeat"]')?.focus({preventScroll:true});
}

function answerPractice(isKnown) {
  if (!practice || !practice.revealed || practice.index >= practice.ids.length) return;
  const id = practice.ids[practice.index];
  if (isKnown) practice.remembered++; else practice.repeat.push(id);
  recordAnswer(progress, id, isKnown, `${practice.id}:${practice.index}`);
  practice.index++;
  practice.revealed = false;
  persist();
  renderPractice();
  refreshDaily();
  const next = $('#reveal-answer') || $('[data-retry]') || $('[data-start-inline]');
  next?.focus({preventScroll:true});
}

function learningProgressHTML() {
  const cards = Object.entries(progress.cards).map(([id, card]) => ({id: Number(id), ...card}));
  const history = cards.flatMap(card => card.history.map(event => ({...event, keyId: card.id}))).sort((a, b) => b.at - a.at);
  const todayCount = new Set(history.filter(event => event.day === dayKey()).map(event => event.keyId)).size;
  const schedule = [...cards].sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  return `<section class="practice-heading"><p class="eyebrow">Шаг за шагом</p><h1>Твой прогресс.</h1><p>Отметки, ответы и следующие встречи со знаками.</p></section>
    <div class="learning-stats"><div><strong>${known.size}<small> / 214</small></strong><span>Знакомых ключей</span></div><div><strong>${todayCount}</strong><span>Повторено сегодня</span></div><div><strong>${dailyStats(progress).due}</strong><span>Пора повторить</span></div><div><strong>${history.length}</strong><span>Ответов в истории</span></div></div>
    <section class="backup-panel" aria-labelledby="backup-title"><div><h2 id="backup-title">Сохрани свои результаты</h2><p>Скачай копию и открой её на другом устройстве. При импорте записи объединяются: для каждого ключа сохраняется более свежий результат.</p><p class="small-note">Прогресс хранится в этом браузере. Очистка данных удалит его. Копия содержит отметки, даты и историю ответов.</p></div><div class="backup-actions"><button class="button primary" data-export>Скачать копию${icon('arrow')}</button><button class="button" data-import>Загрузить копию</button><input id="import-progress" type="file" accept=".json,application/json" hidden><p id="import-result" class="small-note" role="status" aria-live="polite"></p></div></section>
    <div class="progress-columns"><section class="progress-section"><h2>Расписание повторений</h2><p class="small-note">После успешных повторений: ${INTERVALS.join(', ')} дней. Ошибка возвращает ключ на завтра. Можно сразу повторить трудные в конце занятия.</p>${schedule.length ? `<ol class="schedule-list">${schedule.map(card => { const r = radicalById(card.id); return `<li><button class="schedule-key" data-open="${card.id}"><span lang="zh">${r.glyph}</span><span>${esc(r.meaning)}<small>№ ${card.id}</small></span></button><span class="due-badge ${card.due <= dayKey() ? 'is-due' : ''}">${dueLabel(card.due)}</span></li>`; }).join('')}</ol>` : '<p class="progress-empty">Здесь появятся ключи после первой тренировки или отметки в каталоге.</p>'}</section>
    <section class="progress-section"><h2>Последние ответы</h2><p class="small-note">Показаны последние 20 ответов. Полная история сохраняется в резервной копии.</p>${history.length ? `<ol class="schedule-list">${history.slice(0, 20).map(event => { const r = radicalById(event.keyId); return `<li><button class="schedule-key" data-open="${r.id}"><span lang="zh">${r.glyph}</span><span>${esc(r.meaning)}<small>${formatDay(event.day)} · ${new Intl.DateTimeFormat('ru', {hour:'2-digit',minute:'2-digit'}).format(event.at)}</small></span></button><span class="answer-badge ${event.remembered ? 'remembered' : ''}">${event.remembered ? 'Вспомнил' : 'Повторить'}</span></li>`; }).join('')}</ol>` : '<p class="progress-empty">Сначала вспомни значение знака, открой ответ и оцени себя.</p>'}<a class="button" href="#practice">К тренировке${icon('arrow')}</a></section></div>`;
}

function downloadProgress() {
  const blob = new Blob([exportProgress(progress)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `keys-214-progress-${dayKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function uploadProgress(input) {
  const file = input.files?.[0];
  if (!file) return;
  let message;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой. Выбери копию прогресса размером до 8 МБ.');
    const candidate = importProgress(progress, await file.text());
    // Validate and persist before changing the visible state.
    candidate.session = practice;
    const saved = saveProgress(localStorage, candidate);
    progress = saved;
    practice = progress.session;
    storageAvailable = true;
    syncKnown();
    message = `Копия загружена. Ключей с сохранёнными данными: ${Object.keys(progress.cards).length}. Более свежие результаты сохранены.`;
    render();
  } catch (error) { message = `${error.message || 'Не удалось загрузить копию.'} Текущий прогресс не изменён.`; }
  input.value = '';
  const result = $('#import-result');
  if (result) result.textContent = message;
  else showToast(message);
}

function aboutHTML() {
  return `<section class="about-heading"><p class="eyebrow">Книга, метод и источники</p><h1>Увидеть смысл в чертах.</h1><p>Учебный справочник по идее книги Алексея Мыцика.</p></section><div class="about-layout"><article class="article">
    <h2>Что такое 214 ключей</h2><p>Ключ, или <em>радикал</em>, — элемент, по которому иероглиф относят к разделу словаря. В традиционной системе Канси таких ключей 214. Они идут по числу черт: от одночёрточных до семнадцатичёрточного 龠.</p><p>Знакомые ключи помогают замечать составные части новых знаков. Но <strong>ключ не всегда раскрывает значение целого иероглифа</strong>, а его чтение не подсказывает автоматически произношение всех знаков с ним.</p>
    <p class="text-example" lang="zh">木 → 林 → 森</p><p>Дерево, лес, густой лес. У некоторых знаков связь легко заметить. У других понадобятся словарь и история письменности.</p>
    <h2>От бумажных карточек — к практике</h2><p>В книге «214 ключевых иероглифов в картинках с комментариями» А. П. Мыцика ключи организованы по шести темам и представлены на карточках. Этот принцип стал основой сайта.</p><p>Здесь используются <strong>собственные русские пояснения и ассоциации</strong>, китайское чтение в пиньине, традиционные номера и распространённые формы ключей. Распределение по темам составлено для сайта и может отличаться от книги.</p><div class="inline-notice"><p>Ассоциации в карточках — приём запоминания. Они не являются доказанной этимологией или реконструкцией древнего начертания. Историю конкретного знака можно посмотреть по ссылке на словарь в его карточке.</p></div>
    <h2>Как заниматься</h2><ol><li>Выбери небольшую группу и рассмотри знаки. Начать удобно с 山, 木, 日, 月, 水, 火, 人, 口.</li><li>Назови значение и чтение. Свяжи форму с предложенным образом или придумай свой.</li><li>Открой тренировку, вспомни значение и только потом посмотри ответ.</li><li>Отмечай знакомые ключи. Позже возвращайся к тем, которые ещё не запомнились.</li></ol>
    <h2>Почему формы и чтения различаются</h2><p>В каталоге показана традиционная форма ключа. Рядом могут быть сокращённые позиционные варианты и упрощённые китайские формы: например, 水 → 氵 и 龍 → 龙. У некоторых ключей несколько чтений; на карточке дано одно подходящее к указанному значению.</p><p>Число черт соответствует <strong>классической таблице Канси</strong>. В современных начертаниях и региональных нормах оно может отличаться. Например, ключ 龜 находится в группе 16 черт, хотя современная форма может учитываться как 17-чёрточная.</p><p>Особенно полезно различать 阝: слева это обычно 阜 «холм», справа — 邑 «город». Похожая на 月 часть может обозначать как луну, так и 肉 «плоть» — это зависит от знака.</p><p>Сайт ориентирован на китайский язык. Японские чтения кандзи здесь не приводятся.</p>
    <h2>Где читать книгу</h2><p>Издание на присланной фотографии: <strong>А. П. Мыцик, КАРО, 2006, 240 страниц, ISBN 5-89815-554-6</strong>. У издателя и на Литрес есть более позднее издание с ISBN 978-5-9925-0262-6.</p><p>На Литрес доступен бесплатный ознакомительный фрагмент, полный PDF продаётся. Полную бесплатную версию с подтверждённым разрешением на распространение найти не удалось. Полный текст и иллюстрированные карточки книги на этом сайте не воспроизводятся.</p>
    <h2>Источники</h2><ul class="source-list"><li><a href="https://karo.spb.ru/uchebniki-posobiya-po-inostrannym-yazykam/kitayskiy/214-klyuchevyx-ieroglifov-v-kartinkax-s-kommentariyami-izd-2/" target="_blank" rel="noopener noreferrer">КАРО · страница книги ↗</a><p>Описание издания, принцип карточек и шесть смысловых групп.</p></li><li><a href="https://www.litres.ru/book/aleksey-mycik/214-kluchevyh-ieroglifov-v-kartinkah-s-kommentariyami-11283090/" target="_blank" rel="noopener noreferrer">Литрес · бесплатный фрагмент и полный PDF ↗</a><p>На странице книги нажми «Читать фрагмент». Полная электронная версия — после покупки.</p></li><li><a href="https://www.unicode.org/charts/PDF/U2F00.pdf" target="_blank" rel="noopener noreferrer">Unicode · таблица всех 214 ключей ↗</a><p>Традиционные номера и соответствующие символы. Для данных использована версия Unicode 17.0.0.</p></li><li><a href="https://www.unicode.org/reports/tr38/" target="_blank" rel="noopener noreferrer">Unicode Unihan · чтения и значения ↗</a><p>Основа пиньиня и проверка значений. <a href="./licenses/unicode.txt" target="_blank" rel="noopener">Unicode License v3</a>.</p></li><li><a href="https://www.zdic.net/" target="_blank" rel="noopener noreferrer">Ханьдянь · китайский словарь ↗</a><p>Дополнительная проверка многозначных знаков и чтений ключей. В каждой карточке есть ссылка на соответствующую словарную статью.</p></li></ul>
    <h2>Твои отметки и повторения</h2><p>В занятии на сегодня до 10 ключей: сначала те, которым подошёл срок повторения, затем новые. Успешные повторения постепенно увеличивают интервал до 1, 3, 7, 14, 30 и 60 дней. После ошибки ключ возвращается на завтра; трудные можно повторить сразу в конце занятия. Повтор в тот же день или раньше срока не увеличивает интервал.</p><p>Дата занятия определяется по местному времени устройства. Незавершённая тренировка сохраняется при закрытии страницы. Прежние отметки «знаю» сохраняются и попадают в повторение, но не считаются историей успешных ответов.</p><p>Отметки и история хранятся в этом браузере. В разделе <a href="#progress">«Прогресс»</a> можно скачать резервную копию и загрузить её на другом устройстве. При импорте для каждого ключа сохраняется более свежий результат, история объединяется. Очистка данных браузера удалит местную копию.</p>
    </article><aside class="book-card"><p class="eyebrow">Книга-основа</p><h2>214 ключевых иероглифов</h2><p>В картинках с комментариями</p><p>Алексей Мыцик · КАРО</p><span class="tag">240 страниц</span><a class="button primary full" href="https://www.litres.ru/book/aleksey-mycik/214-kluchevyh-ieroglifov-v-kartinkah-s-kommentariyami-11283090/" target="_blank" rel="noopener noreferrer">Открыть на Литрес${icon('arrow')}</a><a class="button full" href="https://karo.spb.ru/uchebniki-posobiya-po-inostrannym-yazykam/kitayskiy/214-klyuchevyx-ieroglifov-v-kartinkax-s-kommentariyami-izd-2/" target="_blank" rel="noopener noreferrer">Страница издателя</a></aside></div>`;
}

function render() {
  const hash = location.hash;
  const deep = /^#key-(\d+)$/.exec(hash);
  state.view = hash === '#about' ? 'about' : hash === '#practice' ? 'practice' : hash === '#progress' ? 'progress' : 'catalog';
  if (dialog.open) dialog.close();
  $('.page-intro').hidden = state.view !== 'catalog';
  $$('.nav-link').forEach(a => { const active = a.hash === `#${state.view}`; a.classList.toggle('active',active); if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  document.title = `${state.view === 'practice' ? 'Тренировка' : state.view === 'progress' ? 'Прогресс' : state.view === 'about' ? 'Книга и источники' : '214 ключей'} · Иероглифика`;
  $('#app').innerHTML = state.view === 'practice' ? practiceHTML() : state.view === 'progress' ? learningProgressHTML() : state.view === 'about' ? aboutHTML() : catalogHTML();
  if (state.view === 'catalog') setupCatalog();
  if (state.view === 'practice') setupPractice();
  if (state.view === 'progress') $('#import-progress').addEventListener('change', event => uploadProgress(event.target));
  storageNotice();
  if (deep && radicalById(Number(deep[1]))) openDetail(Number(deep[1]));
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-close-dialog')) { dialog.close(); return; }
  if (button.hasAttribute('data-start-daily')) { startDaily(); return; }
  if (button.hasAttribute('data-export')) { downloadProgress(); return; }
  if (button.hasAttribute('data-import')) { $('#import-progress').click(); return; }
  if (button.dataset.card || button.dataset.open) { openDetail(Number(button.dataset.card || button.dataset.open)); return; }
  if (button.dataset.known) {
    const id = Number(button.dataset.known);
    const value = !known.has(id);
    markKnown(id, value);
    refreshProgress();
    if (state.view === 'catalog') renderResults();
    showToast(storageAvailable ? (value ? 'Ключ отмечен как знакомый' : 'Ключ возвращён к повторению') : 'Отметка сохранена до закрытия страницы');
    return;
  }
  if (button.dataset.group) {
    state.group = button.dataset.group;
    state.page = 1;
    $$('.category').forEach(b => { const active = b.dataset.group === state.group; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
    $('#results-title').innerHTML = `${state.group === 'all' ? 'Все ключи' : esc(groupById(state.group).name)}<span id="result-count" class="results-count"></span>`;
    renderResults();
    return;
  }
  if (button.dataset.page) {
    state.page += button.dataset.page === 'next' ? 1 : -1;
    renderResults();
    $('.catalog-results').scrollIntoView({behavior:'smooth',block:'start'});
    $('.key-card')?.focus({preventScroll:true});
    return;
  }
  if (button.hasAttribute('data-reset')) {
    Object.assign(state, {query:'',group:'all',strokes:0,onlyUnknown:false,page:1});
    render();
    $('#search')?.focus({preventScroll:true});
    return;
  }
  if (button.id === 'start-practice' || button.hasAttribute('data-start-inline')) { startPractice(); return; }
  if (button.id === 'reveal-answer') { revealAnswer(); return; }
  if (button.dataset.answer) { answerPractice(button.dataset.answer === 'known'); return; }
  if (button.hasAttribute('data-retry') && practice) { startPractice([...practice.repeat]); }
});

document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || state.view !== 'practice' || !practice || practice.index >= practice.ids.length || dialog.open) return;
  if (event.target.closest('input, select, textarea, a')) return;
  if (event.code === 'Space' && !practice.revealed && event.target.closest('#practice-surface')) { event.preventDefault(); revealAnswer(); }
  else if (practice.revealed && ['1','2'].includes(event.key)) { event.preventDefault(); answerPractice(event.key === '2'); }
});

window.addEventListener('hashchange', () => {
  render();
  if (state.view === 'practice' && practice && practice.index < practice.ids.length) focusPractice();
  else window.scrollTo({top:0,behavior:'instant'});
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE) return;
  if (!event.newValue) {
    storageAvailable = false;
    storageNotice();
    return;
  }
  try {
    const incoming = parseProgress(event.newValue);
    progress = mergeProgress(progress, incoming);
    if (incoming.session?.id === practice?.id && incoming.session.index > practice.index) practice = incoming.session;
    syncKnown();
    refreshProgress();
    if (state.view === 'catalog') renderResults();
    if (state.view === 'practice') renderPractice();
  } catch { /* Keep the last valid local state. */ }
});

let visibleDay = dayKey();
function refreshDate() {
  if (document.hidden || visibleDay === dayKey()) return;
  visibleDay = dayKey();
  if (practice?.kind === 'daily' && practice.date !== visibleDay) practice = null;
  render();
}
document.addEventListener('visibilitychange', refreshDate);
window.addEventListener('focus', refreshDate);
setInterval(refreshDate, 60000);

try { render(); if (storageAvailable) persist(); }
catch (error) {
  console.error(error);
  $('#app').innerHTML = '<div class="empty-state"><h2>Не удалось открыть карточки</h2><p>Обнови страницу. Если ошибка повторяется, попробуй другой браузер.</p><button class="button" id="reload-page">Обновить страницу</button></div>';
  $('#reload-page').addEventListener('click', () => location.reload());
}
