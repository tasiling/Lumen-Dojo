import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { digest, InputError, validatedTranscript } from './share.mjs';

const nonce = () => randomBytes(32).toString('base64url');
const leaseMs = 120_000;
const phases = ['resolve', 'download', 'audio', 'transcribe', 'write'];
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
      INSERT OR IGNORE INTO machine(singleton) VALUES(1);`);
    // Columns for writing finished transcripts back to Notion. Existing finished rows start unsynced (0),
    // which is what backfills them.
    const add = (table, column, definition) => {
      if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(({ name }) => name === column))
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };
    add('job', 'finished', 'INTEGER');
    add('job', 'synced', 'INTEGER NOT NULL DEFAULT 0');
    add('job', 'sync_tried', 'INTEGER NOT NULL DEFAULT 0');
    add('job', 'sync_fails', 'INTEGER NOT NULL DEFAULT 0');
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
    const row = this.get(`SELECT j.share,j.synced,r.title,r.status,r.phase,r.error,r.text,r.segments,r.expires,
      COALESCE(r.finished,r.created) AS finished FROM job j JOIN job r ON r.id=COALESCE(j.target,j.id) WHERE j.id=?`, id);
    if (!row) return null;
    const expired = row.status === 'running' && row.expires <= this.clock();
    return {
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
    };
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
    this.transaction(() => {
      const first = this.get('SELECT id FROM job WHERE target=? ORDER BY created,id LIMIT 1', id);
      if (first) {
        this.run(`UPDATE job SET target=NULL,
          video=(SELECT video FROM job WHERE id=?),
          title=(SELECT title FROM job WHERE id=?),
          status=CASE WHEN (SELECT status FROM job WHERE id=?)='done' THEN 'done' ELSE 'queued' END,
          text=(SELECT text FROM job WHERE id=?),
          segments=(SELECT segments FROM job WHERE id=?)
          WHERE id=?`, id, id, id, id, id, first.id);
        this.run('UPDATE job SET target=? WHERE target=?', first.id, id);
      }
      this.run('DELETE FROM job WHERE id=?', id);
    });
  }

  claim(token, ready) {
    return this.transaction(() => {
      this.authenticate(token);
      const now = this.clock();
      this.run('UPDATE machine SET seen=?,ready=?', now, Number(ready));
      if (!ready) return null;
      const row = this.get(`SELECT id,url,video,attempt FROM job WHERE target IS NULL
        AND (status='queued' OR (status='running' AND expires<=?)) ORDER BY created,id LIMIT 1`, now);
      if (!row) return null;
      const lease = nonce();
      this.run("UPDATE job SET status='running',phase='resolve',lease=?,expires=? WHERE id=?", lease, now + leaseMs, row.id);
      return { ...row, lease };
    });
  }

  update(token, data) {
    return this.transaction(() => {
      this.authenticate(token);
      const now = this.clock();
      const job = this.get(`SELECT id,video,created FROM job WHERE id=? AND lease=? AND expires>?
        AND target IS NULL AND status='running'`, data.id, typeof data.lease === 'string' ? data.lease : '', now);
      if (!job) throw new InputError('任務已重新分派。', 409);
      this.run('UPDATE machine SET seen=?', now);

      switch (data.action) {
        case 'heartbeat':
          if (!phases.includes(data.phase)) throw new InputError('轉錄步驟格式不符。');
          this.run('UPDATE job SET phase=?,expires=? WHERE id=?', data.phase, now + leaseMs, job.id);
          return {};
        case 'identify': {
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
          this.run(`UPDATE job SET status='done',phase='',text=?,segments=?,error='',lease=NULL,expires=NULL,finished=?
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
}
