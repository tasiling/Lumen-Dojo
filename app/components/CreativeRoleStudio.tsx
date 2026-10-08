"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CreativeRoleProfile, ManifestationMilestone } from "@/lib/dojo/manifestation";
import AffirmPractice from "./AffirmPractice";

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? "操作失敗");
  return json as T;
}

export default function CreativeRoleStudio() {
  const [profile, setProfile] = useState<CreativeRoleProfile | null>(null);
  const [milestones, setMilestones] = useState<ManifestationMilestone[]>([]);
  const [traitsText, setTraitsText] = useState("");
  const [action, setAction] = useState("");
  const [response, setResponse] = useState("");
  const [trait, setTrait] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/dojo/manifestation", { cache: "no-store" })
      .then((response) => readResponse<{ profile: CreativeRoleProfile; milestones: ManifestationMilestone[] }>(response))
      .then((json) => {
        if (cancelled) return;
        setProfile(json.profile);
        setTraitsText(json.profile.traits.join("、"));
        setTrait(json.profile.traits[0] ?? "");
        setMilestones(json.milestones);
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => { cancelled = true; };
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const traits = traitsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
      const json = await readResponse<{ profile: CreativeRoleProfile }>(await fetch("/api/dojo/manifestation", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, traits }),
      }));
      setProfile(json.profile); setTraitsText(json.profile.traits.join("、"));
      if (!json.profile.traits.includes(trait)) setTrait(json.profile.traits[0] ?? "");
      setMessage("創現角色小檔案已更新。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function saveMilestone() {
    setSaving(true); setError(null); setMessage(null);
    try {
      const json = await readResponse<{ milestone: ManifestationMilestone }>(await fetch("/api/dojo/manifestation", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, response, trait, reflection }),
      }));
      setMilestones((items) => [json.milestone, ...items]);
      setAction(""); setResponse(""); setReflection("");
      setMessage("里程碑已留在修習所；日記只需回指這段進度。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  if (!profile) return <div className="card creative-role-loading">{error || "正在讀取創現角色…"}</div>;
  return <div className="creative-role-studio">
    <section className="creative-principle-card">
      <span className="label">創作者原則</span>
      <b>創現，是主動寫出選擇與行動。</b>
      <p>你是創作者；如實承認此刻，再決定要營造的狀態。外界回應會被記下，但不必宣稱自己控制所有結果。</p>
      <div className="creative-role-pair"><span><b>現世角色</b>今天主筆創作的你</span><span><b>創現角色</b>正在被你持續寫出的版本</span></div>
    </section>

    <section className="creative-method-map" aria-label="三種創作方式">
      <span><b>劇本法</b>角色與行動證據</span>
      <span><b>Affirm</b>專注複誦</span>
      <Link href="/practice?vision=1"><b>Vision</b>前往沉浸練習 →</Link>
    </section>

    <section id="creative-role" className="creative-role-card">
      <div className="section-heading"><div><span className="eyebrow">創現角色</span><h3>角色小檔案</h3></div><small>方向改變時再更新</small></div>
      <label htmlFor="creative-role-title">角色稱號</label>
      <input id="creative-role-title" className="field" value={profile.title} onChange={(event) => setProfile({ ...profile, title: event.target.value })} placeholder="例如：輕盈擁房的自由創作者" />
      <label htmlFor="creative-role-traits">核心特質（1–3 個）</label>
      <input id="creative-role-traits" className="field" value={traitsText} onChange={(event) => setTraitsText(event.target.value)} placeholder="鬆弛、主動、穩定" />
      <small>用頓號分開。這些是你正在持續創作的特質，不是固定人設。</small>
      <label htmlFor="creative-role-note">這一版角色想寫往哪裡？（選填）</label>
      <textarea id="creative-role-note" className="field" rows={3} value={profile.note} onChange={(event) => setProfile({ ...profile, note: event.target.value })} placeholder="一句創作方向即可" />
      <button type="button" className="primary" disabled={saving || !profile.title.trim() || !traitsText.trim()} onClick={() => void saveProfile()}>{saving ? "儲存中…" : "儲存角色小檔案"}</button>
    </section>

    <section id="creative-milestone" className="creative-milestone-card">
      <div className="section-heading"><div><span className="eyebrow">主動創造的證據</span><h3>里程碑事件</h3></div></div>
      <label htmlFor="creative-action">我主動採取了什麼行動？</label>
      <textarea id="creative-action" className="field" rows={3} value={action} onChange={(event) => setAction(event.target.value)} placeholder="例如：我安排並完成了一次看房。" />
      <label htmlFor="creative-response">現實給了什麼回應？（選填）</label>
      <textarea id="creative-response" className="field" rows={2} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="只寫實際發生的回應，不需要把外界結果都歸因於自己。" />
      <label htmlFor="creative-trait">這段行動正在創作哪個特質？</label>
      {profile.traits.length ? <select id="creative-trait" className="field" value={trait} onChange={(event) => setTrait(event.target.value)}>{profile.traits.map((item) => <option key={item}>{item}</option>)}</select> : <input id="creative-trait" className="field" value={trait} onChange={(event) => setTrait(event.target.value)} placeholder="先寫一個特質" />}
      <label htmlFor="creative-reflection">我如何理解這段進度？（選填）</label>
      <textarea id="creative-reflection" className="field" rows={2} value={reflection} onChange={(event) => setReflection(event.target.value)} />
      <button type="button" className="primary" disabled={saving || !action.trim() || !trait.trim()} onClick={() => void saveMilestone()}>{saving ? "保存中…" : "留下里程碑"}</button>
    </section>
    <section id="creative-affirm"><AffirmPractice profile={profile} /></section>
    {error && <p className="form-error">{error}</p>}{message && <p className="save-notice">{message}</p>}
    {milestones.length > 0 && <details className="creative-milestone-history"><summary>最近的里程碑（{milestones.length}）</summary>{milestones.slice(0, 6).map((item) => <article key={item.id}><small>{item.date} · {item.trait}</small><b>{item.action}</b>{item.response && <p>現實回應：{item.response}</p>}</article>)}</details>}
  </div>;
}
