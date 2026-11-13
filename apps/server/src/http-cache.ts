/** Only identical public files may be cached. API, HTML and failures stay private. */
export function responseCacheControl(method:string,url:string,status:number,contentType:unknown):string{
 if(!['GET','HEAD'].includes(method)||![200,206,304].includes(status))return 'no-store';
 const path=url.split('?')[0]!,type=String(contentType??'').split(';')[0]!.toLowerCase();
 const notModified=status===304&&!type;
 if(/^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css)$/.test(path)&&(notModified||/^(?:text\/css|(?:application|text)\/javascript)$/.test(type)))return 'public, max-age=31536000, immutable';
 if(/^\/(?:art\/|audio\/|assets\/(?:ravens|avatars)\/|audio-candidates\/)/.test(path)&&/\.(?:webp|png|jpe?g|gif|svg|avif|mp3|ogg|wav|m4a|flac|woff2?)$/.test(path)&&(notModified||/^(?:image\/|audio\/|font\/)/.test(type)))return 'public, max-age=0, must-revalidate';
 return 'no-store';
}
