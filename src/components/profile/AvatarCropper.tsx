import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

import { Progress } from '@/components/ui/progress';

type Props = {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  busy?: boolean;
  progress?: number;
};

const FRAME = 280; // preview frame size (px)
const OUTPUT = 512; // exported avatar resolution

export const AvatarCropper = ({ open, file, onCancel, onConfirm, busy, progress }: Props) => {
  const [imgUrl, setImgUrl] = useState<string>('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) { setImgUrl(''); setImg(null); return; }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset transform when a new image loads
  useEffect(() => {
    if (!img) return;
    // Choose base zoom so the image's shortest side covers the frame
    const base = FRAME / Math.min(img.naturalWidth, img.naturalHeight);
    setZoom(base);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [img]);

  const clampOffset = (next: { x: number; y: number }, z: number) => {
    if (!img) return next;
    const w = img.naturalWidth * z;
    const h = img.naturalHeight * z;
    const maxX = Math.max(0, (w - FRAME) / 2);
    const maxY = Math.max(0, (h - FRAME) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const next = { x: e.clientX - draggingRef.current.x, y: e.clientY - draggingRef.current.y };
    setOffset(clampOffset(next, zoom));
  };
  const onPointerUp = () => { draggingRef.current = null; };

  const onZoom = (v: number[]) => {
    const z = v[0];
    setZoom(z);
    setOffset((o) => clampOffset(o, z));
  };

  const minZoom = img ? FRAME / Math.min(img.naturalWidth, img.naturalHeight) : 0.1;
  const maxZoom = minZoom * 6;

  const handleConfirm = async () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    const scale = OUTPUT / FRAME;
    ctx.translate(OUTPUT / 2, OUTPUT / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom * scale, zoom * scale);
    ctx.translate(offset.x / zoom, offset.y / zoom);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), 'image/webp', 0.9)
    );
    if (blob) await onConfirm(blob);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
          <DialogDescription>Drag to reposition, zoom, or rotate so your face fits the circle.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative overflow-hidden bg-muted rounded-full select-none touch-none cursor-grab active:cursor-grabbing ring-2 ring-primary/30"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgUrl && (
              <img
                src={imgUrl}
                alt="Crop preview"
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
                style={{
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              />
            )}
          </div>

          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
              <Slider
                value={[zoom]}
                min={minZoom}
                max={maxZoom}
                step={(maxZoom - minZoom) / 100 || 0.01}
                onValueChange={onZoom}
                className="flex-1"
              />
              <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="gap-1.5"
              >
                <RotateCw className="h-3.5 w-3.5" /> Rotate 90°
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:gap-2">
          {busy && (
            <div className="w-full space-y-1">
              <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                <span>Uploading…</span>
                <span>{progress ?? 0}%</span>
              </div>
              <Progress value={progress ?? 0} className="h-2" />
            </div>
          )}
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={busy || !img}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save photo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AvatarCropper;