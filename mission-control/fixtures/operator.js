window.JARVIS = window.JARVIS || {};
window.JARVIS.operator = {
  "role": "operator",
  "status": "done",
  "updatedAt": "2026-11-09T09:16:22-05:00",
  "log": [
    {"t": "2026-11-09T09:13:00-05:00", "msg": "Woke on schedule (Operator: inbox + publishing)"},
    {"t": "2026-11-09T09:13:04-05:00", "msg": "8 pending emails in inbox/"},
    {"t": "2026-11-09T09:14:10-05:00", "msg": "Resolved 3 from faq.md (simulated send)"},
    {"t": "2026-11-09T09:14:52-05:00", "msg": "Drafted 3 for owner approval (refund, billing, partnership)"},
    {"t": "2026-11-09T09:15:07-05:00", "msg": "Escalated email-007: possible data loss"},
    {"t": "2026-11-09T09:15:20-05:00", "msg": "Delegated email-008 to Developer (queue/dev)"},
    {"t": "2026-11-09T09:15:48-05:00", "msg": "Published post-014 (simulated); held post-015 (not approved)"},
    {"t": "2026-11-09T09:16:22-05:00", "msg": "published"}
  ],
  "payload": {
    "runAt": "2026-11-09T09:13:00-05:00",
    "counts": {"resolved": 3, "drafted": 3, "escalated": 1, "delegated": 1, "published": 1, "held": 1},
    "items": [
      {"id": "email-001", "type": "email", "from": "maya.r@example.com", "subject": "How do I export notes to PDF?", "outcome": "resolved", "reason": "Answered from FAQ: Exporting", "faqRef": "faq.md#exporting", "file": "outbox/sent-simulated/email-001.md"},
      {"id": "email-002", "type": "email", "from": "jonas@example.com", "subject": "Sync not working on my iPad", "outcome": "resolved", "reason": "Answered from FAQ: Sync troubleshooting", "faqRef": "faq.md#sync", "file": "outbox/sent-simulated/email-002.md"},
      {"id": "email-003", "type": "email", "from": "priya@example.com", "subject": "Can I share a notebook with my team?", "outcome": "resolved", "reason": "Answered from FAQ: Sharing", "faqRef": "faq.md#sharing", "file": "outbox/sent-simulated/email-003.md"},
      {"id": "email-004", "type": "email", "from": "dana@example.com", "subject": "Refund please", "outcome": "drafted", "reason": "Mentions refund — needs owner approval", "faqRef": null, "file": "outbox/drafts/email-004.md"},
      {"id": "email-005", "type": "email", "from": "leo@example.com", "subject": "I was charged twice this month", "outcome": "drafted", "reason": "Billing dispute — needs owner approval", "faqRef": null, "file": "outbox/drafts/email-005.md"},
      {"id": "email-006", "type": "email", "from": "sam@templatesco.example", "subject": "Partnership: notes templates bundle", "outcome": "drafted", "reason": "Business proposal — owner decides", "faqRef": null, "file": "outbox/drafts/email-006.md"},
      {"id": "email-007", "type": "email", "from": "alex@example.com", "subject": "Lost all my notes after the update!!", "outcome": "escalated", "reason": "Possible data loss — owner should reply personally", "faqRef": null, "file": "outbox/drafts/email-007.md"},
      {"id": "email-008", "type": "email", "from": "kim@example.com", "subject": "Widget text unreadable in dark mode", "outcome": "delegated", "reason": "Reproducible bug — ticket handed to Developer", "faqRef": null, "file": "queue/dev/email-008.md"},
      {"id": "post-014", "type": "publish", "from": null, "subject": "Tip: pin your daily note to the top", "outcome": "published", "reason": "In content/approved — published (simulated)", "faqRef": null, "file": "outbox/published-simulated/post-014.md"},
      {"id": "post-015", "type": "publish", "from": null, "subject": "Black Friday: 40% off annual", "outcome": "held", "reason": "Only in content/pending — not approved", "faqRef": null, "file": null}
    ],
    "summaryMarkdown": "Resolved 3, drafted 3 (need you), escalated 1 (needs you), delegated 1 to Developer, published 1, held 1."
  }
};
