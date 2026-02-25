import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useDeferredValue, useEffect, useTransition } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import DealCard from "@/components/deal-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

const VALID_SORTS = ["date", "pct_change", "current_price"];
const VALID_TYPES = ["all", "trend_drop", "new_low", "watchlist_alert"];

const DEAL_SKELETONS = Array.from({ length: 6 }, (_, i) => (
  <Skeleton key={i} className="h-28 rounded-lg" />
));

export default function DealsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterPending, startFilterTransition] = useTransition();

  // Read state from URL
  const dealType = VALID_TYPES.includes(searchParams.get("type") ?? "all")
    ? (searchParams.get("type") ?? "all")
    : "all";
  const sort = VALID_SORTS.includes(searchParams.get("sort") ?? "date")
    ? (searchParams.get("sort") ?? "date")
    : "date";
  const urlMinPrice = searchParams.get("minPrice") ?? "";
  const urlSearch = searchParams.get("q") ?? "";

  // Local state → debounce (delay network) → defer (deprioritise render)
  const [minPrice, setMinPrice] = useState(urlMinPrice);
  const debouncedMinPrice = useDebounce(minPrice, 300);
  const deferredMinPrice = useDeferredValue(debouncedMinPrice);
  const [search, setSearch] = useState(urlSearch);
  const debouncedSearch = useDebounce(search, 300);
  const deferredSearch = useDeferredValue(debouncedSearch);

  // Sync deferred minPrice back to URL
  useEffect(() => {
    const current = searchParams.get("minPrice") ?? "";
    if (deferredMinPrice !== current) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (deferredMinPrice) {
          next.set("minPrice", deferredMinPrice);
        } else {
          next.delete("minPrice");
        }
        return next;
      }, { replace: true });
    }
  }, [deferredMinPrice, searchParams, setSearchParams]);

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
        return next;
      }, { replace: true });
    }
  }, [deferredSearch, searchParams, setSearchParams]);

  function updateParam(key: string, value: string) {
    startFilterTransition(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const isDefault =
          (key === "type" && value === "all") ||
          (key === "sort" && value === "date");
        if (isDefault) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      }, { replace: true });
    });
  }

  const sortDir = sort === "date" ? "desc" : "asc";

  const apiParams = new URLSearchParams();
  if (dealType !== "all") apiParams.set("type", dealType);
  if (deferredMinPrice) apiParams.set("minPrice", deferredMinPrice);
  if (deferredSearch.length >= 2) apiParams.set("search", deferredSearch);
  apiParams.set("sort", sort);
  apiParams.set("sortDir", sortDir);
  apiParams.set("limit", "100");

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["deals", dealType, deferredMinPrice, deferredSearch, sort, sortDir],
    queryFn: () => apiFetch<{ items: DealRow[]; total: number }>(`/deals?${apiParams.toString()}`),
    placeholderData: keepPreviousData,
  });
  const deals = data?.items;
  const total = data?.total;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <title>Deals — Cardmarket Tracker</title>
      <h1 className="font-display text-2xl md:text-3xl text-primary mb-6 animate-fade-in">Today's Deals</h1>

      <div className="flex gap-3 mb-6 flex-wrap animate-fade-in" style={{ animationDelay: "0.05s" }}>
        <Input
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-52"
        />

        <Select value={dealType} onValueChange={(v) => updateParam("type", v)}>
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

        <Select value={sort} onValueChange={(v) => updateParam("sort", v)}>
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

      {deals && total != null && (
        <p className="text-sm text-muted-foreground mb-4">
          Showing {deals.length} of {total} deal{total !== 1 ? "s" : ""}
        </p>
      )}

      <div className={cn("space-y-3 transition-opacity duration-150", (isFilterPending || (isFetching && !isPending)) && "opacity-50")}>
        {isPending && DEAL_SKELETONS}
        {deals?.map((deal, i) => (
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
            index={i}
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
