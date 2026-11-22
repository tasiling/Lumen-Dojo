/**
 * Public Threads display-page parsing; no network or storage access.
 * Ported from the 野採 trial site (simulations/yecai-inbox-v7.zip, dist/threads-page-parser.js), which reads the
 * official embed page of one post, so a reply is read as its own post instead of being searched for in a whole page.
 */
export type ThreadAddress = { url: string; author: string; code: string };

export function threadAddress(value: unknown): ThreadAddress | null {
  let url: URL;
  try { url = new URL(String(value)); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port ||
      !/^(?:www\.)?threads\.(?:com|net)$/i.test(url.hostname)) return null;
  const path = url.pathname.replace(/\/$/, "");
  const match = /^\/@([\w.]{1,35})\/post\/([\w-]{3,40})$/.exec(path);
  if (match) return { url: "https://www.threads.com" + path, author: match[1], code: match[2] };
  const other = /^\/(t|share)\/([\w-]{3,80})$/.exec(path);
  if (!other) return null;
  return { url:"https://www.threads.com" + path, code:other[1] === "t" ? other[2] : "", author:"" };
}

function threadDecode(raw: string): string {
  const named: Record<string, string> = {amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:"\u00a0",hellip:"…",ndash:"–",mdash:"—",rsquo:"’",lsquo:"‘",ldquo:"“",rdquo:"”",copy:"©"};
  return raw.replace(/&(#(?:x[a-f0-9]+|\d+)|[a-z]+);/gi,(whole: string,key: string)=>{
    if (key[0] !== "#") return named[key] ?? whole;
    const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2),16) : Number(key.slice(1));
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

export function threadAttr(tag: string,key: string): string {
  const m=new RegExp("(?:\\s|^)"+key+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')","i").exec(tag);
  return m ? threadDecode(m[1] ?? m[2]) : "";
}

export function sourceMeta(html: string,key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi)||[]) {
    if (threadAttr(tag,"property") === key) return threadAttr(tag,"content");
  }
  return "";
}

export function hasThreadClass(tag: string,name: string): boolean {return threadAttr(tag,"class").split(/\s+/).includes(name);}

export function samePost(a: ThreadAddress | null | undefined,b: ThreadAddress | null | undefined): boolean {
  return Boolean(a && b && a.code && a.code===b.code && (!a.author||!b.author||a.author.toLowerCase()===b.author.toLowerCase()));
}
export function publicAddress(raw: string | null | undefined): ThreadAddress | null {
  if(!raw)return null;
  try{return threadAddress(new URL(raw,"https://www.threads.com/").href);}catch{return null;}
}
export function threadCanonical(html: string): ThreadAddress | null {
  const og=publicAddress(sourceMeta(html,"og:url"));
  if(og?.author)return og;
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
    if(threadAttr(tag,"rel").toLowerCase().split(/\s+/).includes("canonical")){
      const point=publicAddress(threadAttr(tag,"href"));if(point?.author)return point;
    }
  }
  return null;
}
/** The single post an official embed page shows. `text` is empty when the page is clipped or shows more than one body. */
export function extractThreadBody(embed: string,point: ThreadAddress): { address: ThreadAddress | null; text: string } {
  const visible=embed.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,"");
  let address=threadCanonical(visible),author="";
  let depth=0,target=0,body=0,targets=0,bodies=0,text="",targetAuthor="",clipped=false;
  for (const token of visible.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)||[]) {
    if(/^<a(?:\s|>)/i.test(token)){
      const link=threadAttr(token,"href"),entry=publicAddress(link);
      if(entry&&samePost(point,entry)&&entry.author)address=entry;
      if(hasThreadClass(token,"HeaderLink")){
        try{
          const href=new URL(link,"https://www.threads.com/");
          author=/^(www\.)?threads\.(com|net)$/i.test(href.hostname)?(/^\/@([\w.]+)\/?$/.exec(href.pathname)?.[1]||""):"";
        }catch{author="";}
      }
    }
    if(target && /^<(?:span|a|button|div)\b/i.test(token) && /(?:TextTruncat|CaptionTruncat|ReadMore|ShowMore)/i.test(threadAttr(token,"class")))clipped=true;
    if (/^<span(?:\s|>)/i.test(token)) {
      depth++;
      if (hasThreadClass(token,"TextContentContainerFull")) { target=depth;targets++;targetAuthor=author; }
      if (target && hasThreadClass(token,"BodyTextContainer")) { body=depth;bodies++; }
    } else if (/^<\/span\s*>/i.test(token)) {
      if(body===depth)body=0;if(target===depth)target=0;depth--;
    } else if(body) {
      if(!token.startsWith("<"))text+=threadDecode(token);
      else if(/^<br\b/i.test(token))text+="\n";
      else if(/^<img\b/i.test(token))text+=threadAttr(token,"alt");
    }
  }
  if(!address && targetAuthor && point.author?.toLowerCase()===targetAuthor.toLowerCase())address=point;
  return {address:samePost(point,address)?address:null,text:targets===1 && bodies===1 && !clipped?text.trim():""};
}
export function fullCaption(html: string,address: ThreadAddress): string {
  // Read only the public article schema or the exact post's structured caption.
  // Other authors' replies and the page's SEO description are never full captures.
  const sources=html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
  for(const [,attributes,raw] of sources){
    const type=threadAttr(" "+attributes,"type").toLowerCase();
    if(!["application/ld+json","application/json"].includes(type)||raw.length>1800000)continue;
    if(type!=="application/ld+json"&&!raw.includes("caption"))continue;
    let tree: unknown;try{tree=JSON.parse(raw);}catch{continue;}
    const queue: unknown[]=[tree];let steps=0;
    while(queue.length && ++steps<80000){
      const n=queue.pop() as any;if(!n)continue; // eslint-disable-line @typescript-eslint/no-explicit-any
      if(typeof n==="string"){
        if(n.length<1800000&&n.includes("caption")&&/^[{[]/.test(n)){try{queue.push(JSON.parse(n));}catch{}}
        continue;
      }
      if(typeof n!=="object")continue;
      if(n.code===address.code && n.user?.username?.toLowerCase()===address.author.toLowerCase() &&
          typeof n.caption?.text==="string" && n.caption.text.trim() && !n.caption.is_truncated && !n.is_caption_truncated)return n.caption.text;
      if(type==="application/ld+json"){
        const types=Array.isArray(n["@type"])?n["@type"]:[n["@type"]];
        const target=publicAddress(typeof n.url==="string"?n.url:(n.mainEntityOfPage?.["@id"]||n["@id"]));
        if(types.some((t: unknown)=>["SocialMediaPosting","DiscussionForumPosting","Article","BlogPosting"].includes(t as string)) &&
           samePost(target,address)&&target?.author.toLowerCase()===address.author.toLowerCase()){
          const body=n.articleBody||n.text;if(typeof body==="string"&&body.trim())return body;
        }
      }
      for(const child of Object.values(n))if(child&&typeof child==="object"||typeof child==="string"&&child.includes("caption"))queue.push(child);
    }
  }
  return "";
}

