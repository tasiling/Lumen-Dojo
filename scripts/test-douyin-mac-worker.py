"""Runs the Mac worker's inbox-file and 抖音 paths against a fake media module and a fake production site.

python3 scripts/test-douyin-mac-worker.py
"""
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parent.parent / 'lib' / 'dojo' / 'douyinMac'

calls = []
tasks = {}


class TrialError(Exception):
    pass


media = types.ModuleType('media')
media.TrialError = TrialError
media.LIMIT = 200 * 1024 * 1024
media.API = 'http://127.0.0.1:8483/api/'
media.VIDEO_FORMATS = 'mov,matroska,webm,avi,flv,mpegts,mpeg'
media.FILE_FORMATS = media.VIDEO_FORMATS + ',mp3,wav,aac,ogg,flac'


def api(route):
    if route == 'health':
        return {'ready': True}
    task = route.split('/', 1)[1]
    return tasks.get(task)


def speech_track(clip, output, formats=media.VIDEO_FORMATS):
    calls.append(('speech_track', clip.read_bytes(), formats))
    output.write_bytes(b'RIFF-fake-wave')
    return 12.0


def work_id(url):
    calls.append(('work_id', url))
    return '7699761834606386323'


def official_embed(video):
    calls.append(('official_embed', video))
    return 'player-url', '青銅器展'


def public_video(target, video, player):
    calls.append(('public_video', video, player))
    target.write_bytes(b'mp4-bytes')
    return 12.0


media.api = api
media.speech_track = speech_track
media.work_id = work_id
media.official_embed = official_embed
media.public_video = public_video
sys.modules['media'] = media
sys.path.insert(0, str(ROOT))
import worker  # noqa: E402


def submit_audio(task, path):
    calls.append(('submit_audio', task, path.read_bytes()))
    tasks[task] = {'status': 'SUCCESS', 'result': {'transcript': {
        'full_text': '這是逐字稿。', 'segments': [{'start': 0, 'end': 2.5, 'text': '這是逐字稿。'}]}}}


worker.submit_audio = submit_audio


class FakeClient:
    def __init__(self):
        self.posts = []

    def post(self, route, payload):
        self.posts.append((route, payload))
        if payload.get('action') == 'identify':
            return {'merged': False}
        return {}


def phases(client):
    return [p['phase'] for _, p in client.posts if p.get('action') == 'heartbeat']


import os  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402

with tempfile.TemporaryDirectory() as root:
    folder, archive = Path(root) / 'inbox', Path(root) / 'archive'
    folder.mkdir()
    now = [time.time()]
    inbox = worker.Inbox(folder, archive, clock=lambda: now[0])

    # Inbox: only settled media files are reported, by content hash.
    clip = folder / 'IG 陶藝.MOV'
    clip.write_bytes(b'mov-bytes')
    (folder / 'notes.txt').write_text('not media')
    (folder / '.DS_Store').write_bytes(b'x')
    old = now[0] - 60
    os.utime(clip, (old, old))
    assert inbox.scan() == [], 'a file is not reported the first time it is seen'
    digest = worker.sha256(clip)
    assert inbox.scan() == [(digest, clip, 9)]
    assert inbox.scan() == [(digest, clip, 9)]
    clip.write_bytes(b'mov-bytes-still-syncing')
    assert inbox.scan() == [], 'a file that changed since the last scan is still arriving'
    clip.write_bytes(b'mov-bytes')
    os.utime(clip, (old, old))
    inbox.scan()
    assert inbox.scan() == [(digest, clip, 9)]
    fresh = folder / 'new.mp3'
    fresh.write_bytes(b'abc')
    inbox.scan()
    assert [p for _, p, _ in inbox.scan()] == [clip], 'a file written seconds ago waits'
    fresh.unlink()

    # report_inbox: offers every settled file; an unreadable folder is reported, not fatal.
    class Site:
        def __init__(self, answers):
            self.answers, self.offers = answers, []

        def post(self, route, payload):
            assert route == 'offer'
            self.offers.append(payload)
            return self.answers.get(payload['file'], {'state': 'waiting'})

    site = Site({})
    assert worker.report_inbox(site, inbox) == 'ok'
    assert site.offers == [{'file': digest, 'name': 'IG 陶藝.MOV', 'size': 9}]
    assert clip.exists()
    assert worker.report_inbox(Site({}), worker.Inbox(Path(root) / 'missing', archive)) == 'unreadable'

    # File job: decode the local file with the audio-capable format list; nothing is downloaded or identified.
    capture = '11111111-1111-1111-1111-111111111111'
    file_job = {'id': capture, 'lease': 'L1', 'attempt': 1, 'kind': 'file', 'video': 'file:' + digest, 'url': 'file:' + digest}
    client = FakeClient()
    work = worker.Work(client, file_job, inbox)
    assert work.phase == 'audio'
    work.process()
    assert ('speech_track', b'mov-bytes', media.FILE_FORMATS) in calls
    assert not any(c[0] in ('work_id', 'official_embed', 'public_video') for c in calls)
    assert phases(client) == ['audio', 'transcribe', 'transcribe', 'write'], phases(client)
    finish = [p for _, p in client.posts if p.get('action') == 'finish'][0]
    assert finish['videoId'] == 'file:' + digest and finish['text'] == '這是逐字稿。'
    assert not any(p.get('action') == 'identify' for _, p in client.posts)
    assert set(finish) == {'action', 'id', 'lease', 'videoId', 'text', 'segments'}, 'only the transcript is sent'
    assert clip.exists(), 'the original stays until the site confirms the transcript is stored'

    # Restarted after BiliNote already has the task: no second decode.
    calls.clear()
    client = FakeClient()
    worker.Work(client, file_job, inbox).process()
    assert not calls and [p for _, p in client.posts if p.get('action') == 'finish']

    # Once the site says the transcript is stored, the original moves to the archive under the capture's id.
    assert worker.report_inbox(Site({digest: {'state': 'done', 'captureId': capture}}), inbox) == 'ok'
    assert not clip.exists()
    assert (archive / (capture + '.mov')).read_bytes() == b'mov-bytes'
    # The same file dropped in again is archived beside the first, never overwriting it.
    clip.write_bytes(b'mov-bytes')
    os.utime(clip, (old, old))
    inbox.scan()
    worker.report_inbox(Site({digest: {'state': 'done', 'captureId': capture}}), inbox)
    assert sorted(p.name for p in archive.iterdir()) == [capture + '-2.mov', capture + '.mov']

    # A job whose file is no longer in the folder fails at the audio step with the reason.
    calls.clear()
    tasks.clear()
    client = FakeClient()
    worker.Work(client, dict(file_job, id='22222222-2222-2222-2222-222222222222'), inbox).process()
    fail = [p for _, p in client.posts if p.get('action') == 'fail'][0]
    assert fail['phase'] == 'audio' and '找不到這個檔案' in fail['message'], fail
    assert not calls

# 抖音: unchanged path, identify then official player download and the video-only format list.
calls.clear()
tasks.clear()
douyin_job = {'id': '33333333-3333-3333-3333-333333333333', 'lease': 'L2', 'attempt': 1, 'kind': 'douyin',
              'url': 'https://v.douyin.com/TestPublicVideo/', 'video': None}
client = FakeClient()
work = worker.Work(client, douyin_job)
assert work.phase == 'resolve'
work.process()
assert [c[0] for c in calls] == ['work_id', 'official_embed', 'public_video', 'speech_track', 'submit_audio'], calls
assert calls[3] == ('speech_track', b'mp4-bytes', media.VIDEO_FORMATS)
identify = [p for _, p in client.posts if p.get('action') == 'identify'][0]
assert identify['videoId'] == '7699761834606386323' and identify['title'] == '青銅器展'
assert not any(route == 'file' for route, _ in client.posts)
assert [p for _, p in client.posts if p.get('action') == 'finish'][0]['videoId'] == '7699761834606386323'
assert phases(client) == ['download', 'audio', 'transcribe', 'transcribe', 'write'], phases(client)

# A job from a server older than this worker (no kind) is treated as 抖音.
calls.clear()
tasks.clear()
client = FakeClient()
worker.Work(client, {k: v for k, v in douyin_job.items() if k != 'kind'}).process()
assert calls[0][0] == 'work_id'

print('PASS Mac worker: inbox scan, file transcription, archive by capture id, and unchanged 抖音 path with fake media')
