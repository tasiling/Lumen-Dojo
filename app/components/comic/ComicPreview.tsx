'use client';
import {forwardRef,memo,useMemo} from 'react';
import {comicSvg} from '@/lib/dojo/comic/svg';
import type {ComicDraft} from '@/lib/dojo/comic/model';
export const ComicPreview=memo(forwardRef<HTMLDivElement,{draft:ComicDraft;sheet:number;images:Record<string,string>}>(function ComicPreview({draft,sheet,images},ref){const html=useMemo(()=>({__html:comicSvg(draft,sheet,images)}),[draft,sheet,images]);return <div ref={ref} className="comic-preview" role="img" aria-label={`短漫第${sheet+1}頁預覽`} dangerouslySetInnerHTML={html}/>;}));
