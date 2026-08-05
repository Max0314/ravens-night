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
