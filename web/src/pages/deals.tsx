import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/hooks/use-api";
import DealCard from "@/components/deal-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function DealsPage() {
  const [dealType, setDealType] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [sort, setSort] = useState<string>("date");

  const params = new URLSearchParams();
  if (dealType !== "all") params.set("type", dealType);
  if (minPrice) params.set("minPrice", minPrice);
  params.set("sort", sort);
  params.set("limit", "100");

  const { data: deals, isPending } = useQuery({
    queryKey: ["deals", dealType, minPrice, sort],
    queryFn: () => apiFetch<DealRow[]>(`/deals?${params.toString()}`),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl text-primary mb-6">Today's Deals</h1>

      <div className="flex gap-3 mb-6 flex-wrap">
        <Select value={dealType} onValueChange={setDealType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Deal type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="trend_drop">Trend Drop</SelectItem>
            <SelectItem value="new_low">New Low</SelectItem>
            <SelectItem value="watchlist_alert">Watchlist</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Min price (€)"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="w-36"
        />

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Newest</SelectItem>
            <SelectItem value="pct_change">Biggest drop</SelectItem>
            <SelectItem value="current_price">Lowest price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {deals && (
        <p className="text-sm text-muted-foreground mb-4">
          {deals.length} deal{deals.length !== 1 ? "s" : ""} found
        </p>
      )}

      <div className="space-y-3">
        {isPending &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        {deals?.map((deal) => (
          <DealCard
            key={deal.id}
            uuid={deal.uuid}
            name={deal.name}
            setCode={deal.set_code}
            dealType={deal.deal_type}
            currentPrice={deal.current_price}
            referencePrice={deal.reference_price}
            pctChange={deal.pct_change}
            scryfallId={deal.scryfall_id}
            mcmId={deal.mcm_id}
          />
        ))}
        {deals?.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            No deals found. Try adjusting your filters.
          </p>
        )}
      </div>
    </div>
  );
}
