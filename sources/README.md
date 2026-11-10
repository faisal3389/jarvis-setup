# sources/ — connector exports (MOCK)

All data here is fictional, for the "Acme Notes" Jarvis demo. Times are America/New_York (-05:00).
Exports are raw daily rows only. Compute every total, average and % change yourself; no summaries are stored here.

## Expected connectors

| Connector | What it covers | File | Status |
|---|---|---|---|
| RevenueCat | Subscription revenue, new subscriptions, cancellations, active subscriptions, billing issues (failed payments) | `revenuecat.json` | Export present |
| Meta Ads | Per-ad daily spend, purchase value, impressions, clicks, purchases | `meta_ads.json` | Export present |
| App analytics | Daily signups and active users | `traffic.json` | Export present |
| Stripe | Payouts | none | **No export in this folder.** Report as UNAVAILABLE; do not estimate or substitute another source. |

## File shapes

- `revenuecat.json`: `daily[]` rows `{date, revenue, new_subscriptions, cancellations, active_subscriptions, billing_issues}`
  for 2026-10-01..2026-11-08, plus `billing_issue_events[]` (individual failed payments for recent days).
- `meta_ads.json`: `rows[]` `{date, ad_name, spend, purchase_value, impressions, clicks, purchases}` for 2026-11-02..2026-11-08, one row per ad per day.
  ROAS = purchase_value / spend.
- `traffic.json`: `daily[]` `{date, signups, active_users}` for 2026-10-26..2026-11-08.

Currency is USD. Cite each number as `<Connector> (mock) · sources/<file>` with its date.
