const cron = require('node-cron');
const db = require('../db');
const { sendUploadReminder, sendDeletionNotice } = require('./mailer');

/**
 * Runs every hour. Checks for artists who:
 * 1. Joined 72+ hours ago with no paintings → send reminder
 * 2. Joined 96+ hours ago (72h + 24h grace) with no paintings → auto-delete + notify
 *
 * Uses a `reminder_sent` column to avoid duplicate emails.
 *
 * Note: Since artist registration now requires uploading at least one painting,
 * this cron mainly catches edge cases where an artist deletes all their paintings
 * after registration.
 */
function startArtistCron() {
  // Check Resend API key at startup
  if (!process.env.RESEND_API_KEY) {
    console.warn('[CRON] WARNING: RESEND_API_KEY is not set — reminder/deletion emails will fail!');
  }

  // Run every hour
  cron.schedule('0 * * * *', () => {
    console.log('[CRON] Checking artist upload status...');

    try {
      // Artists who joined 72+ hours ago, have no paintings, haven't been reminded
      const toRemind = db.prepare(`
        SELECT id, email, name, created_at FROM users
        WHERE role = 'artist'
          AND reminder_sent = 0
          AND created_at <= datetime('now', '-72 hours')
          AND (SELECT COUNT(*) FROM paintings WHERE artist_id = users.id AND status != 'removed') = 0
      `).all();

      console.log(`[CRON] Found ${toRemind.length} artist(s) needing 72h reminder`);

      for (const artist of toRemind) {
        sendUploadReminder(artist.email, artist.name)
          .then(() => {
            db.prepare('UPDATE users SET reminder_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(artist.id);
            console.log(`[CRON] Reminder sent to ${artist.email} (joined: ${artist.created_at})`);
          })
          .catch(e => {
            console.error(`[CRON] Failed to send reminder to ${artist.email}:`, e.message);
          });
      }

      // Artists who joined 96+ hours ago (72h + 24h grace), reminded, still no paintings → delete
      const toDelete = db.prepare(`
        SELECT id, email, name, created_at FROM users
        WHERE role = 'artist'
          AND reminder_sent = 1
          AND created_at <= datetime('now', '-96 hours')
          AND (SELECT COUNT(*) FROM paintings WHERE artist_id = users.id AND status != 'removed') = 0
      `).all();

      console.log(`[CRON] Found ${toDelete.length} artist(s) for 96h auto-deletion`);

      for (const artist of toDelete) {
        sendDeletionNotice(artist.email, artist.name)
          .then(() => {
            console.log(`[CRON] Deletion notice sent to ${artist.email}`);
          })
          .catch(e => {
            console.error(`[CRON] Failed to send deletion notice to ${artist.email}:`, e.message);
          });

        // Delete the artist (no paintings/orders to worry about)
        db.prepare('DELETE FROM users WHERE id = ?').run(artist.id);
        console.log(`[CRON] Auto-deleted inactive artist: ${artist.email} (joined: ${artist.created_at})`);
      }

      if (!toRemind.length && !toDelete.length) {
        console.log('[CRON] No action needed.');
      }
    } catch (e) {
      console.error('[CRON] Error:', e.message, e.stack);
    }
  });

  console.log('[CRON] Artist upload check scheduled (hourly)');
}

module.exports = { startArtistCron };
