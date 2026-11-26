import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { digest, InputError, validatedTranscript } from './share.mjs';

const nonce = () => randomBytes(32).toString('base64url');
const leaseMs = 120_000;
const phases = ['resolve', 'download', 'audio', 'transcribe', 'write'];
/** SHA-256 of a media file in the Mac's inbox folder; the file itself never leaves the Mac. */
const fileHash = /^[0-9a-f]{64}$/;
/** A file the Mac stopped reporting (moved or deleted) is no longer offered to the owner. */
const offerFreshMs = 10 * 60_000;
/** A question that LINE could not deliver is asked again after this long. */
const askAgainMs = 10 * 60_000;
/** @type {Map<string, DouyinQueue>} */
const dbByFile = new Map();

export function douyinQueue() {
  const root = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.LEARNING_WRITE_LOCK_DIR;
  if (!root || !isAbsolute(root)) throw new InputError('Mac 轉錄的持久儲存尚未啟用。', 503);
  const dir = join(root, 'yecai-douyin');
  const file = join(dir, 'work.sqlite');
  let queue = dbByFile.get(file);
  if (!queue) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    queue = new DouyinQueue(file);
    chmodSync(file, 0o600);
    dbByFile.set(file, queue);
  }
  return queue;
}

export class DouyinQueue {
  constructor(file, clock = Date.now) {
    this.db = new DatabaseSync(file);
    this.clock = clock;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS job(
        id TEXT PRIMARY KEY, url TEXT NOT NULL, share TEXT NOT NULL, title TEXT NOT NULL,
        video TEXT, status TEXT NOT NULL DEFAULT 'queued', phase TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', segments TEXT NOT NULL DEFAULT '[]',
        attempt INTEGER NOT NULL DEFAULT 1, lease TEXT, expires INTEGER, created INTEGER NOT NULL,
        target TEXT REFERENCES job(id)
      );
      CREATE INDEX IF NOT EXISTS job_url ON job(url);
      CREATE INDEX IF NOT EXISTS job_video ON job(video) WHERE target IS NULL;
      CREATE INDEX IF NOT EXISTS job_pending ON job(status,expires,created) WHERE target IS NULL;
      CREATE TABLE IF NOT EXISTS machine(
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), ticket TEXT, ticket_expires INTEGER,
        token TEXT, seen INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO machine(singleton) VALUES(1);
      CREATE TABLE IF NOT EXISTS offer(
        hash TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL,
        seen INTEGER NOT NULL, tried INTEGER NOT NULL DEFAULT 0, asked INTEGER NOT NULL DEFAULT 0
      );`);
    // Columns added for media files on the Mac (rows written before them are 抖音 jobs), and for writing finished
    // transcripts back to Notion (existing finished rows start unsynced, which is what backfills them).
    const add = (table, column, definition) => {
      if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(({ name }) => name === column))
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };
    add('job', 'kind', "TEXT NOT NULL DEFAULT 'douyin'");
    add('job', 'source', "TEXT NOT NULL DEFAULT ''");
    add('machine', 'files', 'INTEGER NOT NULL DEFAULT 0');
    add('machine', 'inbox', "TEXT NOT NULL DEFAULT ''");
    add('job', 'finished', 'INTEGER');
    add('job', 'synced', 'INTEGER NOT NULL DEFAULT 0');
    add('job', 'sync_tried', 'INTEGER NOT NULL DEFAULT 0');
    add('job', 'sync_fails', 'INTEGER NOT NULL DEFAULT 0');
    // Transcript correction (逐字稿校正). 'none' means not requested: existing transcripts are corrected only when the
    // owner asks, new ones are set to '' (pending) when they finish. A settled state is done, failed or skipped.
    add('job', 'tidy_state', "TEXT NOT NULL DEFAULT 'none'");
    add('job', 'tidy_text', 'TEXT');
    add('job', 'tidy_at', 'TEXT');
    add('job', 'tidy_model', "TEXT NOT NULL DEFAULT ''");
    add('job', 'tidy_changes', 'INTEGER NOT NULL DEFAULT 0');
    add('job', 'tidy_reverted', "TEXT NOT NULL DEFAULT '[]'");
    add('job', 'tidy_reason', "TEXT NOT NULL DEFAULT ''");
    add('job', 'tidy_tried', 'INTEGER NOT NULL DEFAULT 0');
    add('job', 'tidy_notify', 'INTEGER NOT NULL DEFAULT 0');
    // What correction cost, for the monthly cap. Kept apart from jobs so a deleted capture still counts.
    this.db.exec('CREATE TABLE IF NOT EXISTS tidy_spend(at INTEGER NOT NULL, usd REAL NOT NULL)');
    // 畫面與節奏分析：只在擁有者要求時排入。Mac 取得影片、抽出切點與關鍵畫面，只回傳縮圖與時間；影片不離開 Mac。
    this.db.exec(`CREATE TABLE IF NOT EXISTS analysis(
        capture TEXT PRIMARY KEY, source TEXT NOT NULL, url TEXT NOT NULL, video TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', phase TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
        lease TEXT, expires INTEGER, attempt INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL
      )`);
    add('machine', 'analysis', 'INTEGER NOT NULL DEFAULT 0');
  }

  get(sql, ...values) { return this.db.prepare(sql).get(...values); }
  run(sql, ...values) { return this.db.prepare(sql).run(...values); }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  issue() {
    const ticket = nonce();
    this.run('UPDATE machine SET ticket=?,ticket_expires=?', digest(ticket), this.clock() + 600_000);
    return ticket;
  }

  pair(ticket) {
    if (typeof ticket !== 'string' || !/^[\w-]{43}$/.test(ticket))
      throw new InputError('配對檔已失效，請重新下載。', 403);
    return this.transaction(() => {
      const token = nonce();
      if (!this.run(`UPDATE machine SET ticket=NULL,ticket_expires=NULL,token=?,seen=0,ready=0
        WHERE ticket=? AND ticket_expires>?`, digest(token), digest(ticket), this.clock()).changes)
        throw new InputError('配對檔已失效，請重新下載。', 403);
      this.run("UPDATE job SET expires=0 WHERE status='running'");
      return token;
    });
  }

  authenticate(token) {
    const hash = this.get('SELECT token FROM machine')?.token;
    if (!hash || !timingSafeEqual(Buffer.from(hash), Buffer.from(digest(token))))
      throw new InputError('這台 Mac 尚未配對。', 401);
  }

  /**
   * What the paired Mac last reported about its inbox folder: `files` is false for a worker installed before
   * file transcription existed; `inbox` is 'ok', 'unreadable' (macOS denied access or the folder is missing) or ''.
   * @returns {{ files: boolean, inbox: string }}
   */
  mac() {
    const row = this.get('SELECT files,inbox FROM machine');
    return { files: Boolean(row.files), inbox: row.inbox };
  }

  connection() {
    const machine = this.get('SELECT token,seen,ready FROM machine');
    if (!machine.token) return 'unpaired';
    if (!machine.seen || this.clock() - machine.seen > 75_000) return 'offline';
    return machine.ready ? 'ready' : 'waiting';
  }

  /** @param {import("./share.mjs").DouyinSource} source @returns {string[]} */
  matchingIds(source) {
    const rows = this.db.prepare(`SELECT id,target FROM job WHERE url=? OR (video=? AND target IS NULL)
      ORDER BY CASE WHEN url=? THEN 0 ELSE 1 END, created,id`).all(source.url, source.videoId, source.url);
    return [...new Set(rows.flatMap(({ id, target }) => target ? [target, id] : [id]))];
  }

  /** An alias uses the same transcript but retains its own original share and Notion ID. */
  view(id) {
    const row = this.get(`SELECT j.share,j.synced,r.title,r.status,r.phase,r.error,r.text,r.segments,r.expires,r.kind,r.source,
      COALESCE(r.finished,r.created) AS finished,r.tidy_state,r.tidy_text,r.tidy_at,r.tidy_model,r.tidy_changes,r.tidy_reverted,r.tidy_reason
      FROM job j JOIN job r ON r.id=COALESCE(j.target,j.id) WHERE j.id=?`, id);
    if (!row) return null;
    const expired = row.status === 'running' && row.expires <= this.clock();
    return {
      kind: row.kind,
      source: row.kind === 'file' ? row.source || '影片檔' : '抖音',
      status: expired ? 'queued' : row.status,
      phase: expired ? '' : row.phase,
      title: row.title,
      share: row.share,
      text: row.text,
      segments: JSON.parse(row.segments),
      error: row.error,
      // Whether this capture's Notion record holds the finished transcript. Jobs finished before the time was
      // recorded report when they were queued.
      synced: row.status === 'done' && Boolean(row.synced),
      finishedAt: row.status === 'done' ? new Date(row.finished).toISOString() : null,
      // 'pending' while correction is queued or running; null when it was never requested.
      tidyState: row.status !== 'done' || row.tidy_state === 'none' ? null : row.tidy_state || 'pending',
      tidy: row.status === 'done' && ['done', 'failed', 'skipped'].includes(row.tidy_state) && row.tidy_text ? {
        text: row.tidy_text, at: row.tidy_at, model: row.tidy_model, changes: row.tidy_changes,
        state: row.tidy_state, reverted: JSON.parse(row.tidy_reverted),
      } : null,
      tidyReason: row.tidy_reason,
    };
  }

  /**
   * Finished transcripts waiting for correction, oldest first, each marked as started. One that started more than
   * 15 minutes ago without settling (the process restarted) is taken again.
   * @returns {{ id: string, notify: boolean }[]}
   */
  pendingTidy(limit) {
    return this.transaction(() => {
      const now = this.clock();
      const rows = this.db.prepare(`SELECT id,tidy_notify FROM job WHERE target IS NULL AND status='done' AND tidy_state=''
        AND tidy_tried<=? ORDER BY finished,id LIMIT ?`).all(now - 15 * 60_000, limit);
      for (const { id } of rows) this.run('UPDATE job SET tidy_tried=? WHERE id=?', now, id);
      return rows.map(({ id, tidy_notify }) => ({ id, notify: Boolean(tidy_notify) }));
    });
  }

  /** The owner asked to correct a finished transcript (補做校正). No LINE notice is sent for it. */
  requestTidy(id) {
    const changed = this.run(`UPDATE job SET tidy_state='',tidy_tried=0,tidy_notify=0
      WHERE id=(SELECT COALESCE(target,id) FROM job WHERE id=?) AND status='done' AND tidy_state<>''`, id).changes;
    if (!changed && this.view(id)?.status !== 'done') throw new InputError('這筆素材還沒有完成的逐字稿。', 409);
    return this.view(id);
  }

  /**
   * Stores a settled correction, unless the transcript finished again meanwhile (`finishedAt` no longer matches).
   * This capture and every capture merged into the same video then get it written to Notion.
   */
  saveTidy(id, finishedAt, tidy, reason, costUsd) {
    return this.transaction(() => {
      if (costUsd > 0) this.run('INSERT INTO tidy_spend(at,usd) VALUES(?,?)', this.clock(), costUsd);
      const changed = this.run(`UPDATE job SET tidy_state=?,tidy_text=?,tidy_at=?,tidy_model=?,tidy_changes=?,tidy_reverted=?,tidy_reason=?
        WHERE id=? AND target IS NULL AND status='done' AND COALESCE(finished,created)=? AND tidy_state=''`,
        tidy.state, tidy.text, tidy.at, tidy.model, tidy.changes, JSON.stringify(tidy.reverted), reason.slice(0, 300),
        id, Date.parse(finishedAt)).changes;
      if (changed) this.run('UPDATE job SET synced=0,sync_tried=0,sync_fails=0 WHERE id=? OR target=?', id, id);
      return Boolean(changed);
    });
  }

  /**
   * Stores a corrected copy the owner pasted back. It replaces whatever correction the transcript had, including one
   * still pending, and is written to Notion for this capture and every capture merged into the same video.
   */
  saveManualTidy(id, tidy) {
    return this.transaction(() => {
      const root = this.get("SELECT COALESCE(target,id) AS id FROM job WHERE id=?", id)?.id;
      if (!root) return false;
      const changed = this.run(`UPDATE job SET tidy_state='done',tidy_text=?,tidy_at=?,tidy_model=?,tidy_changes=0,tidy_reverted='[]',tidy_reason='',tidy_notify=0
        WHERE id=? AND target IS NULL AND status='done'`, tidy.text, tidy.at, tidy.model, root).changes;
      if (changed) this.run('UPDATE job SET synced=0,sync_tried=0,sync_fails=0 WHERE id=? OR target=?', root, root);
      return Boolean(changed);
    });
  }

  /** What correction cost this calendar month (Taipei time). */
  tidySpentThisMonth() {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' });
    const month = formatter.format(new Date(this.clock()));
    const since = this.clock() - 32 * 24 * 3600_000;
    return this.db.prepare('SELECT at,usd FROM tidy_spend WHERE at>=?').all(since)
      .filter((row) => formatter.format(new Date(row.at)) === month).reduce((sum, row) => sum + row.usd, 0);
  }

  /**
   * Captures whose finished transcript is not in Notion yet: the job's own capture and every capture merged into
   * the same video. Each returned id is marked as tried; a failing one is retried after 5 minutes, doubling up to
   * 6 hours. `force` ignores that wait (the owner asked).
   * @returns {string[]}
   */
  pendingSync(limit, force = false) {
    return this.transaction(() => {
      const now = this.clock();
      const rows = this.db.prepare(`SELECT j.id FROM job j JOIN job r ON r.id=COALESCE(j.target,j.id)
        WHERE r.status='done' AND j.synced=0
        AND (? OR j.sync_tried + MIN(300000 * (1 << MIN(j.sync_fails,7)), 21600000) <= ? OR j.sync_fails=0 AND j.sync_tried=0)
        ORDER BY j.sync_tried,j.created,j.id LIMIT ?`).all(Number(force), now, limit);
      for (const { id } of rows) this.run('UPDATE job SET sync_tried=? WHERE id=?', now, id);
      return rows.map(({ id }) => id);
    });
  }

  /** How many captures have a finished transcript that is not in Notion yet. */
  unsynced() {
    return this.get(`SELECT COUNT(*) AS n FROM job j JOIN job r ON r.id=COALESCE(j.target,j.id)
      WHERE r.status='done' AND j.synced=0`).n;
  }

  /** Records that Notion holds the transcript, unless the job finished again since `finishedAt` was read. */
  markSynced(id, finishedAt) {
    this.run(`UPDATE job SET synced=1,sync_fails=0 WHERE id=? AND EXISTS(SELECT 1 FROM job r
      WHERE r.id=COALESCE(job.target,job.id) AND r.status='done' AND COALESCE(r.finished,r.created)=?)`, id, Date.parse(finishedAt));
  }

  syncFailed(id) {
    this.run('UPDATE job SET sync_fails=sync_fails+1 WHERE id=?', id);
  }

  /** @param {string} id @param {import("./share.mjs").DouyinSource & { raw: string, title: string }} source @param {string | null} [target] */
  enqueue(id, source, target = null) {
    this.run(`INSERT INTO job(id,url,share,title,video,created,target)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET share=CASE WHEN excluded.share<>'' AND (job.share='' OR job.share=job.url)
      THEN excluded.share ELSE job.share END`,
      id, source.url, source.raw, source.title, source.videoId, this.clock(), target);
  }

  retry(id) {
    this.run(`UPDATE job SET status='queued',phase='',error='',lease=NULL,expires=NULL,attempt=attempt+1
      WHERE id=(SELECT COALESCE(target,id) FROM job WHERE id=?) AND status='failed'`, id);
    return this.view(id);
  }

  remove(id) {
    this.transaction(() => this.detach(id));
  }

  /** Removes a capture's job inside a transaction, promoting its first alias. */
  detach(id) {
    const first = this.get('SELECT id FROM job WHERE target=? ORDER BY created,id LIMIT 1', id);
    if (first) {
      this.run(`UPDATE job SET target=NULL,
        video=(SELECT video FROM job WHERE id=?),
        title=(SELECT title FROM job WHERE id=?),
        status=CASE WHEN (SELECT status FROM job WHERE id=?)='done' THEN 'done' ELSE 'queued' END,
        text=(SELECT text FROM job WHERE id=?),
        segments=(SELECT segments FROM job WHERE id=?),
        finished=(SELECT finished FROM job WHERE id=?),
        tidy_state=(SELECT tidy_state FROM job WHERE id=?), tidy_text=(SELECT tidy_text FROM job WHERE id=?),
        tidy_at=(SELECT tidy_at FROM job WHERE id=?), tidy_model=(SELECT tidy_model FROM job WHERE id=?),
        tidy_changes=(SELECT tidy_changes FROM job WHERE id=?), tidy_reverted=(SELECT tidy_reverted FROM job WHERE id=?)
        WHERE id=?`, id, id, id, id, id, id, id, id, id, id, id, id, first.id);
      this.run('UPDATE job SET target=? WHERE target=?', first.id, id);
    }
    this.run('DELETE FROM job WHERE id=?', id);
  }

  /**
   * The Mac reports a media file waiting in its inbox folder. Returns what it should do with the file:
   * `waiting` (the owner has not said which capture it belongs to; `ask` when the question should be sent now),
   * `assigned` (queued or in progress for `captureId`), or `done` (transcribed: archive it under `captureId`).
   * @returns {{ state: 'waiting' | 'assigned' | 'done', captureId?: string, ask?: boolean }}
   */
  offer(token, data) {
    return this.transaction(() => {
      this.authenticate(token);
      const { file, name, size } = data;
      if (typeof file !== 'string' || !fileHash.test(file) || typeof name !== 'string' || !name.trim() || name.length > 255 ||
          !Number.isSafeInteger(size) || size <= 0)
        throw new InputError('檔案資訊格式不符。');
      const now = this.clock();
      this.run('UPDATE machine SET seen=?', now);
      const job = this.get('SELECT id,status FROM job WHERE video=? AND target IS NULL', 'file:' + file);
      if (job) return { state: job.status === 'done' ? 'done' : 'assigned', captureId: job.id };
      this.run(`INSERT INTO offer(hash,name,size,created,seen) VALUES(?,?,?,?,?)
        ON CONFLICT(hash) DO UPDATE SET name=excluded.name,size=excluded.size,seen=excluded.seen`, file, name.trim(), size, now, now);
      const ask = Boolean(this.run('UPDATE offer SET tried=? WHERE hash=? AND asked=0 AND tried<=?', now, file, now - askAgainMs).changes);
      return { state: 'waiting', ask };
    });
  }

  /** The owner was asked in LINE which capture this file belongs to. */
  asked(file) {
    this.run('UPDATE offer SET asked=1 WHERE hash=?', file);
  }

  /** The name of a waiting file, or null once it has been assigned or was never offered. */
  offerName(file) {
    return typeof file === 'string' && fileHash.test(file) ? this.get('SELECT name FROM offer WHERE hash=?', file)?.name ?? null : null;
  }

  /** Files waiting on the Mac for the owner to say which capture they belong to. */
  offers() {
    return this.db.prepare('SELECT hash AS file,name,size FROM offer WHERE seen>? ORDER BY created,hash')
      .all(this.clock() - offerFreshMs);
  }

  busy(captureId) {
    const job = this.get('SELECT r.status FROM job j JOIN job r ON r.id=COALESCE(j.target,j.id) WHERE j.id=?', captureId);
    if (job && (job.status === 'queued' || job.status === 'running'))
      throw new InputError('這筆素材正在等待或進行轉錄，完成或失敗後才能換檔重轉。', 409);
  }

  /**
   * Queues a waiting file for a capture, in place of that capture's previous job. The job is identified by the
   * file's hash, so there is nothing for the Mac to resolve.
   * @param {string} captureId @param {string} file @param {{ title: string, source: string }} capture
   */
  assign(captureId, file, { title, source }) {
    return this.transaction(() => {
      const offer = typeof file === 'string' && fileHash.test(file) ? this.get('SELECT name FROM offer WHERE hash=?', file) : null;
      if (!offer) throw new InputError('這個檔案已經指定過，或已不在 Mac 的資料夾裡。', 410);
      this.busy(captureId);
      this.detach(captureId);
      const name = 'file:' + file;
      this.run(`INSERT INTO job(id,url,share,title,video,created,kind,source) VALUES(?,?,'',?,?,?,'file',?)`,
        captureId, name, title.trim().slice(0, 250) || offer.name, name, this.clock(), source.trim().slice(0, 40));
      this.run('DELETE FROM offer WHERE hash=?', file);
      return this.view(captureId);
    });
  }

  /**
   * @param {string} token @param {boolean} ready
   * @param {{ files?: boolean, inbox?: string, analysis?: boolean }} [mac] what the worker reports: its inbox folder, and whether it can cut frames for 畫面與節奏分析
   */
  claim(token, ready, { files = false, inbox = '', analysis = false } = {}) {
    return this.transaction(() => {
      this.authenticate(token);
      const now = this.clock();
      this.run('UPDATE machine SET seen=?,ready=?,files=?,inbox=?,analysis=?', now, Number(ready), Number(files),
        inbox === 'ok' || inbox === 'unreadable' ? inbox : '', Number(analysis));
      // Analysis does not need BiliNote, so it is handed out even when transcription is not ready.
      if (!ready) return analysis ? this.claimAnalysis(now) : null;
      // A worker installed before file transcription existed only receives 抖音 jobs.
      const row = this.get(`SELECT id,url,video,attempt,kind FROM job WHERE target IS NULL
        AND (status='queued' OR (status='running' AND expires<=?)) AND (kind='douyin' OR ?)
        ORDER BY created,id LIMIT 1`, now, Number(files));
      if (!row) return analysis ? this.claimAnalysis(now) : null;
      const lease = nonce();
      // A file is already on the Mac and identified by its hash, so it starts at the audio step.
      this.run("UPDATE job SET status='running',phase=?,lease=?,expires=? WHERE id=?",
        row.kind === 'file' ? 'audio' : 'resolve', lease, now + leaseMs, row.id);
      return { ...row, lease };
    });
  }

  update(token, data) {
    return this.transaction(() => {
      this.authenticate(token);
      const now = this.clock();
      const job = this.get(`SELECT id,video,created,kind FROM job WHERE id=? AND lease=? AND expires>?
        AND target IS NULL AND status='running'`, data.id, typeof data.lease === 'string' ? data.lease : '', now);
      if (!job) throw new InputError('任務已重新分派。', 409);
      this.run('UPDATE machine SET seen=?', now);

      switch (data.action) {
        case 'heartbeat':
          if (!phases.includes(data.phase)) throw new InputError('轉錄步驟格式不符。');
          this.run('UPDATE job SET phase=?,expires=? WHERE id=?', data.phase, now + leaseMs, job.id);
          return {};
        case 'identify': {
          if (job.kind !== 'douyin') throw new InputError('Mac 上的檔案不需辨認作品。', 422);
          if (typeof data.videoId !== 'string' || !/^\d{10,22}$/.test(data.videoId) || typeof data.title !== 'string' || !data.title.trim())
            throw new InputError('抖音作品編號或標題格式不符。');
          const match = this.get(`SELECT id FROM job WHERE video=? AND id<>? AND target IS NULL
            ORDER BY CASE status WHEN 'done' THEN 0 WHEN 'running' THEN 1 ELSE 2 END, created,id LIMIT 1`, data.videoId, job.id);
          if (match) {
            this.run('UPDATE job SET target=? WHERE target=?', match.id, job.id);
            this.run('UPDATE job SET target=?,lease=NULL,expires=NULL WHERE id=?', match.id, job.id);
            return { merged: true };
          }
          this.run("UPDATE job SET video=?,title=?,phase='download',expires=? WHERE id=?",
            data.videoId, data.title.trim().slice(0, 250), now + leaseMs, job.id);
          return { merged: false };
        }
        case 'finish': {
          if (!job.video || data.videoId !== job.video) throw new InputError('逐字稿與原影片編號不符。', 422);
          const { text, segments } = validatedTranscript(data);
          // A new transcript is corrected automatically, and the owner hears about it once correction settles.
          this.run(`UPDATE job SET status='done',phase='',text=?,segments=?,error='',lease=NULL,expires=NULL,finished=?,
            tidy_state='',tidy_text=NULL,tidy_at=NULL,tidy_model='',tidy_changes=0,tidy_reverted='[]',tidy_reason='',tidy_tried=0,tidy_notify=1
            WHERE id=?`, text, JSON.stringify(segments), now, job.id);
          // This capture and every capture merged into the same video get the new transcript written to Notion.
          this.run('UPDATE job SET synced=0,sync_tried=0,sync_fails=0 WHERE id=? OR target=?', job.id, job.id);
          return {};
        }
        case 'fail': {
          if (!phases.includes(data.phase) || typeof data.message !== 'string' || !data.message.trim())
            throw new InputError('錯誤原因或步驟格式不符。');
          this.run(`UPDATE job SET status='failed',phase=?,error=?,lease=NULL,expires=NULL WHERE id=?`,
            data.phase, data.message.trim().slice(0, 600), job.id);
          return {};
        }
        default: throw new InputError('無法識別的轉錄動作。');
      }
    });
  }

  // ---- 畫面與節奏分析 ----

  /** Whether the paired Mac runs a worker that can analyse video. */
  macAnalyses() {
    return Boolean(this.get('SELECT analysis FROM machine')?.analysis);
  }

  /**
   * Queues an analysis for a capture whose video the Mac has transcribed: a 抖音 video it can fetch again, or a
   * file it archived. Asking again after a failure or a finished analysis starts a new attempt.
   */
  requestAnalysis(captureId) {
    return this.transaction(() => {
      const job = this.get(`SELECT r.id,r.kind,r.url,r.video,r.status FROM job j JOIN job r ON r.id=COALESCE(j.target,j.id) WHERE j.id=?`, captureId);
      if (!job || job.status !== 'done' || !job.video)
        throw new InputError('這筆素材還沒有 Mac 轉錄過的影片，暫時無法分析畫面。', 409);
      const current = this.get('SELECT status,expires FROM analysis WHERE capture=?', captureId);
      if (current && (current.status === 'queued' || (current.status === 'running' && current.expires > this.clock())))
        return this.analysisView(captureId);
      const source = job.kind === 'file' ? 'file' : 'douyin';
      this.run(`INSERT INTO analysis(capture,source,url,video,created) VALUES(?,?,?,?,?)
        ON CONFLICT(capture) DO UPDATE SET source=excluded.source,url=excluded.url,video=excluded.video,status='queued',
        phase='',error='',lease=NULL,expires=NULL,attempt=analysis.attempt+1,created=excluded.created`,
        captureId, source, job.url, job.video, this.clock());
      return this.analysisView(captureId);
    });
  }

  /** @returns {{ status: string, phase: string, error: string } | null} */
  analysisView(captureId) {
    const row = this.get('SELECT status,phase,error,expires FROM analysis WHERE capture=?', captureId);
    if (!row) return null;
    const expired = row.status === 'running' && row.expires <= this.clock();
    return { status: expired ? 'queued' : row.status, phase: expired ? '' : row.phase, error: row.error };
  }

  /** Called inside claim's transaction. */
  claimAnalysis(now) {
    const row = this.get(`SELECT capture,source,url,video,attempt FROM analysis
      WHERE status='queued' OR (status='running' AND expires<=?) ORDER BY created,capture LIMIT 1`, now);
    if (!row) return null;
    const lease = nonce();
    this.run("UPDATE analysis SET status='running',phase='fetch',lease=?,expires=? WHERE capture=?", lease, now + leaseMs, row.capture);
    return { id: row.capture, kind: 'analysis', source: row.source, url: row.url, video: row.video, attempt: row.attempt, lease };
  }

  /**
   * The Mac reports on an analysis: `heartbeat` (phase fetch | frames | upload), `fail`, or `frames` (done on the
   * Mac; the site reads the frames next). Returns the capture id for `frames`.
   */
  updateAnalysis(token, data) {
    return this.transaction(() => {
      this.authenticate(token);
      const now = this.clock();
      const row = this.get(`SELECT capture FROM analysis WHERE capture=? AND lease=? AND expires>? AND status='running'`,
        data.id, typeof data.lease === 'string' ? data.lease : '', now);
      if (!row) throw new InputError('分析任務已重新分派。', 409);
      this.run('UPDATE machine SET seen=?', now);
      switch (data.action) {
        case 'heartbeat':
          if (!['fetch', 'frames', 'upload'].includes(data.phase)) throw new InputError('分析步驟格式不符。');
          this.run('UPDATE analysis SET phase=?,expires=? WHERE capture=?', data.phase, now + leaseMs, row.capture);
          return {};
        case 'fail':
          if (typeof data.message !== 'string' || !data.message.trim()) throw new InputError('錯誤原因格式不符。');
          this.run("UPDATE analysis SET status='failed',error=?,lease=NULL,expires=NULL WHERE capture=?", data.message.trim().slice(0, 600), row.capture);
          return {};
        case 'frames':
          this.run("UPDATE analysis SET status='reading',phase='',error='',lease=NULL,expires=NULL WHERE capture=?", row.capture);
          return {};
        default: throw new InputError('無法識別的分析動作。');
      }
    });
  }

  /** The site finished (or failed) reading the frames. */
  settleAnalysis(captureId, error = '') {
    this.run("UPDATE analysis SET status=?,error=? WHERE capture=?", error ? 'failed' : 'done', error.slice(0, 600), captureId);
  }
}
