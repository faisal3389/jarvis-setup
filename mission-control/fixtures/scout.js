window.JARVIS = window.JARVIS || {};
window.JARVIS.scout = {
  "role": "scout",
  "status": "done",
  "updatedAt": "2026-11-09T06:52:41-05:00",
  "log": [
    {"t": "2026-11-09T06:47:02-05:00", "msg": "Woke on schedule (Morning: Scout → Advisor)"},
    {"t": "2026-11-09T06:47:05-05:00", "msg": "Reading RevenueCat export"},
    {"t": "2026-11-09T06:47:31-05:00", "msg": "Reading Meta Ads export (14 ads)"},
    {"t": "2026-11-09T06:48:02-05:00", "msg": "Reading traffic export"},
    {"t": "2026-11-09T06:48:20-05:00", "msg": "Stripe: no connector and no export — marked UNAVAILABLE"},
    {"t": "2026-11-09T06:49:44-05:00", "msg": "URGENT: 4 failed payments yesterday (avg 1/day)"},
    {"t": "2026-11-09T06:52:10-05:00", "msg": "Report written (98 words)"},
    {"t": "2026-11-09T06:52:41-05:00", "msg": "published"}
  ],
  "payload": {
    "reportDate": "2026-11-09",
    "dataFor": "2026-11-08",
    "revenue": {
      "yesterday": {"label": "Revenue yesterday", "value": 412.5, "display": "$412.50", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08", "kind": "actual"},
      "mtd": {"label": "Revenue MTD", "value": 3186.4, "display": "$3,186.40", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08", "kind": "actual"},
      "vsLastMonthSamePoint": {"label": "vs same point last month", "value": 8.1, "display": "+8.1%", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08", "kind": "actual"},
      "newSubs": {"label": "New subs", "value": 23, "display": "23", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08", "kind": "actual"},
      "cancellations": {"label": "Cancellations", "value": 9, "display": "9", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08", "kind": "actual"},
      "netSubs": {"label": "Net subs", "value": 14, "display": "+14", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08", "kind": "actual"}
    },
    "ads": {
      "spendYesterday": {"label": "Ad spend yesterday", "value": 142.3, "display": "$142.30", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08", "kind": "actual"},
      "roasYesterday": {"label": "ROAS yesterday", "value": 2.41, "display": "2.41x", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08", "kind": "actual"},
      "bestAd": {
        "name": "UGC-Testimonial-v3",
        "roas": {"label": "ROAS", "value": 3.92, "display": "3.92x", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08", "kind": "actual"},
        "spend": {"label": "Spend", "value": 48.2, "display": "$48.20", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08", "kind": "actual"}
      },
      "worstAd": {
        "name": "Static-Discount-20",
        "roas": {"label": "ROAS", "value": 0.55, "display": "0.55x", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08", "kind": "actual"},
        "spend": {"label": "Spend", "value": 36.0, "display": "$36.00", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08", "kind": "actual"}
      }
    },
    "traffic": {
      "signups": {"label": "Signups", "value": 187, "display": "187", "source": "Traffic (mock) · sources/traffic.json", "date": "2026-11-08", "kind": "actual"},
      "activeUsers": {"label": "Active users", "value": 2914, "display": "2,914", "source": "Traffic (mock) · sources/traffic.json", "date": "2026-11-08", "kind": "actual"},
      "movers": [
        {"text": "Signups +38% vs 7-day avg", "changePct": 38, "source": "Traffic (mock) · sources/traffic.json", "date": "2026-11-08"},
        {"text": "TikTok referrals +61% vs 7-day avg", "changePct": 61, "source": "Traffic (mock) · sources/traffic.json", "date": "2026-11-08"},
        {"text": "App Store page views -12% vs 7-day avg", "changePct": -12, "source": "Traffic (mock) · sources/traffic.json", "date": "2026-11-08"}
      ]
    },
    "alerts": [
      {"level": "watch", "text": "Static-Discount-20 ROAS below 1.0 for 3 days running", "source": "Meta Ads (mock) · sources/meta-ads.json", "date": "2026-11-08"},
      {"level": "urgent", "text": "4 failed payments yesterday (avg 1/day)", "source": "RevenueCat (mock) · sources/revenuecat.json", "date": "2026-11-08"}
    ],
    "unavailable": [
      {"item": "Stripe payouts", "reason": "No connector and no export in sources/"}
    ],
    "projections": [
      {"label": "November revenue (run-rate)", "value": 12050, "display": "$12,050", "source": "Scout projection · MTD run-rate", "date": "2026-11-08", "kind": "projection"},
      {"label": "MRR at month end", "value": 11480, "display": "$11,480", "source": "Scout projection · net subs trend", "date": "2026-11-08", "kind": "projection"}
    ],
    "reportMarkdown": "**URGENT:** 4 failed payments yesterday vs an average of 1/day (RevenueCat, 2026-11-08).\n\nRevenue yesterday $412.50. Month to date $3,186.40, +8.1% vs the same point last month. 23 new subs, 9 cancellations, net +14.\n\nAds: $142.30 spend at 2.41x ROAS. Best: UGC-Testimonial-v3 at 3.92x on $48.20. Worst: Static-Discount-20 at 0.55x on $36.00.\n\nTraffic: 187 signups (+38% vs 7-day avg), 2,914 active users.\n\nUNAVAILABLE: Stripe payouts (no connector, no export).",
    "wordCount": 72
  }
};
