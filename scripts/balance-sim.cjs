// Headless balance check: runs full matches with every power on autopilot and reports
// who wins and how the table looks. Uses the real rules from index.html; only rendering,
// audio and networking are replaced. Usage:
//   node scripts/balance-sim.cjs [--matches 40] [--seed 7] [--file index.html] [--diff 1] [--trace]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = name => argv.includes('--' + name);
const MATCHES = Number(arg('matches', 40));
const SEED = Number(arg('seed', 7));
const DIFF = Number(arg('diff', 1));
const TRACE = flag('trace');
const FILE = path.resolve(__dirname, '..', arg('file', 'index.html'));
const LIMIT = Number(arg('limit', 1800));   // seconds of match time before a draw is recorded

const html = fs.readFileSync(FILE, 'utf8');
function section(from, to) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  if (start < 0 || end <= start) throw new Error(`Missing section: ${from}`);
  return html.slice(start, end);
}

function makeWorld(seed) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      style: {}, textContent: '', innerHTML: '', hidden: false, disabled: false, dataset: {},
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
      children: [], firstChild: { textContent: '', style: {} },
      appendChild() {}, replaceChildren() {}, querySelector() { return null; },
      querySelectorAll() { return []; }, getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0 }; },
    });
    return elements.get(id);
  }
  let timerId = 0;
  const context = vm.createContext({
    console, window: {},
    document: {
      getElementById: element,
      createElement: () => ({
        style: {}, dataset: {}, innerHTML: '', textContent: '',
        classList: { toggle() {}, add() {}, remove() {} },
        children: [], lastChild: { firstChild: { style: {} } },
        appendChild() {}, remove() {}, insertAdjacentHTML() {},
      }),
      body: { style: {}, classList: { toggle() {}, add() {}, remove() {} } },
    },
    setTimeout() { return ++timerId; },
    clearTimeout() {},
    controls: {}, closeRadial() {}, setNuke() {}, refreshDock() {}, closeArsenal() {},
    log() {}, fxNet() {}, showCoach() {}, logTo() {},
    S: { click() {}, buy() {}, no() {}, alarm() {}, boom() {}, pop() {}, launch() {}, uav() {}, ping() {} },
    IC: { play: '', pause: '' },
    startGame(c) { context.started = c; },
  });
  vm.runInContext(fs.readFileSync(path.join(path.dirname(FILE), 'world.js'), 'utf8'), context);
  vm.runInContext(section('const CFG=', '/* ================= КАРТА'), context);
  vm.runInContext(section('const landState=', 'const T=W.units'), context);
  vm.runInContext('const pcol=o=>o<0?NEUTRAL:POWERS[o].color;', context);
  vm.runInContext(`
    /* seeded random so runs are reproducible */
    let __s=${seed >>> 0};
    Math.random=()=>{__s=(__s*1664525+1013904223)>>>0;return __s/4294967296;};
    const T=window.WORLD.units.map((u,i)=>({i,name:u.n,owner:-1,home:-1,alive:true,
      hp:14,maxHp:14,cap:null,adj:u.adj,sea:u.sea||[],slots:3,
      st:{d:0,t:0,m:0,i:0,h:0,pvo:0},job:null,auto:null,burns:0,rev:0,dirty:true,marker:{visible:true},
      pos:{angleTo(other){
        const a=u.c,b=other.coords,r=Math.PI/180;
        return Math.acos(Math.max(-1,Math.min(1,Math.sin(a[1]*r)*Math.sin(b[1]*r)
          +Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.cos((a[0]-b[0])*r))));
      },coords:u.c}}));
    T.forEach(t=>{t.adj=t.adj.map(i=>T[i]);t.sea=t.sea.map(i=>T[i]);});
    POWERS.forEach(p=>{const t=T[window.WORLD.units.findIndex(u=>u.key===p.a3)];p.name=t.name;p.home=t;});
  `, context);
  vm.runInContext(section('const $=id=>', '/* --- маркеры и подписи'), context);
  vm.runInContext(section('function destroyLand(', 'function hit('), context);
  vm.runInContext(section('function hit(', 'const mtx=new THREE.Matrix4()'), context);
  vm.runInContext(section('function pickLand(', '/* ================= ИНТЕРФЕЙС'), context);
  vm.runInContext(section('let endTimer=', 'function finish(win)'), context);
  vm.runInContext(section('function finish(win)', '/* --- стартовый экран'), context);
  vm.runInContext(section('function sim(dt)', 'const neutralC='), context);
  vm.runInContext(section('const hp0=', 'let endTimer='), context);
  /* headless projectiles: the browser version draws meshes and moves them every frame */
  vm.runInContext(`
    let pid=0;
    function killProj(q){q.dead=true;}
    function spawn(p,w,src,tg,k=0){PW[p].stat.shots++;
      const s=WPN[w].spd,a=ang(src,tg);
      projs.push({id:++pid,w,owner:p,si:src.i,ti:tg.i,T:tg,t:0,dur:s[0]+s[1]*a,checked:false,ic:null,k});
      return projs[projs.length-1];}
    function stepProjs(dt,auth){for(const q of projs){if(q.dead)continue;q.t+=dt/q.dur;
      if(!auth)continue;
      if(!q.checked&&q.t>=checkAt(q.w)){q.checked=true;
        if(!WPN[q.w].nopvo&&hostile(q.owner,q.T)){const df=shieldUse(q);
          if(df){PW[df.owner].stat.icp++;PW[q.T.owner].grudge[q.owner]+=1;q.dead=true;PW[q.T.owner].stat.icp=q.dead?PW[q.T.owner].stat.icp:0;}}}
      if(!q.dead&&q.t>=1){hit(q);q.dead=true;}}
      for(let i=projs.length-1;i>=0;i--)if(projs[i].dead)projs.splice(i,1);}
    const tut={on:false};
    const pl=new Float32Array(2),pa=new Float32Array(2),pg={attributes:{aA:{}}};
    let pcur=0,shake=0,fly=null,down=null,hovW=null;
    T.forEach(t=>{t.col={set(){},copy(){return this},lerp(){return this},r:0,g:0,b:0};t.dirty=true;});
    const camera={position:{sub(){},length(){return 3},clone(){return this}}},shakeV={set(){}},GU={uHov:{value:0}};
    function clearBattleVisuals(){projs.length=0;sched.length=0;nukes.length=0;}
    function resetToLobby(){}
    function startGame(c){
      me=c.me;him=c.him??-1;diff=c.diff;humans=new Set();allied=false;
      team=POWERS.map((_,i)=>i);
      setSites(c.sites||[]);
      POWERS.forEach((_,p)=>{const P=PW[p],h=POWERS[p].home;
        h.maxHp=h.hp=hp0(p);h.slots=CFG.homeSlots+slotBonus(p);h.st.t=1;h.st.pvo=is(p,'ISR')?4:2;
        if(is(p,'RUS'))h.st.i=1;if(is(p,'DEU')){P.up.eco=1;P.up.rkt=1;}
        if(START_EXTRA)START_EXTRA(p,P,h);});
      T.forEach(t=>t.dirty=true);
      running=true;over=false;matchEnded=false;time=0;escBoost=0;
    }
  `, context);
  return context;
}

function runMatch(seed) {
  const context = makeWorld(seed);
  const api = {
    run: code => vm.runInContext(code, context),
  };
  api.run("startGame({me:0,him:-1,diff:" + DIFF + ",sites:pickSites()})");
  const powers = api.run('POWERS.map(p=>p.name)');
  let t = 0;
  while (t < LIMIT) {
    api.run('sim(.05)');
    t += 0.05;
    if (api.run('matchEnded||over&&!PW[0].alive')) break;
  }
  const alive = api.run('POWERS.map((p,i)=>PW[i].alive)');
  const lands = api.run('POWERS.map((_,i)=>lands(i).length)');
  const shots = api.run('PW.map(P=>P.stat.shots)');
  const burned = api.run('PW.map(P=>P.stat.burn)');
  const end = api.run('time');
  return { powers, alive, lands, shots, burned, end };
}

const results = [];
for (let m = 0; m < MATCHES; m++) results.push(runMatch(SEED + m * 7919));

const names = results[0].powers;
const n = names.length;
const wins = names.map(() => 0);
const survivor = names.map(() => 0);
const landSum = names.map(() => 0);
let duration = 0, draws = 0;
for (const r of results) {
  const aliveNames = names.filter((_, i) => r.alive[i]);
  if (aliveNames.length > 1) draws++;
  if (aliveNames.length === 1) wins[names.indexOf(aliveNames[0])]++;
  for (let i = 0; i < n; i++) {
    if (r.alive[i]) survivor[i]++;
    landSum[i] += r.lands[i];
  }
  duration += r.end;
}
const M = results.length;
console.log(`\nbalance: ${M} matches · ${n} powers · difficulty ${DIFF} · seed ${SEED} · file ${path.basename(FILE)}`);
console.log('power     wins  surviv  avgLands');
names.forEach((name, i) => {
  console.log(name.padEnd(16).slice(0, 16) + String(wins[i]).padStart(4) + String((survivor[i] / M * 100).toFixed(0) + '%').padStart(8) + (landSum[i] / M).toFixed(1).padStart(10));
});
console.log(`draws ${draws}/${M} · avg match ${(duration / M / 60).toFixed(1)} min`);
const fair = M / n;
const chi = wins.reduce((a, w) => a + (w - fair) ** 2 / fair, 0);
console.log(`win spread: best ${Math.max(...wins)} vs fair ${fair.toFixed(1)} · chi2 ${chi.toFixed(1)} (fair < ${(n - 1 + 2 * Math.sqrt(2 * (n - 1))).toFixed(1)})`);
