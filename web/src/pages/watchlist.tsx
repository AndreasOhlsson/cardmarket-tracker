import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useDeferredValue, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/hooks/use-api";
import CardHoverPreview from "@/components/card-hover-preview";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WatchlistRow {
  uuid: string;
  name: string;
  set_code: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  notes: string | null;
  latest_price: number | null;
  foil_price: number | null;
  signal: "near_low" | "below_avg" | null;
  avg_30d: number | null;
  avg_90d: number | null;
  pct_change: number | null;
}

type SortKey = "name" | "latest_price" | "avg_30d" | "avg_90d" | "pct_change";
const VALID_SORTS: SortKey[] = ["name", "latest_price", "avg_30d", "avg_90d", "pct_change"];

function parseSortKey(value: string | null): SortKey {
  return VALID_SORTS.includes(value as SortKey) ? (value as SortKey) : "name";
}

function parseSortDir(value: string | null): "asc" | "desc" {
  return value === "desc" ? "desc" : "asc";
}

function scryfallImageUrl(scryfallId: string | null): string | null {
  if (!scryfallId) return null;
  return `https://cards.scryfall.io/small/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

function SortableHead({
  label,
  sortKey,
  activeSort,
  activeDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  activeDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = activeSort === sortKey;
  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-primary transition-colors", className)}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive && (
        <span className="ml-1 text-primary">{activeDir === "asc" ? "▲" : "▼"}</span>
      )}
    </TableHead>
  );
}

export default function WatchlistPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = 50;

  // Read state from URL
  const sort = parseSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"));
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const urlSearch = searchParams.get("q") ?? "";

  // Local search state for debounce — initialise from URL
  const [search, setSearch] = useState(urlSearch);
  const deferredSearch = useDeferredValue(search);

  // Sync deferred search back to URL
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (deferredSearch !== current) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (deferredSearch) {
          next.set("q", deferredSearch);
        } else {
          next.delete("q");
        }
        next.delete("page");
        return next;
      }, { replace: true });
    }
  }, [deferredSearch, searchParams, setSearchParams]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v == null || v === "" || (k === "sort" && v === "name") || (k === "dir" && v === "asc") || (k === "page" && v === "0")) {
            next.delete(k);
          } else {
            next.set(k, v);
          }
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  function handleSort(key: SortKey) {
    if (sort === key) {
      const newDir = sortDir === "asc" ? "desc" : "asc";
      updateParams({ dir: newDir, page: "0" });
    } else {
      const newDir = key === "name" ? "asc" : "desc";
      updateParams({ sort: key, dir: newDir, page: "0" });
    }
  }

  const { data: cards, isPending, isFetching } = useQuery({
    queryKey: ["watchlist", deferredSearch, page, sort, sortDir],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deferredSearch.length >= 2) params.set("search", deferredSearch);
      params.set("sort", sort);
      params.set("sortDir", sortDir);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      return apiFetch<WatchlistRow[]>(`/watchlist?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="font-display text-2xl md:text-3xl text-primary">Watchlist</h1>
        <Input
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      <div className="rounded-lg border border-border overflow-x-auto relative">
        {isFetching && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/30 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-primary animate-[slide_1s_ease-in-out_infinite]" />
          </div>
        )}
        <Table className="table-fixed min-w-[700px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-18"></TableHead>
              <SortableHead label="Name" sortKey="name" activeSort={sort} activeDir={sortDir} onSort={handleSort} className="w-[35%]" />
              <TableHead className="w-16">Set</TableHead>
              <SortableHead label="Price" sortKey="latest_price" activeSort={sort} activeDir={sortDir} onSort={handleSort} className="text-right w-30" />
              <SortableHead label="30d Avg" sortKey="avg_30d" activeSort={sort} activeDir={sortDir} onSort={handleSort} className="text-right w-24" />
              <SortableHead label="90d Avg" sortKey="avg_90d" activeSort={sort} activeDir={sortDir} onSort={handleSort} className="text-right w-24" />
              <SortableHead label="Change" sortKey="pct_change" activeSort={sort} activeDir={sortDir} onSort={handleSort} className="text-right w-22" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-10" />
                  </TableCell>
                </TableRow>
              ))}
            {cards?.map((card) => (
              <TableRow
                key={card.uuid}
                className="hover:bg-muted/20 h-20 cursor-pointer table-row-hover"
                onClick={() => navigate(`/card/${card.uuid}`)}
              >
                <TableCell className="py-2">
                  {card.scryfall_id ? (
                    <CardHoverPreview scryfallId={card.scryfall_id}>
                      <img
                        src={scryfallImageUrl(card.scryfall_id) ?? ""}
                        alt=""
                        className="w-14 h-auto rounded-sm"
                        loading="lazy"
                      />
                    </CardHoverPreview>
                  ) : null}
                </TableCell>
                <TableCell className="py-2 truncate font-medium">
                  {card.name}
                </TableCell>
                <TableCell className="py-2 text-muted-foreground">{card.set_code}</TableCell>
                <TableCell className="py-2 text-right font-mono">
                  <div>{card.latest_price != null ? `€${card.latest_price.toFixed(2)}` : "—"}</div>
                  {card.foil_price != null && (
                    <div className="text-xs text-muted-foreground">F €{card.foil_price.toFixed(2)}</div>
                  )}
                  {card.signal && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] mt-0.5 px-1.5 py-0 animate-badge-glow",
                        card.signal === "near_low" && "text-deal-new-low border-deal-new-low/30",
                        card.signal === "below_avg" && "text-deal-trend-drop border-deal-trend-drop/30",
                      )}
                    >
                      {card.signal === "near_low" ? "Near Low" : "Below Avg"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right font-mono text-muted-foreground">
                  {card.avg_30d != null ? `€${card.avg_30d.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="py-2 text-right font-mono text-muted-foreground">
                  {card.avg_90d != null ? `€${card.avg_90d.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="py-2 text-right font-mono">
                  {card.pct_change != null ? (
                    <span
                      className={cn(
                        card.pct_change < 0 ? "text-deal-trend-drop" : "text-positive",
                      )}
                    >
                      {card.pct_change > 0 ? "+" : ""}
                      {(card.pct_change * 100).toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
            {cards?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No cards found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {cards && cards.length > 0 && (
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => updateParams({ page: String(Math.max(0, page - 1)) })}
            disabled={page === 0}
            className="text-sm text-primary disabled:text-muted-foreground"
          >
            ← Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <button
            onClick={() => updateParams({ page: String(page + 1) })}
            disabled={cards.length < pageSize}
            className="text-sm text-primary disabled:text-muted-foreground"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
