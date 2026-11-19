"""Isolated public Douyin playback and local BiliNote audio decoding for the Mac worker."""
import array
import fcntl
import math
from html.parser import HTMLParser
import http.client
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from urllib import error, parse, request
import wave

PAGE_HOSTS = ('douyin.com', 'iesdouyin.com')
MEDIA_HOSTS = ('douyin.com', 'douyinvod.com', 'douyincdn.com', 'bytecdn.cn', 'bytevcloud.com', 'amemv.com', 'zjcdn.com')
EMBED = 'https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id='
PLAYER_HOST = ('open.douyin.com',)
API = 'http://127.0.0.1:8481/engine/api/collector/'
LIMIT = 200 * 1024 * 1024
LOOPBACK = request.build_opener(request.ProxyHandler({}))


class TrialError(Exception):
    pass


def trusted(url, domains):
    try:
        u = parse.urlsplit(url)
        return (u.scheme == 'https' and not u.username and not u.password and u.port in (443, None)
                and any(u.hostname == d or (u.hostname or '').endswith('.' + d) for d in domains))
    except ValueError:
        return False


class PlatformRedirect(request.HTTPRedirectHandler):
    def __init__(self, domains):
        self.domains = domains

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not trusted(newurl, self.domains):
            raise TrialError('來源重新導向其他站點，已停止。')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, domains, redirect=None, headers=None):
    if not trusted(url, domains):
        raise TrialError('來源位址不在支援的抖音網域。')
    try:
        req = request.Request(url, headers=headers or {})
        return request.build_opener(redirect or PlatformRedirect(domains)).open(req, timeout=25)
    except error.HTTPError as exc:
        raise TrialError('來源回傳 HTTP %d。' % exc.code) from None
    except (error.URLError, OSError, http.client.HTTPException):
        raise TrialError('連線未完成，請確認 Mac 可以開啟抖音網址。') from None


class PlayerHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.iframes = []

    def handle_starttag(self, tag, attrs):
        if tag == 'iframe':
            self.iframes.append(dict(attrs).get('src') or '')


def validated_embed(info, video):
    if not isinstance(info, dict):
        raise TrialError('抖音官方服務回傳的作品資料格式不符。')
    if info.get('err_no') == 28003004:
        raise TrialError('抖音官方播放器回報這支作品不對外公開。')
    if info.get('err_no') != 0 or not isinstance(info.get('data'), dict):
        raise TrialError('抖音官方服務未提供這支作品的播放頁。')
    data = info['data']
    title = str(data.get('video_title') or '').strip()
    frame = PlayerHTML()
    frame.feed(str(data.get('iframe_code') or ''))
    if len(frame.iframes) != 1:
        raise TrialError('官方回傳的作品無法與這筆野採素材核對。')
    u = parse.urlsplit(frame.iframes[0])
    if (not trusted(frame.iframes[0], PLAYER_HOST) or u.hostname != PLAYER_HOST[0]
            or u.path != '/player/video' or parse.parse_qs(u.query).get('vid') != [video]):
        raise TrialError('官方播放器網址無法與本次作品核對。')
    return 'https://open.douyin.com/player/video?vid=' + video + '&autoplay=0', title or '抖音影片'


def playable_source(state):
    if not isinstance(state, dict):
        raise TrialError('Mac 未能讀取官方播放頁。')
    if state.get('blocked'):
        raise TrialError('官方播放器限制這支作品的播放或取用，已停止。')
    if not (state.get('ready') and state.get('workOK')):
        raise TrialError('Mac 的官方播放頁尚未載入可核對的這支影片。')
    duration = state.get('duration')
    if not isinstance(duration, (float, int)) or not math.isfinite(duration) or duration <= 0:
        raise TrialError('播放器未提供有效的影片長度。')
    if not isinstance(state.get('media'), str) or not trusted(state['media'], MEDIA_HOSTS):
        raise TrialError('播放器沒有提供可直接讀取的公開影音檔案。')
    return state['media'], duration


def browser_binary():
    apps = {
        'Google Chrome': 'Google Chrome', 'Chromium': 'Chromium',
        'Microsoft Edge': 'Microsoft Edge', 'Brave Browser': 'Brave Browser',
    }
    for directory in (Path('/Applications'), Path.home() / 'Applications'):
        for name, binary in apps.items():
            path = directory / (name + '.app') / 'Contents' / 'MacOS' / binary
            if path.is_file() and os.access(path, os.X_OK):
                return str(path)
    raise TrialError('Mac 需要安裝 Chrome、Edge、Brave 或 Chromium 來開啟官方播放器。')


class BrowserPipe:
    """Exchange public page commands with one temporary browser over two anonymous pipes."""

    def __init__(self, binary, profile):
        self.seq = 0
        self.buffer = bytearray()
        to_child, self.writer = os.pipe()
        self.reader, from_child = os.pipe()
        try:
            # Move the three sources out of fd 0..4 before setting up Chrome's pipe pair.
            with open(os.devnull, 'r+b') as devnull:
                descriptors = []
                try:
                    for fd in (to_child, from_child, devnull.fileno()):
                        descriptors.append(fcntl.fcntl(fd, fcntl.F_DUPFD, 10))
                    actions = [(os.POSIX_SPAWN_DUP2, descriptors[i], dest)
                               for i, dest in ((0, 3), (1, 4), (2, 0), (2, 1), (2, 2))]
                    actions.extend((os.POSIX_SPAWN_CLOSE, fd) for fd in descriptors)
                    args = [binary, '--headless', '--no-first-run', '--no-default-browser-check',
                            '--disable-sync', '--disable-extensions', '--remote-debugging-pipe',
                            '--user-data-dir=' + profile, 'about:blank']
                    self.pid = os.posix_spawn(binary, args, os.environ, file_actions=actions, setpgroup=0)
                finally:
                    for fd in descriptors:
                        os.close(fd)
        except BaseException:
            os.close(self.writer)
            os.close(self.reader)
            raise
        finally:
            os.close(to_child)
            os.close(from_child)

    def call(self, method, params, session=None):
        self.seq += 1
        command = {'id': self.seq, 'method': method, 'params': params}
        if session:
            command['sessionId'] = session
        data = memoryview(json.dumps(command).encode() + b'\x00')
        try:
            while data:
                data = data[os.write(self.writer, data):]
            deadline = time.monotonic() + 15
            while True:
                cut = self.buffer.find(0)
                if cut < 0:
                    left = deadline - time.monotonic()
                    if left <= 0 or not select.select([self.reader], [], [], left)[0]:
                        raise TrialError('Mac 瀏覽器等候官方播放器回應逾時。')
                    chunk = os.read(self.reader, 65536)
                    if not chunk:
                        raise TrialError('Mac 瀏覽器在讀取播放頁時結束。')
                    self.buffer.extend(chunk)
                    if len(self.buffer) > 2 * 1024 * 1024:
                        raise TrialError('播放頁回應超過大小限制。')
                    continue
                reply = json.loads(bytes(self.buffer[:cut]))
                del self.buffer[:cut + 1]
                if reply.get('id') == self.seq:
                    if 'error' in reply:
                        raise TrialError('Mac 瀏覽器未能讀取官方播放頁。')
                    return reply.get('result') or {}
        except (OSError, ValueError):
            raise TrialError('Mac 的獨立瀏覽器連線已中斷。') from None

    def close(self):
        os.close(self.writer)
        os.close(self.reader)
        try:
            os.killpg(self.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        for _ in range(20):
            if os.waitpid(self.pid, os.WNOHANG)[0]:
                return
            time.sleep(0.05)
        try:
            os.killpg(self.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        os.waitpid(self.pid, 0)


PLAYER_STATE = r"""(function(id) {
    const page = new URL(location.href);
    if (page.origin !== 'https://open.douyin.com' || page.pathname !== '/player/video' ||
        page.searchParams.get('vid') !== id) return {};
    const text = document.body ? document.body.innerText : '';
    const videos = document.querySelectorAll('video');
    const v = videos.length === 1 && videos[0];
    const blocked = /不允许下载|禁止下载|不允许播放|视频已删除|视频已下架|暂无播放权限|请先登录|暂不支持播放|禁止下載|請先登入/.test(text) ||
        Boolean(v && (v.mediaKeys || v.webkitKeys || v.controlsList?.contains('nodownload')));
    // The verified embed and the rendered address must both identify the claimed video.

    if (blocked || !v) return {blocked, workOK:true, ready:false};
    if (!v.readyState && v.paused && !v.dataset.yecaiTried) {
        v.dataset.yecaiTried = '1';
        v.muted = true;
        v.play().catch(() => {});
    }
    return {blocked, workOK:true, ready:v.readyState >= 1, duration:v.duration, media:v.currentSrc};
})"""


def rendered_source(browser, url, video):
    expression = PLAYER_STATE + '(' + json.dumps(video) + ')'
    with tempfile.TemporaryDirectory(prefix='yecai-player-') as profile:
        link = BrowserPipe(browser, profile)
        try:
            tab = link.call('Target.createTarget', {'url': 'about:blank'}).get('targetId')
            if not tab:
                raise TrialError('Mac 瀏覽器未能開啟獨立播放視窗。')
            session = link.call('Target.attachToTarget', {'targetId': tab, 'flatten': True}).get('sessionId')
            if not session:
                raise TrialError('Mac 瀏覽器未能連到獨立播放視窗。')
            nav = link.call('Page.navigate', {'url': url}, session)
            if nav.get('errorText'):
                raise TrialError('這台 Mac 未能載入抖音官方播放器。')
            limit = time.monotonic() + 55
            state = {}
            while time.monotonic() < limit:
                result = link.call('Runtime.evaluate', {'expression': expression,
                                   'returnByValue': True, 'userGesture': True}, session)
                state = result.get('result', {}).get('value') or {}
                if state.get('blocked') or (state.get('workOK') and state.get('ready') and state.get('media')):
                    return playable_source(state)
                time.sleep(0.5)
            return playable_source(state)
        finally:
            link.close()


def official_embed(video):
    try:
        with fetch(EMBED + video, PLAYER_HOST) as response:
            raw = response.read(96 * 1024 + 1)
        if len(raw) > 96 * 1024:
            raise ValueError()
        return validated_embed(json.loads(raw), video)
    except (ValueError, OSError, http.client.HTTPException):
        raise TrialError('抖音官方服務沒有回傳可判讀的作品資訊。') from None


class WorkRedirect(PlatformRedirect):
    """The share service names the work in Location before the web page loads."""
    def __init__(self):
        super().__init__(PAGE_HOSTS)
        self.video_id = None

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if trusted(newurl, PAGE_HOSTS):
            match = re.fullmatch(r'/(?:share/)?video/(\d+)/?', parse.urlsplit(newurl).path)
            if match:
                self.video_id = match.group(1)
                return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def work_id(url):
    u = parse.urlsplit(url)
    pages = {'www.douyin.com', 'douyin.com', 'm.douyin.com', 'www.iesdouyin.com', 'iesdouyin.com'}
    if not trusted(url, PAGE_HOSTS):
        raise TrialError('來源必須是抖音的 HTTPS 作品網址。')
    direct = re.fullmatch(r'/(?:share/)?video/(\d{10,22})/?', u.path)
    if u.hostname in pages and direct:
        return direct.group(1)
    if u.hostname != 'v.douyin.com' or not re.fullmatch(r'/[A-Za-z0-9_-]{3,100}/?', u.path):
        raise TrialError('這不是抖音影片分享網址。')
    redirect = WorkRedirect()
    try:
        with fetch(url, PAGE_HOSTS, redirect) as result:
            match = re.fullmatch(r'/(?:share/)?video/(\d{10,22})/?', parse.urlsplit(result.geturl()).path)
            if match:
                redirect.video_id = match.group(1)
    except TrialError:
        if not redirect.video_id:
            raise
    if not redirect.video_id or not re.fullmatch(r'\d{10,22}',redirect.video_id):
        raise TrialError('這個分享網址未能取得抖音作品編號。')
    return redirect.video_id


def local_engine():
    docker = shutil.which('docker') or '/Applications/Docker.app/Contents/Resources/bin/docker'
    if not Path(docker).is_file() or os.getenv('DOCKER_HOST') or os.getenv('DOCKER_CONTEXT'):
        raise TrialError('目前無法使用這台 Mac 上的 Docker Desktop。')
    context = subprocess.run([docker, 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
                             capture_output=True, text=True, timeout=15)
    if context.returncode or not context.stdout.strip().startswith('unix://'):
        raise TrialError('轉出音軌需要 Mac 上的 FFmpeg 或 Docker Desktop。')
    found = subprocess.run([docker, 'ps', '-q', '--filter', 'label=com.docker.compose.project=material-inbox-lab',
                            '--filter', 'label=com.docker.compose.service=bilinote'],
                           capture_output=True, text=True, timeout=20)
    container = found.stdout.strip()
    if found.returncode or not re.fullmatch('[a-f0-9]{12,64}', container):
        raise TrialError('找不到已啟動的本機 BiliNote 容器。')
    return docker, container


def download_media(url, target):
    offset, total, validator = 0, None, None
    budget = min(1024 ** 3, shutil.disk_usage(target.parent).free - 64 * 1024 ** 2)
    headers = {}
    deadline = time.monotonic() + 15 * 60
    with target.open('wb') as out:
        while time.monotonic() < deadline:
            with fetch(url, MEDIA_HOSTS, headers=headers) as media:
                kind = media.headers.get_content_type()
                if kind.startswith('text/') or kind == 'application/json':
                    raise TrialError('播放位址回傳的是文字頁面。')
                length = media.headers.get('Content-Length', '')
                size = int(length) if length.isdigit() else None
                marker = media.headers.get('ETag') or media.headers.get('Last-Modified')
                if offset and validator and validator != marker:
                    raise TrialError('播放器在讀取期間更換了影片檔案。')
                before = offset
                if media.status == 206:
                    part = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', media.headers.get('Content-Range', ''))
                    if not part:
                        raise TrialError('影音片段沒有標示完整範圍。')
                    start, end, whole = map(int, part.groups())
                    if start != offset or not start <= end < whole or (total is not None and total != whole):
                        raise TrialError('影音分段不連續，已停止。')
                    if size is not None and end - start + 1 != size:
                        raise TrialError('影音片段標示的大小不一致。')
                    total, size = whole, end - start + 1
                elif media.status == 200:
                    # A server can ignore Range and send a complete copy.
                    if offset:
                        out.seek(0)
                        out.truncate()
                        offset, before = 0, 0
                    total = size
                else:
                    raise TrialError('播放位址沒有回傳影片。')
                if (total or 0) > budget:
                    raise TrialError('影片超過本次 1 GB 暫存上限或 Mac 可用空間不足。')
                for block in iter(lambda: media.read(256 * 1024), b''):
                    offset += len(block)
                    if offset > budget or time.monotonic() >= deadline:
                        raise TrialError('影片傳輸超過暫存空間或等候時間。')
                    out.write(block)
                if offset == before or (size is not None and offset - before != size):
                    raise TrialError('播放來源回傳空檔案或不完整的影音。')
                if total is None or offset == total:
                    return
                validator = marker
                headers = {'Range': 'bytes=%d-' % offset}
                if validator and not validator.startswith('W/'):
                    headers['If-Range'] = validator
        raise TrialError('Mac 讀取官方影片逾時。')


def public_video(target, video, player):
    url, duration = rendered_source(browser_binary(), player, video)
    download_media(url, target)
    measured, audio_duration = probe(target)
    if not math.isfinite(measured) or abs(duration - measured) > max(2, duration * 0.015):
        raise TrialError('取得的檔案時長與這支影片的播放器不一致。')
    return audio_duration


def stream_types(data):
    streams = data.get('streams', []) if isinstance(data, dict) else []
    return {s.get('codec_type') for s in streams if isinstance(s, dict)
            and not (s.get('disposition') or {}).get('attached_pic')}


def probe(path):
    # Use the existing BiliNote container if FFmpeg is only installed in Docker.
    args = ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm,avi,flv,mpegts,mpeg', '-show_entries', 'format=duration:stream=codec_type,duration:stream_disposition=attached_pic', '-of', 'json']
    binary = shutil.which('ffprobe')
    if binary:
        cmd = [binary] + args + [str(path)]
        result = subprocess.run(cmd, capture_output=True, timeout=90)
    else:
        docker, container = local_engine()
        # MP4 with a trailing moov atom needs a seekable file, not a pipe.
        cmd = [docker, 'exec', '-i', container, 'sh', '-ec',
               'f=$(mktemp); trap \'rm -f "$f"\' EXIT; cat > "$f"; ffprobe "$@" "$f"', 'probe'] + args
        with path.open('rb') as src:
            result = subprocess.run(cmd, stdin=src, capture_output=True, timeout=180)
    try:
        data = json.loads(result.stdout) if result.returncode == 0 else {}
        kinds = stream_types(data)
        duration = float((data.get('format') or {}).get('duration', 0))
    except (ValueError, TypeError, AttributeError):
        kinds, duration = set(), 0
    if not {'video', 'audio'}.issubset(kinds):
        raise TrialError('檔案需要同時含有影片和可辨識的音軌。')
    voice = next(s for s in data['streams'] if s.get('codec_type') == 'audio')
    try:
        audio_duration = float(voice.get('duration'))
    except (ValueError, TypeError):
        audio_duration = None
    return duration, audio_duration


def speech_track(clip, output):
    """Decode locally to the PCM file the Mac Whisper worker will receive."""
    flags = ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file', '-format_whitelist',
             'mov,matroska,webm,avi,flv,mpegts,mpeg', '-i']
    conversion = ['-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav']
    binary = shutil.which('ffmpeg')
    if binary:
        cmd = [binary] + flags + [str(clip)] + conversion + [str(output)]
        result = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, timeout=200)
    else:
        docker, container = local_engine()
        script = ('d=$(mktemp -d); trap \'rm -rf "$d"\' EXIT; cat > "$d/clip"; '
                  'ffmpeg "$@" "$d/clip" -map 0:a:0 -vn -ac 1 -ar 16000 -c:a pcm_s16le -f wav "$d/voice.wav"; '
                  'cat "$d/voice.wav"')
        with clip.open('rb') as src, output.open('wb') as dst:
            result = subprocess.run([docker, 'exec', '-i', container, 'sh', '-ec', script, 'decode'] + flags,
                                    stdin=src, stdout=dst, stderr=subprocess.PIPE, timeout=230)
    if result.returncode:
        raise TrialError('Mac 已取得影像，但 FFmpeg 無法解開其中的音軌。')
    try:
        with wave.open(str(output), 'rb') as wav:
            if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (1, 16000, 2):
                raise TrialError('轉出的語音檔格式異常。')
            read, low, high = 0, 32767, -32768
            for frames in iter(lambda: wav.readframes(16000), b''):
                samples = array.array('h', frames)
                if sys.byteorder != 'little':
                    samples.byteswap()
                low, high = min(low, min(samples)), max(high, max(samples))
                read += len(samples)
            if read != wav.getnframes() or not read:
                raise TrialError('轉出的語音檔不完整。')
            if high - low < 32:
                raise TrialError('這份音軌沒有讀到可辨識的聲音。')
            return read / wav.getframerate()
    except (wave.Error, EOFError):
        raise TrialError('Mac 無法讀取轉出的語音檔。') from None


def api(route):
    try:
        with LOOPBACK.open(API + route, timeout=12) as response:
            value = json.load(response)
    except error.HTTPError as exc:
        if exc.code == 404 and route.startswith('tasks/'):
            return None
        raise TrialError('Mac BiliNote 回傳 HTTP %d。' % exc.code) from None
    except (ValueError, OSError, http.client.HTTPException):
        raise TrialError('無法讀取 Mac 本機的 BiliNote。請先開啟原安裝包的 Start-Mac.command。') from None
    if not isinstance(value, dict) or value.get('code') != 0 or not isinstance(value.get('data'), dict):
        raise TrialError('Mac BiliNote 的回應格式與採集匣版本不符。')
    return value['data']
