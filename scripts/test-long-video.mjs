import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();
try{
 const m=f.load('lib/dojo/longVideo/model.ts'),c=f.load('lib/dojo/longVideo/composition.ts');
 const budget=f.load('lib/dojo/longVideo/package.ts');assert.throws(()=>budget.assertPackageBudget(Array(20).fill(180*48000*2*2),10000),/256MiB/);assert(budget.assertPackageBudget([8*1024*1024,960044],10000).encodedUpperBound<budget.LONG_VIDEO_PACKAGE_MAX_BYTES);
 const voice={assetId:'a'.repeat(64),kind:'test',sourceNote:'隔離測試音',publicConfirmed:true},image={assetId:'b'.repeat(64),kind:'generated',tool:'imagegen',prompt:'fictional',sourceNote:'虛構圖',publicConfirmed:true};
 const d={title:'雲豆的四章練習',angle:'慢慢生長',style:'mixed',rawTranscript:'00:00 原音',scenes:Array.from({length:4},(_,i)=>({...m.newScene('s'+i),title:'章節'+(i+1),duration:60,narration:'生活有自己的時間',caption:'先生活，再慢慢生長。',voice,image}))};
 assert.equal(m.parseLongVideoDraft(d).scenes.length,4);assert.equal(m.duration(d),240);assert.deepEqual(m.chapters(d).map(c=>c.start),[0,60,120,180]);assert.deepEqual(m.chapters({...d,scenes:[d.scenes[3],d.scenes[0]]}).map(c=>c.sceneId),['s3','s0']);
 assert.doesNotThrow(()=>m.assertLongVideoReady(d));assert.throws(()=>m.parseLongVideoDraft({...d,voice}));assert.throws(()=>m.parseLongVideoDraft({...d,scenes:Array(41).fill(d.scenes[0])}));assert.throws(()=>m.parseLongVideoDraft({...d,scenes:[{...d.scenes[0],duration:301}]}));assert.throws(()=>m.assertLongVideoReady({...d,scenes:[d.scenes[0]]}),/180/);assert.throws(()=>m.assertLongVideoReady({...d,scenes:d.scenes.map(s=>({...s,caption:'長'.repeat(120)}))}),/字幕/);assert.throws(()=>m.assertChapterAudio(d,{[voice.assetId]:61}),/0.5/);
 assert.equal(c.srt({...d,scenes:[{...d.scenes[0],duration:3600},{...d.scenes[1],duration:1}]}).includes('01:00:00,000'),true);
 const html=c.compositionHtml(d,{}, {[voice.assetId]:'chapter.wav'},{[voice.assetId]:60});assert(html.includes('data-width="1280"'));assert(html.includes('data-start="180"'));assert(!c.sceneSvg({...d.scenes[0],title:'<script>\"'},'mixed').includes('<script>'));assert.throws(()=>c.compositionHtml(d,{}, {[voice.assetId]:'https://x/voice.wav'},{[voice.assetId]:60}));
 const media=f.load('lib/dojo/shortVideo/media.ts'),file=join(f.dir,'long.wav');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=220:sample_rate=8000','-t','240',file]);const bytes=await readFile(file),a=await media.saveMedia(bytes,'long-video');assert.equal(a.duration,240);await assert.rejects(()=>media.saveMedia(bytes),/180/);await assert.rejects(()=>media.readMedia(a.id,'podcast'),/找不到/);assert.equal((await media.readMedia(a.id,'long-video')).duration,240);
 await assert.rejects(()=>media.saveMedia(Buffer.alloc(256*1024*1024+1),'long-video'),/256/);
 await writeFile(join(f.dir,'domain-complete'),'yes');console.log('PASS long video domain/chapters/per-chapter audio/SRT/escaping and isolated media profile limits');
}finally{await f.close();}
