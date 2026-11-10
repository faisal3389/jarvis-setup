window.JARVIS = window.JARVIS || {};
// Optional clock jobs. Nothing is installed by default: see "Schedules" in README.md for the
// crontab lines (they call `bash bin/ask.sh "..." clock` from the project folder).
window.JARVIS.schedules = [
  {"name":"Morning check","cron":"47 6 * * *","human":"Every day ~6:47 AM","jobId":"not installed"},
  {"name":"Inbox sweep","cron":"0 8-20/3 * * *","human":"Every 3 hours, 8 AM to 8 PM (only if new mail)","jobId":"not installed"}
];
