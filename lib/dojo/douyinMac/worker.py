"""User LaunchAgent. Only heartbeats, source IDs and transcript data leave this Mac for the paired production site.

Video and audio files saved to the iCloud Drive inbox folder are transcribed here. The production site is told
each file's name, size and SHA-256 so the owner can say which capture it belongs to; the media itself stays on
this Mac and is moved to the archive folder, named after the capture, once its transcript is stored."""
import base64
import hashlib
import json
from pathlib import Path
import shutil
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
        raise ConnectionLost('行光道場位址已改變。')


class Client:
    def __init__(self, config):
        self.origin = config['origin']
        self.token = config['token']
        u = parse.urlsplit(self.origin)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.path not in ('', '/'):
            raise ValueError('行光道場需使用 HTTPS 網址。')
        self.http = request.build_opener(NoRedirect())

    def post(self, route, payload, timeout=18):
        req = request.Request(self.origin + '/api/integrations/douyin/worker/' + route,
                              data=json.dumps(payload, ensure_ascii=False).encode(),
                              headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token})
        try:
            with self.http.open(req, timeout=timeout) as result:
                return json.load(result)
        except error.HTTPError as exc:
            if exc.code == 409:
                raise ExpiredLease() from None
            if exc.code in (400, 413, 422):
                raise media.TrialError('行光道場未接受這份資料（HTTP %d）。' % exc.code) from None
            raise ConnectionLost('暫時連不上已配對的行光道場。') from None
        except (OSError, ValueError):
            raise ConnectionLost('暫時連不上已配對的行光道場。') from None


INBOX = Path.home() / 'Library' / 'Mobile Documents' / 'com~apple~CloudDocs' / '行光轉錄'
ARCHIVE = Path.home() / 'Movies' / '行光轉錄封存'
MEDIA_SUFFIXES = {'.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus'}


class Inbox:
    """Media files in the iCloud Drive inbox folder, identified by content hash."""

    def __init__(self, folder=INBOX, archive=ARCHIVE, clock=time.time):
        self.folder = folder
        self.archive_folder = archive
        self.clock = clock
        self.known = {}  # path -> (size, mtime, hash or None)

    def scan(self):
        """Return [(hash, path, size)] for files that have finished arriving. Raises OSError if unreadable."""
        ready, known = [], {}
        for path in sorted(self.folder.iterdir()):
            if path.name.startswith('.'):
                # An iCloud placeholder for a file not yet on this Mac: ask for it and pick it up on a later scan.
                if path.name.endswith('.icloud'):
                    subprocess.run(['/usr/bin/brctl', 'download', str(path)], capture_output=True, timeout=20)
                continue
            if path.suffix.lower() not in MEDIA_SUFFIXES or not path.is_file():
                continue
            info = path.stat()
            size, mtime, digest = self.known.get(path, (None, None, None))
            # A file still syncing changes between two scans; hash it only once it has settled.
            if (size, mtime) != (info.st_size, info.st_mtime):
                known[path] = (info.st_size, info.st_mtime, None)
                continue
            if digest is None and info.st_size and self.clock() - info.st_mtime >= 10:
                digest = sha256(path)
            known[path] = (size, mtime, digest)
            if digest:
                ready.append((digest, path, size))
        self.known = known
        return ready

    def find(self, digest):
        for path, (_, _, known) in self.known.items():
            if known == digest and path.is_file():
                return path
        return None

    def archive(self, path, capture_id):
        """Move a transcribed original out of iCloud, named after its capture; a repeat gets a numbered name."""
        self.archive_folder.mkdir(parents=True, exist_ok=True)
        suffix = path.suffix.lower()
        target = self.archive_folder / (capture_id + suffix)
        number = 2
        while target.exists():
            target = self.archive_folder / ('%s-%d%s' % (capture_id, number, suffix))
            number += 1
        shutil.move(str(path), str(target))
        self.known.pop(path, None)
        return target


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as src:
        for block in iter(lambda: src.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


class Work:
    def __init__(self, client, job, inbox=None):
        self.client = client
        self.job = job
        self.inbox = inbox
        self.phase = 'audio' if job.get('kind') == 'file' else 'resolve'
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
            if self.job.get('kind') == 'file':
                self.transcribe_file()
            else:
                self.transcribe_douyin()
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

    def task_for(self, video_id):
        return str(uuid.uuid5(uuid.NAMESPACE_URL, 'yecai-douyin/' + self.job['id'] + '/' +
                              str(self.job['attempt']) + '/' + video_id))

    def transcribe_file(self):
        """A file from the inbox folder: the job names it by hash, so decode it and continue as with 抖音."""
        video = self.job['video']
        task = self.task_for(video)
        # Recover an already submitted task after a restart instead of decoding again.
        if media.api('tasks/' + task) is None:
            self.enter('audio')
            source = self.inbox.find(video.split(':', 1)[1]) if self.inbox else None
            if source is None:
                raise media.TrialError('Mac 的「行光轉錄」資料夾裡找不到這個檔案，請重新放入。')
            with tempfile.TemporaryDirectory(prefix='yecai-file-') as folder:
                wav = Path(folder) / 'voice.wav'
                media.speech_track(source, wav, media.FILE_FORMATS)
                self.enter('transcribe')
                submit_audio(task, wav)
        self.enter('transcribe')
        result = wait_for_result(task, self.lost)
        self.enter('write')
        self.update('finish', videoId=video, text=result['full_text'], segments=result['segments'])

    def transcribe_douyin(self):
        """Unchanged 抖音 path: identify the work, download it from the official player, then transcribe."""
        # Recover an already submitted task even if the public share later expires.
        video = self.job.get('video')
        previous = media.api('tasks/' + self.task_for(video)) if video else None
        if previous is None:
            video = media.work_id(self.job['url'])
            player, title = media.official_embed(video)
            if self.update('identify', videoId=video, title=title).get('merged'):
                return
        task = self.task_for(video)
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


def find_archived(digest, cache={}):
    """A transcribed file moved to the archive folder, found by its content hash."""
    try:
        paths = [p for p in ARCHIVE.iterdir() if p.is_file() and p.suffix.lower() in MEDIA_SUFFIXES]
    except OSError:
        return None
    for path in paths:
        info = path.stat()
        key = (str(path), info.st_size, info.st_mtime)
        if key not in cache:
            cache[key] = sha256(path)
        if cache[key] == digest:
            return path
    return None


class AnalysisWork:
    """畫面與節奏分析：取得影片、抽出切點與關鍵畫面，只把縮圖與時間傳回行光道場。"""

    def __init__(self, client, job, inbox=None):
        self.client = client
        self.job = job
        self.inbox = inbox
        self.phase = 'fetch'
        self.lost = threading.Event()
        self.stop = threading.Event()

    def update(self, action, timeout=18, **data):
        if self.lost.is_set():
            raise ExpiredLease()
        return self.client.post('analysis', dict(data, action=action, id=self.job['id'], lease=self.job['lease']), timeout)

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

    def fetch(self, folder):
        video = self.job['video']
        if self.job.get('source') == 'file':
            digest = video.split(':', 1)[1]
            found = (self.inbox.find(digest) if self.inbox else None) or find_archived(digest)
            if found is None:
                raise media.TrialError('Mac 的「行光轉錄」資料夾與「行光轉錄封存」裡都找不到這支影片。')
            return found
        player, _ = media.official_embed(video)
        clip = Path(folder) / 'clip.mp4'
        media.public_video(clip, video, player)
        return clip

    def process(self):
        thread = threading.Thread(target=self.tick, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix='yecai-frames-') as folder:
                clip = self.fetch(folder)
                self.enter('frames')
                duration, cuts, frames = media.analysis_frames(clip, folder)
                self.enter('upload')
                payload = [{'t': round(t, 2), 'shot': shot, 'data': base64.b64encode(path.read_bytes()).decode()}
                           for t, shot, path in frames]
                self.update('frames', timeout=120, duration=round(duration, 2), cuts=cuts, frames=payload)
        except (media.TrialError, OSError, subprocess.TimeoutExpired, ValueError) as exc:
            msg = str(exc) if isinstance(exc, media.TrialError) else 'Mac 未能取得影片或抽出畫面。'
            try:
                self.update('fail', message=msg)
            except (ConnectionLost, ExpiredLease, media.TrialError):
                pass
        finally:
            self.stop.set()
            thread.join(timeout=20)


def report_inbox(client, inbox):
    """Tell the production site which files are waiting, and archive the ones whose transcript it has stored."""
    try:
        files = inbox.scan()
    except (OSError, subprocess.TimeoutExpired):
        # Missing folder, or macOS has not allowed this program to read iCloud Drive.
        return 'unreadable'
    for digest, path, size in files:
        try:
            answer = client.post('offer', {'file': digest, 'name': path.name, 'size': size})
            if answer.get('state') == 'done' and answer.get('captureId'):
                inbox.archive(path, answer['captureId'])
        except (media.TrialError, OSError):
            continue
    return 'ok'


def run():
    if sys.platform != 'darwin':
        raise SystemExit('請在安裝 BiliNote 的 Mac 上啟動。')
    config = Path(__file__).resolve().with_name('connection.json')
    client = Client(json.loads(config.read_text()))
    inbox = Inbox()
    while True:
        try:
            try:
                ready = bool(media.api('health').get('ready'))
            except media.TrialError:
                ready = False
            job = client.post('claim', {'ready': ready, 'files': True, 'analysis': True,
                                        'inbox': report_inbox(client, inbox)}).get('job')
            if job and job.get('kind') == 'analysis':
                AnalysisWork(client, job, inbox).process()
                continue
            if job:
                Work(client, job, inbox).process()
                continue
        except (ConnectionLost, ExpiredLease, media.TrialError, OSError):
            pass
        time.sleep(20)


if __name__ == '__main__':
    run()
