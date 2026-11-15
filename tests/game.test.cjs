const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function section(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing game section: ${from}`);
  return html.slice(start, end);
}

test('the complete browser module parses as JavaScript', () => {
  const module = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(module);
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: module[1], encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
});

// Actual game rules and network handlers; only browser and visual I/O are replaced.
function game() {
  const elements = new Map();
  const timers = new Map();
  let timerId = 0;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      style: {}, textContent: '', disabled: false, checked: true,
      classList: { toggle() {} }, children: [], replaceChildren() {},
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    console, window: {}, document: { getElementById: element },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    controls: {}, closeRadial() {}, refreshDock() {}, closeArsenal() {},
    log() {}, fxNet() {}, showCoach() {},
    logTo() {}, S:{click(){}}, IC:{play:'',pause:''},
    spawn() {}, stepProjs() {}, startGame(c) { context.started=c; },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'world.js'), 'utf8'), context);
  vm.runInContext(section('const CFG=', '/* ================= КАРТА'), context);
  vm.runInContext(section('const landState=', 'const T=W.units'), context);
  vm.runInContext('const pcol=o=>o<0?NEUTRAL:POWERS[o].color;', context);
  vm.runInContext(`
    const T=window.WORLD.units.map((u,i)=>({i,name:u.n,owner:i<12?i:-1,
      home:i<12?i:-1,alive:true,hp:i<12?40:14,maxHp:i<12?40:14,cap:null,
      adj:u.adj,sea:u.sea||[],slots:i<12?6:3,st:{d:0,t:0,m:0,i:0,h:0,pvo:0},job:null,burns:0,rev:0,dirty:true,marker:{visible:true},pos:{angleTo(other){
        const a=u.c,b=other.coords,r=Math.PI/180;
        return Math.acos(Math.max(-1,Math.min(1,Math.sin(a[1]*r)*Math.sin(b[1]*r)
          +Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.cos((a[0]-b[0])*r))));
      },coords:u.c}}));
    T.forEach(t=>{t.adj=t.adj.map(i=>T[i]);t.sea=t.sea.map(i=>T[i]);});
    POWERS.forEach((p,i)=>{p.name=T[i].name;p.home=T[i]});
  `, context);
  vm.runInContext(section('const $=id=>', '/* --- маркеры и подписи'), context);
  vm.runInContext(section('function destroyLand(', 'function hit('), context);
  vm.runInContext(section('function pickLand(', '/* ================= ИНТЕРФЕЙС'), context);
  vm.runInContext(section('function finish(win)', '/* --- стартовый экран'), context);
  vm.runInContext(section('let endTimer=', 'function finish(win)'), context);
  vm.runInContext(section('function sim(dt)', 'const neutralC='), context);
  vm.runInContext(section('function startMatch()', "$('go').onclick=startMatch"), context);
  vm.runInContext(`
    const tut={on:false};
    document.createElement=()=>({style:{},dataset:{},lastChild:{firstChild:{style:{}}},
     classList:{toggle(k,v){this[k]=v}}});
    $('plist').appendChild=row=>$('plist').children.push(row);
    const pl=new Float32Array(2),pa=new Float32Array(2),pg={attributes:{aA:{}}};
    let pcur=0,pid=0,shake=0,fly=null,down=null,hovW=null;
    const camera={position:{sub(){}}},shakeV={set(){}},GU={uHov:{value:0}};
    document.body={style:{}};T.forEach(t=>t.col={set(){}});
    function killProj(q){q.dead=true;}const FXN={};
    const sent=[];
    const guest={player:1,open:true,send(m){sent.push(m)},close(){this.open=false}};
    net=createHost();net.guests.set(guest,true);
    me=0;him=1;humans=new Set([0,1]);running=true;time=2;
    PW.forEach(p=>{p.think=1000});
  `, context);
  vm.runInContext(section('const hp0=', 'let endTimer='), context);
  return { run: code => vm.runInContext(code, context), element,
    flushTimers() { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
  };
}

test('auto-build waits for a free slot, refills it, and can be turned off', () => {
 const g=game();
 g.run('T[0].st.t=T[0].slots');
 assert.equal(g.run("doCmd(0,{c:'auto',x:0,w:'pvo'})"),true);
 g.run('stepWorld(.1)');assert.equal(g.run('T[0].job'),null);
 g.run("scrap(0,T[0],'t');stepWorld(.1)");
 assert.equal(g.run('T[0].job.w'),'pvo');
 g.run('stepWorld(T[0].job.dur)');
 assert.equal(g.run('T[0].st.pvo'),1);
 assert.equal(g.run('T[0].job'),null);
 assert.equal(g.run("doCmd(0,{c:'auto',x:0,w:''})"),true);
 g.run("scrap(0,T[0],'pvo');stepWorld(.1)");
 assert.equal(g.run('T[0].job'),null);
});

test('host validates guest auto-build and its snapshot updates the guest', async () => {
 const host=game(),guest=game();
 assert.equal(host.run("doCmd(1,{c:'auto',x:0,w:'pvo'})"),false);
 assert.equal(host.run("doCmd(1,{c:'auto',x:1,w:'h'})"),false);
 guest.run("net.role='guest';me=1;him=0");
 const pending=guest.run("order('auto','pvo',T[1])");
 assert.equal(guest.run('T[1].auto'),undefined);
 host.run(`hostData(${JSON.stringify(guest.run('sent.at(-1)'))},guest)`);
 host.run('stepWorld(.1);netSend(0,true)');
 for(const m of host.run('sent')) guest.run(`guestData(${JSON.stringify(m)})`);
 assert.equal(await pending,true);
 assert.equal(guest.run('T[1].auto'),'pvo');
 assert.equal(guest.run('T[1].job.w'),'pvo');
 host.run('destroyLand(T[1],0)');
 assert.equal(host.run('T[1].auto'),null);
});

test('defeated host can spectate and a guest can return the finished room to the lobby', () => {
 const host=game(),guest=game();
 host.run("T[0].alive=false;PW[0].alive=false;checkEnd()");
 host.flushTimers();
 assert.equal(host.element('watch').hidden,false);
 assert.equal(host.element('again').hidden,true);
 host.run("$('watch').onclick()");
 assert.equal(host.element('hud').style.display,'block');
 assert.equal(host.run('running'),true);
 host.run("T[1].alive=false;PW[1].alive=false;checkEnd();netSend(0,true)");
 assert.equal(host.element('end').style.display,'flex');
 assert.equal(host.element('again').hidden,false);
 host.run("const room=net,peer=netPeer={};$('mcode').textContent='ABCDE';projs.push({});sched.push({});pl[0]=1;pa[0]=1;T[0].auto='t';PW[0].up.arm=3");
 guest.run("net.role='guest';me=1;him=0;const room=net;endMatch();$('again').onclick()");
 host.run(`hostData(${JSON.stringify(guest.run('sent.at(-1)'))},guest)`);
 const reset=host.run("sent.find(m=>m.t==='reset')");
 assert.ok(reset);
 guest.run(`guestData(${JSON.stringify(reset)})`);
 for(const g of [host,guest]){
  assert.equal(g.run('net===room&&!running&&!over&&!matchEnded&&time===0'),true);
  assert.equal(g.run('T[0].alive&&T[0].owner===0&&T[0].auto===null&&PW[0].alive&&PW[0].up.arm===0'),true);
  assert.equal(g.element('start').style.display,'flex');
 }
 assert.equal(host.run('netPeer===peer&&net.guests.has(guest)&&!projs.length&&!sched.length&&!pl[0]&&!pa[0]'),true);
 assert.equal(host.element('mcode').textContent,'ABCDE');
 host.run('startMatch()');
 assert.equal(host.run("sent.at(-1).t"),'start');
});

test('the country HUD updates classes and ranking on the original rows', () => {
 const g=game();
 g.element('plist').innerHTML='initial';
 g.run('const rows=[...powerRows];drawHud(.3);T[1].alive=false;drawHud(.4)');
 assert.equal(g.run("$('plist').innerHTML"),'initial');
 assert.equal(g.run("rows.every((r,i)=>$('plist').children[i]===r)"),true);
 assert.equal(g.run("rows[0].style.order===0&&rows[0].classList.me"),true);
 assert.equal(g.run("rows[1].classList.dead&&rows[1].lastChild.firstChild.style.width==='0%'"),true);
});

test('world data: symmetric adjacency and finite closed polygon rings', () => {
  const c = vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(root, 'world.js'), 'utf8'), c);
  const w = c.window.WORLD;
  for (const [i, unit] of w.units.entries()) for (const j of [...unit.adj,...unit.sea]) {
    assert.ok(j >= 0 && j < w.units.length && j !== i);
    assert.ok((unit.adj.includes(j)?w.units[j].adj:w.units[j].sea).includes(i), `${i} -> ${j} must be reciprocal`);
  }
  for (const country of w.countries) {
    assert.ok(country.u >= 0 && country.u < w.units.length);
    for (const polygon of country.g) for (const ring of polygon) {
      assert.ok(ring.length >= 8 && ring.length % 2 === 0);
      assert.ok(ring.every(Number.isFinite));
      assert.equal(ring[0], ring.at(-2));
      assert.equal(ring[1], ring.at(-1));
    }
  }
});

test('the 12 playable countries match their map homes and have polygons', () => {
 const g=game();
 assert.equal(g.run("POWERS.map(p=>p.a3).join(',')"),'RUS,CHN,USA,KOR,DEU,GBR,FRA,BRA,ZAF,AUS,IRN,ISR');
 assert.equal(g.run('POWERS.every((p,i)=>window.WORLD.units[i].key===p.a3&&window.WORLD.countries.some(c=>c.u===i))'),true);
});

test('ocean capture takes longer, completes, and can be cancelled and restarted', () => {
 const g=game();
 g.run("const ocean=T[2].sea.find(t=>t.owner<0&&!T[2].adj.includes(t));const duration=capDuration(2,T[2],ocean)");
 assert.equal(g.run('capture(2,ocean)'),true);
 assert.equal(g.run('duration>CFG.capTime'),true);
 g.run('stepWorld(10)');assert.equal(g.run('ocean.owner'),-1);
 assert.equal(g.run("doCmd(2,{c:'cancel',x:2})"),true);
 assert.equal(g.run('ocean.cap'),null);assert.equal(g.run('T[2].job'),null);
 assert.equal(g.run('capture(2,ocean)'),true);
 g.run('stepWorld(duration+1)');assert.equal(g.run('ocean.owner'),2);
});

test('ocean routes are real neighbours: remote inland and hostile lands cannot be captured', () => {
 const g=game();
 g.run('const far=T.find(t=>t.owner<0&&!t.adj.includes(T[2])&&!t.sea.includes(T[2]))');
 assert.equal(g.run('capture(2,far,T[2])'),false);
 assert.equal(g.run('capture(2,T[5])'),false);
});

test('busy sea sources are excluded and destroyed source releases a landing', () => {
 const g=game();
 g.run('const target=T[2].sea.find(t=>t.owner<0);T[2].job={k:"b",w:"t",t:0,dur:20}');
 assert.equal(g.run('capture(2,target,T[2])'),false);
 g.run('T[2].job=null');assert.equal(g.run('capture(2,target,T[2])'),true);
 g.run('destroyLand(T[2],0)');
 assert.equal(g.run('target.cap'),null);
});

test('scrapping frees a full slot immediately; clear removes shields and all weapons', () => {
 const g=game();g.run('T[0].st.t=4;T[0].st.pvo=2');
 assert.equal(g.run("build(0,'t',T[0])"),false);
 assert.equal(g.run("doCmd(0,{c:'scrap',x:0,w:'t'})"),true);
 assert.equal(g.run('free(T[0])'),1);
 assert.equal(g.run("build(0,'t',T[0])"),true);
 assert.equal(g.run("doCmd(0,{c:'clear',x:0})"),true);
 assert.equal(g.run('used(T[0])'),0);assert.equal(g.run('free(T[0])'),5);
 assert.equal(g.run('cancelJob(0,T[0])'),true);assert.equal(g.run('free(T[0])'),6);
});

test('cleanup validates ownership and preview never mutates inventory or jobs', () => {
 const g=game();g.run('T[0].st.t=2;T[0].job={k:"b",w:"t",t:3,dur:20}');
 for(const cmd of ["{c:'scrap',x:0,w:'t'}","{c:'clear',x:0}","{c:'cancel',x:0}"]){
  assert.equal(g.run(`doCmd(1,${cmd})`),false);
  assert.equal(g.run(`doCmd(0,${cmd},true)`),true);
 }
 assert.equal(g.run('T[0].st.t'),2);assert.equal(g.run('T[0].job.t'),3);
 assert.equal(g.run("scrap(0,T[0],'toString')"),false);
 assert.equal(g.run("doCmd(0,{c:'clear',x:999})"),false);
});

test('country perks change the intended mechanics', () => {
 const g=game();
 assert.equal(g.run("wLvl(0,'i')"),1);
 // Китай: каждая третья стройка выдаёт две штуки
 g.run("T[1].st.t=0;for(let i=0;i<3;i++){T[1].job={k:'b',w:'t',t:1,dur:1};stepWorld(.01);}");
 assert.equal(g.run('T[1].st.t'),4);
 assert.equal(g.run("wCount(3,'t')"),2);assert.equal(g.run("wCount(4,'t')"),1);
 assert.equal(g.run("wTime(11,'pvo')<wTime(4,'pvo')"),true);
 assert.equal(g.run('hpMul(8)'),1.25);assert.equal(g.run('slotBonus(8)'),1);
 assert.equal(g.run('capTime(7)'),10);
 assert.equal(g.run("wCount(10,'d')"),6);
 assert.equal(g.run("wDmg(6,'t')"),7);
 assert.equal(g.run("wRange(2,'t')>wRange(4,'t')"),true);
});

function roomFixture(g){
 peerFixture(g);
 g.run(`
  $('mhost').onclick();peers[0].handlers.open();
  const clients=[];
  function connect(){const c={open:false,player:-1,handlers:{},messages:[],on(e,fn){this.handlers[e]=fn},send(m){this.messages.push(m)},close(){this.open=false}};
   peers[0].handlers.connection(c);c.open=true;c.handlers.open();clients.push(c);return c;}
 `);
}

test('one room accepts four guests, assigns unique countries, rejects a sixth player', () => {
 const g=game();roomFixture(g);g.run('for(let i=0;i<5;i++)connect()');
 assert.equal(g.run('net.guests.size'),4);
 assert.equal(g.run('new Set(roomPlayers()).size'),5);
 assert.equal(g.run('clients[4].messages.at(-1).t'),'reject');
});

test('five-player lobby prevents duplicate picks and starts each guest in its own country', () => {
 const g=game();roomFixture(g);g.run('for(let i=0;i<4;i++)connect();hostData({t:"pick",p:0},clients[0]);hostData({t:"pick",p:2},clients[0])');
 assert.equal(g.run('clients[0].player'),1);
 g.run('hostData({t:"pick",p:8},clients[0]);startMatch()');
 assert.equal(g.run('started.players.length'),5);
 assert.equal(g.run('clients.every(c=>c.messages.at(-1).t==="start"&&c.messages.at(-1).gp===c.player&&c.messages.at(-1).players.length===5)'),true);
});

test('host authenticates commands by connection and sends acknowledgements only to their sender', () => {
 const g=game();roomFixture(g);g.run('connect();connect();running=true;humans=new Set([0,1,2]);hostData({t:"cmd",c:"buy",w:"t",x:-1,p:2,id:7},clients[0])');
 assert.equal(g.run('T[1].job.w'),'t');assert.equal(g.run('T[2].job'),null);
 assert.equal(g.run('clients[0].messages.at(-1).t'),'ack');
 assert.equal(g.run('clients[1].messages.some(m=>m.t==="ack")'),false);
});

test('one of four guests leaving preserves the room, other players, and alliance', () => {
 const g=game();roomFixture(g);g.run('for(let i=0;i<4;i++)connect();running=true;humans=new Set(roomPlayers());team[0]=team[1]=99;netLost(clients[0])');
 assert.equal(g.run('net.guests.size'),3);assert.equal(g.run('humans.size'),4);
 assert.equal(g.run('humans.has(1)'),false);assert.equal(g.run('humans.has(2)'),true);
 assert.equal(g.run('team[0]===team[1]'),true);
 assert.equal(g.run('clients[1].messages.at(-1).t'),'players');
});

test('host accepts living guest purchases after its own defeat', () => {
  const g = game();
  g.run("over=true;PW[0].alive=false;T[0].alive=false;hostData({t:'cmd',c:'buy',w:'t',x:-1},guest)");
  assert.equal(g.run('T[1].job.w'), 't');
  assert.equal(g.run('free(T[1])'), 5);
});

test('finished multiplayer match stops and sends its final state', () => {
  const g = game();
  g.run('T.forEach(t=>{if(t.owner!==0)t.alive=false});PW.forEach((p,i)=>p.alive=i===0);sim(.05)');
  assert.equal(g.run('running'), false);
  assert.equal(g.run('sent.at(-1).ended'), true);
});

test('hidden host detects defeat without drawing the HUD', () => {
  const g = game();
  g.run('T[0].alive=false;PW[0].alive=false;sim(.05)');
  assert.equal(g.run('over'), true);
  assert.equal(g.run('running'), true, 'living guest still needs its host');
});

test('guest refuses locked orders before sending them', async () => {
  const g = game();
  g.run("net.role='guest'");
  assert.equal(await g.run("order('buy','i')"), false);
  assert.equal(g.run('sent.length'), 0);
});

test('guest purchase resolves only after host acknowledgement', async () => {
  const g = game();
  g.run("net.role='guest'");
  let completed = false;
  const pending = Promise.resolve(g.run("order('buy','t')")).then(ok => { completed = true; return ok; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(g.run('T[0].job'), null, 'guest must not start production speculatively');
  g.run("guestData({t:'ack',id:sent.at(-1).id,ok:true})");
  assert.equal(await pending, true);
});

test('commands cannot start production while the match is paused', async () => {
  const g = game();
  g.run('paused=true');
  assert.equal(await g.run("order('buy','t')"), false);
  assert.equal(g.run('T[0].job'), null);
});

test('network commands validate the player and weapon name', () => {
  const g = game();
  assert.equal(g.run("doCmd(-1,{c:'buy',w:'t',x:-1})"), false);
  assert.equal(g.run("doCmd(1,{c:'buy',w:'toString',x:-1})"), false);
  assert.equal(g.run('T[1].job'), null);
});

test('lobby disconnect restores start and connection buttons', () => {
  const g = game();
  g.run("running=false;net.role='guest';him=1");
  for (const id of ['go', 'mhost', 'mjoin', 'mjoinb', 'ally']) g.element(id).disabled = true;
  g.run('netLost()');
  assert.equal(g.run('him'), -1);
  for (const id of ['go', 'mhost', 'mjoin', 'mjoinb', 'ally']) assert.equal(g.element(id).disabled, false, id);
});

function peerFixture(g) {
  g.run(`
    const peers=[];
    window.Peer=class {
      constructor(){this.handlers={};this.destroyed=false;peers.push(this)}
      on(event,handler){this.handlers[event]=handler;return this}
      destroy(){this.destroyed=true}
    };
    globalThis.Peer=window.Peer;
    net=null;running=false;him=-1;
  `);
}

test('repeated room clicks do not create competing peers', () => {
  const g = game(); peerFixture(g);
  g.run("$('mhost').onclick();$('mhost').onclick()");
  assert.equal(g.run('peers.length'), 1);
});

test('connection error cleans up the peer and permits another attempt', () => {
  const g = game(); peerFixture(g);
  g.run("$('mhost').onclick();peers[0].handlers.error({type:'network'})");
  assert.equal(g.run('peers[0].destroyed'), true);
  assert.equal(g.element('mhost').disabled, false);
  g.run("$('mhost').onclick()");
  assert.equal(g.run('peers.length'), 2);
});

test('disconnected ally is controlled by a bot and retains its alliance', () => {
  const g = game();
  g.run('allied=true;team[0]=team[1]=99;netLost(guest)');
  assert.equal(g.run('humans.has(1)'), false);
  assert.equal(g.run('team[0]'), g.run('team[1]'));
});

test('network country selection cannot change during battle', () => {
  const g = game();
  g.run("hostData({t:'pick',p:2},guest)");
  assert.equal(g.run('him'), 1);
});

test('invalid country indices do not crash the host', () => {
  const g = game();
  g.run('running=false');
  assert.doesNotThrow(() => g.run("hostData({t:'pick',p:999},guest)"));
  assert.equal(g.run('him'), 1);
});

test('peace forbids firing; locked purchases preserve stock and slots', () => {
  const g = game();
  g.run('T[0].st.t=1');
  assert.equal(g.run("fire(0,'t',T[1])"), false);
  assert.equal(g.run("build(0,'i')"), false);
  assert.equal(g.run('T[0].st.t'), 1);
});

test('land capture awards ownership only on completion', () => {
  const g = game();
  g.run('const target=T[0].adj.find(t=>t.owner<0)');
  assert.equal(g.run('capture(0,target)'), true);
  assert.equal(g.run('target.owner'), -1);
  g.run('stepWorld(22)');
  assert.equal(g.run('target.owner'), 0);
  assert.equal(g.run('target.cap'), null);
});

test('special sites give their owner the listed bonuses and are placed on neutral lands', () => {
 const g=game();
 const sites=g.run('pickSites()');
 assert.equal(sites.length,6);
 assert.equal(new Set(sites.map(s=>s[0])).size,6);assert.equal(new Set(sites.map(s=>s[1])).size,6);
 assert.equal(g.run(`pickSites().every(s=>T[s[0]].home<0)`),true);
 // ничья земля с объектом бонуса не даёт никому
 g.run("T.forEach(t=>{if(t.i>=12)t.owner=-1});setSites([[20,'cos'],[21,'ura'],[22,'rad'],[23,'fab'],[24,'bun'],[25,'hub']])");
 assert.equal(g.run("has(0,'cos')"),false);
 const base=g.run("({r:wRange(0,'t'),ti:wTime(0,'h'),d:wDmg(0,'h'),pr:pvoRange(0),dr:dronesPer(0),up:upTime(0,'rkt'),cap:capDuration(0,T[0],T[T[0].adj[0].i])})");
 g.run('for(let i=20;i<=25;i++)T[i].owner=0;refreshSites()');
 assert.equal(g.run("wRange(0,'t')"),base.r*1.15);
 assert.ok(Math.abs(g.run("wTime(0,'h')")-base.ti*.7)<1e-9);
 assert.equal(g.run("wDmg(0,'h')"),base.d+3);assert.equal(g.run("wDmg(0,'t')"),g.run("wDmg(4,'t')"));
 assert.equal(g.run('pvoRange(0)'),base.pr*1.25);assert.equal(g.run('dronesPer(0)'),base.dr+2);
 assert.ok(Math.abs(g.run("upTime(0,'rkt')")-base.up*.7)<1e-9);
 assert.ok(Math.abs(g.run('capDuration(0,T[0],T[T[0].adj[0].i])')-base.cap*.65)<1e-9);
 // завод строит вдвое быстрее только на своей земле; сгоревший объект бонуса не даёт
 assert.equal(g.run("landTime(T[23],'t')"),g.run("landTime(T[0],'t')")/2);
 g.run('T[20].alive=false;refreshSites()');assert.equal(g.run("has(0,'cos')"),false);
});

test('capturing a factory or a bunker changes that land; stats count captures and burned lands', () => {
 const g=game();
 g.run("T.forEach(t=>{if(t.i>=12){t.owner=-1;t.job=null;}});const A=T[0].adj.filter(t=>t.i>=12);setSites([[A[0].i,'fab']]);");
 assert.equal(g.run('capture(0,A[0],T[0])'),true);
 g.run('T[0].job.t=T[0].job.dur;stepWorld(.01)');
 assert.equal(g.run('A[0].owner'),0);assert.equal(g.run('A[0].slots'),g.run('CFG.zoneSlots+CFG.site.fabSlots'));
 assert.equal(g.run('PW[0].stat.cap'),1);assert.equal(g.run("has(0,'fab')"),true);
 g.run('T[1].owner=1;destroyLand(T[1],0)');assert.equal(g.run('PW[0].stat.burn'),1);
 const html=g.run('statsHtml()');assert.ok(html.includes('<b>1</b>'));assert.equal((html.match(/<tr/g)||[]).length,13);
});

test('auto-repeat and scrap work as land commands without the arsenal panel', () => {
 const g=game();
 assert.equal(g.run("doCmd(0,{c:'auto',w:'t',x:0})"),true);assert.equal(g.run('T[0].auto'),'t');
 assert.equal(g.run("doCmd(0,{c:'auto',w:'',x:0})"),true);assert.equal(g.run('T[0].auto'),null);
 g.run('T[0].st.t=2');assert.equal(g.run("doCmd(0,{c:'scrap',w:'t',x:0})"),true);assert.equal(g.run('T[0].st.t'),1);
});
