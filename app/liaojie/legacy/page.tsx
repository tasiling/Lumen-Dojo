import Link from 'next/link';
import WeavingProjectHub from '@/app/components/WeavingProjectHub';
export default function Page(){return <section className="screen"><h1>舊正式作品與相容入口</h1><p>原作品暫時保留於舊織光工作端；使用後可由此返回聊解室。</p><Link href="/liaojie/works">返回聊解室作品管理</Link><WeavingProjectHub/></section>;}
