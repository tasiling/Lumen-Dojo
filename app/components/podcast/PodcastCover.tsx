'use client';
import {memo} from 'react';
import {coverSvg} from '@/lib/dojo/podcast/cover';
import type {PodcastDraft} from '@/lib/dojo/podcast/model';
export default memo(function PodcastCover({draft,image}:{draft:PodcastDraft;image?:string}){return <div className="podcast-cover" dangerouslySetInnerHTML={{__html:coverSvg(draft,image)}}/>;});
