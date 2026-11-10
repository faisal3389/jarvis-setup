window.JARVIS = window.JARVIS || {};
window.JARVIS.board = {
  "updatedAt": "2026-11-09T10:04:40-05:00",
  "nextRequest": 4, "nextTask": 6, "nextNote": 13,
  "requests": [
    {"id": 2, "text": "research what Notely and Inkwell charge for their yearly plans", "from": "text",
     "status": "done", "reply": "Notely Plus is $89.99 a year and Inkwell Pro is $34.99, so Acme Notes Pro at $59.99 sits in the middle. Sources are in outbox/research/task-3.md.",
     "taskIds": [3], "createdAt": "2026-11-09T09:20:12-05:00", "updatedAt": "2026-11-09T09:31:40-05:00"},
    {"id": 3, "text": "find why signups jumped and draft a tweet about it", "from": "voice",
     "status": "working", "reply": null, "taskIds": [4, 5],
     "createdAt": "2026-11-09T09:41:03-05:00", "updatedAt": "2026-11-09T10:04:40-05:00"}
  ],
  "tasks": [
    {"id": 3, "requestId": 2, "title": "Compare Notely and Inkwell yearly plan pricing",
     "detail": "Find current yearly prices for Notely Plus and Inkwell Pro, cite URLs and dates, compare with Acme Notes Pro ($59.99/yr).",
     "worker": "researcher", "status": "done", "dependsOn": [],
     "result": "Notely Plus $89.99/yr, Inkwell Pro $34.99/yr (mock research, both checked 2026-11-09).",
     "files": ["outbox/research/task-3.md"], "approval": null,
     "log": [
       {"t": "2026-11-09T09:22:05-05:00", "msg": "Searching Notely pricing page"},
       {"t": "2026-11-09T09:24:41-05:00", "msg": "Reading Inkwell Pro plans"},
       {"t": "2026-11-09T09:27:18-05:00", "msg": "Comparing with Acme Notes Pro ($59.99/yr)"},
       {"t": "2026-11-09T09:29:56-05:00", "msg": "Wrote outbox/research/task-3.md"}
     ],
     "createdAt": "2026-11-09T09:21:30-05:00", "updatedAt": "2026-11-09T09:31:02-05:00"},
    {"id": 4, "requestId": 3, "title": "Find why signups jumped on Nov 8",
     "detail": "Use sources/ traffic + Meta Ads exports. Explain the Nov 8 signup spike with numbers, source and date.",
     "worker": "scout", "status": "done", "dependsOn": [],
     "result": "Signups +38% (187 vs 135.5 avg); timing matches UGC-Testimonial-v3 spend.",
     "files": ["outbox/analysis/task-4.md"], "approval": null,
     "log": [
       {"t": "2026-11-09T09:43:10-05:00", "msg": "Reading sources/traffic export"},
       {"t": "2026-11-09T09:44:02-05:00", "msg": "Signups 187 on Nov 8 vs 135.5 7-day avg"},
       {"t": "2026-11-09T09:46:37-05:00", "msg": "Cross-checking Meta Ads spend by creative"},
       {"t": "2026-11-09T09:48:15-05:00", "msg": "UGC-Testimonial-v3 spend up 2.1x on Nov 7-8"},
       {"t": "2026-11-09T09:50:48-05:00", "msg": "Wrote outbox/analysis/task-4.md"}
     ],
     "createdAt": "2026-11-09T09:42:20-05:00", "updatedAt": "2026-11-09T09:51:30-05:00"},
    {"id": 5, "requestId": 3, "title": "Draft a tweet about the signup jump",
     "detail": "Write one tweet (<= 260 chars) in the owner's voice about the signup jump, based on task 4. Do not publish.",
     "worker": "operator", "status": "needs_you", "dependsOn": [4],
     "result": "Tweet drafted (212 chars), ready to publish.",
     "files": ["outbox/drafts/task-5.md"],
     "approval": {"action": "Publish the tweet to X", "decision": null, "decidedAt": null, "note": null},
     "log": [
       {"t": "2026-11-09T09:53:04-05:00", "msg": "Reading outbox/analysis/task-4.md"},
       {"t": "2026-11-09T09:55:40-05:00", "msg": "Matching tone to content/approved examples"},
       {"t": "2026-11-09T09:59:12-05:00", "msg": "Drafted tweet (212 chars)"},
       {"t": "2026-11-09T10:01:27-05:00", "msg": "Wrote outbox/drafts/task-5.md"}
     ],
     "createdAt": "2026-11-09T09:42:21-05:00", "updatedAt": "2026-11-09T10:04:40-05:00"}
  ],
  "notes": [
    {"id": 8, "t": "2026-11-09T09:20:13-05:00", "text": "On it. That's request 2.", "requestId": 2, "taskId": null, "spoken": true},
    {"id": 9, "t": "2026-11-09T09:31:41-05:00", "text": "Request 2 is done. Notely Plus is $89.99 a year and Inkwell Pro is $34.99, so Acme Notes Pro sits in the middle.", "requestId": 2, "taskId": null, "spoken": true},
    {"id": 10, "t": "2026-11-09T09:41:04-05:00", "text": "On it. That's request 3.", "requestId": 3, "taskId": null, "spoken": true},
    {"id": 11, "t": "2026-11-09T09:51:35-05:00", "text": "Task 4 is done. Signups jumped 38 percent, and the timing matches the UGC Testimonial v3 ad.", "requestId": 3, "taskId": 4, "spoken": false},
    {"id": 12, "t": "2026-11-09T10:04:41-05:00", "text": "Task 5 needs you. Approve publishing the tweet to X?", "requestId": 3, "taskId": 5, "spoken": false}
  ]
};
