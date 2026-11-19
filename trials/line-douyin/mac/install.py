"""Install or update just this user's paired worker, without changing Docker or BiliNote."""
import base64
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
from urllib import request, parse, error

BUNDLE = '__YECAI_INSTALL_BUNDLE__'
LABEL = 'app.yecai.douyin-trial.worker'

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
        raise ValueError('測試站網址不符。')
    root=Path.home()/'Library'/'Application Support'/'YeCai-Douyin-Trial'
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    (Path.home()/'Library'/'LaunchAgents').mkdir(parents=True,exist_ok=True)
    agent=Path.home()/'Library'/'LaunchAgents'/(LABEL+'.plist')
    for name in ('media.py','worker.py'):
        compile(data['files'][name],name,'exec')
    class LocalPair(request.HTTPRedirectHandler):
        def redirect_request(self,*args):
            raise ValueError('測試站位址已更動，請從測試站重新下載。')
    req=request.Request(origin+'/api/worker/pair',data=json.dumps({'ticket':data['ticket']}).encode(),
                        headers={'Content-Type':'application/json'})
    try:
        with request.build_opener(LocalPair()).open(req,timeout=20) as res:
            token=json.load(res)['token']
    except error.HTTPError as exc:
        if exc.code==403: raise ValueError('配對連結已使用或逾時，請在測試站重新下載連線檔。') from None
        raise ValueError('測試站暫時無法完成配對。') from None
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
    print('回到野採測試站，看到「Mac 可轉錄」後就能貼下一支抖音影片。')

if __name__=='__main__':
    try:
        install()
    except (ValueError,OSError,subprocess.CalledProcessError,KeyError) as exc:
        print('連線未完成。'+(str(exc) if isinstance(exc,ValueError) else '請確認 Mac 網路與目前登入帳號，再回到測試站重新下載。'),file=sys.stderr)
        sys.exit(1)
