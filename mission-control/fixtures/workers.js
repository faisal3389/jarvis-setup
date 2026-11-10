window.JARVIS = window.JARVIS || {};
window.JARVIS.workers = [
  {"id": "scout", "label": "SCOUT", "color": "#4de3ff",
   "summary": "Numbers and analysis from the business data in sources/. Read-only.",
   "output": "outbox/analysis", "extraBash": []},
  {"id": "operator", "label": "OPERATOR", "color": "#b892ff",
   "summary": "Inbox sweeps and drafts of emails, replies and posts; simulated send or publish only after you approve.",
   "output": "outbox/drafts", "extraBash": []},
  {"id": "developer", "label": "DEVELOPER", "color": "#5cf0d8",
   "summary": "Small self-contained python3 scripts and checks, built only inside workspace/task-<id>/.",
   "output": "workspace", "extraBash": []},
  {"id": "researcher", "label": "RESEARCHER", "color": "#ff8fd0",
   "summary": "Web research with every claim cited by URL and date; anything unconfirmed is marked UNVERIFIED.",
   "output": "outbox/research", "extraBash": []},
  {"id": "tester", "label": "TESTER", "color": "#b6f25e",
   "summary": "Checks other workers' output (runs code, tries edge cases, verifies numbers) and writes PASS/FAIL; never fixes it.",
   "output": "outbox/tests", "extraBash": []}
];
