// Slow, luck-dependent comparison of the three difficulty levels. Not part of the normal test run.
//   STRENGTH=1 node --test tests/strength.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./harness');

async function winRate(n, me, npc) {
  const g = loadGame();
  g.run(`settings.level=${JSON.stringify(npc)};
    humanDiscard=async()=>{const r=bestDiscard(G.hands[0],G.dealer===0,${JSON.stringify(me)});return r.disc.map(c=>G.hands[0].indexOf(c))};
    humanPlay=async()=>{const pl=G.peg[0].filter(c=>G.count+val(c)<=31);
      return choosePlay({playable:pl,pile:G.pile,count:G.count,level:${JSON.stringify(me)},unseen:unseenFor(0),oppLeft:G.peg[1].length,myHand:G.peg[0]})};
    undoWindow=async()=>true; showPanel=async()=>{}; var results=[];
    gameOver=w=>{results.push(w)};`);
  for (let i = 0; i < n; i++) await g.run('newGame()');
  const r = g.run('results');
  return r.filter(w => w === 0).length / r.length;
}

test('Hard beats Normal over 400 games (expected about 60%)', { skip: !process.env.STRENGTH }, async () => {
  const p = await winRate(400, 'hard', 'normal');
  console.log(`Hard vs Normal: ${(100 * p).toFixed(1)}%`);
  assert.ok(p > 0.5);
});
