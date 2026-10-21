import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();try{
 const m=f.load('lib/dojo/podcast/model.ts'),cover=f.load('lib/dojo/podcast/cover.ts');
 const draft={title:'雨停以後',showName:'生活裡的一點光',angle:'允許慢慢生長',description:'虛構隔離節目',rawTranscript:'00:00 原音逐字稿',segments:[m.newSegment('a')],recording:null,cover:null};
 const parsed=m.parsePodcastDraft(draft);assert.equal(parsed.rawTranscript,draft.rawTranscript);assert.throws(()=>m.assertPodcastReady(parsed),/錄音|封面/);
 for(const patch of [{owner:'other'},{segments:[]},{segments:[m.newSegment('a'),m.newSegment('a')]},{segments:[{...m.newSegment('a'),startSeconds:-1}]}])assert.throws(()=>m.parsePodcastDraft({...draft,...patch}));
 const timed={...draft,segments:[{...m.newSegment('a'),title:'開始',startSeconds:0},{...m.newSegment('b'),title:'生長',startSeconds:4}]};m.assertChapters(timed,10);assert.throws(()=>m.assertChapters(timed,4));assert.throws(()=>m.assertChapters({...timed,segments:timed.segments.toReversed()},10));
 const svg=cover.coverSvg({...draft,title:'<script>壞</script>'});assert(!svg.includes('<script>'));assert(svg.includes('viewBox="0 0 1080 1080"'));assert.equal(svg,cover.coverSvg({...draft,title:'<script>壞</script>'}));
 const media=f.load('lib/dojo/shortVideo/media.ts'),wav=await readFile('docs/creative-short-video-evidence/test-tone.wav');const a=await media.saveMedia(wav,'podcast');assert.equal(a.kind,'audio');assert.equal((await media.readMedia(a.id,'podcast')).id,a.id);await assert.rejects(()=>media.readMedia(a.id));
 await assert.rejects(async()=>media.saveMedia(await readFile('docs/creative-short-video-evidence/final.mp4'),'podcast'));
 const samples=8000*182,long=Buffer.alloc(44+samples*2);wav.copy(long,0,0,44);long.writeUInt32LE(long.length-8,4);long.writeUInt32LE(8000,24);long.writeUInt32LE(16000,28);long.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)long.writeInt16LE(Math.round(Math.sin(i/8000*440*Math.PI*2)*1000),44+i*2);
 assert((await media.saveMedia(long,'podcast')).duration>181);await assert.rejects(()=>media.saveMedia(long));await assert.rejects(()=>media.saveMedia(Buffer.alloc(128*1024*1024+1),'podcast'),e=>e.status===413);
 console.log('PASS podcast strict drafts/chapters/cover/real long audio/profile isolation/short-video unchanged');
}finally{await f.close();}
