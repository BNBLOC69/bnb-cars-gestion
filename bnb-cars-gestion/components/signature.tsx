'use client';
import { useEffect, useRef, useState } from 'react';

/** Signature au doigt. Stocke une image PNG dans un champ caché. */
export function SignaturePad({ name, label }: { name: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    c.width = r.width * ratio; c.height = r.height * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
    let drawing = false;
    const pos = (e: PointerEvent) => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] as const; };
    const down = (e: PointerEvent) => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
    const up = () => { if (drawing) { drawing = false; setValue(c.toDataURL('image/png')); } };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); };
  }, []);
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setValue(''); };
  return (
    <div className="stack-s" style={{ gap: 6 }}>
      <div className="row between"><span className="small">{label}</span><button type="button" className="ghost" onClick={clear}>Effacer</button></div>
      <canvas ref={canvas} className="sig" aria-label={label} />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
