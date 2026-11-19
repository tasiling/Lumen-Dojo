import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue } from './store.mjs';
import { digest, InputError, readShare } from './share.mjs';

const base = fileURLToPath(new URL('.',import.meta.url));
const assets = new Map([['/site.css',['site.css','text/css']],['/site.js',['site.js','text/javascript']]]);
const equal = (a,b) => timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
const statusLabels = {queued:'等待 Mac 轉錄',running:'Mac 正在處理',failed:'轉錄需要重試',done:'已有逐字稿'};
const webhookPath='/api/integrations/line/webhook';
async function readBody(req,limit) {
  const chunks=[];let length=0;
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>limit) throw new InputError('內容過長。',413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function decode(raw) {
  try { const val=JSON.parse(raw); if(val && typeof val==='object' && !Array.isArray(val))return val; } catch {}
  throw new InputError('需要 JSON 物件。');
}
function installFile(origin, ticket) {
  const files={};
  for (const f of ['media.py','worker.py']) files[f]=readFileSync(join(base,'mac',f),'utf8');
  const bundle=Buffer.from(JSON.stringify({origin,ticket,files})).toString('base64');
  const installer=readFileSync(join(base,'mac','install.py'),'utf8').replace('__YECAI_INSTALL_BUNDLE__',bundle);
  return "#!/bin/bash\nset -eu\nexec /usr/bin/env python3 -u - <<'YECAI_INSTALL_END'\n"+installer+"\nYECAI_INSTALL_END\n";
}

export function application({queue,origin,accessKey,secret,channelToken,allowedLineUser,reply=sendLine}) {
  const secure = new URL(origin).protocol==='https:';
  const local= ['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname);
  if ((!secure&&!local) || !accessKey) throw new Error('需要測試站網址與登入金鑰。');
  if (!queue.setting('webSalt')) queue.set('webSalt',randomBytes(32).toString('hex'));
  const signing=createHmac('sha256',accessKey).update(queue.setting('webSalt')).digest();
  const sign=value=>createHmac('sha256',signing).update(value).digest('base64url');
  function owner(req) {
    const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)yc_trial=([^;]+)/)?.[1]||'';
    const [exp, salt, mac]=cookie.split('.');
    return /^\d+$/.test(exp)&&Number(exp)>Date.now()&&!!salt&&!!mac&&equal(mac,sign(exp+'.'+salt));
  }
  const badLogins=new Map();
  const lineReady=Boolean(secret&&channelToken);
  async function handleLine(event) {
    if (event.type!=='message'||event.message?.type!=='text'||event.source?.type!=='user') return;
    const uid=event.source.userId, raw=event.message.text, receipt=event.replyToken;
    if (typeof uid!=='string'||!uid||typeof raw!=='string') return;
    const ownerId=allowedLineUser||queue.setting('lineUser');
    const pairing=raw.trim().match(/^配對\s+([a-f0-9]{16})$/);
    if (pairing&&!allowedLineUser) {
      try { queue.redeem('line',pairing[1],uid); } catch (e) { if(uid!==ownerId)return; }
      if (receipt) await reply(channelToken,receipt,{type:'text',text:'已連接野採測試匣。現在可以分享一支抖音影片。'});
      return;
    }
    if (uid!==ownerId) return;
    const eventId=event.webhookEventId||event.message.id;
    if (typeof eventId!=='string'||!eventId) throw new InputError('LINE 訊息缺少識別碼。');
    let share;
    try { share=readShare(raw); } catch (e) {
      if (receipt) await reply(channelToken,receipt,{type:'text',text:e.message});
      return;
    }
    const key='line:'+eventId;
    const accepted=queue.ingest(share,'LINE',key);
    if (!receipt||accepted.replied) return;
    const item=queue.publicCard(accepted.id);
    const deepLink=origin+'/forage/captures?captureId='+item.id;
    const message={type:'text',text:(accepted.duplicate?'這支影片已在野採測試匣':'已剪藏抖音影片')+'，'+statusLabels[item.status]+'。',
      quickReply:{items:[{type:'action',action:{type:'uri',label:'查看這筆素材',uri:deepLink}}]}};
    // Reserve the reply as well as the card when LINE redelivers requests concurrently.
    if (!queue.run('UPDATE event SET reply_until=? WHERE id=? AND replied=0 AND reply_until<?',
        queue.clock()+12000,key,queue.clock()).changes) return;
    try {
      await reply(channelToken,receipt,message);
      queue.run('UPDATE event SET replied=1,reply_until=0 WHERE id=?',key);
    } catch (err) {
      queue.run('UPDATE event SET reply_until=0 WHERE id=?',key);
      throw err;
    }
  }
  return async (req,res) => {
    const method=req.method, pathname=new URL(req.url,'http://localhost').pathname;
    const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    const file=(content,type)=>{res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(content);};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      if (method==='GET'&&pathname==='/healthz') {queue.get('SELECT 1');return json({ready:true});}
      if (method==='GET'&&['/','/forage/captures','/unlock'].includes(pathname)) return file(readFileSync(join(base,'public','index.html')),'text/html');
      if (method==='GET'&&assets.has(pathname)) {const [name,mime]=assets.get(pathname);return file(readFileSync(join(base,'public',name)),mime);}
      if (pathname===webhookPath && method==='POST') {
        if (!lineReady) throw new InputError('尚未連接測試 LINE 帳號。',503);
        const raw=await readBody(req,1024*1024);
        const expected=createHmac('sha256',secret).update(raw).digest('base64');
        if (!equal(String(req.headers['x-line-signature']||''),expected)) throw new InputError('LINE 簽章不符。',403);
        const {events}=decode(raw);
        if (!Array.isArray(events)) throw new InputError('LINE 事件格式不符。');
        await Promise.all(events.map(handleLine)); return json({});
      }
      if (pathname.startsWith('/api/worker/') && method==='POST') {
        if (req.headers.origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw new InputError('不接受此工作請求。',403);
        const route=pathname.slice('/api/worker/'.length);
        if (route==='pair') {
          const data=decode(await readBody(req,4096)); const token=queue.redeem('mac',data.ticket);
          return json({token});
        }
        const token=(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        if (!token||!queue.setting('workerHash')||!equal(digest(token),queue.setting('workerHash'))) throw new InputError('Mac 尚未配對。',401);
        const data=decode(await readBody(req,10*1024*1024));
        if (route==='claim') return json({job:queue.claim(data.ready===true)});
        if (route==='update'&&typeof data.id==='string') return json(queue.workerUpdate(data.id,data));
        throw new InputError('未知的工作路徑。',404);
      }
      if (method==='POST') {
        if (req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site' ||
            !/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw new InputError('請從野採測試站操作。',403);
      }
      if (pathname==='/api/login'&&method==='POST') {
        const ip=(req.headers['x-real-ip']||req.socket.remoteAddress||'').toString();
        const now=Date.now(), last=badLogins.get(ip);
        if (last?.expires>now&&last.n>=12) throw new InputError('嘗試次數過多，請稍後再試。',429);
        const {key}=decode(await readBody(req,4096));
        if (typeof key!=='string'||!equal(key,accessKey)) {
          if (badLogins.size>=1000) for(const [k,v] of badLogins) if(v.expires<=now)badLogins.delete(k);
          badLogins.set(ip,{n:last?.expires>now?last.n+1:1,expires:last?.expires>now?last.expires:now+300000});
          throw new InputError('登入金鑰不符。',401);
        }
        badLogins.delete(ip);
        const value=(now+7*86400000)+'.'+randomBytes(16).toString('hex');
        res.setHeader('Set-Cookie','yc_trial='+value+'.'+sign(value)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+(secure?'; Secure':''));
        return json({ok:true});
      }
      if (!owner(req)) throw new InputError('請使用行光道場預覽站的登入金鑰。',401);
      if (method==='GET'&&pathname==='/api/inbox') return json({cards:queue.list(),worker:queue.workerState(),
        line:{configured:lineReady,paired:Boolean(allowedLineUser||queue.setting('lineUser'))}});
      if (method==='POST'&&pathname==='/api/mac/install') {
        const script=installFile(origin,queue.issue('mac'));
        res.setHeader('Content-Disposition','attachment; filename="YeCai-Connect-Mac.command"');
        return file(script,'application/octet-stream');
      }
      if (method==='POST'&&pathname==='/api/line/pair') {
        if (!lineReady) throw new InputError('請先在測試服務設定 LINE Channel 憑證。',409);
        if (allowedLineUser) throw new InputError('測試帳號已指定可用的 LINE 使用者。',409);
        return json({command:'配對 '+queue.issue('line')});
      }
      if (method==='POST'&&pathname==='/api/captures') {
        const data=decode(await readBody(req,65000));
        if (typeof data.requestId!=='string'||!/^[-\w]{8,100}$/.test(data.requestId)) throw new InputError('缺少操作識別碼。');
        return json(queue.ingest(readShare(data.share,data.note||''),'測試頁','web:'+data.requestId));
      }
      const card=pathname.match(/^\/api\/captures\/([0-9a-f-]{36})(?:\/(retry|note))?$/);
      if (card&&method==='GET'&&!card[2]) return json(queue.publicCard(card[1]));
      if (card&&method==='POST'&&card[2]) {
        if (card[2]==='retry') queue.retry(card[1]);
        else {const {note,previous}=decode(await readBody(req,90000));queue.note(card[1],note,previous);}
        return json(queue.publicCard(card[1]));
      }
      throw new InputError('找不到頁面。',404);
    } catch (e) {
      const status=e instanceof InputError?e.status:500;
      if (status>=500) console.error('Request failure',method,pathname,status,e.name);
      return json({error: e instanceof InputError ? e.message : '暫時無法完成，請稍後重試。'},status);
    }
  };
}

async function sendLine(token,receipt,message) {
  const result=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({replyToken:receipt,messages:[message]}),signal:AbortSignal.timeout(4500)});
  if (!result.ok) throw new InputError('LINE 暫時無法接收回覆。',502);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||8080);
  const dir=process.env.TRIAL_DATA_DIR||'./private-data';mkdirSync(dir,{recursive:true,mode:0o700});
  const origin=process.env.TRIAL_ORIGIN || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://'+process.env.RAILWAY_PUBLIC_DOMAIN : 'http://127.0.0.1:'+port);
  const handler=application({queue:new Queue(join(dir,'yecai.sqlite')),origin,accessKey:process.env.ACCESS_KEY,
    secret:process.env.TRIAL_LINE_CHANNEL_SECRET,channelToken:process.env.TRIAL_LINE_ACCESS_TOKEN,allowedLineUser:process.env.TRIAL_LINE_USER_ID});
  createServer(handler).listen(port,'0.0.0.0',()=>console.log('野採抖音測試站已啟動'));
}
