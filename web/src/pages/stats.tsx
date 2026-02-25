import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";

interface PipelineStats {
  totalCards: number;
  totalPrices: number;
  totalDeals: number;
  watchlistSize: number;
  latestPriceDate: string | null;
}

interface DealStatRow {
  deal_type: string;
  date: string;
  count: number;
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

export default function StatsPage() {
  const { data: stats, isPending: statsPending } = useQuery({
    queryKey: ["pipeline-stats"],
    queryFn: () => apiFetch<PipelineStats>("/stats/pipeline"),
  });

  const { data: dealStats } = useQuery({
    queryKey: ["deal-stats"],
    queryFn: () => apiFetch<DealStatRow[]>("/deals/stats"),
  });

  const { data: topDrops } = useQuery({
    queryKey: ["top-drops"],
    queryFn: () => apiFetch<DealRow[]>("/deals?sort=pct_change&sortDir=asc&limit=10"),
  });

  const chartData = dealStats
    ? Object.values(
        dealStats.reduce(
          (acc, row) => {
            if (!acc[row.date]) acc[row.date] = { date: row.date, trend_drop: 0, new_low: 0, watchlist_alert: 0 };
            const entry = acc[row.date]!;
            if (row.deal_type === "trend_drop") entry.trend_drop = row.count;
            if (row.deal_type === "new_low") entry.new_low = row.count;
            if (row.deal_type === "watchlist_alert") entry.watchlist_alert = row.count;
            return acc;
          },
          {} as Record<string, { date: string; trend_drop: number; new_low: number; watchlist_alert: number }>,
        ),
      ).sort((a, b) => a.date.localeCompare(b.date))
    : [];

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
                <p className="text-xs text-muted-foreground">Total Deals</p>
                <p className="font-mono text-2xl text-foreground">
                  {stats?.totalDeals.toLocaleString()}
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

      {chartData.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="font-display text-lg">Deals by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 80 / 0.3)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.18 0.02 250)",
                    border: "1px solid oklch(0.30 0.03 80)",
                    borderRadius: "0.5rem",
                    color: "oklch(0.93 0.01 80)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="trend_drop" fill="oklch(0.58 0.22 25)" name="Trend Drop" />
                <Bar dataKey="new_low" fill="oklch(0.62 0.18 250)" name="New Low" />
                <Bar dataKey="watchlist_alert" fill="oklch(0.75 0.15 75)" name="Watchlist" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {topDrops && topDrops.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Biggest Drops</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDrops.map((deal, i) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <Link
                      to={`/card/${deal.uuid}`}
                      className="text-sm font-medium hover:text-primary transition-colors"
                    >
                      {deal.name}
                    </Link>
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
