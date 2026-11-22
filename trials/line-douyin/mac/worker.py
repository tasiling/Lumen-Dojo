"""User LaunchAgent. Only heartbeats, source IDs and transcript data leave this Mac for the trial."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib import error, parse, request
import uuid

import media


class ConnectionLost(Exception):
    pass


class ExpiredLease(Exception):
    pass


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ConnectionLost('測試站位址已改變。')


class Client:
    def __init__(self, config):
        self.origin = config['origin']
        self.token = config['token']
        u = parse.urlsplit(self.origin)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.path not in ('', '/'):
            raise ValueError('測試站需使用 HTTPS 網址。')
        self.http = request.build_opener(NoRedirect())

    def post(self, route, payload):
        req = request.Request(self.origin + '/api/worker/' + route,
                              data=json.dumps(payload, ensure_ascii=False).encode(),
                              headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token})
        try:
            with self.http.open(req, timeout=18) as result:
                return json.load(result)
        except error.HTTPError as exc:
            if exc.code == 409:
                raise ExpiredLease() from None
            if exc.code in (400, 413, 422):
                raise media.TrialError('測試站未接受這份資料（HTTP %d）。' % exc.code) from None
            raise ConnectionLost('暫時連不上已配對的測試站。') from None
        except (OSError, ValueError):
            raise ConnectionLost('暫時連不上已配對的測試站。') from None


class Work:
    def __init__(self, client, job):
        self.client = client
        self.job = job
        self.phase = 'resolve'
        self.lost = threading.Event()
        self.stop = threading.Event()

    def update(self, action, **data):
        if self.lost.is_set():
            raise ExpiredLease()
        return self.client.post('update', dict(data, action=action, id=self.job['id'], lease=self.job['lease']))

    def tick(self):
        while not self.stop.wait(24):
            try:
                self.update('heartbeat', phase=self.phase)
            except ExpiredLease:
                self.lost.set()
                return
            except (ConnectionLost, media.TrialError):
                continue

    def enter(self, phase):
        self.phase = phase
        self.update('heartbeat', phase=phase)

    def process(self):
        thread = threading.Thread(target=self.tick, daemon=True)
        thread.start()
        try:
            def task_for(video_id):
                return str(uuid.uuid5(uuid.NAMESPACE_URL, 'yecai-line/' + self.job['id'] + '/' +
                                      str(self.job['attempt']) + '/' + video_id))
            # Recover an already submitted task even if the public share later expires.
            video = self.job.get('video')
            previous = media.api('tasks/' + task_for(video)) if video else None
            if previous is None:
                video = media.work_id(self.job['url'])
                player, title = media.official_embed(video)
                if self.update('identify', videoId=video, title=title).get('merged'):
                    return
            task = task_for(video)
            if previous is None and media.api('tasks/' + task) is None:
                self.enter('download')
                with tempfile.TemporaryDirectory(prefix='yecai-clip-') as folder:
                    clip = Path(folder) / 'clip.mp4'
                    expected = media.public_video(clip, video, player)
                    self.enter('audio')
                    wav = Path(folder) / 'voice.wav'
                    measured = media.speech_track(clip, wav)
                    if expected and abs(expected - measured) > max(1, expected * 0.01):
                        raise media.TrialError('聲音檔案不完整。')
                    self.enter('transcribe')
                    submit_audio(task, wav)
            self.enter('transcribe')
            result = wait_for_result(task, self.lost)
            self.enter('write')
            self.update('finish', videoId=video, text=result['full_text'], segments=result['segments'])
        except (media.TrialError, OSError, subprocess.TimeoutExpired, ValueError) as exc:
            if self.phase == 'transcribe':
                try:
                    if not media.api('health').get('ready'):
                        raise ConnectionLost()
                except media.TrialError:
                    raise ConnectionLost() from None
            msg = str(exc) if isinstance(exc, media.TrialError) else 'Mac 的網路、媒體或本機程序未能完成這個步驟。'
            self.update('fail', phase=self.phase, message=msg)
        finally:
            self.stop.set()
            thread.join(timeout=20)


def submit_audio(task, path):
    if not 0 < path.stat().st_size <= media.LIMIT:
        raise media.TrialError('音軌超過 BiliNote 的 200 MB 上傳容量或是空檔案。')
    args = ['/usr/bin/curl', '-q', '--silent', '--show-error', '--fail', '--noproxy', '*',
            '--max-time', '240', '--form-string', 'task_id=' + task, '--form',
            'file=@-;filename=audio.wav;type=audio/wav', media.API + 'transcribe-file']
    with path.open('rb') as src:
        response = subprocess.run(args, stdin=src, capture_output=True)
    try:
        payload = json.loads(response.stdout)
        if response.returncode == 0 and (payload.get('data') or {}).get('task_id') == task:
            return
    except (ValueError, AttributeError):
        pass
    if media.api('tasks/' + task) is None:
        raise media.TrialError('本機 BiliNote 沒有確認收到音軌。')


def wait_for_result(task, lost):
    for _ in range(2400):
        if lost.is_set():
            raise ExpiredLease()
        data = media.api('tasks/' + task) or {}
        state = data.get('status')
        if state == 'SUCCESS':
            tr = (data.get('result') or {}).get('transcript') or {}
            if not isinstance(tr.get('full_text'), str) or not tr['full_text'].strip() or not tr.get('segments'):
                raise media.TrialError('BiliNote 任務結束，但沒有可用的全文與時間戳。')
            return tr
        if state == 'FAILED':
            raise media.TrialError('BiliNote 語音辨識失敗。本機任務 ' + task)
        if state not in ('PENDING','DOWNLOADING','TRANSCRIBING'):
            raise media.TrialError('本機 BiliNote 找不到這次任務。')
        lost.wait(3)
    raise media.TrialError('本機辨識逾時，可從原卡重試。')


def run():
    if sys.platform != 'darwin':
        raise SystemExit('請在安裝 BiliNote 的 Mac 上啟動。')
    config = Path(__file__).resolve().with_name('connection.json')
    client = Client(json.loads(config.read_text()))
    while True:
        try:
            try:
                ready = bool(media.api('health').get('ready'))
            except media.TrialError:
                ready = False
            job = client.post('claim', {'ready': ready}).get('job')
            if job:
                Work(client, job).process()
                continue
        except (ConnectionLost, ExpiredLease, media.TrialError, OSError):
            pass
        time.sleep(20)


if __name__ == '__main__':
    run()
