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

interface DealRow {
  id: number;
  uuid: string;
  date: string;
  deal_type: string;
  current_price: number;
  reference_price: number;
  pct_change: number;
  name: string;
  set_code: string | null;
  mcm_id: number | null;
  scryfall_id: string | null;
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
      className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded transition-colors"
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

export default function StatsPage() {
  const { data: stats, isPending: statsPending } = useQuery({
    queryKey: ["pipeline-stats"],
    queryFn: () => apiFetch<PipelineStats>("/stats/pipeline"),
  });

  const { data: topDrops } = useQuery({
    queryKey: ["top-drops"],
    queryFn: () => apiFetch<DealRow[]>("/deals?sort=pct_change&sortDir=asc&limit=10"),
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
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl text-primary mb-6">Stats</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statsPending ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cards Tracked</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalCards.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Price Records</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalPrices.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Watchlist Size</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.watchlistSize.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
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
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Watchlist Losers</CardTitle>
          </CardHeader>
          <CardContent>
            {losers ? (
              <div className="space-y-1">
                {losers.filter(c => c.pct_change != null && c.pct_change < 0).map((card, i) => (
                  <MoverRow key={card.uuid} card={card} rank={i + 1} />
                ))}
                {losers.filter(c => c.pct_change != null && c.pct_change < 0).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No losers right now</p>
                )}
              </div>
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Watchlist Gainers</CardTitle>
          </CardHeader>
          <CardContent>
            {gainers ? (
              <div className="space-y-1">
                {gainers.filter(c => c.pct_change != null && c.pct_change > 0).map((card, i) => (
                  <MoverRow key={card.uuid} card={card} rank={i + 1} />
                ))}
                {gainers.filter(c => c.pct_change != null && c.pct_change > 0).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No gainers right now</p>
                )}
              </div>
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>
      </div>

      {topDrops && topDrops.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Biggest Drops</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDrops.map((deal, i) => (
                <Link
                  key={deal.id}
                  to={`/card/${deal.uuid}`}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    {deal.scryfall_id && (
                      <CardHoverPreview scryfallId={deal.scryfall_id}>
                        <img
                          src={scryfallSmallUrl(deal.scryfall_id)}
                          alt=""
                          className="w-10 h-auto rounded-sm"
                          loading="lazy"
                        />
                      </CardHoverPreview>
                    )}
                    <span className="text-sm font-medium">
                      {deal.name}
                    </span>
                    {deal.set_code && (
                      <span className="text-xs text-muted-foreground">{deal.set_code}</span>
                    )}
                  </div>
                  <div className="font-mono text-sm">
                    <span className="text-deal-trend-drop">
                      {(deal.pct_change * 100).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground ml-2">
                      €{deal.current_price.toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
