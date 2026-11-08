const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadLogic, loadGame, read } = require('./harness');

const L = loadLogic();
// Card helper: C(5,0) is the 5 of spades. Ranks 1..13 (A..K); suits 0 spades, 1 hearts, 2 diamonds, 3 clubs.
const C = (r, s = 0) => ({ r, s });
const score = (hand, starter, crib = false) => L.scoreHand(hand, starter, crib).total;

test('hand scoring: well-known hands', () => {
  assert.equal(score([C(5, 0), C(5, 1), C(5, 3), C(11, 2)], C(5, 2)), 29);       // 5,5,5,J + 5 with nobs
  assert.equal(score([C(5, 0), C(5, 1), C(5, 3), C(10, 2)], C(5, 2)), 28);       // 5,5,5,10 + 5, no nobs
  assert.equal(score([C(7, 0), C(7, 1), C(8, 2), C(8, 3)], C(9, 0)), 24);        // 4 pairs of runs and fifteens
  assert.equal(score([C(3, 0), C(3, 1), C(4, 2), C(4, 3)], C(5, 0)), 20);
  assert.equal(score([C(10, 0), C(10, 1), C(10, 2), C(10, 3)], C(5, 0)), 20);    // 4 fifteens (8) + 6 pairs (12)
});

test('hand scoring: items add up to the total', () => {
  const r = L.scoreHand([C(3), C(4, 1), C(5, 2), C(6, 3)], C(7, 0), false);
  assert.equal(r.items.reduce((a, i) => a + i.p, 0), r.total);
});

// Previously flagged mismatches. Worked by hand, the game was right and the expectations were wrong.
test('flush of 4 also has a fifteen (2+4+9)', () => {
  assert.equal(score([C(2), C(4), C(7), C(9)], C(12, 1)), 6);   // fifteen 2 + flush 4
});
test('crib needs a 5-card flush: 4 same-suit cards score only the fifteen', () => {
  assert.equal(score([C(2), C(4), C(7), C(9)], C(12, 1), true), 2);
  assert.equal(score([C(2), C(4), C(7), C(9)], C(12, 0), true), 2 + 5);   // all five spades
});
test('flush of 5 in hand', () => {
  assert.equal(score([C(2), C(4), C(7), C(9)], C(12, 0)), 2 + 5);
});
test('nobs: jack of the starter suit scores 1, other jacks do not', () => {
  assert.equal(score([C(11, 2), C(1, 0), C(9, 1), C(13, 3)], C(2, 2)), 1);
  assert.equal(score([C(11, 1), C(1, 0), C(9, 1), C(13, 3)], C(2, 2)), 0);
});
test('run of 5, double runs, triple run', () => {
  assert.equal(score([C(3, 0), C(4, 1), C(5, 2), C(6, 3)], C(7, 0)), 5 + 4);      // run of 5 + fifteens 3+5+7 and 4+5+6
  assert.equal(score([C(3, 0), C(4, 1), C(5, 2), C(5, 3)], C(13, 0)), 6 + 2 + 4); // double run (6) + pair (2) + two 5+K fifteens (4)
});

// An independent, brute-force scorer used to cross-check scoreHand on many random hands.
function oracle(hand, starter, isCrib) {
  const all = [...hand, starter];
  const v = c => Math.min(c.r, 10);
  let total = 0;
  const n = all.length;
  for (let m = 1; m < 1 << n; m++) {
    const sub = all.filter((_, i) => m & (1 << i));
    if (sub.reduce((a, c) => a + v(c), 0) === 15) total += 2;
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (all[i].r === all[j].r) total += 2;
  for (let len = 5; len >= 3; len--) {
    let runs = 0;
    for (let m = 1; m < 1 << n; m++) {
      const sub = all.filter((_, i) => m & (1 << i));
      if (sub.length !== len) continue;
      const ranks = sub.map(c => c.r).sort((a, b) => a - b);
      if (ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) runs++;
    }
    if (runs) { total += runs * len; break; }
  }
  if (hand.every(c => c.s === hand[0].s)) {
    if (starter.s === hand[0].s) total += 5;
    else if (!isCrib) total += 4;
  }
  if (hand.some(c => c.r === 11 && c.s === starter.s)) total += 1;
  return total;
}

test('hand scoring agrees with an independent brute-force scorer (20,000 random hands)', () => {
  for (let k = 0; k < 20000; k++) {
    const d = L.shuffle(L.newDeck());
    const hand = d.slice(0, 4), starter = d[4], isCrib = k % 2 === 0;
    const got = score(hand, starter, isCrib), want = oracle(hand, starter, isCrib);
    assert.equal(got, want, `hand ${JSON.stringify(hand)} starter ${JSON.stringify(starter)} crib=${isCrib}`);
  }
});

test('no hand can score 19, 25, 26 or 27 (impossible cribbage scores)', () => {
  const seen = new Set();
  for (let k = 0; k < 30000; k++) {
    const d = L.shuffle(L.newDeck());
    seen.add(score(d.slice(0, 4), d[4]));
  }
  for (const bad of [19, 25, 26, 27]) assert.ok(!seen.has(bad), `scored ${bad}`);
  assert.ok(Math.max(...seen) <= 29);
});

function peg(ranks) {
  const pile = ranks.map(r => C(r));
  const count = pile.reduce((a, c) => a + L.val(c), 0);
  return L.pegPoints(pile, count).pts;
}
test('pegging points', () => {
  assert.equal(peg([7, 8]), 2);            // count 15
  assert.equal(peg([10, 5]), 2);           // count 15
  assert.equal(peg([4, 5, 6]), 2 + 3);     // count 15 plus run of 3 (was mis-expected as 3)
  assert.equal(peg([6, 6]), 2);            // pair
  assert.equal(peg([6, 6, 6]), 6);         // pair royal
  assert.equal(peg([5, 5, 5, 5]), 12);     // double pair royal
  assert.equal(peg([3, 4, 5, 2]), 4);      // run of 4 in any order, count 14
  assert.equal(peg([3, 5, 4, 6]), 4);      // run of 4 out of order, count 18
  assert.equal(peg([2, 4, 3]), 3);         // run of 3 out of order
  assert.equal(peg([6, 2, 3, 4]), 2 + 3);  // 15 plus run of 3; the 6 does not extend it
  assert.equal(peg([5, 3, 5]), 0);         // pairs must be adjacent
  assert.equal(peg([10, 10, 10, 1]), 2);   // count 31 (was mis-expected as 0)
  assert.equal(peg([9, 8, 7, 6]), 4);      // run of 4, count 30
  assert.equal(peg([9, 8, 7, 6, 1]), 2);   // count 31; the 1 breaks the run
});
test('pegging: a pair adjacent to a run only counts once each', () => {
  assert.equal(peg([4, 5, 5]), 2);   // pair of 5s; 4,5,5 is not a run
});

test('version compare', () => {
  assert.equal(L.cmpVer('1.0.1', '1.0.0'), 1);
  assert.equal(L.cmpVer('1.0.0', '1.0.0'), 0);
  assert.equal(L.cmpVer('1.2', '1.10'), -1);
  assert.equal(L.cmpVer('2', '1.9.9'), 1);
  assert.equal(L.cmpVer('1.0', '1.0.0'), 0);
});

test('board: every score 1-120 has its own hole, in reading order; 0 is the start and 121 is home', () => {
  assert.deepEqual(L.pegCell(0), { start: true });
  assert.deepEqual(L.pegCell(-3), { start: true });
  assert.deepEqual(L.pegCell(121), { home: true });
  const seen = new Set();
  let prev = -1;
  for (let sc = 1; sc <= 120; sc++) {
    const c = L.pegCell(sc);
    assert.ok(c.band >= 0 && c.band < 4 && c.col >= 0 && c.col < 30, `score ${sc}`);
    const idx = c.band * 30 + c.col;
    assert.ok(idx > prev, 'holes advance left to right, top to bottom');
    prev = idx; seen.add(idx);
  }
  assert.equal(seen.size, 120);
  assert.deepEqual(L.pegCell(30), { band: 0, col: 29 });
  assert.deepEqual(L.pegCell(31), { band: 1, col: 0 });
  assert.deepEqual(L.pegCell(61), { band: 2, col: 0 });   // double skunk line sits before 61
  assert.deepEqual(L.pegCell(91), { band: 3, col: 0 });   // skunk line sits before 91
});

test('stats: wins, losses, streaks, skunks, per difficulty', () => {
  const s = L.emptyStats();
  L.recordGame(s, { won: true, loserScore: 100, level: 'normal' });
  L.recordGame(s, { won: true, loserScore: 85, level: 'hard' });    // skunk
  L.recordGame(s, { won: true, loserScore: 40, level: 'hard' });    // double skunk
  assert.deepEqual([s.games, s.w, s.l, s.streak, s.bestStreak], [3, 3, 0, 3, 3]);
  assert.deepEqual([s.skunksFor, s.doubleFor], [2, 1]);
  L.recordGame(s, { won: false, loserScore: 61, level: 'easy' });   // we lost with 61: skunked, but 61 is not a double skunk
  assert.deepEqual([s.streak, s.bestStreak, s.l, s.skunksAgainst, s.doubleAgainst], [0, 3, 1, 1, 0]);
  L.recordGame(s, { won: false, loserScore: 60, level: 'easy' });   // 60 or fewer is a double skunk
  assert.deepEqual([s.skunksAgainst, s.doubleAgainst], [2, 1]);
  assert.deepEqual(s.byDiff.hard, { w: 2, l: 0 });
  assert.deepEqual(s.byDiff.easy, { w: 0, l: 2 });   // the 61 and the 60 games
  L.recordGame(s, { won: false, loserScore: 90, level: 'easy' });   // 90 is a skunk, 91 is safe
  L.recordGame(s, { won: false, loserScore: 91, level: 'easy' });
  assert.equal(s.skunksAgainst, 3);
});
test('stats: hand and crib averages and bests', () => {
  const s = L.emptyStats();
  L.recordHand(s, 8, false); L.recordHand(s, 12, false); L.recordHand(s, 4, true);
  assert.deepEqual([s.handN, s.handSum, s.bestHand, s.cribN, s.cribSum, s.bestCrib], [2, 20, 12, 1, 4, 4]);
});
test('stats: loading tolerates junk and missing fields', () => {
  assert.deepEqual(L.mergeStats(null), L.emptyStats());
  assert.deepEqual(L.mergeStats('x'), L.emptyStats());
  const m = L.mergeStats({ w: 3, games: 5, byDiff: { hard: { w: 2, l: 1 } }, bogus: 9, l: 'nope' });
  assert.equal(m.w, 3); assert.equal(m.games, 5); assert.equal(m.l, 0);
  assert.deepEqual(m.byDiff.hard, { w: 2, l: 1 });
  assert.equal(m.bogus, undefined);
});

test('discards: returns two cards from the hand, Hard keeps the better hand than a random choice', () => {
  const hand = [C(5, 0), C(5, 1), C(5, 2), C(11, 3), C(1, 0), C(13, 1)];
  for (const level of ['easy', 'normal', 'hard']) {
    const r = L.bestDiscard(hand, true, level);
    assert.equal(r.disc.length, 2);
    assert.ok(r.disc.every(c => hand.includes(c)));
    assert.equal(r.keep.length, 4);
  }
  // Hard/Normal should never throw away a pair of 5s from 5,5,5,J,A,K when they are the pone
  const hard = L.bestDiscard(hand, false, 'hard');
  assert.ok(hard.disc.filter(c => c.r === 5).length < 2, 'tossed two fives into the opponent crib');
});

test('pegging AI: takes a 15 or 31 when it can, never plays an illegal card', () => {
  const pile = [C(10)];
  const hand = [C(5), C(9), C(2)];
  for (const level of ['easy', 'normal', 'hard']) {
    for (let i = 0; i < 20; i++) {
      const c = L.choosePlay({ playable: hand, pile, count: 10, level, unseen: [], oppLeft: 0 });
      assert.ok(hand.includes(c));
    }
  }
  for (const level of ['normal', 'hard']) {
    const c = L.choosePlay({ playable: hand, pile, count: 10, level, unseen: [], oppLeft: 0, det: true });
    assert.equal(c.r, 5, `${level} should make 15 with the 5`);
  }
});
test('pegging AI (hard): avoids giving away a 31 when it has a safe alternative', () => {
  // count 21: playing a 10 hits 31 for 2; that should obviously be preferred
  const c = L.choosePlay({ playable: [C(10), C(2)], pile: [C(10), C(1), C(10)], count: 21, level: 'hard', unseen: [], oppLeft: 0, det: true });
  assert.equal(c.r, 10);
});
test('pegSim: points are counted for both sides, including go and last card', () => {
  // I play 5 (count 15, +2), they play 2 and take the last card (+1): net +1
  assert.equal(L.pegSim([C(10)], 10, [C(5)], [C(2)], 0, 1), 1);
  // 10s all round: they pair (-2), I make a pair royal (+6), I take the go (+1), they take the last card (-1)
  assert.equal(L.pegSim([], 0, [C(10), C(10)], [C(10), C(10)], 0, null), 4);
});
test('pegging AI (hard, with lookahead): returns a legal card and prefers an immediate 15 over a risky play', () => {
  const myHand = [C(5), C(9), C(2)];
  const known = new Set([...myHand, C(10)].map(L.key));
  const unseen = L.newDeck().filter(c => !known.has(L.key(c)));
  for (let i = 0; i < 10; i++) {
    const c = L.choosePlay({ playable: myHand, pile: [C(10)], count: 10, level: 'hard', unseen, oppLeft: 4, myHand });
    assert.ok(myHand.includes(c));
  }
  // with 31 on offer the lookahead must take it
  const take31 = L.choosePlay({ playable: [C(10), C(2)], pile: [C(10), C(1), C(10)], count: 21, level: 'hard',
    unseen: unseen.filter(c => c.r !== 10), oppLeft: 3, myHand: [C(10), C(2)], det: true });
  assert.equal(take31.r, 10);
});
test('pHasAny is a probability and monotone', () => {
  assert.equal(L.pHasAny(40, 0, 4), 0);
  assert.equal(L.pHasAny(40, 5, 0), 0);
  const a = L.pHasAny(40, 5, 4), b = L.pHasAny(40, 10, 4);
  assert.ok(a > 0 && a < b && b < 1);
  assert.equal(L.pHasAny(10, 10, 3), 1);
});

// ---------- whole game, headless ----------
function botGame(g, levelMe, levelNpc, stubGameOver = true) {
  g.run(`settings.level=${JSON.stringify(levelNpc)};
    humanDiscard=async()=>{const r=bestDiscard(G.hands[0],G.dealer===0,${JSON.stringify(levelMe)});return r.disc.map(c=>G.hands[0].indexOf(c))};
    humanPlay=async()=>{const pl=G.peg[0].filter(c=>G.count+val(c)<=31);
      return choosePlay({playable:pl,pile:G.pile,count:G.count,level:${JSON.stringify(levelMe)},unseen:unseenFor(0),oppLeft:G.peg[1].length,myHand:G.peg[0]})};
    undoWindow=async()=>true;
    showPanel=async()=>{};
    var results=[];
    ${stubGameOver ? 'gameOver=w=>{results.push({w,s:[...G.scores]})};' : ''}`);
}
async function playMany(n, levelMe, levelNpc) {
  const g = loadGame();
  botGame(g, levelMe, levelNpc);
  for (let i = 0; i < n; i++) await g.run('newGame()');
  return g.run('results');
}

test('full games run to completion with sane scores at every difficulty', async () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const res = await playMany(15, 'normal', level);
    assert.equal(res.length, 15);
    for (const r of res) {
      assert.ok(Math.max(...r.s) === 121, 'winner has exactly 121');
      assert.ok(Math.min(...r.s) < 121 && Math.min(...r.s) >= 0);
      assert.ok(r.w === (r.s[0] === 121 ? 0 : 1));
    }
  }
});

// Expected win rates are about 80% for Hard and 70% for Normal against Easy; these thresholds sit several
// standard deviations below that so luck alone will essentially never fail the build.
test('difficulty ordering: Hard and Normal clearly beat Easy', async () => {
  const hardVsEasy = await playMany(100, 'hard', 'easy');
  const normVsEasy = await playMany(100, 'normal', 'easy');
  const winsHard = hardVsEasy.filter(r => r.w === 0).length;
  const winsNorm = normVsEasy.filter(r => r.w === 0).length;
  assert.ok(winsHard >= 60, `hard won only ${winsHard}/100 against easy`);
  assert.ok(winsNorm >= 55, `normal won only ${winsNorm}/100 against easy`);
});

test('there is a pause after the last card of the play before the counting starts', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`var events=[];
    sleep=ms=>{events.push(ms);return Promise.resolve()};
    showPanel=async()=>{events.push('show');throw{abort:true}};`);
  await g.run('newGame()');
  const ev = g.run('events');
  const i = ev.indexOf('show');
  assert.ok(i > 0, 'the count was reached');
  assert.ok(ev[i - 1] >= 1500, `expected a pause of at least 1.5s right before counting, got ${ev[i - 1]}ms`);
});
test('the pause is shortened by "skip animations"', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`settings.fast=true;var events=[];
    sleep=ms=>{events.push(ms);return Promise.resolve()};
    showPanel=async()=>{events.push('show');throw{abort:true}};`);
  await g.run('newGame()');
  const ev = g.run('events');
  assert.ok(ev.every(x => x === 'show' || x <= 120), 'no long pauses when animations are skipped');
});

test('stats are recorded by the game and old 1.0 records are migrated', async () => {
  const g = loadGame();
  g.store.set('crib-rec', JSON.stringify({ w: 4, l: 2 }));
  assert.deepEqual([g.run('loadStats().w'), g.run('loadStats().l'), g.run('loadStats().games')], [4, 2, 6]);
  botGame(g, 'normal', 'normal', false);   // keep the real gameOver so it records the result
  g.run('stats=emptyStats()');
  await g.run('newGame()');
  assert.equal(g.run('stats.games'), 1);
  assert.ok(g.run('stats.handN') > 0 && g.run('stats.cribN') >= 0);
  assert.ok(g.store.has('crib-stats'));
});


// ---------- version 1.2 features ----------
test('skunk lines: full game (91 / 61) and short game (31)', () => {
  assert.deepEqual([90, 91, 60, 61, 0].map(x => L.skunkKind(x, 121)), ['skunk', null, 'double', 'skunk', 'double']);
  assert.deepEqual([30, 31, 0].map(x => L.skunkKind(x, 61)), ['skunk', null, 'skunk']);
});
test('muggins: what you claim is what you score, the NPC takes the difference', () => {
  assert.deepEqual(L.resolveClaim(8, 12), { me: 8, npc: 4, over: false });
  assert.deepEqual(L.resolveClaim(12, 12), { me: 12, npc: 0, over: false });
  assert.deepEqual(L.resolveClaim(14, 12), { me: 12, npc: 0, over: true });
  assert.deepEqual(L.resolveClaim(0, 0), { me: 0, npc: 0, over: false });
});
test('short game: board cells and stats use the 61 target', () => {
  assert.equal(L.pegCell(61, 61).home, true);
  assert.equal(L.pegCell(60, 61).home, undefined);
  assert.equal(L.pegCell(61, 121).home, undefined);
  const st = L.emptyStats();
  L.recordGame(st, { won: true, loserScore: 20, level: 'normal', target: 61 });
  L.recordGame(st, { won: false, loserScore: 45, level: 'normal', target: 61 });
  assert.equal(st.skunksFor, 1);
  assert.equal(st.skunksAgainst, 0);
  assert.equal(st.doubleFor, 0);
});
test('hint explanations: ranked plays are best-first and the text mentions the points', () => {
  const o = { playable: [C(5, 0), C(10, 1)], pile: [C(10, 2)], count: 10, level: 'hard', det: true,
    myHand: [C(5, 0), C(10, 1), C(2, 3)], unseen: L.newDeck().filter(c => !(c.r === 5 && c.s === 0)).slice(0, 30), oppLeft: 3 };
  const rk = L.rankPlays(o);
  assert.equal(rk.length, 2);
  assert.ok(rk[0].v >= rk[1].v);
  assert.match(L.explainPlay(rk, o.pile, o.count), /scores/);
  const h = L.bestDiscard([C(5, 0), C(5, 1), C(5, 2), C(11, 3), C(13, 1), C(2, 0)], true, 'hard');
  assert.equal(h.disc.length, 2);
  assert.ok(L.explainDiscard(h, true).length > 10);
});
test('saved games: round trip, and junk is rejected', () => {
  const g = loadGame();
  g.run(`botSetup=1`);
  const d = L.newDeck();
  const base = { scores: [10, 20], prev: [5, 12], dealer: 1, level: 'hard', target: 61, muggins: true,
    hands: [d.slice(0, 4), d.slice(4, 8)], orig: [d.slice(0, 6), d.slice(6, 12)], crib: d.slice(12, 14), starter: d[14],
    deck: d.slice(20), peg: [d.slice(0, 2), d.slice(4, 6)], pile: [d[30]], playedAll: [d[30]], count: 10, stage: 'peg',
    showIdx: 0, pcur: 1, plast: 0, pegInit: true, log: ['a', 'b'] };
  const back = L.unpackGame(JSON.parse(JSON.stringify(L.packGame(base))));
  assert.deepEqual(back.scores, [10, 20]);
  assert.equal(back.target, 61);
  assert.equal(back.stage, 'peg');
  assert.equal(back.hands[0].length, 4);
  for (const bad of [null, 5, 'x', {}, { ...L.packGame(base), stage: 'nope' }, { ...L.packGame(base), target: 99 },
    { ...L.packGame(base), scores: [1] }, { ...L.packGame(base), hands: 'junk' }]) {
    assert.equal(L.unpackGame(bad), null);
  }
});
test('sound and vibration never throw when the browser has no audio or vibration', () => {
  const g = loadGame();
  g.run(`for(const k of ['play','go','score','npcscore','win','lose'])sfx(k,9);buzz(50);settings.sound=false;sfx('win');settings.haptics=false;buzz(10)`);
});
test('short game (to 61) runs to completion and never exceeds 61', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run('settings.target=61');
  for (let i = 0; i < 10; i++) await g.run('newGame()');
  const res = g.run('results');
  assert.equal(res.length, 10);
  for (const r of res) { assert.equal(Math.max(...r.s), 61); assert.ok(Math.min(...r.s) < 61); }
});
test('muggins game: missed points go to the NPC and games still finish', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`settings.muggins=true;var mug=0,askN=0;
    askCount=async(t,h,s)=>{askN++;const a=scoreHand(h,s,t.includes('crib')).total;return Math.max(0,a-(askN%3===0?2:0))};
    const oa=addScore;addScore=(p,pts,why)=>{if(why==='muggins')mug++;return oa(p,pts,why)};`);
  for (let i = 0; i < 8; i++) await g.run('newGame()');
  assert.equal(g.run('results.length'), 8);
  assert.ok(g.run('askN') > 10, 'the player was asked to count');
  assert.ok(g.run('mug') > 0, 'the NPC caught missed points');
});
test('resume: a game stopped at any saved point can be restored and finished', async () => {
  for (const stopAt of [1, 2, 5, 9, 14, 25, 40, 70]) {
    const g1 = loadGame();
    botGame(g1, 'normal', 'normal');
    g1.run(`var nsave=0;const os=saveGame;saveGame=()=>{os();if(++nsave===${stopAt})throw{abort:true}}`);
    await g1.run('newGame()');
    const saved = g1.store.get('crib-save');
    assert.ok(saved, `a save exists at checkpoint ${stopAt}`);
    const g2 = loadGame();
    botGame(g2, 'normal', 'normal');
    g2.store.set('crib-save', saved);
    assert.ok(g2.run('loadSave()'), 'the save loads');
    await g2.run('newGame(loadSave())');
    const res = g2.run('results');
    assert.equal(res.length, 1, `game resumed from checkpoint ${stopAt} finished`);
    assert.equal(Math.max(...res[0].s), 121);
  }
});
test('resume: saving at every pause (as when the app is backgrounded) always gives a state that can be finished', async () => {
  const g1 = loadGame();
  botGame(g1, 'normal', 'normal');
  g1.run(`var snaps=[];sleep=ms=>{saveGame();const s=localStorage.getItem('crib-save');if(s)snaps.push(s);return Promise.resolve()}`);
  await g1.run('newGame()');
  const snaps = g1.run('snaps');
  assert.ok(snaps.length > 50);
  let n = 0;
  for (let i = 0; i < snaps.length; i += 5) {
    const o = JSON.parse(snaps[i]);
    if (o.stage === 'discard') assert.ok(o.hands.every(h => h.length === 6), 'discard-stage saves still hold full hands');
    const g2 = loadGame();
    botGame(g2, 'normal', 'normal');
    g2.store.set('crib-save', snaps[i]);
    await g2.run('newGame(loadSave())');
    const res = g2.run('results');
    assert.equal(res.length, 1, `snapshot ${i} finished`);
    assert.equal(Math.max(...res[0].s), 121);
    n++;
  }
  assert.ok(n > 10);
});
test('update check: offers the published APK, ignores unreleased versions, falls back to version.json', async () => {
  const g = loadGame();
  const run = async (fetchImpl) => {
    g.run(`fetch=${fetchImpl};renderVer=x=>{lastVer=x||''}`);
    await g.run('checkUpdate(true)');
    return g.run('lastVer');
  };
  const rel = (tag) => `u=>Promise.resolve({ok:true,json:async()=>(${JSON.stringify({ tag_name: tag, body: 'Notes',
    assets: [{ name: 'OrangitazCribbage-9.0.0.apk', browser_download_url: 'https://github.com/Orangitaz/OrangitazCribbage/releases/download/v9.0.0/OrangitazCribbage-9.0.0.apk' }] })})})`;
  let out = await run(rel('v9.0.0'));
  assert.match(out, /Update v9\.0\.0 available/);
  assert.match(out, /href="https:\/\/github\.com\/Orangitaz\/OrangitazCribbage\/releases\/download\/v9\.0\.0\/OrangitazCribbage-9\.0\.0\.apk"/);
  out = await run(rel('v0.0.1'));
  assert.match(out, /Up to date/);
  out = await run(`u=>u.includes('api.github.com')?Promise.reject(new Error('x')):Promise.resolve({ok:true,json:async()=>({version:'9.0.0',notes:'n',url:'https://github.com/x/y'})})`);
  assert.match(out, /Update v9\.0\.0 available/);
  out = await run(`u=>Promise.reject(new Error('offline'))`);
  assert.match(out, /Couldn't check/);
});
test('finished games clear the saved game', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal', false);
  await g.run('newGame()');
  assert.equal(g.store.has('crib-save'), false);
});

// ---------- release hygiene ----------
test('APP_VERSION in cribbage.html matches version.json', () => {
  const html = read();
  const v = /const APP_VERSION='([^']+)'/.exec(html)[1];
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
  assert.equal(v, j.version);
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.match(j.url, /^https:\/\/github\.com\//);
});
