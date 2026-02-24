# Web Dashboard Design

## Goal

A read-only web dashboard for monitoring MTG Commander card deals, tracking prices, and browsing the watchlist. Shared with a few friends via direct link.

## Architecture

Monorepo with Express API + React SPA, reading the existing SQLite database.

```
cardmarket-tracker/
├── src/                    (existing pipeline code, untouched)
├── server/                 (Express API, reads data/tracker.db)
│   └── api.ts
└── web/                    (React + Vite SPA)
    └── src/
        ├── pages/
        └── components/
```

- Express reads the same `data/tracker.db` via better-sqlite3 (synchronous, fast)
- React SPA handles interactivity (charts, filtering, search)
- Vite dev server proxies to Express in development
- In production, Express serves the built React static files + API routes
- No auth needed for Phase 1

### Alternatives considered

- **Separate repo** — shared DB path becomes awkward, more overhead
- **Embedded in pipeline process** — pipeline runs once then exits, wrong lifecycle
- **Static site generated after pipeline** — no interactivity, no search

## Pages

### 1. Deals (landing page)

Today's detected deals as a filterable feed.

Each deal card shows:
- Card name + set icon
- Price drop with percentage badge
- Deal type tag (color-coded)
- 30-day sparkline
- Cardmarket link button
- Scryfall card image

Filter bar: deal type (trend_drop / new_low / watchlist_alert), date range, minimum price.
Sort by: biggest drop %, lowest price, newest.

### 2. Watchlist

DataTable of the 1000 watched cards.

Columns: name, set, current price, 30d average, % change, 30d sparkline, last deal date.
Search by name. Sortable columns. Paginated. Rows link to Card Detail.

### 3. Card Detail (`/card/:uuid`)

- Price history chart with time range toggle (30d / 90d / all)
- Card metadata: name, set, Scryfall card image, Cardmarket link
- Deal history table for this card
- All printings with their current prices side by side

### 4. Stats

- Deal counts by type over time (bar chart)
- Top 10 biggest drops this week
- Watchlist coverage stats
- Pipeline health: last run time, prices stored, data freshness

## Aesthetic: "Planeswalker's Trading Desk"

Dark fantasy meets data tool.

### Colors

| Role | Color | Hex |
|------|-------|-----|
| Background | Deep charcoal | `#1a1a2e` |
| Surface/panels | Dark navy | `#16213e` |
| Primary accent | Gold | `#c9a84c` |
| trend_drop | Crimson | `#e63946` |
| new_low | Sapphire | `#4895ef` |
| watchlist_alert | Amber | `#f4a261` |
| Positive change | Emerald | `#2a9d8f` |

### Typography

- **Display headings:** Cinzel (serif, fantasy-appropriate)
- **Body text:** Source Sans 3 (clean sans-serif)
- **Numbers/data:** JetBrains Mono (monospace, precise)

### Visual details

- Thin gold border accents on panels, echoing MTG card frames
- Subtle dark parchment texture overlay on background
- Scryfall card images in deal cards and card detail
- Mana symbols as decorative elements in empty states
- Staggered fade-in on deal cards, animated chart drawing
- Hover glow on deal cards matching deal type color

## API Endpoints

All read-only.

```
GET  /api/deals?type=&date=&minPrice=&sort=&limit=50
GET  /api/deals/stats
GET  /api/watchlist?search=&sort=&page=
GET  /api/cards/:uuid
GET  /api/cards/:uuid/prices?days=30
GET  /api/cards/:uuid/deals
GET  /api/cards/search?q=
GET  /api/stats/pipeline
```

## Tech Stack

| Package | Purpose |
|---------|---------|
| `express` | API server |
| `react` + `react-dom` | UI framework |
| `vite` | Dev server + build |
| `tailwindcss` | Utility-first styling |
| `shadcn/ui` | Component library (Table, Card, Badge, Command, Tabs, Skeleton) |
| `@tanstack/react-table` | Underpins shadcn DataTable for sortable/filterable watchlist |
| `@tanstack/react-query` | Data fetching + caching |
| `recharts` | Price history charts + sparklines |
| `react-router-dom` | Client-side routing |

## Resolved Decisions

1. **Read-only dashboard** — no watchlist editing from UI in Phase 1
2. **No auth** — shared via direct link, can add basic auth later
3. **Single process** — Express serves both API and static files in production
4. **Same SQLite DB** — no data duplication, pipeline writes, dashboard reads
5. **shadcn/ui + Tailwind** — themed with CSS variables for the dark fantasy palette
6. **Recharts for charts** — works well with React, supports sparklines and area charts
