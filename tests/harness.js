// Loads the game out of cribbage.html so it can be tested in Node without a browser.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'cribbage.html');
const read = () => fs.readFileSync(HTML, 'utf8');
const script = () => read().split('<script>')[1].split('</script>')[0];

// Just the pure rules/AI/stats code between the LOGIC markers.
function loadLogic() {
  const code = script().split('// ==LOGIC==')[1].split('// ==END LOGIC==')[0];
  return new Function(code + `
    return {SUITS,RANKS,val,key,newDeck,shuffle,scoreHand,pegPoints,cribVal,makeSamples,cribAvg,bestDiscard,pHasAny,pegSim,
            choosePlay,cmpVer,emptyStats,mergeStats,recordHand,recordGame,pegCell};`)();
}

// The whole game script, with a fake DOM and instant timers, for running full games.
function loadGame() {
  const store = new Map();
  const stub = () => ({
    innerHTML: '', textContent: '', className: '', disabled: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, querySelectorAll() { return []; }, onclick: null, onchange: null,
  });
  const els = {};
  const ctx = {
    document: { getElementById: id => els[id] || (els[id] = stub()), body: stub() },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    fetch: () => Promise.reject(new Error('offline')),
    console, Math, Promise, Date, JSON, Set, Map, Array, Object, Number, String, parseInt, isFinite,
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Error,
  };
  vm.createContext(ctx);
  const js = script()
    .replace('const sleep=ms=>new Promise(r=>setTimeout(r,ms));', 'var sleep=()=>Promise.resolve();')
    .replace(/\nnewGame\(\);\s*$/, '\n');
  vm.runInContext(js, ctx);
  return { ctx, run: code => vm.runInContext(code, ctx), store };
}

module.exports = { loadLogic, loadGame, read };
