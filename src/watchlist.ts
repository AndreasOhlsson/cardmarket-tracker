import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

const watchlistCardSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  notes: z.string().optional(),
});

const watchlistSchema = z.object({
  description: z.string().optional(),
  created: z.string().optional(),
  cards: z.array(watchlistCardSchema),
});

export type WatchlistCard = z.infer<typeof watchlistCardSchema>;

export function loadWatchlist(filePath: string): WatchlistCard[] {
  if (!existsSync(filePath)) {
    console.warn(`Watchlist file not found: ${filePath}`);
    return [];
  }

  const raw = readFileSync(filePath, "utf-8");
  const data = watchlistSchema.parse(JSON.parse(raw));
  return data.cards;
}
