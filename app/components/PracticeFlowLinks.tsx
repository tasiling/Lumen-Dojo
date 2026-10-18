'use client';
import Link from './PracticeRouteLink';
import {practiceFlowLinks} from '@/lib/dojo/practiceNavigation';
export default function PracticeFlowLinks({learningItemId}:{learningItemId?:string}){
 return <nav aria-label='修習與收藏導覽'><h2>修習與收藏入口</h2><div className='practice-shortcuts'>{practiceFlowLinks(learningItemId).map(link=><Link key={link.id} className='practice-link card' href={link.href}><b>{link.title}</b><small>{link.detail}</small></Link>)}</div></nav>;
}
