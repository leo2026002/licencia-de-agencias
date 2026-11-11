import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import assert from 'node:assert/strict';

await mkdir('native-test-results',{recursive:true});
function adb(args, binary=false) {
  return execFileSync('adb',args,{encoding:binary?undefined:'utf8',timeout:15000,maxBuffer:8*1024*1024});
}
function nodes(xml) {
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map(match=>Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>')])
  ));
}
async function screen(name) { await writeFile(`native-test-results/${name}.png`,adb(['exec-out','screencap','-p'],true)); }
async function hierarchy() {
  adb(['shell','uiautomator','dump','/sdcard/licencias-ui.xml']);
  return adb(['shell','cat','/sdcard/licencias-ui.xml']);
}
async function waitForText(text) {
  let xml='';
  for(let i=0;i<12;i++) {
    try {
      xml=await hierarchy();
      const found=nodes(xml).find(n=>(n.text||'').includes(text)||(n['content-desc']||'').includes(text));
      if(found)return found;
    }catch(error){ if(i===11)throw error; }
    await pause(1500);
  }
  await writeFile('native-test-results/Android-ui.xml',xml);
  throw new Error(`No apareció el control Android: ${text}`);
}
try {
  await pause(5000);
  assert.ok(adb(['shell','pidof','com.leo2026002.licencias']).trim(),'La aplicación debe permanecer abierta');
  await screen('Android-arranque');
  await waitForText('Tu software, bajo control.');
  const button=await waitForText('Nueva licencia');
  const rect=button.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  assert.ok(rect,'El botón de nueva licencia debe tener una posición visible');
  adb(['shell','input','tap',String(Math.round((Number(rect[1])+Number(rect[3]))/2)),String(Math.round((Number(rect[2])+Number(rect[4]))/2))]);
  await waitForText('Nombre del cliente');
  await screen('Android-formulario');
  const log=adb(['logcat','-d','-s','AndroidRuntime:E','Capacitor/Console:E']);
  await writeFile('native-test-results/Android-logcat.txt',log);
  assert.ok(!log.includes('FATAL EXCEPTION'),'No debe haber errores fatales en la aplicación Android');
  console.log('Android: APK instalado, aplicación abierta, dashboard visible y formulario de licencia verificados mediante UI Automator.');
}catch(error){
  try{
    await screen('Android-error');
    const log=adb(['logcat','-d','-s','AndroidRuntime','Capacitor','Capacitor/Console','chromium']);
    await writeFile('native-test-results/Android-logcat.txt',log);
    console.error(log.split('\n').slice(-90).join('\n'));
  }catch(diagnosticError){ console.error('No se pudo capturar el diagnóstico:',diagnosticError.message); }
  throw error;
}
