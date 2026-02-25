import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { apiFetch } from "@/hooks/use-api";
import PriceChart from "@/components/price-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  historicalLow: number | null;
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

function cardmarketUrl(name: string, mcmId: number | null): string {
  if (mcmId) return `https://www.cardmarket.com/en/Magic/Products/Singles/${mcmId}`;
  return `https://www.cardmarket.com/en/Magic/Cards/${encodeURIComponent(name)}`;
}

export default function CardDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [days, setDays] = useState("90");

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
    ? `https://api.scryfall.com/cards/${card.scryfall_id}?format=image&version=normal`
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex gap-8 mb-8">
        {imageUrl && (
          <div className="shrink-0">
            <img
              src={imageUrl}
              alt={card.name}
              className="w-56 rounded-lg shadow-lg"
            />
          </div>
        )}

        <div className="flex-1">
          <h1 className="font-display text-3xl text-primary mb-1">{card.name}</h1>
          <p className="text-muted-foreground mb-4">
            {card.set_name} ({card.set_code})
          </p>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">30d Average</p>
                <p className="font-mono text-lg">
                  {card.avg30d != null ? `€${card.avg30d.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Historical Low</p>
                <p className="font-mono text-lg">
                  {card.historicalLow != null ? `€${card.historicalLow.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cardmarket</p>
                <a
                  href={cardmarketUrl(card.name, card.mcm_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm"
                >
                  View on CM →
                </a>
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

      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-lg">Price History</CardTitle>
          <Tabs value={days} onValueChange={setDays}>
            <TabsList>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
              <TabsTrigger value="365">1y</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {prices ? <PriceChart data={prices} /> : <Skeleton className="h-64" />}
        </CardContent>
      </Card>

      {deals && deals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Deal History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
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
                      {deal.deal_type}
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
