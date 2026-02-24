import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./db/schema.js";
import { runDailyPipeline } from "./pipeline.js";
import { sendSlackNotification } from "./notifications/slack.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = getConfig();
  const maxRetries = config.pipelineMaxRetries;
  const retryDelayMs = config.pipelineRetryDelayMs;

  mkdirSync(dirname(config.dbPath), { recursive: true });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeDatabase(db);

    try {
      await runDailyPipeline(db, config);
      db.close();
      return; // Success — exit cleanly
    } catch (err) {
      db.close();
      if (attempt < maxRetries) {
        const delayMin = Math.round(retryDelayMs / 60000);
        console.error(
          `Attempt ${attempt}/${maxRetries} failed: ${err instanceof Error ? err.message : err}`,
        );
        console.error(`Retrying in ${delayMin} minutes...`);
        await sleep(retryDelayMs);
      } else {
        console.error(`All ${maxRetries} attempts failed. Last error:`, err);

        // Attempt to notify via Slack that the pipeline has failed
        try {
          await sendSlackNotification(config.slackWebhookUrl, {
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Pipeline Failed*\nAll ${maxRetries} attempts exhausted.\nLast error: ${err instanceof Error ? err.message : String(err)}`,
                },
              },
            ],
          });
        } catch {
          // Don't let notification failure mask the real error
        }

        process.exit(1);
      }
    }
  }
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
