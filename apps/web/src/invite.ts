import QRCode from "qrcode";

export function invitationUrl(code: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set("room", code);
  return url.toString();
}

export function invitationQr(code: string, width = 280): Promise<string> {
  return QRCode.toDataURL(invitationUrl(code), {
    width,
    margin: 1,
    color: { dark: "#111722", light: "#f2ead7" },
    errorCorrectionLevel: "M",
  });
}

/** Opens a confirmation form; a display seat is never allocated by following a link. */
export function displayInvitationUrl(code:string):string{const url=new URL(invitationUrl(code));url.searchParams.set('display','1');return url.toString();}

/** Fixed same-origin route: retain the invitation, never arbitrary redirect/query parameters. */
export function invitationReturnPath(search=window.location.search):string{
  const incoming=new URLSearchParams(search),code=(incoming.get('room')??'').trim().toUpperCase();
  if(!/^[A-Z2-9]{6}$/.test(code))return '/';
  const params=new URLSearchParams({room:code});if(incoming.get('display')==='1')params.set('display','1');
  return `/?${params}`;
}
