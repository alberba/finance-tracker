/// <reference types="vite-svg-loader" />

declare namespace App {
  interface Locals {
    runtime?: {
      env?: {
        finance_tracker_db?: unknown;
        GITHUB_ISSUE_TOKEN?: string;
        GITHUB_TOKEN?: string;
        GITHUB_OWNER?: string;
        GITHUB_REPO?: string;
        MARKET_DATA_PROVIDER?: string;
        TWELVE_DATA_API_KEY?: string;
        COINGECKO_API_KEY?: string;
        COINGECKO_API_PLAN?: string;
        MARKET_QUOTE_STALE_MINUTES?: string;
        MARKET_QUOTE_CACHE_SECONDS?: string;
      };
    };
  }
}
