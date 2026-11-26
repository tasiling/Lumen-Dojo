"""Runs the Mac worker's 畫面與節奏分析 path against a fake media module and a fake production site,
then checks frame picking against a real FFmpeg-made video when FFmpeg is installed.

python3 scripts/test-video-analysis-worker.py
"""
from pathlib import Path
import base64
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import types

ROOT = Path(__file__).resolve().parent.parent / 'lib' / 'dojo' / 'douyinMac'
calls = []


class TrialError(Exception):
    pass


fake = types.ModuleType('media')
fake.TrialError = TrialError
fake.VIDEO_FORMATS = 'mov,matroska,webm,avi,flv,mpegts,mpeg'
fake.FILE_FORMATS = fake.VIDEO_FORMATS + ',mp3'
fake.api = lambda route: {'ready': True}


def official_embed(video):
    calls.append(('official_embed', video))
    return 'player-url', '小動畫'


def public_video(target, video, player):
    calls.append(('public_video', video, player))
    target.write_bytes(b'mp4-bytes')
    return 6.0


def analysis_frames(clip, folder):
    calls.append(('analysis_frames', Path(clip).read_bytes()))
    frame = Path(folder) / 'one.jpg'
    frame.write_bytes(b'\xff\xd8\xff-jpeg')
    return 6.0, [1.5, 3.0], [(0.0, 1, frame), (1.75, 2, frame)]


fake.official_embed = official_embed
fake.public_video = public_video
fake.analysis_frames = analysis_frames
sys.modules['media'] = fake
sys.path.insert(0, str(ROOT))
import worker  # noqa: E402


class FakeClient:
    def __init__(self, fail_frames=False):
        self.posts = []
        self.fail_frames = fail_frames

    def post(self, route, payload, timeout=18):
        self.posts.append((route, payload, timeout))
        if self.fail_frames and payload.get('action') == 'frames':
            raise TrialError('行光道場未接受這份資料（HTTP 422）。')
        return {}


def actions(client):
    return [(p['action'], p.get('phase')) for _, p, _ in client.posts]


# 抖音: the video is fetched again from the official player, cut into frames, and only frames are sent.
client = FakeClient()
job = {'id': 'cap-1', 'lease': 'L', 'kind': 'analysis', 'source': 'douyin', 'url': 'https://www.douyin.com/video/7', 'video': '7300000000000000000'}
worker.AnalysisWork(client, job).process()
assert ('official_embed', '7300000000000000000') in calls
assert actions(client) == [('heartbeat', 'frames'), ('heartbeat', 'upload'), ('frames', None)], actions(client)
route, sent, timeout = client.posts[-1]
assert route == 'analysis' and timeout == 120
assert sent['duration'] == 6.0 and sent['cuts'] == [1.5, 3.0]
assert [(f['t'], f['shot']) for f in sent['frames']] == [(0.0, 1), (1.75, 2)]
assert base64.b64decode(sent['frames'][0]['data']) == b'\xff\xd8\xff-jpeg'
assert 'mp4-bytes' not in str(sent), 'the video itself never leaves the Mac'

# A file the Mac transcribed earlier is found in the archive folder by its hash.
with tempfile.TemporaryDirectory() as root:
    worker.ARCHIVE = Path(root)
    archived = Path(root) / 'cap-2.mov'
    archived.write_bytes(b'archived-movie')
    digest = worker.sha256(archived)
    calls.clear()
    client = FakeClient()
    worker.AnalysisWork(client, {**job, 'id': 'cap-2', 'source': 'file', 'video': 'file:' + digest}).process()
    assert ('analysis_frames', b'archived-movie') in calls
    assert actions(client)[-1] == ('frames', None)

    # A file that is nowhere on this Mac is reported as a failure the owner can read.
    client = FakeClient()
    worker.AnalysisWork(client, {**job, 'id': 'cap-3', 'source': 'file', 'video': 'file:' + '0' * 64}).process()
    assert actions(client)[-1] == ('fail', None)
    assert '找不到' in client.posts[-1][1]['message']

# A rejected upload is reported as a failure, and the worker keeps running.
client = FakeClient(fail_frames=True)
worker.AnalysisWork(client, job).process()
assert actions(client)[-1] == ('fail', None)

# Real frame picking: every chosen frame comes from inside its own shot.
if shutil.which('ffmpeg'):
    spec = importlib.util.spec_from_file_location('real_media', ROOT / 'media.py')
    real = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(real)
    with tempfile.TemporaryDirectory() as folder:
        clip = Path(folder) / 'clip.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=540x960:d=1.5', '-f', 'lavfi', '-i', 'color=c=blue:s=540x960:d=0.75',
                        '-f', 'lavfi', '-i', 'color=c=green:s=540x960:d=2.5', '-f', 'lavfi', '-i', 'color=c=yellow:s=540x960:d=1',
                        '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v]', '-map', '[v]', '-r', '25', '-pix_fmt', 'yuv420p', str(clip)], check=True)
        duration, cuts, frames = real.analysis_frames(clip, folder)
        assert abs(duration - 5.75) < 0.1 and len(cuts) == 3, (duration, cuts)
        expected = {1: (255, 0, 0), 2: (0, 0, 255), 3: (0, 128, 0), 4: (255, 255, 0)}
        for t, shot, path in frames:
            rgb = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', 'scale=1:1,format=rgb24', '-f', 'rawvideo', '-'], capture_output=True).stdout
            assert all(abs(a - b) < 40 for a, b in zip(rgb, expected[shot])), (t, shot, list(rgb))
        assert {shot for _, shot, _ in frames} == {1, 2, 3, 4}
    print('PASS 畫面分析：抖音與封存檔案的取得、只傳縮圖、失敗回報，以及以真實影片確認每張畫面都在自己的鏡頭內')
else:
    print('PASS 畫面分析（未安裝 FFmpeg，略過真實影片檢查）')
