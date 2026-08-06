'use client';

import { useEffect, useRef, useState } from 'react';

export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = 160 * ratio;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#123d36';
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 160, touchAction: 'none' }}
        onPointerDown={(event) => {
          drawing.current = true;
          const context = canvasRef.current?.getContext('2d');
          if (!context) return;
          const { x, y } = point(event);
          context.beginPath();
          context.moveTo(x, y);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const context = canvasRef.current?.getContext('2d');
          if (!context) return;
          const { x, y } = point(event);
          context.lineTo(x, y);
          context.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          const data = empty ? null : canvasRef.current?.toDataURL('image/png') ?? null;
          onChange(data);
        }}
      />
      <div className="heading-actions">
        <button
          type="button"
          className="button soft"
          onClick={() => {
            const canvas = canvasRef.current;
            const context = canvas?.getContext('2d');
            if (!canvas || !context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
