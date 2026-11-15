// Optional browser QA: PLAYWRIGHT_PATH points to an existing Playwright installation.
const { chromium }=require(process.env.PLAYWRIGHT_PATH||'playwright');
const { spawn }=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const output=process.env.QA_OUTPUT||path.join(root,'qa');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const server=spawn(process.execPath,[path.join(__dirname,'serve.cjs')],{env:{...process.env,PORT:'8766'},windowsHide:true});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();const errors=[];const sounds=new Set();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/sfx/')&&r.ok())sounds.add(r.url())});
  // Expose module state only in this isolated test response, never in the game file.
  await page.route('http://127.0.0.1:8766/',route=>{
   const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('</script>\n</body>',`globalThis.qa={get loaded(){return Object.values(SB).flat().filter(Boolean).length},stress(){time=300;humans=new Set(POWERS.map((_,i)=>i));for(let p=0;p<12;p++)nukeOrder(p,T[(p+1)%12]);tut.on=false;$('coach').style.display='none';},votes(p){return nukeBy(p)?.votes.length||0},get clock(){return time},play(){for(let i=0;i<20;i++){S.boom(.6);S.launch('i');S.alarm();}}};</script>\n</body>`);
   route.fulfill({contentType:'text/html',body:html});
  });
  await page.setViewportSize({width:1366,height:768});
  await page.goto('http://127.0.0.1:8766/');
  await page.locator('#go').click();await page.mouse.move(0,0);
  await page.waitForFunction(()=>globalThis.qa?.loaded===35,{},{timeout:30000});
  assert.equal(sounds.size,35);console.log('decoded audio: 35/35');
  await page.evaluate(()=>qa.stress());
  await page.waitForTimeout(400);
  const vote=page.locator('#nukes button[data-by="1"]');await vote.scrollIntoViewIfNeeded();
  const box=await vote.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  assert.equal(await page.evaluate(()=>qa.votes(1)),0);
  await page.waitForTimeout(1100);await page.mouse.up();await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>qa.votes(1)),1);console.log('vote fires on completed click, survives countdown redraw');
  await page.evaluate(()=>document.getElementById('top').scrollTop=0);await page.mouse.move(0,0);
  for(const [width,height] of [[1366,768],[1024,768],[390,844],[320,568],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(400);
   const rects=await page.evaluate(()=>Object.fromEntries(['plist','top','dock','misc','abil','sitebar'].map(id=>{
    const e=document.getElementById(id),r=e.getBoundingClientRect();return [id,{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}];
   })));
   for(const [id,r] of Object.entries(rects))if(r.w&&r.h){assert.ok(r.x>=-1&&r.right<=width+1&&r.y>=-1&&r.bottom<=height+1,`${width}: ${id} outside viewport ${JSON.stringify(r)}`);}
   for(const [a,b] of [['plist','top'],['dock','misc'],['dock','abil'],['misc','abil'],['sitebar','abil'],['top','dock'],['top','misc']]){
    const x=rects[a],y=rects[b];assert.ok(!x.w||!x.h||!y.w||!y.h||x.right<=y.x||y.right<=x.x||x.bottom<=y.y||y.bottom<=x.y,`${width}: ${a} overlaps ${b}`);
   }
   await page.screenshot({path:path.join(output,`${width}x${height}.png`)});
   console.log('layout passed',width,height);
  }
  await page.locator('#sfxvolume').fill('25');await page.reload();await page.locator('#go').click();
  assert.equal(await page.locator('#sfxvolume').inputValue(),'25');
  assert.deepEqual(errors,[]);console.log('volume persists; no browser errors');
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
