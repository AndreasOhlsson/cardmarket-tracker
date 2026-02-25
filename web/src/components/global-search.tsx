import { useState, useDeferredValue, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchResult {
  uuid: string;
  name: string;
  set_code: string | null;
  scryfall_id: string | null;
  latest_price: number | null;
}

function scryfallSmallUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/small/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

export default function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const deferredQuery = useDeferredValue(query);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results } = useQuery({
    queryKey: ["card-search", deferredQuery],
    queryFn: () => apiFetch<SearchResult[]>(`/cards/search?q=${encodeURIComponent(deferredQuery)}`),
    enabled: deferredQuery.length >= 2,
  });

  const visibleResults = results?.slice(0, 8) ?? [];

  const selectCard = useCallback(
    (uuid: string) => {
      navigate(`/card/${uuid}`);
      setQuery("");
      setOpen(false);
      onNavigate?.();
    },
    [navigate, onNavigate],
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || visibleResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, visibleResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      selectCard(visibleResults[selectedIndex].uuid);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        placeholder="Search cards..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setSelectedIndex(-1);
        }}
        onFocus={() => query.length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full"
      />

      {open && visibleResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-scale-in origin-top">
          {visibleResults.map((card, i) => (
            <button
              key={card.uuid}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-100",
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50",
              )}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => selectCard(card.uuid)}
            >
              {card.scryfall_id && (
                <img
                  src={scryfallSmallUrl(card.scryfall_id)}
                  alt=""
                  className="w-8 h-auto rounded-sm shrink-0"
                  loading="lazy"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{card.name}</div>
                {card.set_code && (
                  <span className="text-xs text-muted-foreground">{card.set_code}</span>
                )}
              </div>
              {card.latest_price != null && (
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  €{card.latest_price.toFixed(2)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && deferredQuery.length >= 2 && visibleResults.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 p-4 text-center text-sm text-muted-foreground animate-fade-in">
          No cards found
        </div>
      )}
    </div>
  );
}
