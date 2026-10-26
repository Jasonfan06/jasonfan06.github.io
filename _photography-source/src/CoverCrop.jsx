import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

export const DEFAULT_CROP = { x: 0.5, y: 0.5, zoom: 1 };
const clamp = (value) => Math.max(0, Math.min(1, value));

export default function CoverCrop({ photo, crop, onChange, disabled }) {
  const image = useRef(null);
  const drag = useRef(null);
  const [moving, setMoving] = useState(false);
  const position = `${crop.x * 100}% ${crop.y * 100}%`;
  function start(event) {
    if (disabled || event.button !== 0 || !image.current?.naturalWidth) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const width = image.current.naturalWidth;
    const height = image.current.naturalHeight;
    const scale = Math.max(box.width / width, box.height / height) * crop.zoom;
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, crop, overflowX: width * scale - box.width, overflowY: height * scale - box.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoving(true);
  }
  function move(event) {
    const initial = drag.current;
    if (!initial || initial.pointer !== event.pointerId) return;
    onChange({ ...initial.crop,
      x: initial.overflowX > 0.5 ? clamp(initial.crop.x - (event.clientX - initial.x) / initial.overflowX) : initial.crop.x,
      y: initial.overflowY > 0.5 ? clamp(initial.crop.y - (event.clientY - initial.y) / initial.overflowY) : initial.crop.y,
    });
  }
  function end() { drag.current = null; setMoving(false); }
  return <div className="studio-cover-editor">
    <div className={`studio-cover-preview studio-crop-frame${moving ? ' is-moving' : ''}${disabled ? ' is-disabled' : ''}`}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <img ref={image} src={photo.url} alt="Selected cover crop" draggable={false} decoding="async"
        onError={(event) => { if (photo.remoteUrl && event.currentTarget.src !== photo.remoteUrl) event.currentTarget.src = photo.remoteUrl; }}
        style={{ objectPosition: position, transformOrigin: position, transform: `scale(${crop.zoom})` }} />
      <span className="studio-crop-grid" aria-hidden="true" />
    </div>
    <p className="studio-crop-hint">Drag the image to frame your cover.</p>
    <div className="studio-crop-controls">
      <label><span>Zoom <output>{crop.zoom.toFixed(2)}×</output></span><input aria-label="Cover zoom" type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(event) => onChange({ ...crop, zoom: Number(event.target.value) })} disabled={disabled} /></label>
      <label><span>Horizontal position</span><input type="range" min="0" max="100" step="1" value={crop.x * 100} onChange={(event) => onChange({ ...crop, x: Number(event.target.value) / 100 })} disabled={disabled} /></label>
      <label><span>Vertical position</span><input type="range" min="0" max="100" step="1" value={crop.y * 100} onChange={(event) => onChange({ ...crop, y: Number(event.target.value) / 100 })} disabled={disabled} /></label>
      <button className="studio-crop-reset" type="button" onClick={() => onChange({ ...DEFAULT_CROP })} disabled={disabled}><RotateCcw size={12} /> Reset crop</button>
    </div>
  </div>;
}
