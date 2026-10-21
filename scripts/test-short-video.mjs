import assert from 'node:assert/strict';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();
try{
 const m=f.load('lib/dojo/shortVideo/model.ts'),c=f.load('lib/dojo/shortVideo/composition.ts');
 const scene={...m.newScene('scene-a'),title:'雨後',narration:'改寫口播',caption:'慢慢生長',duration:4};
 const draft={title:'雨停以後',angle:'允許慢下來',style:'mixed',rawTranscript:'00:00 原始逐字稿',scenes:[scene],voice:null};
 assert.equal(m.parseVideoDraft(draft).rawTranscript,'00:00 原始逐字稿');assert.equal(m.duration(draft),4);
 for(const bad of [{...draft,owner:'other'},{...draft,scenes:[]},{...draft,scenes:[{...scene,duration:0}]},{...draft,scenes:[scene,scene]}])assert.throws(()=>m.parseVideoDraft(bad));
 assert.throws(()=>m.assertVideoReady(draft),/圖片|聲音/);
 assert.match(c.srt(draft),/00:00:00,000 --> 00:00:04,000/);
 const escaped=c.sceneSvg({...scene,caption:'<script>alert(1)</script>'},'mixed',undefined,0);assert(!escaped.includes('<script>'));assert(escaped.includes('&lt;'));
 const a=c.sceneSvg(scene,'watercolor',undefined,.2),b=c.sceneSvg(scene,'watercolor',undefined,.8);assert.notEqual(a,b);assert.equal(a,c.sceneSvg(scene,'watercolor',undefined,.2));
 const html=c.compositionHtml(draft,{},'voice.wav');assert.match(html,/<head><meta charset="utf-8">/);assert(!html.includes('data:audio'));assert.match(html,/data-no-timeline/);assert.throws(()=>c.compositionHtml(draft,{},'https://example.com/voice.wav'));
 const media=f.load('lib/dojo/shortVideo/media.ts');
 // Explicit non-speech test tone, never a recording or synthetic copy of Crystal.
 const rate=8000,samples=rate*4,wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*1000),44+i*2);
 const asset=await media.saveMedia(wav);assert.equal(asset.kind,'audio');assert.equal(asset.mime,'audio/wav');assert(Math.abs(asset.duration-4)<.01);assert.equal((await media.readMedia(asset.id)).id,asset.id);
 await assert.rejects(()=>media.saveMedia(Buffer.from('<html>fake media</html>')));await assert.rejects(()=>media.readMedia('../escape'));await assert.rejects(()=>media.saveMedia(Buffer.alloc(64*1024*1024+1)));
 console.log('PASS short video domain, escaped deterministic frames/SRT, real WAV probe, durable media and limits');
}finally{await f.close();}
