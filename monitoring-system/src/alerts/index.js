const AlertManager = require('./alert-manager');
const AlertConfig = require('./alert-config');
const {
  NotificationChannel,
  ConsoleNotificationChannel,
  DashboardNotificationChannel,
  EmailNotificationChannel,
  WebhookNotificationChannel,
  NotificationManager
} = require('./notification-channels');

module.exports = {
  AlertManager,
  AlertConfig,
  NotificationChannel,
  ConsoleNotificationChannel,
  DashboardNotificationChannel,
  EmailNotificationChannel,
  WebhookNotificationChannel,
  NotificationManager
};