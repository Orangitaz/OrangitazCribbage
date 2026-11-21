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

test('progress board: percent of the target, clamped, with skunk lines at 61 and 91 (31 in a short game)', () => {
  assert.equal(L.progressPct(0, 121), 0);
  assert.equal(L.progressPct(121, 121), 100);
  assert.equal(L.progressPct(200, 121), 100);
  assert.equal(L.progressPct(-4, 121), 0);
  assert.equal(Math.round(L.progressPct(61, 121)), 50);
  assert.equal(L.progressPct(30.5, 61), 50);
  assert.deepEqual(L.skunkLines(121), [61, 91]);
  assert.deepEqual(L.skunkLines(61), [31]);
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
    humanDiscard=async()=>{const r=bestDiscard(G.hands[0],cribMine(0),${JSON.stringify(levelMe)});return r.disc.map(c=>G.hands[0].indexOf(c))};
    humanPlay=async()=>{const pl=G.peg[0].filter(c=>G.count+val(c)<=31);
      return choosePlay({playable:pl,pile:G.pile,count:G.count,level:${JSON.stringify(levelMe)},unseen:unseenFor(0),oppLeft:oppLeftFor(0),myHand:G.peg[0]})};
    undoWindow=async()=>true;
    cutForDeal=async()=>Math.floor(Math.random()*NS());
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
test('cutting for deal: lower card deals, ace is low, equal ranks cut again', () => {
  assert.equal(L.cutDealer(C(2, 0), C(9, 1)), 0);
  assert.equal(L.cutDealer(C(1, 0), C(2, 1)), 0);
  assert.equal(L.cutDealer(C(13, 0), C(12, 1)), 1);
  assert.equal(L.cutDealer(C(7, 0), C(7, 3)), null);
});
test('muggins: what you claim is what you score, the NPC takes the difference', () => {
  assert.deepEqual(L.resolveClaim(8, 12), { me: 8, npc: 4, over: false });
  assert.deepEqual(L.resolveClaim(12, 12), { me: 12, npc: 0, over: false });
  assert.deepEqual(L.resolveClaim(14, 12), { me: 12, npc: 0, over: true });
  assert.deepEqual(L.resolveClaim(0, 0), { me: 0, npc: 0, over: false });
});
test('short game: stats use the 61 target', () => {
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
test('nothing is saved while cutting for the deal, and a save with no dealt hands is rejected', async () => {
  const g = loadGame();
  g.run(`cutForDeal=()=>new Promise(()=>{})`);   // never answered, like leaving the app at the cut
  g.run('newGame()');
  g.run('saveGame()');
  assert.equal(g.store.has('crib-save'), false);
  const d = L.newDeck();
  const empty = { v: 1, scores: [0, 0], prev: [0, 0], dealer: 0, level: 'normal', target: 121, muggins: false, hands: [[], []],
    orig: [[], []], crib: [], starter: null, deck: [], peg: [[], []], pile: [], playedAll: [], count: 0, stage: 'discard',
    showIdx: 0, pcur: 0, plast: null, pegInit: false, log: [] };
  assert.equal(L.unpackGame(empty), null);
  assert.ok(L.unpackGame({ ...empty, hands: [d.slice(0, 6), d.slice(6, 12)], orig: [d.slice(0, 6), d.slice(6, 12)], deck: d.slice(12) }));
});
test('start screen: Continue only when a game is saved; settings and stats open without a game', async () => {
  const g = loadGame();
  g.run('showHome()');
  assert.doesNotMatch(g.run("$('panel').innerHTML"), /hCont/);
  assert.match(g.run("$('panel').innerHTML"), /hNew/);
  g.run('openMenu();openStats("home")');
  // save a real game, then the start screen offers it
  botGame(g, 'normal', 'normal');
  g.run(`var nsave=0;const os=saveGame;saveGame=()=>{os();if(++nsave===3)throw{abort:true}}`);
  await g.run('newGame()');
  g.run('G=null;showHome()');
  assert.match(g.run("$('panel').innerHTML"), /hCont/);
  assert.match(g.run("$('panel').innerHTML"), /You \d+ – NPC \d+/);
});
test('difficulty dial: styles blend smoothly, Easy < Normal < Hard, and random plays are legal', () => {
  const S = L.LEVEL_SKILL;
  assert.ok(S.easy < S.normal && S.normal < S.hard && S.hard === 1);
  assert.equal(L.skillLevel(0, 0.5), 'easy');
  assert.equal(L.skillLevel(0.5, 0.5), 'normal');
  assert.equal(L.skillLevel(1, 0.999), 'hard');
  assert.equal(L.skillLevel(-0.5, 0.5), 'random');
  assert.equal(L.skillLevel(-0.5, 1), 'easy');
  const hand = [C(2, 0), C(5, 1), C(7, 2), C(9, 3), C(11, 0), C(13, 1)];
  for (let i = 0; i < 50; i++) {
    const r = L.bestDiscard(hand, true, 'random');
    assert.equal(r.disc.length, 2);
    assert.notEqual(r.disc[0], r.disc[1]);
    assert.equal(r.keep.length, 4);
    const c = L.choosePlay({ playable: [C(3, 0), C(4, 1)], pile: [], count: 0, level: 'random', unseen: [], oppLeft: 0 });
    assert.ok(c.r === 3 || c.r === 4);
  }
});
// ---------- 3 and 4 player games ----------
test('player modes: seats, sides and deal sizes', () => {
  assert.deepEqual(Object.keys(L.MODES), ['2', '3', '4i', '4t']);
  assert.equal(L.entOf('4t', 0), 0); assert.equal(L.entOf('4t', 2), 0);   // you and the player opposite are a team
  assert.equal(L.entOf('4t', 1), 1); assert.equal(L.entOf('4t', 3), 1);
  assert.equal(L.entOf('4i', 3), 3); assert.equal(L.entOf('3', 2), 2);
  assert.equal(L.handSize(2), 6); assert.equal(L.handSize(3), 5); assert.equal(L.handSize(4), 5);
  assert.equal(L.cribStart(3), 1); assert.equal(L.cribStart(2), 0); assert.equal(L.cribStart(4), 0);
  for (const m of Object.keys(L.MODES)) {
    assert.equal(L.SEAT_NAMES[m].length, L.MODES[m].n);
    assert.equal(L.ENT_NAMES[m].length, L.MODES[m].ents);
  }
});
test('cut for the deal: lowest card, ties cut again, any number of players', () => {
  assert.equal(L.cutLowest([C(9), C(3), C(12)]), 1);
  assert.equal(L.cutLowest([C(1), C(13), C(7), C(2)]), 0);
  assert.equal(L.cutLowest([C(4, 0), C(4, 1), C(9)]), null);
  assert.equal(L.cutLowest([C(4, 0), C(4, 1), C(2)]), 2);
});
test('one-card discards: five cards in, one to the crib, four kept', () => {
  const hand = [C(2, 0), C(5, 1), C(7, 2), C(9, 3), C(13, 1)];
  for (const level of ['random', 'easy', 'normal', 'hard']) {
    const r = L.bestDiscard(hand, level === 'hard', level);
    assert.equal(r.disc.length, 1, level);
    assert.equal(r.keep.length, 4, level);
    assert.ok(hand.includes(r.disc[0]));
  }
  // with 5, 5, 5, J and a king, Hard and Normal never break up the three fives
  const great = [C(5, 0), C(5, 1), C(5, 2), C(11, 3), C(13, 1)];
  for (const lv of ['hard', 'normal']) assert.ok([11, 13].includes(L.bestDiscard(great, true, lv).disc[0].r), lv);
});
test('one-card crib samples need three unknown cards and a starter', () => {
  const U = 47, s = L.makeSamples(U, 20, 3);
  for (const x of s) { assert.equal(x.length, 4); assert.equal(new Set(x).size, 4); assert.ok(x.every(i => i >= 0 && i < U)); }
  assert.equal(L.makeSamples(U, 5)[0].length, 3);   // default is the two-player case
});
test('saved games: older saves without a mode load as two-player; modes and sizes are checked', () => {
  const d = L.newDeck();
  const base = (mode, n, E) => ({ v: 1, mode, scores: Array(E).fill(0), prev: Array(E).fill(0), dealer: 0, level: 'normal', target: 121,
    muggins: false, hands: Array.from({ length: n }, (_, i) => d.slice(i * 5, i * 5 + L.handSize(n))), orig: Array.from({ length: n }, () => []),
    crib: d.slice(40, 40 + L.cribStart(n)), starter: null, deck: d.slice(30, 36), peg: Array.from({ length: n }, () => []), pile: [], playedAll: [],
    count: 0, stage: 'discard', showIdx: 0, pcur: 0, plast: null, pegInit: false, log: [] });
  for (const [m, n, E] of [['2', 2, 2], ['3', 3, 3], ['4i', 4, 4], ['4t', 4, 2]]) assert.ok(L.unpackGame(base(m, n, E)), m);
  const old = base('2', 2, 2); delete old.mode;
  assert.equal(L.unpackGame(old).mode, '2');
  assert.equal(L.unpackGame({ ...base('3', 3, 3), mode: 'bogus' }), null);
  assert.equal(L.unpackGame({ ...base('3', 3, 3), scores: [0, 0] }), null);        // wrong number of scorers
  assert.equal(L.unpackGame({ ...base('4t', 4, 2), scores: [0, 0, 0, 0] }), null);  // teams have two scores
  assert.equal(L.unpackGame({ ...base('4i', 4, 4), dealer: 4 }), null);
  assert.equal(L.unpackGame({ ...base('3', 3, 3), crib: [] }), null);              // the 3-player crib starts with a card
  assert.equal(L.unpackGame({ ...base('3', 3, 3), hands: base('2', 2, 2).hands }), null);
});
test('stats are kept per game type; a win needs every other side under the skunk line', () => {
  const st = L.emptyStats();
  L.recordGame(st, { won: true, loserScore: 40, level: 'hard', target: 121, mode: '3' });
  L.recordGame(st, { won: false, loserScore: 80, level: 'hard', target: 121, mode: '4t' });
  L.recordGame(st, { won: true, loserScore: 100, level: 'easy', target: 121 });
  assert.deepEqual(st.byMode['3'], { w: 1, l: 0 });
  assert.deepEqual(st.byMode['4t'], { w: 0, l: 1 });
  assert.deepEqual(st.byMode['2'], { w: 1, l: 0 });
  assert.equal(st.skunksFor, 1); assert.equal(st.doubleFor, 1); assert.equal(st.skunksAgainst, 1);
  assert.equal(L.mergeStats(JSON.parse(JSON.stringify(st))).byMode['3'].w, 1);
  assert.equal(L.mergeStats({ games: 3 }).byMode['4i'].w, 0);   // old stats files have no byMode
});
async function modeGames(mode, n, extra = '') {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`settings.mode=${JSON.stringify(mode)};var results=[],shows=[];
    gameOver=w=>{results.push({w,s:[...G.scores],mode:G.mode})};
    showPanel=async(title,hand)=>{shows.push({title,len:hand.length,crib:G.crib.length,start:G.starter&&1})};${extra}`);
  for (let i = 0; i < n; i++) await g.run('newGame()');
  return { g, results: g.run('results'), shows: g.run('shows') };
}
for (const [mode, n, E] of [['3', 3, 3], ['4i', 4, 4], ['4t', 4, 2]]) {
  test(`${mode}: full games finish, hands and crib are always four cards, every side can win`, async () => {
    const { results, shows } = await modeGames(mode, 12);
    assert.equal(results.length, 12);
    for (const r of results) {
      assert.equal(r.s.length, E);
      assert.equal(Math.max(...r.s), 121);
      assert.equal(r.s[r.w], 121);
      assert.equal(r.s.filter(x => x >= 121).length, 1, 'one winner');
    }
    assert.ok(shows.length > 0 && shows.every(x => x.len === 4 && x.start));
    assert.ok(shows.filter(x => /crib/.test(x.title)).every(x => x.crib === 4));
    // each round counts n hands and one crib
    assert.ok(shows.filter(x => /crib/.test(x.title)).length * n <= shows.filter(x => /hand/.test(x.title)).length + n * 12);
  });
}
test('3 players: each round counts three hands and a crib; the first hand counted is left of the dealer', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`settings.mode='3';var order=[];
    showPanel=async(title)=>{order.push([G.dealer,title]);if(order.length===4)throw{abort:true}};`);
  await g.run('newGame()');
  const o = g.run('order');
  assert.equal(o.length, 4);
  const d = o[0][0], names = ['You', 'Ann', 'Ben'];
  const first = names[(d + 1) % 3], second = names[(d + 2) % 3];
  const poss = n => n === 'You' ? 'Your' : n + "'s";
  assert.equal(o[0][1], `${poss(first)} hand`);
  assert.equal(o[1][1], `${poss(second)} hand`);
  assert.equal(o[2][1], `${poss(names[d])} hand`);          // the dealer counts last
  assert.equal(o[3][1], `${poss(names[d])} crib`);
});
test('partner game: your partner scores for your team and teams share one score', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`settings.mode='4t';cutForDeal=()=>new Promise(()=>{})`);
  g.run('newGame()');
  g.run('G.target=121;addScore(2,5,"test");addScore(1,3,"test");addScore(3,2,"test");addScore(0,1,"test")');
  assert.deepEqual(g.run('G.scores'), [6, 5]);
  assert.equal(g.run('cribMine(2)'), g.run('cribMine(0)'));        // partners share the crib
  assert.notEqual(g.run('cribMine(1)'), g.run('cribMine(0)'));
});
test('three players: only the dealer owns the crib', async () => {
  const g = loadGame();
  g.run(`settings.mode='3';cutForDeal=()=>new Promise(()=>{})`);
  g.run('newGame();G.dealer=1');
  assert.deepEqual([0, 1, 2].map(s => g.run(`cribMine(${s})`)), [false, true, false]);
});
test('muggins in a 4 player game: the player on your left takes what you miss', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal');
  g.run(`settings.mode='4i';settings.muggins=true;var mugSeats=[];
    askCount=async(t,h,s)=>Math.max(0,scoreHand(h,s,t.includes('crib')).total-1);
    const oa=addScore;addScore=(p,pts,why)=>{if(why==='muggins')mugSeats.push(p);return oa(p,pts,why)};
    gameOver=()=>{};`);
  for (let i = 0; i < 3; i++) await g.run('newGame()');
  const w = g.run('mugSeats');
  assert.ok(w.length > 0 && w.every(x => x === 1));
});
test('resume works in every mode: saves at many points all finish', async () => {
  for (const mode of ['3', '4i', '4t']) {
    for (const stopAt of [1, 3, 8, 20, 45, 90]) {
      const g1 = loadGame();
      botGame(g1, 'normal', 'normal');
      g1.run(`settings.mode='${mode}';var nsave=0;const os=saveGame;saveGame=()=>{os();if(++nsave===${stopAt})throw{abort:true}}`);
      await g1.run('newGame()');
      const saved = g1.store.get('crib-save');
      assert.ok(saved, `${mode} save at ${stopAt}`);
      const g2 = loadGame();
      botGame(g2, 'normal', 'normal');
      g2.run(`var results=[];gameOver=w=>{results.push({w,s:[...G.scores]})}`);
      g2.store.set('crib-save', saved);
      assert.ok(g2.run('loadSave()'), `${mode} save loads`);
      await g2.run('newGame(loadSave())');
      const res = g2.run('results');
      assert.equal(res.length, 1, `${mode} resumed from ${stopAt} and finished`);
      assert.equal(Math.max(...res[0].s), 121);
    }
  }
});
// ---------- recap and who-played-what ----------
test('recap tally: points are filed by kind, best hand is tracked, junk is repaired', () => {
  const t = L.blankTally(3);
  L.addTally(t, 1, 'peg', 4); L.addTally(t, 1, 'hand', 12); L.addTally(t, 1, 'hand', 7); L.addTally(t, 2, 'crib', 9); L.addTally(t, 0, 'other', 2);
  L.addTally(t, 2, 'nonsense', 1);   // unknown kinds count as pegging
  assert.deepEqual(t[1], { peg: 4, hand: 19, crib: 0, other: 0, best: 12 });
  assert.equal(t[2].peg, 1); assert.equal(t[2].crib, 9); assert.equal(t[0].other, 2);
  assert.deepEqual(L.cleanTally(JSON.parse(JSON.stringify(t)), 3), t);
  for (const bad of [null, 'x', [], [{}, {}], [{ peg: -1 }, {}, {}], [{ peg: 'a' }, {}, {}], [null, {}, {}]]) {
    assert.deepEqual(L.cleanTally(bad, 3), L.blankTally(3));
  }
  assert.equal(L.cleanTally([{ peg: 2 }, { hand: 3 }], 2)[1].hand, 3);   // missing fields default to zero
});
test('saves keep the recap and who played each pile card; old saves still load', () => {
  const d = L.newDeck();
  const base = { v: 1, mode: '3', scores: [0, 0, 0], prev: [0, 0, 0], dealer: 0, level: 'normal', target: 121, muggins: false,
    hands: [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)], orig: [d.slice(0, 5), d.slice(5, 10), d.slice(10, 15)], crib: d.slice(20, 24),
    starter: d[30], deck: d.slice(31), peg: [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)], pile: [d[40], d[41]], playedAll: [d[40], d[41]],
    count: 12, stage: 'peg', showIdx: 0, pcur: 2, plast: 1, pegInit: true, log: [] };
  const withNew = L.unpackGame({ ...base, pileBy: [1, 2], tally: [{ peg: 3 }, { peg: 0 }, { hand: 5, best: 5 }] });
  assert.deepEqual(withNew.pileBy, [1, 2]);
  assert.equal(withNew.tally[2].best, 5);
  const old = L.unpackGame(base);   // saved by an older version
  assert.deepEqual(old.pileBy, [-1, -1]);
  assert.deepEqual(old.tally, L.blankTally(3));
  assert.deepEqual(L.unpackGame({ ...base, pileBy: [1] }).pileBy, [-1, -1]);       // wrong length
  assert.deepEqual(L.unpackGame({ ...base, pileBy: [1, 9] }).pileBy, [-1, -1]);    // not a seat
});
for (const mode of ['2', '3', '4i', '4t']) {
  test(`${mode}: the recap adds up to each side's score and the pile always knows who played every card`, async () => {
    const g = loadGame();
    botGame(g, 'normal', 'normal');
    g.run(`settings.mode='${mode}';var results=[],bad=0;
      gameOver=w=>{const E=MODES[G.mode];const sums=Array(E.ents).fill(0);G.tally.forEach((t,sd)=>{sums[entOf(G.mode,sd)]+=${JSON.stringify(['peg', 'hand', 'crib', 'other'])}.reduce((n,k)=>n+t[k],0)});
        results.push({w,scores:[...G.scores],sums,best:G.tally.map(t=>t.best)})};
      const oa=addScore;addScore=(p,pts,why,kind)=>{if(G.pileBy.length!==G.pile.length)bad++;return oa(p,pts,why,kind)};`);
    for (let i = 0; i < 6; i++) await g.run('newGame()');
    const res = g.run('results');
    assert.equal(res.length, 6);
    assert.equal(g.run('bad'), 0, 'pileBy always matches the pile');
    for (const r of res) r.scores.forEach((sc, e) => {
      if (e === r.w) assert.ok(r.sums[e] >= sc, 'the winner may have scored past the target');
      else assert.equal(r.sums[e], sc, `side ${e}`);
    });
    assert.ok(res.every(r => r.best.every(b => b >= 0 && b <= 29)));
  });
}
test('finished games clear the saved game', async () => {
  const g = loadGame();
  botGame(g, 'normal', 'normal', false);
  await g.run('newGame()');
  assert.equal(g.store.has('crib-save'), false);
});

test('web version: manifest, icons and service worker exist and the page links them', () => {
  const root = path.join(__dirname, '..', 'web');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
  assert.ok(fs.existsSync(path.join(root, 'icon-180.png')));
  assert.ok(fs.existsSync(path.join(root, 'sw.js')));
  const html = read();
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="icon-180\.png"/);
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
