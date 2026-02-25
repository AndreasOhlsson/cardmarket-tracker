import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  avg_30d: number | null;
  pct_change: number | null;
}

function scryfallImageUrl(scryfallId: string | null): string | null {
  if (!scryfallId) return null;
  return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=small`;
}

export default function WatchlistPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: cards, isPending } = useQuery({
    queryKey: ["watchlist", search, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.length >= 2) params.set("search", search);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      return apiFetch<WatchlistRow[]>(`/watchlist?${params.toString()}`);
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-primary">Watchlist</h1>
        <Input
          placeholder="Search cards..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-64"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Set</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">30d Avg</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            {cards?.map((card) => (
              <TableRow key={card.uuid} className="hover:bg-muted/20">
                <TableCell>
                  {card.scryfall_id && (
                    <img
                      src={scryfallImageUrl(card.scryfall_id) ?? ""}
                      alt=""
                      className="w-8 h-auto rounded-sm"
                      loading="lazy"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/card/${card.uuid}`}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {card.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{card.set_code}</TableCell>
                <TableCell className="text-right font-mono">
                  {card.latest_price != null ? `€${card.latest_price.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {card.avg_30d != null ? `€${card.avg_30d.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
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
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-sm text-primary disabled:text-muted-foreground"
          >
            ← Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
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
