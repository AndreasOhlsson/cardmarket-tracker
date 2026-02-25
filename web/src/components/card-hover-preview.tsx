import { useState, useRef, type ReactNode } from "react";

function scryfallNormalUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/normal/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

interface CardHoverPreviewProps {
  scryfallId: string;
  children: ReactNode;
}

export default function CardHoverPreview({ scryfallId, children }: CardHoverPreviewProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<"right" | "left">("right");
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseEnter() {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      setPosition(spaceRight < 300 ? "left" : "right");
    }
    setVisible(true);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 top-1/2 -translate-y-1/2 pointer-events-none ${
            position === "right" ? "left-full ml-3" : "right-full mr-3"
          }`}
        >
          <img
            src={scryfallNormalUrl(scryfallId)}
            alt=""
            className="w-56 rounded-lg shadow-2xl shadow-black/50 ring-1 ring-border/50"
          />
        </div>
      )}
    </div>
  );
}
