import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Inline-SVG QR code (no images, no network). Black modules on a white card so phone cameras read it from a projector. */
export function Qr({ text, size }: { text: string; size: number }) {
  const svg = useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch {
      return '';
    }
  }, [text]);
  if (!svg) return null;
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code" />;
}
