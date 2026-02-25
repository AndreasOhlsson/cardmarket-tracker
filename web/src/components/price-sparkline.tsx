import { LineChart, Line, ResponsiveContainer } from "recharts";

interface PriceSparklineProps {
  data: { date: string; price: number }[];
  color?: string;
  height?: number;
}

export default function PriceSparkline({
  data,
  color = "hsl(var(--chart-1))",
  height = 32,
}: PriceSparklineProps) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
