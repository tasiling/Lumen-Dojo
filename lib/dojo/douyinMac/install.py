"""Install or update just this user's paired worker, without changing Docker or BiliNote."""
import base64
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
from urllib import request, parse, error

BUNDLE = '__YECAI_INSTALL_BUNDLE__'
LABEL = 'app.yecai.douyin.worker'

def private_write(path, data):
    with tempfile.NamedTemporaryFile(dir=str(path.parent),delete=False) as f:
        f.write(data)
    os.chmod(f.name,0o600)
    os.replace(f.name,str(path))

def install():
    if sys.platform != 'darwin':
        raise ValueError('請在安裝 BiliNote 的 Mac 上執行。')
    if sys.version_info < (3,8):
        raise ValueError('這個 Mac 連線程式需要 Python 3.8 或更新版本。')
    data=json.loads(base64.b64decode(BUNDLE))
    origin=data['origin']
    url=parse.urlsplit(origin)
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.path:
        raise ValueError('行光道場網址不符。')
    root=Path.home()/'Library'/'Application Support'/'YeCai-Douyin'
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    (Path.home()/'Library'/'LaunchAgents').mkdir(parents=True,exist_ok=True)
    agent=Path.home()/'Library'/'LaunchAgents'/(LABEL+'.plist')
    for name in ('media.py','worker.py'):
        compile(data['files'][name],name,'exec')
    class LocalPair(request.HTTPRedirectHandler):
        def redirect_request(self,*args):
            raise ValueError('行光道場位址已更動，請從行光道場重新下載。')
    req=request.Request(origin+'/api/integrations/douyin/worker/pair',data=json.dumps({'ticket':data['ticket']}).encode(),
                        headers={'Content-Type':'application/json'})
    try:
        with request.build_opener(LocalPair()).open(req,timeout=20) as res:
            token=json.load(res)['token']
    except error.HTTPError as exc:
        if exc.code in (401, 403, 410): raise ValueError('配對連結已使用或逾時，請在行光道場重新下載連線檔。') from None
        raise ValueError('行光道場暫時無法完成配對。') from None
    if not isinstance(token,str) or len(token)!=43:
        raise ValueError('配對回應格式不符。')
    for name in ('media.py','worker.py'):
        private_write(root/name,data['files'][name].encode())
    private_write(root/'connection.json',json.dumps({'origin':origin,'token':token}).encode())
    settings={'Label':LABEL,'ProgramArguments':[sys.executable,'-u',str(root/'worker.py')],
              'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':30,'ProcessType':'Background',
              'EnvironmentVariables':{'PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'},
              'StandardErrorPath':str(root/'worker-error.log')}
    private_write(agent,plistlib.dumps(settings))
    scope='gui/'+str(os.getuid())
    subprocess.run(['/bin/launchctl','bootout',scope+'/'+LABEL],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.run(['/bin/launchctl','enable',scope+'/'+LABEL],check=True)
    subprocess.run(['/bin/launchctl','bootstrap',scope,str(agent)],check=True)
    print('已配對這台 Mac。請開著原有的 Docker 與 BiliNote；以後登入 Mac 後會自動等候任務。')
    inbox=Path.home()/'Library'/'Mobile Documents'/'com~apple~CloudDocs'/'行光轉錄'
    archive=Path.home()/'Movies'/'行光轉錄封存'
    try:
        inbox.mkdir(parents=True,exist_ok=True)
        archive.mkdir(parents=True,exist_ok=True)
        print('把影片或音訊存進 iCloud 雲碟的「行光轉錄」資料夾，這台 Mac 會轉錄；轉完的原檔移到「影片 → 行光轉錄封存」。')
    except OSError:
        print('未能建立 iCloud 雲碟的「行光轉錄」資料夾。請確認已開啟 iCloud 雲碟，再手動建立這個資料夾。')
    print('回到行光道場的野採，看到「Mac 可轉錄」後，就能把抖音影片傳給行光剪藏。')

if __name__=='__main__':
    try:
        install()
    except (ValueError,OSError,subprocess.CalledProcessError,KeyError) as exc:
        print('連線未完成。'+(str(exc) if isinstance(exc,ValueError) else '請確認 Mac 網路與目前登入帳號，再回到行光道場重新下載。'),file=sys.stderr)
        sys.exit(1)
