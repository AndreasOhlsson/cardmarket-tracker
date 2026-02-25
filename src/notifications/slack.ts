export interface DealForSlack {
  name: string;
  setCode?: string;
  dealType: string;
  currentPrice: number;
  referencePrice: number;
  pctChange: number;
  mcmId?: number;
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  trend_drop: "TREND DROP",
  new_low: "NEW LOW",
  watchlist_alert: "WATCHLIST",
};

function cardmarketUrl(name: string, mcmId?: number): string {
  if (mcmId) {
    return `https://www.cardmarket.com/en/Magic/Products?idProduct=${mcmId}`;
  }
  return `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
}

export function formatDealMessage(deal: DealForSlack): string {
  const label = DEAL_TYPE_LABELS[deal.dealType] ?? deal.dealType;
  const pctStr = `${(deal.pctChange * 100).toFixed(1)}%`;
  const setStr = deal.setCode ? ` (${deal.setCode})` : "";
  const url = cardmarketUrl(deal.name, deal.mcmId);
  const urlLine = `\n<${url}|View on Cardmarket>`;

  return (
    `*${label}:* ${deal.name}${setStr}\n` +
    `€${deal.currentPrice.toFixed(2)} ← €${deal.referencePrice.toFixed(2)} (${pctStr})` +
    urlLine
  );
}

export function formatDealBatch(deals: DealForSlack[]): { blocks: unknown[] } {
  if (deals.length === 0) return { blocks: [] };

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Deal Alert — ${deals.length} deal${deals.length > 1 ? "s" : ""} found`,
      },
    },
    { type: "divider" },
  ];

  for (const deal of deals) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatDealMessage(deal),
      },
    });
  }

  return { blocks };
}

// Slack Block Kit allows max 50 blocks per message.
// Reserve 2 for header + divider = 48 deal blocks per message.
const MAX_DEALS_PER_MESSAGE = 48;

export function batchDeals(deals: DealForSlack[]): { blocks: unknown[] }[] {
  if (deals.length === 0) return [];

  const batches: { blocks: unknown[] }[] = [];
  for (let i = 0; i < deals.length; i += MAX_DEALS_PER_MESSAGE) {
    const chunk = deals.slice(i, i + MAX_DEALS_PER_MESSAGE);
    batches.push(formatDealBatch(chunk));
  }
  return batches;
}

export async function sendSlackNotification(
  webhookUrl: string,
  payload: { blocks: unknown[] },
): Promise<void> {
  if (!webhookUrl) {
    console.log("No Slack webhook URL configured, skipping notification");
    return;
  }

  if (payload.blocks.length === 0) {
    console.log("No deals to notify");
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }

  const dealCount = Math.max(0, payload.blocks.length - 2);
  console.log(`Slack notification sent (${dealCount} block${dealCount !== 1 ? "s" : ""})`);
}
