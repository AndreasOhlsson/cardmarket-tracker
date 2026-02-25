import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useState, useOptimistic, useTransition } from "react";
import { apiFetch } from "@/hooks/use-api";
import PriceChart from "@/components/price-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CardData {
  uuid: string;
  name: string;
  set_code: string | null;
  set_name: string | null;
  scryfall_id: string | null;
  mcm_id: number | null;
  avg30d: number | null;
  avg90d: number | null;
  historicalLow: number | null;
  latestPrice: number | null;
  foilPrice: number | null;
  signal: "near_low" | "below_avg" | null;
  isWatched: boolean;
  printings: { uuid: string; set_code: string | null; set_name: string | null; scryfall_id: string | null }[];
}

interface PriceRow {
  date: string;
  cm_trend: number | null;
}

interface DealRow {
  id: number;
  date: string;
  deal_type: string;
  current_price: number;
  reference_price: number;
  pct_change: number;
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  trend_drop: "Trend Drop",
  new_low: "New Low",
  watchlist_alert: "Watchlist",
};

function dealTypeLabel(dealType: string): string {
  return DEAL_TYPE_LABELS[dealType] ?? dealType;
}

function cardmarketUrl(name: string, mcmId: number | null): string {
  if (mcmId) return `https://www.cardmarket.com/en/Magic/Products?idProduct=${mcmId}`;
  return `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
}

const SIGNAL_CONFIG = {
  near_low: { label: "Near Historical Low", className: "text-deal-new-low bg-deal-new-low/10 border-deal-new-low/30" },
  below_avg: { label: "Below 30d Avg", className: "text-deal-trend-drop bg-deal-trend-drop/10 border-deal-trend-drop/30" },
} as const;

export default function CardDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [days, setDays] = useState("90");
  const [isChartPending, startChartTransition] = useTransition();
  const queryClient = useQueryClient();

  const { data: card, isPending: cardPending } = useQuery({
    queryKey: ["card", uuid],
    queryFn: () => apiFetch<CardData>(`/cards/${uuid}`),
    enabled: !!uuid,
  });

  const { data: prices } = useQuery({
    queryKey: ["prices", uuid, days],
    queryFn: () => apiFetch<PriceRow[]>(`/cards/${uuid}/prices?days=${days}`),
    enabled: !!uuid,
  });

  const { data: deals } = useQuery({
    queryKey: ["card-deals", uuid],
    queryFn: () => apiFetch<DealRow[]>(`/cards/${uuid}/deals`),
    enabled: !!uuid,
  });

  const [optimisticWatched, setOptimisticWatched] = useOptimistic(card?.isWatched ?? false);

  const watchlistMutation = useMutation({
    mutationFn: () => {
      setOptimisticWatched(!optimisticWatched);
      if (card?.isWatched) {
        return apiFetch(`/watchlist/${uuid}`, { method: "DELETE" });
      }
      return apiFetch(`/watchlist/${uuid}`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card", uuid] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  if (cardPending) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!card) {
    return <div className="p-6 text-muted-foreground">Card not found.</div>;
  }

  const imageUrl = card.scryfall_id
    ? `https://cards.scryfall.io/normal/front/${card.scryfall_id[0]}/${card.scryfall_id[1]}/${card.scryfall_id}.jpg`
    : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <title>{card.name} — Cardmarket Tracker</title>
      <div className="flex flex-col sm:flex-row gap-6 md:gap-8 mb-8">
        {imageUrl && (
          <div className="shrink-0 flex justify-center sm:block animate-fade-in-up">
            <img
              src={imageUrl}
              alt={card.name}
              className="w-44 sm:w-56 rounded-lg shadow-lg hover:shadow-xl hover:shadow-primary/10 transition-shadow duration-300"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl text-primary">{card.name}</h1>
            <Button
              variant={optimisticWatched ? "default" : "outline"}
              size="sm"
              onClick={() => watchlistMutation.mutate()}
              disabled={watchlistMutation.isPending}
            >
              {optimisticWatched ? "Watching" : "Watch"}
            </Button>
          </div>
          <p className="text-muted-foreground mb-4">
            {card.set_name ? `${card.set_name} (${card.set_code})` : card.set_code}
            <a
              href={cardmarketUrl(card.name, card.mcm_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm ml-3"
            >
              View on Cardmarket →
            </a>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
            <Card className="border-primary/30 animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Current Price</p>
                <p className="font-mono text-2xl font-semibold">
                  {card.latestPrice != null ? `€${card.latestPrice.toFixed(2)}` : "—"}
                </p>
                {card.foilPrice != null && (
                  <p className="font-mono text-sm text-muted-foreground mt-1">
                    Foil €{card.foilPrice.toFixed(2)}
                  </p>
                )}
                {card.signal && (
                  <Badge
                    variant="outline"
                    className={cn("mt-2 text-xs animate-badge-glow", SIGNAL_CONFIG[card.signal].className)}
                  >
                    {SIGNAL_CONFIG[card.signal].label}
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0.12s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">30d Average</p>
                <p className="font-mono text-lg">
                  {card.avg30d != null ? `€${card.avg30d.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0.16s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">90d Average</p>
                <p className="font-mono text-lg">
                  {card.avg90d != null ? `€${card.avg90d.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Historical Low</p>
                <p className="font-mono text-lg">
                  {card.historicalLow != null ? `€${card.historicalLow.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {card.printings.length > 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Other printings:</p>
              <div className="flex flex-wrap gap-1">
                {card.printings
                  .filter((p) => p.uuid !== card.uuid)
                  .map((p) => (
                    <Link key={p.uuid} to={`/card/${p.uuid}`}>
                      <Badge variant="outline" className="text-xs hover:bg-muted">
                        {p.set_code}
                      </Badge>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Card className="mb-8 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-lg">Price History</CardTitle>
          <Tabs value={days} onValueChange={(v) => startChartTransition(() => setDays(v))}>
            <TabsList>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
              <TabsTrigger value="365">1y</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className={cn("transition-opacity duration-150", isChartPending && "opacity-50")}>
            {prices ? <PriceChart data={prices} /> : <Skeleton className="h-64" />}
          </div>
        </CardContent>
      </Card>

      {deals && deals.length > 0 && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <CardHeader>
            <CardTitle className="font-display text-lg">Deal History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        deal.deal_type === "trend_drop" && "text-deal-trend-drop",
                        deal.deal_type === "new_low" && "text-deal-new-low",
                        deal.deal_type === "watchlist_alert" && "text-deal-watchlist",
                      )}
                    >
                      {dealTypeLabel(deal.deal_type)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{deal.date}</span>
                  </div>
                  <div className="font-mono text-sm">
                    €{deal.current_price.toFixed(2)}{" "}
                    <span className="text-muted-foreground">← €{deal.reference_price.toFixed(2)}</span>{" "}
                    <span
                      className={cn(
                        deal.pct_change < 0 ? "text-deal-trend-drop" : "text-positive",
                      )}
                    >
                      ({(deal.pct_change * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
