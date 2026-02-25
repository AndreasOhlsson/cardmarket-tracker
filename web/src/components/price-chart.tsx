import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PriceChartProps {
  data: { date: string; cm_trend: number | null }[];
}

export default function PriceChart({ data }: PriceChartProps) {
  const chartData = data
    .filter((d) => d.cm_trend != null)
    .map((d) => ({ date: d.date, price: d.cm_trend }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return <p className="text-muted-foreground">No price data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.72 0.12 80)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="oklch(0.72 0.12 80)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 80 / 0.3)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={{ fill: "oklch(0.65 0.02 80)", fontSize: 11 }}
          tickFormatter={(v: number) => `€${v}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.18 0.02 250)",
            border: "1px solid oklch(0.30 0.03 80)",
            borderRadius: "0.5rem",
            color: "oklch(0.93 0.01 80)",
            fontFamily: "JetBrains Mono",
            fontSize: "12px",
          }}
          formatter={(value: number | undefined) => value != null ? [`€${value.toFixed(2)}`, "Trend"] : []}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="oklch(0.72 0.12 80)"
          strokeWidth={2}
          fill="url(#priceGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
