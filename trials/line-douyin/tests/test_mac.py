import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'mac'))
import media
import worker


class MacTrial(unittest.TestCase):
    def test_distinct_public_works_and_durations(self):
        for vid, duration in [('7000000000000000001',12.5),('7000000000000000002',847)]:
            url='https://www.douyin.com/video/'+vid
            self.assertEqual(media.work_id(url),vid)
            player='https://open.douyin.com/player/video?vid='+vid+'&autoplay=0'
            payload={'err_no':0,'data':{'video_title':'本次作品','iframe_code':'<iframe src="'+player+'"></iframe>'}}
            self.assertEqual(media.validated_embed(payload,vid),(player,'本次作品'))
            with self.assertRaises(media.TrialError):media.validated_embed(payload,'7000000000000000003')
            state={'workOK':True,'ready':True,'blocked':False,'duration':duration,'media':'https://v3-dy-o.zjcdn.com/sample'}
            self.assertEqual(media.playable_source(state),(state['media'],duration))
            for invalid in [dict(state,blocked=True),dict(state,duration=0),dict(state,media='blob:local')]:
                with self.assertRaises(media.TrialError):media.playable_source(invalid)

    def test_timed_actual_audio_is_posted_to_bilinote_and_result_uses_the_original_capture(self):
        vid='7000000000000000002';jobs={};uploads=[];updates=[]
        expected={'full_text':'測試回覆','segments':[{'start':0.0,'end':1.0,'text':'測試回覆'}]}
        class Bili(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def answer(self,body,status=200):
                self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers()
                self.wfile.write(json.dumps(body).encode())
            def do_GET(self):
                task=self.path.rsplit('/',1)[-1]
                if task not in jobs:return self.answer({},404)
                self.answer({'code':0,'data':jobs[task]})
            def do_POST(self):
                from email.parser import BytesParser
                from email.policy import default
                assert self.path=='/transcribe-file'
                raw=self.rfile.read(int(self.headers['Content-Length']))
                m=BytesParser(policy=default).parsebytes(('Content-Type: '+self.headers['Content-Type']+'\r\n\r\n').encode()+raw)
                fields={part.get_param('name',header='content-disposition'):part for part in m.iter_parts()}
                audio=fields['file'].get_payload(decode=True);assert audio.startswith(b'RIFF') and len(audio)>16000
                assert fields['file'].get_filename()=='audio.wav'
                task=fields['task_id'].get_content().strip();uploads.append(task)
                jobs[task]={'status':'SUCCESS','result':{'transcript':expected}}
                self.answer({'code':0,'data':{'task_id':task}})
        server=ThreadingHTTPServer(('127.0.0.1',0),Bili)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        class Cloud:
            def post(self,route,payload):
                assert route=='update';updates.append(payload);return {'merged':False}
        claim={'id':str(uuid.uuid4()),'url':'https://www.douyin.com/video/'+vid,'attempt':1,'lease':'test'}
        def fixture(target,video,player):
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=s=24x24:d=1.2','-f','lavfi','-i',
                            'sine=frequency=330:duration=1.2','-shortest','-c:v','mpeg4','-c:a','aac',str(target)],check=True)
            duration,audio=media.probe(target);self.assertGreater(duration,1);return audio
        try:
            with patch.object(media,'API','http://127.0.0.1:%d/'%server.server_port),patch.object(media,'official_embed',return_value=('test-player','第二支作品')),patch.object(media,'public_video',side_effect=fixture) as extract:
                worker.Work(Cloud(),claim).process()
                self.assertEqual(updates[-1]['action'],'finish')
                self.assertEqual(updates[-1]['id'],claim['id'])
                self.assertEqual(updates[-1]['segments'],expected['segments'])
                with patch.object(media,'official_embed',side_effect=AssertionError('should resume without refetch')):
                    worker.Work(Cloud(),dict(claim,video=vid)).process()
                self.assertEqual(len(uploads),1);self.assertEqual(extract.call_count,1)
                self.assertEqual(updates[-1]['action'],'finish')
        finally:
            server.shutdown();server.server_close();thread.join()

    def test_unavailable_clip_reports_download_stage_and_keeps_mac_asr_idle(self):
        calls=[]
        class Cloud:
            def post(self,route,data):calls.append(data);return {}
        claim={'id':str(uuid.uuid4()),'url':'https://www.douyin.com/video/7000000000000000001','attempt':1,'lease':'test'}
        with patch.object(media,'api',return_value=None),patch.object(media,'official_embed',return_value=('test','作品')),patch.object(media,'public_video',side_effect=media.TrialError('來源回傳 HTTP 403。')),patch.object(worker,'submit_audio') as submit:
            worker.Work(Cloud(),claim).process()
            self.assertEqual(calls[-1]['phase'],'download');self.assertEqual(calls[-1]['action'],'fail')
            submit.assert_not_called()


if __name__=='__main__':unittest.main()
