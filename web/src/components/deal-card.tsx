import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface DealCardProps {
  uuid: string;
  name: string;
  setCode: string | null;
  dealType: string;
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
  scryfallId: string | null;
  mcmId: number | null;
}

const DEAL_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  trend_drop: {
    label: "TREND DROP",
    className: "bg-deal-trend-drop/20 text-deal-trend-drop border-deal-trend-drop/30",
  },
  new_low: {
    label: "NEW LOW",
    className: "bg-deal-new-low/20 text-deal-new-low border-deal-new-low/30",
  },
  watchlist_alert: {
    label: "WATCHLIST",
    className: "bg-deal-watchlist/20 text-deal-watchlist border-deal-watchlist/30",
  },
};

function cardmarketUrl(name: string, mcmId: number | null): string {
  if (mcmId) return `https://www.cardmarket.com/en/Magic/Products/Singles/${mcmId}`;
  return `https://www.cardmarket.com/en/Magic/Cards/${encodeURIComponent(name)}`;
}

function scryfallImageUrl(scryfallId: string | null, size: "small" | "normal" = "small"): string | null {
  if (!scryfallId) return null;
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

export default function DealCard(props: DealCardProps) {
  const config = DEAL_TYPE_CONFIG[props.dealType] ?? {
    label: props.dealType,
    className: "bg-muted text-muted-foreground",
  };
  const pctStr = (props.pctChange * 100).toFixed(1);
  const imageUrl = scryfallImageUrl(props.scryfallId);

  return (
    <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="p-0 flex">
        {imageUrl && (
          <Link to={`/card/${props.uuid}`} className="shrink-0">
            <img
              src={imageUrl}
              alt={props.name}
              className="w-24 h-auto object-cover"
              loading="lazy"
            />
          </Link>
        )}

        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn("text-xs", config.className)}>
                {config.label}
              </Badge>
              {props.setCode && (
                <span className="text-xs text-muted-foreground">{props.setCode}</span>
              )}
            </div>
            <Link to={`/card/${props.uuid}`}>
              <h3 className="font-display text-sm font-semibold text-foreground hover:text-primary transition-colors">
                {props.name}
              </h3>
            </Link>
          </div>

          <div className="flex items-end justify-between mt-2">
            <div>
              <span className="font-mono text-lg font-semibold text-foreground">
                €{props.currentPrice.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ← €{props.referencePrice.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-mono text-sm font-medium",
                  props.pctChange < 0 ? "text-deal-trend-drop" : "text-positive",
                )}
              >
                {props.pctChange > 0 ? "+" : ""}
                {pctStr}%
              </span>
              <a
                href={cardmarketUrl(props.name, props.mcmId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Buy →
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
