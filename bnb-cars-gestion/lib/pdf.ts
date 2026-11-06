import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';

const A4: [number, number] = [595.28, 841.89];
const M = 48;

/** Remplace ce que la police standard ne sait pas écrire. */
const clean = (t: unknown) => String(t ?? '').replace(/[−–—]/g, '-').replace(/ | /g, ' ').replace(/[^\x00-\xff€œŒ’‘“”…]/g, '');

export class Doc {
  pdf!: PDFDocument; page!: PDFPage; font!: PDFFont; bold!: PDFFont; y = 0;
  static async create() {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.font = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.newPage();
    return d;
  }
  newPage() { this.page = this.pdf.addPage(A4); this.y = A4[1] - M; }
  ensure(h: number) { if (this.y - h < M) this.newPage(); }
  text(t: unknown, o: { size?: number; bold?: boolean; color?: number; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const f = o.bold ? this.bold : this.font;
    const width = A4[0] - M * 2 - (o.indent ?? 0);
    for (const para of clean(t).split('\n')) {
      let line = '';
      const flush = (l: string) => {
        this.ensure(size + 4);
        this.page.drawText(l, { x: M + (o.indent ?? 0), y: this.y - size, size, font: f, color: rgb(o.color ?? 0, o.color ?? 0, o.color ?? 0) });
        this.y -= size * 1.4;
      };
      if (!para) { this.y -= size * 0.8; continue; }
      for (const w of para.split(' ')) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > width && line) { flush(line); line = w; } else line = test;
      }
      if (line) flush(line);
    }
    this.y -= o.gap ?? 2;
  }
  row(left: unknown, right: unknown, o: { bold?: boolean; size?: number } = {}) {
    const size = o.size ?? 10;
    const f = o.bold ? this.bold : this.font;
    this.ensure(size + 6);
    this.page.drawText(clean(left).slice(0, 90), { x: M, y: this.y - size, size, font: f });
    const r = clean(right);
    this.page.drawText(r, { x: A4[0] - M - f.widthOfTextAtSize(r, size), y: this.y - size, size, font: f });
    this.y -= size * 1.6;
  }
  rule() { this.ensure(8); this.page.drawLine({ start: { x: M, y: this.y - 2 }, end: { x: A4[0] - M, y: this.y - 2 }, thickness: 0.6, color: rgb(.75, .75, .75) }); this.y -= 10; }
  async image(bytes: ArrayBuffer, contentType: string | null, w: number, h: number): Promise<PDFImage | null> {
    try { return contentType?.includes('png') ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes); } catch { return null; }
  }
  drawImage(img: PDFImage, w: number, x = M) {
    const h = (img.height / img.width) * w;
    this.ensure(h + 6);
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    return h;
  }
  async done() { return Buffer.from(await this.pdf.save()); }
}
