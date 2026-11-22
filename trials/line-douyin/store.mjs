import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { digest, InputError, validatedTranscript } from './share.mjs';

export const LEASE = 120_000;
const nonce = () => randomBytes(32).toString('base64url');
const conflict = (message) => new InputError(message, 409);
const addNote = (old, extra) =>
  !extra || old === extra || old.split('\n\n').includes(extra)
    ? old
    : [old, extra].filter(Boolean).join('\n\n');
export class Queue {
  constructor(file, clock = Date.now) {
    this.db = new DatabaseSync(file);
    this.clock = clock;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS card(
        id TEXT PRIMARY KEY, url TEXT NOT NULL, raw TEXT NOT NULL, note TEXT NOT NULL,
        title TEXT NOT NULL, video TEXT, source TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
        phase TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '',
        segments TEXT NOT NULL DEFAULT '[]', attempt INTEGER NOT NULL DEFAULT 1, lease TEXT, until_ms INTEGER,
        target TEXT REFERENCES card(id), created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS video_key ON card(video) WHERE target IS NULL AND video IS NOT NULL;
      CREATE INDEX IF NOT EXISTS next_job ON card(state,until_ms,created);
      CREATE TABLE IF NOT EXISTS alias(url TEXT PRIMARY KEY, card TEXT NOT NULL REFERENCES card(id));
      CREATE TABLE IF NOT EXISTS event(id TEXT PRIMARY KEY, card TEXT NOT NULL REFERENCES card(id), replied INTEGER NOT NULL DEFAULT 0, reply_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS setting(name TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticket(kind TEXT PRIMARY KEY, hash TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  get(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  setting(name) {
    return this.get('SELECT value FROM setting WHERE name=?', name)?.value;
  }
  set(name, value) {
    this.run('INSERT OR REPLACE INTO setting VALUES(?,?)', name, String(value));
  }
  issue(kind) {
    const ticket = kind === 'line' ? randomBytes(8).toString('hex') : nonce();
    this.run('INSERT OR REPLACE INTO ticket VALUES(?,?,?)', kind, digest(ticket), this.clock() + 600000);
    return ticket;
  }
  redeem(kind, ticket, binding) {
    return this.transaction(() => {
      if (
        typeof ticket !== 'string' ||
        !this.run(
          'DELETE FROM ticket WHERE kind=? AND hash=? AND expires>?',
          kind,
          digest(ticket),
          this.clock(),
        ).changes
      )
        throw new InputError('配對碼已失效，請從測試站重新取得。', 403);
      if (kind === 'line') {
        this.set('lineUser', binding);
        return;
      }
      const token = nonce();
      this.set('workerHash', digest(token));
      this.set('seen', 0);
      return token;
    });
  }
  row(id) {
    let r = this.get('SELECT * FROM card WHERE id=?', id);
    while (r?.target) r = this.get('SELECT * FROM card WHERE id=?', r.target);
    if (!r) throw new InputError('找不到這筆測試素材。', 404);
    return r;
  }
  ingest(share, source, eventId) {
    return this.transaction(() => {
      const prior = this.get('SELECT * FROM event WHERE id=?', eventId);
      if (prior)
        return { id: this.row(prior.card).id, duplicate: true, replied: Boolean(prior.replied) };
      const existing =
        this.get('SELECT card AS id FROM alias WHERE url=?', share.url) ||
        (share.videoId &&
          this.get('SELECT id FROM card WHERE video=? AND target IS NULL', share.videoId));
      let id;
      const now = this.clock();
      if (existing) {
        const card = this.row(existing.id);
        id = card.id;
        const note = addNote(card.note, share.note);
        if (note !== card.note) this.run('UPDATE card SET note=?,updated=? WHERE id=?', note, now, id);
      } else {
        id = randomUUID();
        this.run(
          'INSERT INTO card(id,url,raw,note,title,video,source,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',
          id,
          share.url,
          share.raw,
          share.note,
          share.title,
          share.videoId,
          source,
          now,
          now,
        );
      }
      this.run('INSERT OR IGNORE INTO alias VALUES(?,?)', share.url, id);
      this.run('INSERT INTO event(id,card) VALUES(?,?)', eventId, id);
      return { id, duplicate: Boolean(existing), replied: false };
    });
  }
  promptReflection(uid, id, eventKey) {
    return this.transaction(() => {
      const card = this.row(id);
      if (!this.get('SELECT id FROM event WHERE id=?', eventKey)) {
        this.run('INSERT INTO event(id,card) VALUES(?,?)', eventKey, card.id);
        this.set('reflectionPrompt', JSON.stringify({ uid, id: card.id, until: this.clock() + 600000 }));
      }
      return card.title;
    });
  }
  acceptReflection(uid, eventId, text) {
    if (!text.trim() || text.length > 5000) return null;
    return this.transaction(() => {
      const previous = this.get('SELECT card FROM event WHERE id=?', eventId);
      if (previous) return this.row(previous.card).id;
      const prompt = JSON.parse(this.setting('reflectionPrompt') || 'null');
      if (!prompt || prompt.uid !== uid || prompt.until <= this.clock()) return null;
      const card = this.row(prompt.id);
      this.run(
        'UPDATE card SET note=?,updated=? WHERE id=?',
        addNote(card.note, text.trim()),
        this.clock(),
        card.id,
      );
      this.run('INSERT INTO event(id,card) VALUES(?,?)', eventId, card.id);
      this.set('reflectionPrompt', 'null');
      return card.id;
    });
  }
  publicCard(id) {
    const r = this.row(id);
    const asleep = r.state === 'running' && r.until_ms <= this.clock();
    return {
      id: r.id,
      url: r.url,
      share: r.raw,
      note: r.note,
      title: r.title,
      source: r.source,
      status: asleep ? 'queued' : r.state,
      phase: asleep ? 'resume' : r.phase,
      error: r.error,
      text: r.text,
      segments: JSON.parse(r.segments),
      created: r.created,
      updated: r.updated,
    };
  }
  list() {
    return this.db
      .prepare(
        `SELECT id,title,state,phase,until_ms,created,updated,source
        FROM card WHERE target IS NULL ORDER BY created DESC`,
      )
      .all()
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.state === 'running' && r.until_ms <= this.clock() ? 'queued' : r.state,
        phase: r.phase,
        created: r.created,
        source: r.source,
      }));
  }
  note(id, note, previous) {
    if (typeof note !== 'string' || note.length > 10000 || typeof previous !== 'string')
      throw new InputError('請確認筆記長度。');
    const card = this.row(id);
    if (card.note === note.trim()) return;
    if (
      !this.run(
        'UPDATE card SET note=?,updated=? WHERE id=? AND note=?',
        note.trim(),
        this.clock(),
        card.id,
        previous,
      ).changes
    )
      throw conflict('筆記剛更新，請重新讀取再保存。');
  }
  retry(id) {
    const card = this.row(id);
    if (
      !this.run(
        "UPDATE card SET state='queued',phase='',error='',attempt=attempt+1,updated=? WHERE id=? AND state='failed'",
        this.clock(),
        card.id,
      ).changes
    )
      throw conflict('這筆素材已在處理或已有逐字稿。');
  }
  claim(ready) {
    return this.transaction(() => {
      const now = this.clock();
      this.set('seen', now);
      this.set('ready', ready ? 'yes' : 'no');
      if (!ready) return null;
      const r = this.get(
        `SELECT id,url,attempt,video FROM card WHERE target IS NULL
        AND (state='queued' OR (state='running' AND until_ms<=?)) ORDER BY created,id LIMIT 1`,
        now,
      );
      if (!r) return null;
      const token = nonce();
      this.run(
        "UPDATE card SET state='running',phase='resolve',error='',lease=?,until_ms=?,updated=? WHERE id=?",
        digest(token),
        now + LEASE,
        now,
        r.id,
      );
      return { ...r, lease: token };
    });
  }
  owned(id, token) {
    const r = this.get(
      "SELECT * FROM card WHERE id=? AND state='running' AND lease=? AND until_ms>? AND target IS NULL",
      id,
      digest(typeof token === 'string' ? token : ''),
      this.clock(),
    );
    if (!r) throw conflict('這筆任務已交由新的工作程序接手。');
    return r;
  }
  workerUpdate(id, data) {
    return this.transaction(() => {
      const r = this.owned(id, data.lease),
        now = this.clock();
      this.set('seen', now);
      if (data.action === 'identify') {
        if (!/^\d{10,22}$/.test(data.videoId) || typeof data.title !== 'string' || !data.title.trim())
          throw new InputError('作品編號或標題不符。');
        if (r.video && r.video !== data.videoId) throw conflict('分享網址所指的作品已改變。');
        const existing = this.get(
          'SELECT * FROM card WHERE video=? AND id<>? AND target IS NULL',
          data.videoId,
          id,
        );
        if (existing) {
          this.run(
            'UPDATE card SET note=?,updated=? WHERE id=?',
            addNote(existing.note, r.note),
            now,
            existing.id,
          );
          this.run('UPDATE alias SET card=? WHERE card=?', existing.id, id);
          this.run('UPDATE event SET card=? WHERE card=?', existing.id, id);
          this.run(
            "UPDATE card SET target=?,lease=NULL,until_ms=NULL,state='merged' WHERE id=?",
            existing.id,
            id,
          );
          return { merged: true, id: existing.id };
        }
        this.run(
          'UPDATE card SET video=?,title=? WHERE id=?',
          data.videoId,
          data.title.trim().slice(0, 300),
          id,
        );
        this.run(
          'INSERT OR IGNORE INTO alias VALUES(?,?)',
          'https://www.douyin.com/video/' + data.videoId,
          id,
        );
      } else if (data.action === 'finish') {
        if (!r.video || data.videoId !== r.video) throw conflict('逐字稿的作品編號與原卡不符。');
        const result = validatedTranscript(data);
        this.run(
          "UPDATE card SET state='done',phase='',error='',text=?,segments=?,lease=NULL,until_ms=NULL,updated=? WHERE id=?",
          result.text,
          JSON.stringify(result.segments),
          now,
          id,
        );
        return { id, status: 'done' };
      } else if (data.action === 'fail') {
        const phases = new Set(['resolve', 'download', 'audio', 'transcribe', 'write']);
        if (!phases.has(data.phase) || typeof data.message !== 'string' || !data.message.trim())
          throw new InputError('需要失敗步驟和原因。');
        this.run(
          "UPDATE card SET state='failed',phase=?,error=?,lease=NULL,until_ms=NULL,updated=? WHERE id=?",
          data.phase,
          data.message.trim().slice(0, 420),
          now,
          id,
        );
        return { id, status: 'failed' };
      } else if (data.action !== 'heartbeat') throw new InputError('未知的工作動作。');
      const phase = data.action === 'identify' ? 'download' : data.phase || r.phase;
      if (!['resolve', 'download', 'audio', 'transcribe', 'write'].includes(phase))
        throw new InputError('未知的工作步驟。');
      this.run('UPDATE card SET phase=?,until_ms=?,updated=? WHERE id=?', phase, now + LEASE, now, id);
      return { id, merged: false };
    });
  }
  workerState() {
    const seen = Number(this.setting('seen') || 0);
    return {
      paired: Boolean(this.setting('workerHash')),
      online: seen > 0 && this.clock() - seen < LEASE,
      ready: this.setting('ready') === 'yes',
      lastSeen: seen,
    };
  }
}
