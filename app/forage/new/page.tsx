import Link from "next/link";
import {CaptureForm} from "../../components/ForageCaptureForm";
export default function ForageNew(){return <section className="screen"><div className="forage-page-heading"><div><span className="eyebrow">野採・原始材料</span><h1>新增素材</h1><p>先接住一個念頭，之後再慢慢整理。</p></div><Link href="/forage">回到野採</Link></div><CaptureForm /></section>;}
