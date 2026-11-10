window.JARVIS = window.JARVIS || {};
window.JARVIS.schedules = [
  {"name": "Morning: Scout → Advisor", "cron": "47 6 * * *", "human": "Every day ~6:47 AM", "jobId": "job-7f3a21"},
  {"name": "Operator: inbox + publishing", "cron": "13 9 * * 1-5", "human": "Weekdays ~9:13 AM", "jobId": "job-2c9e04"},
  {"name": "Operator: afternoon sweep", "cron": "13 15 * * 1-5", "human": "Weekdays ~3:13 PM", "jobId": "job-b81d55"}
];
