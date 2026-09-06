// Calendar-based review schedule. No network or account is needed.
export const STORAGE = 'keys214.progress.v2';
export const LEGACY_STORAGE = 'keys214.known.v1';
export const INTERVALS = [1, 3, 7, 14, 30, 60];
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const IDS = Array.from({length: 214}, (_, i) => i + 1);
const STARTERS = [46, 75, 72, 74, 85, 86, 9, 30, 102, 32];

export const dayKey = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(day, days) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const emptyProgress = () => ({version: 2, cards: {}, daily: null, session: null});
const validId = id => Number.isInteger(id) && id >= 1 && id <= 214;
const validTime = n => Number.isSafeInteger(n) && n >= 0 && n < 253402300800000;
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validIds = ids => Array.isArray(ids) && ids.length <= 214 && ids.every(validId) && new Set(ids).size === ids.length;
const requireValid = condition => { if (!condition) throw new Error('Файл прогресса повреждён или имеет неподдерживаемый формат.'); };
const blankCard = now => ({known: false, level: 0, due: dayKey(now), lastReview: null, updatedAt: now, history: []});

export function migrateLegacy(values, now = Date.now()) {
  const progress = emptyProgress();
  if (Array.isArray(values)) for (const id of values.filter(validId)) {
    progress.cards[id] = {...blankCard(now), known: true, updatedAt: 0};
  }
  return progress;
}

// Rebuild allowed fields rather than accepting imported objects into live state.
export function validateProgress(value) {
  requireValid(object(value) && value.version === 2 && object(value.cards));
  const result = emptyProgress();
  const entries = Object.entries(value.cards);
  requireValid(entries.length <= 214);
  let reviews = 0;
  for (const [key, card] of entries) {
    requireValid(validId(Number(key)) && String(Number(key)) === key && object(card));
    requireValid(typeof card.known === 'boolean' && Number.isInteger(card.level) && card.level >= 0 && card.level <= INTERVALS.length);
    requireValid(validDay(card.due) && (card.lastReview === null || validDay(card.lastReview)) && validTime(card.updatedAt));
    requireValid(Array.isArray(card.history) && card.history.length <= 5000);
    reviews += card.history.length;
    requireValid(reviews <= 60000);
    const eventIds = new Set();
    const history = card.history.map(event => {
      requireValid(object(event) && typeof event.id === 'string' && /^[a-zA-Z0-9:-]{1,100}$/.test(event.id));
      requireValid(!eventIds.has(event.id) && validTime(event.at) && event.at <= card.updatedAt && validDay(event.day) && typeof event.remembered === 'boolean');
      eventIds.add(event.id);
      return {id: event.id, at: event.at, day: event.day, remembered: event.remembered};
    }).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    result.cards[key] = {known: card.known, level: card.level, due: card.due, lastReview: card.lastReview, updatedAt: card.updatedAt, history};
  }
  if (value.daily != null) {
    requireValid(object(value.daily) && validDay(value.daily.date) && validIds(value.daily.ids) && value.daily.ids.length <= 10);
    result.daily = {date: value.daily.date, ids: [...value.daily.ids]};
  }
  if (value.session != null) {
    const s = value.session;
    requireValid(object(s) && typeof s.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(s.id));
    requireValid(['daily', 'custom', 'retry'].includes(s.kind) && validDay(s.date) && validIds(s.ids) && s.ids.length > 0);
    requireValid(Number.isInteger(s.index) && s.index >= 0 && s.index <= s.ids.length && typeof s.revealed === 'boolean');
    requireValid(Number.isInteger(s.remembered) && s.remembered >= 0 && validIds(s.repeat) && s.remembered + s.repeat.length === s.index);
    requireValid(s.repeat.every(id => s.ids.slice(0, s.index).includes(id)));
    result.session = {id: s.id, kind: s.kind, date: s.date, ids: [...s.ids], index: s.index, revealed: s.revealed, remembered: s.remembered, repeat: [...s.repeat]};
  }
  return result;
}

export function parseProgress(text) {
  requireValid(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES);
  try { return validateProgress(JSON.parse(text)); }
  catch (error) { throw new Error('Файл прогресса повреждён или имеет неподдерживаемый формат.', {cause: error}); }
}

export function mergeProgress(local, incoming) {
  const result = structuredClone(local);
  if (incoming.daily && (!result.daily || incoming.daily.date > result.daily.date)) result.daily = structuredClone(incoming.daily);
  for (const [id, remote] of Object.entries(incoming.cards)) {
    const current = result.cards[id];
    if (!current) { result.cards[id] = structuredClone(remote); continue; }
    // A stale backup cannot roll back a newer answer or manual mark.
    const winner = remote.updatedAt > current.updatedAt ? remote : current;
    const events = new Map(remote.history.map(event => [event.id, event]));
    current.history.forEach(event => events.set(event.id, event));
    result.cards[id] = {...structuredClone(winner), history: [...events.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))};
  }
  return result;
}

export function loadProgress(storage, now = Date.now()) {
  const saved = storage.getItem(STORAGE);
  if (saved !== null) return parseProgress(saved);
  const legacy = storage.getItem(LEGACY_STORAGE);
  if (legacy === null) return emptyProgress();
  let values;
  try { values = JSON.parse(legacy); } catch { throw new Error('Не удалось прочитать прежние отметки. Исходные данные не изменены.'); }
  requireValid(Array.isArray(values));
  return migrateLegacy(values, now);
}

export function saveProgress(storage, progress) {
  const saved = storage.getItem(STORAGE);
  const merged = saved === null ? progress : mergeProgress(progress, parseProgress(saved));
  const checked = validateProgress(merged);
  // setItem is atomic: a quota error leaves the previous saved state intact.
  storage.setItem(STORAGE, JSON.stringify(checked));
  return checked;
}

export function setKnown(progress, id, known, now = Date.now()) {
  if (!validId(id)) return;
  const old = progress.cards[id] || blankCard(now);
  progress.cards[id] = {...old, known, level: 0, due: dayKey(now), updatedAt: Math.max(now, old.updatedAt + 1)};
}

export function recordAnswer(progress, id, remembered, eventId, now = Date.now()) {
  if (!validId(id)) return false;
  const old = progress.cards[id] || blankCard(now);
  if (old.history.some(event => event.id === eventId)) return false;
  const today = dayKey(now);
  // Early practice and immediate retries never advance multiple intervals.
  const advance = old.lastReview !== today && old.due <= today;
  const level = remembered ? Math.max(1, Math.min(INTERVALS.length, old.level + (advance ? 1 : 0))) : 0;
  const due = remembered && !advance && old.level > 0 ? old.due : addDays(today, remembered ? INTERVALS[level - 1] : 1);
  progress.cards[id] = {known: remembered, level, due, lastReview: today, updatedAt: Math.max(now, old.updatedAt + 1), history: [...old.history, {id: eventId, at: now, day: today, remembered}]};
  return true;
}

export function dailyPlan(progress, now = Date.now()) {
  const today = dayKey(now);
  if (progress.daily?.date === today) return progress.daily;
  const due = IDS.filter(id => progress.cards[id]?.due <= today).sort((a, b) => {
    const x = progress.cards[a], y = progress.cards[b];
    return x.due.localeCompare(y.due) || Number(x.known) - Number(y.known) || a - b;
  });
  const newIds = [...STARTERS, ...IDS.filter(id => !STARTERS.includes(id))].filter(id => !progress.cards[id]);
  return {date: today, ids: [...due, ...newIds].slice(0, 10)};
}

export function dailyStats(progress, now = Date.now()) {
  const today = dayKey(now);
  const plan = dailyPlan(progress, now);
  const reviewedToday = id => progress.cards[id]?.history.some(event => event.day === today);
  const completed = plan.ids.filter(reviewedToday).length;
  const dates = Object.values(progress.cards).map(card => card.due).filter(day => day > today).sort();
  return {total: plan.ids.length, completed, remaining: plan.ids.filter(id => !reviewedToday(id)), due: IDS.filter(id => progress.cards[id]?.due <= today).length, next: dates[0] || null};
}

export function exportProgress(progress, now = Date.now()) {
  return JSON.stringify({app: 'keys214', exportedAt: new Date(now).toISOString(), ...validateProgress(progress), session: null}, null, 2);
}

export function importProgress(local, text) {
  const incoming = parseProgress(text);
  const merged = mergeProgress(local, incoming);
  // Keep the current session and an existing plan for the same day.
  return validateProgress(merged);
}
