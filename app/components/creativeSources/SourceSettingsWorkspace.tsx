'use client';
import Link from 'next/link';
import LeaveProvider from '../weaving/LeaveDialog';
import SourcePicker from '../weaving/SourcePicker';
import CreativeIcon from '../creative/CreativeIcon';
import '@/app/weaving/workflow.css';
import './sourceSettings.css';
export default function SourceSettingsWorkspace(){return <LeaveProvider><section className="creative-source-settings weaving-clarity"><Link href="/weaving">返回織光堂</Link><header className="ritual-card"><span className="eyebrow"><CreativeIcon name="document"/> 選素材之前</span><h1>來源與公開設定</h1><p>先找一份素材，再分別決定點點能否主動取材、內容能否用在公開作品。</p><p>尚未設定時，兩項都需逐次確認。目前不會自動讀取你的個人日記。</p><p><Link href="/dao/explore">查找閱讀、洞察與知識 →</Link></p></header><div className="ritual-card"><SourcePicker settingsOnly pickerId="source-settings"/></div></section></LeaveProvider>;}
