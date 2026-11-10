window.JARVIS = window.JARVIS || {};
window.JARVIS.advisor = {
  "role": "advisor",
  "status": "done",
  "updatedAt": "2026-11-09T06:58:12-05:00",
  "log": [
    {"t": "2026-11-09T06:53:00-05:00", "msg": "Woke after Scout (Morning: Scout → Advisor)"},
    {"t": "2026-11-09T06:53:06-05:00", "msg": "Read Scout report for 2026-11-08"},
    {"t": "2026-11-09T06:53:40-05:00", "msg": "Loaded 7-day recommendation history (2 not acted on)"},
    {"t": "2026-11-09T06:55:12-05:00", "msg": "Skipped Stripe payouts (UNAVAILABLE)"},
    {"t": "2026-11-09T06:57:51-05:00", "msg": "Ranked 3 recommendations: blocking, outperforming, degrading"},
    {"t": "2026-11-09T06:58:12-05:00", "msg": "published"}
  ],
  "payload": {
    "date": "2026-11-09",
    "routineDay": false,
    "recommendations": [
      {"rank": 1, "category": "blocking", "action": "Email the 4 customers whose renewals failed on 8 Nov and turn on billing-retry reminders today.", "evidence": "4 failed payments on 2026-11-08 vs an average of 1/day (RevenueCat (mock) · 2026-11-08).", "ifIgnored": "Roughly $40 of MRR churns silently this week; failed renewals rarely recover after 7 days."},
      {"rank": 2, "category": "outperforming", "action": "Raise UGC-Testimonial-v3's daily budget from $48 to $75.", "evidence": "3.92x ROAS on $48.20 spend vs 2.41x account ROAS; signups +38% vs 7-day avg (Meta Ads, Traffic (mock) · 2026-11-08).", "ifIgnored": "The best ad stays budget-capped while demand is up."},
      {"rank": 3, "category": "degrading", "action": "Pause Static-Discount-20.", "evidence": "0.55x ROAS on $36.00 spend; below 1.0 for 3 days running (Meta Ads (mock) · 2026-11-08).", "ifIgnored": "About $250 of spend this week returns roughly $140."}
    ],
    "unacted7d": [
      {"date": "2026-11-05", "action": "Add an annual plan option to the paywall", "daysOpen": 4},
      {"date": "2026-11-07", "action": "Reply to the 2-star App Store review about sync", "daysOpen": 2}
    ],
    "skippedUnavailable": ["Stripe payouts (UNAVAILABLE) not used"],
    "summaryMarkdown": "1) BLOCKING: recover 4 failed payments. 2) OUTPERFORMING: scale UGC-Testimonial-v3. 3) DEGRADING: pause Static-Discount-20. 2 older recommendations still not acted on."
  }
};
