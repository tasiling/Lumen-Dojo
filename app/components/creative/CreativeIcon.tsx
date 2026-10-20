import type { CreativeIconName } from '@/lib/dojo/creativeWorkflowSteps';
export default function CreativeIcon({name,className=''}:{name:CreativeIconName;className?:string}) {
  return <svg className={`creative-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name==='document'&&<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>}
    {name==='compass'&&<><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></>}
    {name==='pen'&&<><path d="m4 20 1-5L16 4a2.1 2.1 0 0 1 3 3L8 18Zm9-13 4 4M4 20l4-2"/></>}
    {name==='eye'&&<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}
    {name==='handoff'&&<><path d="M5 12v8h14v-8M12 16V2m-4 4 4-4 4 4"/></>}
    {name==='layers'&&<><path d="m3 7 9-5 9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5"/></>}
    {name==='sprout'&&<><path d="M12 22V11M12 15C4 15 3 10 3 7c6 0 9 3 9 8Zm0-3c0-7 4-9 9-9 0 6-3 10-9 10"/></>}
    {name==='inbox'&&<><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M3 6h18V3H3Zm5 5h8m-4 0v3"/></>}
    {name==='chat'&&<><path d="M12 4a8 8 0 0 0-8 8l-1 7 5-2a8 8 0 1 0 4-13Z"/><path d="M15 14a6 6 0 0 1 6 6l1 3-5-1a6 6 0 0 1-5-3"/></>}
    {name==='clock'&&<><circle cx="12" cy="14" r="8"/><path d="M12 14l3-4M10 2h4M17 4l2 2"/></>}
    {name==='grid'&&<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>}
    {name==='sun'&&<><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5m13 13L20 20M20 4l-1.5 1.5m-13 13L4 20"/></>}
    {name==='add'&&<><path d="M14 21H5V3h10l4 4v5M15 3v5h4m-3 8h6m-3-3v6M8 9h4M8 13h4"/></>}
    {name==='chevron'&&<path d="m9 5 7 7-7 7"/>}
    {name==='back'&&<path d="m15 5-7 7 7 7"/>}
    {name==='tools'&&<path d="m14 4 3-2a6 6 0 0 0-7 7l-7 7a2.8 2.8 0 0 0 4 4l7-7a6 6 0 0 0 7-7l-3 3-4-1Z"/>}
  </svg>;
}
