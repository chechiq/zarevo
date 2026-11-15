const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('const SFX='),html.indexOf('function soundAmp('));
test('recorded sounds are attenuated, quiet recordings are never amplified',()=>{
 const c=vm.createContext({});vm.runInContext(code,c);
 for(const [level,expected] of [[1,.16],[.02,.02]]){
  const data=new Float32Array(100).fill(level);
  c.buf={numberOfChannels:1,getChannelData:()=>data};
  vm.runInContext('normalizeSfx(buf)',c);
  assert.ok(Math.abs(data[0]-expected)<1e-6);
 }
});
test('recorded voices remain limited for their real duration; no synthetic fallback on saturation',()=>{
 let starts=0;const c=vm.createContext({
  AC:{currentTime:0,createBufferSource(){return {playbackRate:{value:1},connect(x){return x},start(){starts++}}}},
  audioGain(){return {connect(){return this}}},smp:{},wet:{},
 });vm.runInContext(code,c);
 vm.runInContext("SB.boom_big=[{duration:4}];sample('boom_big',0);sample('boom_big',.5)",c);
 assert.equal(vm.runInContext("sample('boom_big',1)",c),true);assert.equal(starts,2);
 vm.runInContext("sample('boom_big',5)",c);assert.equal(starts,3);
});
test('all declared ElevenLabs variations are present',()=>{
 const c=vm.createContext({});vm.runInContext(code,c);
 for(const [key,count] of Object.entries(vm.runInContext('SFX',c)))for(let i=1;i<=count;i++){
  assert.ok(fs.statSync(require('node:path').join(__dirname,`../sfx/${key}_${i}.mp3`)).size>1000);
 }
});
test('combat saturation leaves a reserved voice for the alarm',()=>{
 let starts=0;const c=vm.createContext({
  AC:{createBufferSource(){return {playbackRate:{value:1},connect(x){return x},start(){starts++}}}},
  audioGain(){return {connect(){return this}}},smp:{},wet:{},
 });vm.runInContext(code,c);
 vm.runInContext("for(const k of ['boom_big','launch_rocket','intercept','alarm'])SB[k]=[{duration:4}];for(const k of ['boom_big','launch_rocket','intercept']){sample(k,0);sample(k,0)}sample('alarm',0)",c);
 assert.equal(starts,7);
});
