import { RADICALS, GROUPS } from './data.js';

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
const STORAGE = 'keys214.known.v1';
let storageAvailable = true;
const known = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
  if (Array.isArray(saved)) saved.filter(n => Number.isInteger(n) && n >= 1 && n <= 214).forEach(n => known.add(n));
} catch { storageAvailable = false; }

const state = { query: '', group: 'all', strokes: 0, onlyUnknown: false, page: 1, selected: 85, view: 'catalog' };
const PAGE_SIZE = 24;
let practice = null;
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

function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify([...known])); storageAvailable = true; }
  catch { storageAvailable = false; }
}

function markKnown(id, yes) {
  yes ? known.add(id) : known.delete(id);
  persist();
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
    ${full ? `<a class="reference-link" href="https://www.zdic.net/hans/${encodeURIComponent(r.glyph)}" target="_blank" rel="noopener noreferrer">Чтения и история знака в словаре Ханьдянь ↗</a><p class="small-note">Чтение — китайское. Число черт — по таблице Канси. Ассоциация придумана для запоминания.</p>` : '<p class="small-note">Отметки сохраняются в этом браузере</p>'}
  </div>`;
}

function progressHTML() {
  return `<div class="progress-note"><div class="progress-line"><span>Ты уже знаешь</span><strong>${known.size} / 214</strong></div><div class="progress-track" role="progressbar" aria-label="Изучено ключей" aria-valuemin="0" aria-valuemax="214" aria-valuenow="${known.size}"><span style="width:${known.size / 214 * 100}%"></span></div><p class="small-note">${storageAvailable ? 'Возвращайся к знакомым знакам в тренировке.' : 'Хранилище браузера недоступно. Отметки сохранятся только до закрытия страницы.'}</p></div>`;
}

function catalogHTML() {
  return `<section aria-label="Каталог ключей">
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
  if (location.hash.startsWith('#key-')) history.replaceState(null,'','#catalog');
  const returnFocus = lastDialogTrigger?.isConnected ? lastDialogTrigger : $(`[data-card="${state.selected}"]`);
  returnFocus?.focus({preventScroll:true});
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

function practiceHTML() {
  return `<section class="practice-heading"><p class="eyebrow">От узнавания — к памяти</p><h1>Вспомни значение.</h1><p>Посмотри на знак, назови его значение и проверь себя.</p></section><div class="practice-layout"><section class="practice-options" aria-label="Настройки тренировки"><h2>Твоя колода</h2><label class="field full-field">Смысловая группа<select class="select" id="practice-group"><option value="all">Все 214 ключей</option>${GROUPS.map(g => `<option value="${g.id}" ${practiceConfig.group === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}</select></label><label class="field">За один раз<select class="select" id="practice-count"><option value="10" ${practiceConfig.count === 10 ? 'selected' : ''}>10 карточек</option><option value="20" ${practiceConfig.count === 20 ? 'selected' : ''}>20 карточек</option><option value="214" ${practiceConfig.count === 214 ? 'selected' : ''}>Вся подборка</option></select></label><label class="field">Какие ключи<select class="select" id="practice-source"><option value="all" ${practiceConfig.source === 'all' ? 'selected' : ''}>Все</option><option value="unknown" ${practiceConfig.source === 'unknown' ? 'selected' : ''}>Ещё не знаю</option><option value="known" ${practiceConfig.source === 'known' ? 'selected' : ''}>Уже знаю</option></select></label><button class="button primary full-field" id="start-practice">${practice && practice.index < practice.ids.length ? 'Начать заново' : 'Начать тренировку'}${icon('arrow')}</button><p class="small-note">Ответ «Вспомнил» отмечает ключ как знакомый. «Повторить» снимает отметку.</p></section><section class="practice-surface" aria-label="Карточки для повторения" id="practice-surface"></section></div>`;
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

function startPractice(onlyIds = null) {
  const pool = onlyIds || RADICALS.filter(r => (practiceConfig.group === 'all' || r.group === practiceConfig.group) && (practiceConfig.source === 'all' || (practiceConfig.source === 'known' ? known.has(r.id) : !known.has(r.id)))).map(r => r.id);
  if (!pool.length) {
    practice = null;
    $('#practice-surface').innerHTML = `<div class="empty-state"><span class="empty-glyph" lang="zh" aria-hidden="true">空</span><h3>В этой колоде пока пусто</h3><p>${practiceConfig.source === 'known' ? 'Отметь знакомые ключи в каталоге или выбери «Все».' : 'Выбери другую группу или переключи подборку на «Все».'}</p><a class="button" href="#catalog">К каталогу</a></div>`;
    showToast('Для этих настроек нет карточек');
    return;
  }
  practice = { ids: shuffle(pool).slice(0, onlyIds ? onlyIds.length : practiceConfig.count), index: 0, revealed: false, remembered: 0, repeat: [] };
  $('#start-practice').innerHTML = `Начать заново${icon('arrow')}`;
  renderPractice();
  $('#practice-surface').scrollIntoView({behavior:'smooth',block:'start'});
  $('#reveal-answer')?.focus({preventScroll:true});
}

function renderPractice() {
  const surface = $('#practice-surface');
  if (!surface) return;
  if (!practice) {
    surface.innerHTML = `<div class="session-card practice-intro"><div class="practice-glyphs" lang="zh" aria-hidden="true">木 水 火</div><h2>Один знак. Одна мысль.</h2><p>Сначала попробуй вспомнить значение без подсказки. Затем открой ответ и честно оцени себя.</p><button class="button primary" data-start-inline>Начать с ${practiceConfig.count === 214 ? 'подборки' : practiceConfig.count + ' карточек'}${icon('arrow')}</button></div>`;
    return;
  }
  if (practice.index >= practice.ids.length) {
    $('#start-practice').innerHTML = `Новая тренировка${icon('arrow')}`;
    surface.innerHTML = `<div class="session-card"><p class="eyebrow">Тренировка завершена</p><div class="result-number">${practice.remembered}<small> / ${practice.ids.length}</small></div><h2>${practice.repeat.length ? 'Ещё немного практики.' : 'Все ключи вспомнились.'}</h2><p class="hint">${practice.repeat.length ? `К повторению: ${keyText(practice.repeat.length)}. Вернись к ним, пока образы свежи в памяти.` : 'Попробуй другую группу или вернись к этим знакам позже.'}</p><div class="result-actions">${practice.repeat.length ? `<button class="button primary" data-retry>${icon('repeat')}Повторить трудные</button>` : ''}<button class="button ${practice.repeat.length ? '' : 'primary'}" data-start-inline>Новая колода</button><a class="button" href="#catalog">К каталогу</a></div><p class="small-note" style="margin-top:20px">${storageAvailable ? 'Отметки обновлены в этом браузере.' : 'Хранилище недоступно: отметки сохранятся до закрытия страницы.'}</p></div>`;
    return;
  }
  const r = radicalById(practice.ids[practice.index]);
  surface.innerHTML = `<div class="session-meta"><span>Карточка ${practice.index + 1} из ${practice.ids.length}</span><span>Вспомнил: ${practice.remembered}</span></div><div class="progress-track" role="progressbar" aria-label="Ход тренировки" aria-valuemin="0" aria-valuemax="${practice.ids.length}" aria-valuenow="${practice.index}"><span style="width:${practice.index / practice.ids.length * 100}%"></span></div><div class="session-card"><p class="eyebrow">Ключ № ${r.id} · ${strokeText(r.strokes)}</p><div class="writing-grid"><span lang="zh">${r.glyph}</span></div>${practice.revealed ? `<h2>${esc(r.meaning)}</h2><p class="detail-pinyin" lang="zh-Latn">${esc(r.pinyin)}</p><p class="hint">${esc(r.mnemonic)}</p>` : '<p class="hint">Что означает этот ключ?</p>'}</div><div class="session-controls">${practice.revealed ? `<button class="button" data-answer="repeat">${icon('repeat')}Повторить</button><button class="button primary" data-answer="known">${icon('check')}Вспомнил</button>` : `<button class="button primary" id="reveal-answer">Показать ответ${icon('arrow')}</button>`}</div><p class="keyboard-note">${practice.revealed ? '<kbd>1</kbd> повторить · <kbd>2</kbd> вспомнил' : '<kbd>Пробел</kbd> — показать ответ'}</p>`;
}

function answerPractice(isKnown) {
  if (!practice || !practice.revealed || practice.index >= practice.ids.length) return;
  const id = practice.ids[practice.index];
  if (isKnown) practice.remembered++; else practice.repeat.push(id);
  markKnown(id, isKnown);
  practice.index++;
  practice.revealed = false;
  renderPractice();
  const next = $('#reveal-answer') || $('[data-retry]') || $('[data-start-inline]');
  next?.focus({preventScroll:true});
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
    <h2>Твои отметки</h2><p>Знакомые ключи сохраняются только в этом браузере. На другом устройстве отметок не будет; очистка данных браузера удалит их. Во время тренировки кнопка «Повторить» снимает отметку, а «Вспомнил» добавляет её.</p>
    </article><aside class="book-card"><p class="eyebrow">Книга-основа</p><h2>214 ключевых иероглифов</h2><p>В картинках с комментариями</p><p>Алексей Мыцик · КАРО</p><span class="tag">240 страниц</span><a class="button primary full" href="https://www.litres.ru/book/aleksey-mycik/214-kluchevyh-ieroglifov-v-kartinkah-s-kommentariyami-11283090/" target="_blank" rel="noopener noreferrer">Открыть на Литрес${icon('arrow')}</a><a class="button full" href="https://karo.spb.ru/uchebniki-posobiya-po-inostrannym-yazykam/kitayskiy/214-klyuchevyx-ieroglifov-v-kartinkax-s-kommentariyami-izd-2/" target="_blank" rel="noopener noreferrer">Страница издателя</a></aside></div>`;
}

function render() {
  const hash = location.hash;
  const deep = /^#key-(\d+)$/.exec(hash);
  state.view = hash === '#about' ? 'about' : hash === '#practice' ? 'practice' : 'catalog';
  if (dialog.open) dialog.close();
  $('.page-intro').hidden = state.view !== 'catalog';
  $$('.nav-link').forEach(a => { const active = a.hash === `#${state.view}`; a.classList.toggle('active',active); if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  document.title = `${state.view === 'practice' ? 'Тренировка' : state.view === 'about' ? 'Книга и источники' : '214 ключей'} · Иероглифика`;
  $('#app').innerHTML = state.view === 'practice' ? practiceHTML() : state.view === 'about' ? aboutHTML() : catalogHTML();
  if (state.view === 'catalog') setupCatalog();
  if (state.view === 'practice') setupPractice();
  if (deep && radicalById(Number(deep[1]))) openDetail(Number(deep[1]));
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-close-dialog')) { dialog.close(); return; }
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
  if (button.id === 'reveal-answer' && practice) { practice.revealed = true; renderPractice(); $('[data-answer="repeat"]')?.focus({preventScroll:true}); return; }
  if (button.dataset.answer) { answerPractice(button.dataset.answer === 'known'); return; }
  if (button.hasAttribute('data-retry') && practice) { startPractice([...practice.repeat]); }
});

document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || state.view !== 'practice' || !practice || practice.index >= practice.ids.length || dialog.open) return;
  if (event.target.closest('input, select, textarea, a')) return;
  if (event.code === 'Space' && !practice.revealed) { event.preventDefault(); practice.revealed = true; renderPractice(); $('[data-answer="repeat"]')?.focus({preventScroll:true}); }
  else if (practice.revealed && ['1','2'].includes(event.key)) { event.preventDefault(); answerPractice(event.key === '2'); }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo({top:0,behavior:'instant'}); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE && event.key !== null) return;
  try {
    const values = JSON.parse(event.newValue || '[]');
    if (!Array.isArray(values)) return;
    known.clear();
    values.filter(n => Number.isInteger(n) && n >= 1 && n <= 214).forEach(n => known.add(n));
    refreshProgress();
    if (state.view === 'catalog') renderResults();
  } catch { /* Keep the last valid local state. */ }
});

try { render(); }
catch (error) {
  console.error(error);
  $('#app').innerHTML = '<div class="empty-state"><h2>Не удалось открыть карточки</h2><p>Обнови страницу. Если ошибка повторяется, попробуй другой браузер.</p><button class="button" id="reload-page">Обновить страницу</button></div>';
  $('#reload-page').addEventListener('click', () => location.reload());
}
