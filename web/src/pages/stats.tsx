import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import CardHoverPreview from "@/components/card-hover-preview";
import { cn } from "@/lib/utils";

function scryfallSmallUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/small/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

interface PipelineStats {
  totalCards: number;
  totalPrices: number;
  totalDeals: number;
  watchlistSize: number;
  latestPriceDate: string | null;
}

interface WatchlistRow {
  uuid: string;
  name: string;
  set_code: string | null;
  scryfall_id: string | null;
  latest_price: number | null;
  pct_change: number | null;
}

function MoverRow({ card, rank }: { card: WatchlistRow; rank: number }) {
  return (
    <Link
      to={`/card/${card.uuid}`}
      className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded transition-colors animate-fade-in-up"
      style={{ animationDelay: `${rank * 0.04}s` }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-5">{rank}.</span>
        {card.scryfall_id && (
          <CardHoverPreview scryfallId={card.scryfall_id}>
            <img
              src={scryfallSmallUrl(card.scryfall_id)}
              alt=""
              className="w-10 h-auto rounded-sm"
              loading="lazy"
            />
          </CardHoverPreview>
        )}
        <span className="text-sm font-medium">{card.name}</span>
        {card.set_code && (
          <span className="text-xs text-muted-foreground">{card.set_code}</span>
        )}
      </div>
      <div className="font-mono text-sm flex items-center gap-3">
        {card.latest_price != null && (
          <span className="text-muted-foreground">€{card.latest_price.toFixed(2)}</span>
        )}
        {card.pct_change != null && (
          <span className={cn(
            "min-w-16 text-right",
            card.pct_change < 0 ? "text-deal-trend-drop" : "text-positive",
          )}>
            {card.pct_change > 0 ? "+" : ""}
            {(card.pct_change * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </Link>
  );
}

const STAT_SKELETONS = Array.from({ length: 4 }, (_, i) => (
  <Skeleton key={i} className="h-24" />
));

export default function StatsPage() {
  const { data: stats, isPending: statsPending } = useQuery({
    queryKey: ["pipeline-stats"],
    queryFn: () => apiFetch<PipelineStats>("/stats/pipeline"),
  });

  const { data: losers } = useQuery({
    queryKey: ["watchlist-losers"],
    queryFn: () => apiFetch<WatchlistRow[]>("/watchlist?sort=pct_change&sortDir=asc&limit=10"),
  });

  const { data: gainers } = useQuery({
    queryKey: ["watchlist-gainers"],
    queryFn: () => apiFetch<WatchlistRow[]>("/watchlist?sort=pct_change&sortDir=desc&limit=10"),
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-2xl md:text-3xl text-primary mb-6">Stats</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statsPending ? (
          STAT_SKELETONS
        ) : (
          <>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cards Tracked</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalCards.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Price Records</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalPrices.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Watchlist Size</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.watchlistSize.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Latest Data</p>
                <p className="font-mono text-lg text-foreground">
                  {stats?.latestPriceDate ?? "—"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <CardHeader>
            <CardTitle className="font-display text-lg">Watchlist Losers</CardTitle>
          </CardHeader>
          <CardContent>
            {losers ? (
              <div className="space-y-1">
                {(() => {
                  const filtered = losers.filter(c => c.pct_change != null && c.pct_change < 0);
                  return filtered.length > 0
                    ? filtered.map((card, i) => <MoverRow key={card.uuid} card={card} rank={i + 1} />)
                    : <p className="text-sm text-muted-foreground py-4 text-center">No losers right now</p>;
                })()}
              </div>
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
          <CardHeader>
            <CardTitle className="font-display text-lg">Watchlist Gainers</CardTitle>
          </CardHeader>
          <CardContent>
            {gainers ? (
              <div className="space-y-1">
                {(() => {
                  const filtered = gainers.filter(c => c.pct_change != null && c.pct_change > 0);
                  return filtered.length > 0
                    ? filtered.map((card, i) => <MoverRow key={card.uuid} card={card} rank={i + 1} />)
                    : <p className="text-sm text-muted-foreground py-4 text-center">No gainers right now</p>;
                })()}
              </div>
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
