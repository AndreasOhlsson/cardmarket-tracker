import { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

function scryfallNormalUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/normal/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

interface CardHoverPreviewProps {
  scryfallId: string;
  children: ReactNode;
}

export default function CardHoverPreview({ scryfallId, children }: CardHoverPreviewProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const previewWidth = 224; // w-56
    const previewHeight = 312; // approximate card aspect ratio
    const gap = 12;

    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight > previewWidth + gap
      ? rect.right + gap
      : rect.left - previewWidth - gap;

    const top = Math.max(8, Math.min(
      rect.top + rect.height / 2 - previewHeight / 2,
      window.innerHeight - previewHeight - 8,
    ));

    setCoords({ top, left });
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setCoords(null)}
    >
      {children}
      {coords && createPortal(
        <div
          className="fixed z-50 pointer-events-none"
          style={{ top: coords.top, left: coords.left }}
        >
          <img
            src={scryfallNormalUrl(scryfallId)}
            alt=""
            className="w-56 rounded-lg shadow-2xl shadow-black/50 ring-1 ring-border/50"
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
