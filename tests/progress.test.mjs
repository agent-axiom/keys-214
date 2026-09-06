import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE, LEGACY_STORAGE, INTERVALS, dayKey, addDays, emptyProgress, migrateLegacy, validateProgress, parseProgress, mergeProgress, loadProgress, saveProgress, setKnown, recordAnswer, dailyPlan, dailyStats, exportProgress, importProgress } from '../dist/progress.js';

const time = day => new Date(`${day}T19:00:00`).getTime();
const NOW = time('2026-09-06');
const storage = initial => {
  const values = new Map(Object.entries(initial || {}));
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
};
const review = (progress, id, day, remembered = true, event = `review-${id}-${day}`) => recordAnswer(progress, id, remembered, event, time(day));

test('migration keeps valid old marks without inventing review history', () => {
  const saved = storage({[LEGACY_STORAGE]: '[1,85,214,85,0,215,"2",null]'});
  const p = loadProgress(saved, NOW);
  assert.deepEqual(Object.keys(p.cards), ['1','85','214']);
  assert.equal(p.cards[85].known, true);
  assert.equal(p.cards[85].level, 0);
  assert.equal(p.cards[85].due, '2026-09-06');
  assert.deepEqual(p.cards[85].history, []);
  saveProgress(saved, p);
  assert.equal(saved.getItem(LEGACY_STORAGE), '[1,85,214,85,0,215,"2",null]');
  assert.deepEqual(loadProgress(saved, NOW), p);
});

test('bad legacy and current data remain intact', () => {
  for (const [key, text] of [[STORAGE, '{bad'], [STORAGE, '{"version":3,"cards":{}}'], [LEGACY_STORAGE, '{broken']]) {
    const saved = storage({[key]: text});
    assert.throws(() => loadProgress(saved, NOW));
    if (key === STORAGE) assert.throws(() => saveProgress(saved, emptyProgress()));
    assert.equal(saved.getItem(key), text);
  }
});

test('successful spaced reviews grow intervals and cap at 60 days', () => {
  const p = emptyProgress();
  let day = '2026-09-06';
  for (const [i, interval] of [...INTERVALS, 60].entries()) {
    review(p, 85, day);
    assert.equal(p.cards[85].due, addDays(day, interval));
    assert.equal(p.cards[85].level, Math.min(i + 1, 6));
    day = p.cards[85].due;
  }
  assert.equal(p.cards[85].history.length, 7);
});

test('immediate retries and early practice do not inflate the interval', () => {
  const p = emptyProgress();
  review(p, 85, '2026-09-06');
  review(p, 85, '2026-09-06', true, 'same-day');
  assert.equal(p.cards[85].level, 1);
  review(p, 85, '2026-09-07');
  assert.equal(p.cards[85].due, '2026-09-10');
  review(p, 85, '2026-09-08');
  assert.equal(p.cards[85].level, 2);
  assert.equal(p.cards[85].due, '2026-09-10');
});

test('a forgotten card returns tomorrow and a retry starts from one day', () => {
  const p = emptyProgress();
  review(p, 85, '2026-09-06');
  review(p, 85, '2026-09-07');
  review(p, 85, '2026-09-08', false);
  assert.equal(p.cards[85].known, false);
  assert.equal(p.cards[85].level, 0);
  assert.equal(p.cards[85].due, '2026-09-09');
  review(p, 85, '2026-09-08', true, 'retry');
  assert.equal(p.cards[85].level, 1);
  assert.equal(p.cards[85].due, '2026-09-09');
});

test('processing the same answer twice is idempotent', () => {
  const p = emptyProgress();
  assert.equal(review(p, 85, '2026-09-06'), true);
  const before = structuredClone(p);
  assert.equal(review(p, 85, '2026-09-06', false), false);
  assert.deepEqual(p, before);
});

test('manual marks preserve history and request a review without advancing', () => {
  const p = emptyProgress();
  review(p, 85, '2026-09-06');
  setKnown(p, 85, true, time('2026-09-07'));
  assert.equal(p.cards[85].due, '2026-09-07');
  assert.equal(p.cards[85].level, 0);
  assert.equal(p.cards[85].history.length, 1);
});

test('daily queue gives overdue and forgotten cards priority before new keys', () => {
  const p = emptyProgress();
  review(p, 214, '2026-09-04');
  review(p, 213, '2026-09-05');
  review(p, 212, '2026-09-05', false);
  review(p, 85, '2026-09-06');
  const plan = dailyPlan(p, NOW);
  assert.deepEqual(plan.ids.slice(0, 3), [214, 212, 213]);
  assert.equal(plan.ids.length, 10);
  assert.equal(new Set(plan.ids).size, 10);
  assert.equal(plan.ids.includes(85), false);
});

test('daily plan and unfinished session survive reload; completed plan stays completed', () => {
  let p = emptyProgress();
  p.daily = dailyPlan(p, NOW);
  const ids = [...p.daily.ids];
  p.session = {id:'session-one', kind:'daily', date:'2026-09-06', ids, index:1, revealed:false, remembered:0, repeat:[ids[0]]};
  review(p, ids[0], '2026-09-06', false);
  const saved = storage();
  saveProgress(saved, p);
  p = loadProgress(saved, NOW);
  assert.equal(p.session.index, 1);
  assert.deepEqual(p.session.repeat, [ids[0]]);
  assert.deepEqual(dailyPlan(p, NOW).ids, ids);
  assert.equal(dailyStats(p, NOW).completed, 1);
  for (const id of ids.slice(1)) review(p, id, '2026-09-06');
  assert.equal(dailyStats(p, NOW).completed, 10);
  assert.deepEqual(dailyStats(p, NOW).remaining, []);
  assert.deepEqual(dailyPlan(p, NOW).ids, ids);
  assert.equal(dailyPlan(p, time('2026-09-07')).date, '2026-09-07');
});

test('no premature reviews are offered when every key is scheduled in the future', () => {
  const p = emptyProgress();
  for (let id = 1; id <= 214; id++) review(p, id, '2026-09-06');
  assert.deepEqual(dailyPlan(p, NOW).ids, []);
  assert.equal(dailyStats(p, NOW).next, '2026-09-07');
});

test('export/import round trip preserves all learning records', () => {
  const p = migrateLegacy([2, 85], NOW);
  p.daily = dailyPlan(p, NOW);
  review(p, 85, '2026-09-06');
  const copy = exportProgress(p, NOW);
  const restored = importProgress(emptyProgress(), copy);
  assert.deepEqual(restored.cards, p.cards);
  assert.deepEqual(restored.daily, p.daily);
  assert.equal(restored.session, null);
});

test('stale backups do not roll back results, erase keys, or duplicate history', () => {
  const p = emptyProgress();
  review(p, 85, '2026-09-06');
  const old = exportProgress(p, NOW);
  review(p, 85, '2026-09-07', false);
  review(p, 75, '2026-09-07');
  const merged = importProgress(p, old);
  assert.deepEqual(merged.cards, p.cards);
  assert.deepEqual(importProgress(merged, old), merged);
});

test('legacy migration timestamps do not hide real imported reviews', () => {
  const p = migrateLegacy([85], time('2026-09-08'));
  const backup = emptyProgress();
  review(backup, 85, '2026-09-06', false);
  assert.equal(importProgress(p, exportProgress(backup, NOW)).cards[85].known, false);
});

test('independent device histories merge and the latest schedule wins', () => {
  const a = emptyProgress(), b = emptyProgress();
  review(a, 85, '2026-09-06', true, 'device-a');
  review(b, 85, '2026-09-07', false, 'device-b');
  const merged = mergeProgress(a, b);
  assert.equal(merged.cards[85].history.length, 2);
  assert.equal(merged.cards[85].known, false);
  assert.equal(merged.cards[85].due, '2026-09-08');
  assert.deepEqual(mergeProgress(b, a).cards, merged.cards);
});

test('saving a stale tab merges newer stored records', () => {
  const saved = storage();
  const tabA = emptyProgress(), tabB = emptyProgress();
  review(tabA, 85, '2026-09-06');
  review(tabB, 75, '2026-09-06');
  saveProgress(saved, tabA);
  saveProgress(saved, tabB);
  assert.deepEqual(Object.keys(loadProgress(saved).cards), ['75', '85']);
});

test('quota errors leave the old serialized state unchanged', () => {
  const saved = storage();
  const p = emptyProgress();
  saveProgress(saved, p);
  const before = saved.getItem(STORAGE);
  saved.setItem = () => { throw new Error('QuotaExceededError'); };
  review(p, 85, '2026-09-06');
  assert.throws(() => saveProgress(saved, p), /QuotaExceededError/);
  assert.equal(saved.getItem(STORAGE), before);
});

test('malformed imports fail completely without changing live progress', () => {
  const p = emptyProgress();
  review(p, 85, '2026-09-06');
  const before = structuredClone(p);
  const bad = [];
  for (const change of [
    x => x.version = 99,
    x => x.cards[85].due = '2026-02-30',
    x => x.cards[85].level = 7,
    x => x.cards[85].known = 'yes',
    x => x.cards[85].history[0].remembered = 'true',
    x => x.cards[85].history.push({...x.cards[85].history[0]}),
    x => x.cards[215] = x.cards[85],
    x => x.session = {id:'bad', kind:'daily', date:'2026-09-06', ids:[85], index:2, revealed:false, remembered:2, repeat:[]},
  ]) { const candidate = structuredClone(p); change(candidate); bad.push(JSON.stringify(candidate)); }
  bad.push('{bad', 'null', '[]', '{"version":2,"cards":{"__proto__":{}}}');
  for (const file of bad) {
    assert.throws(() => importProgress(p, file));
    assert.deepEqual(p, before);
  }
});

test('local calendar dates work through month, year, leap-day and DST boundaries', () => {
  assert.equal(dayKey(new Date(2026, 8, 6, 0, 1).getTime()), '2026-09-06');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  const p = emptyProgress();
  review(p, 85, '2026-03-28');
  assert.equal(p.cards[85].due, '2026-03-29');
  assert.doesNotThrow(() => validateProgress(p));
  assert.deepEqual(parseProgress(exportProgress(p, NOW)).cards, p.cards);
});
