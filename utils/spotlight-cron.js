const cron = require('node-cron');
const db = require('../db');
const { sendSpotlightAnnouncement } = require('./mailer');
const { postToInstagram, buildSpotlightCaption } = require('./instagram');

/**
 * Runs every Monday at 9:00 AM UTC.
 * Auto-selects a random available painting as Spotlight of the Week
 * and emails all registered users the announcement.
 *
 * Skips if admin already set a spotlight for the current week.
 * Avoids repeating the same painting if others are available.
 */
function startSpotlightCron() {
  // Every Monday at 9:00 AM UTC
  cron.schedule('0 9 * * 1', async () => {
    console.log('[SPOTLIGHT] Running weekly spotlight selection...');

    try {
      // Calculate current week (Monday to Sunday)
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekStart = monday.toISOString().slice(0, 10);
      const weekEnd = sunday.toISOString().slice(0, 10);

      // Skip if a spotlight already exists for this week (admin override)
      const existing = db.prepare('SELECT id FROM spotlights WHERE week_start = ?').get(weekStart);
      if (existing) {
        console.log('[SPOTLIGHT] Spotlight already set for this week, skipping auto-select.');
        return;
      }

      // Get the last spotlighted painting to avoid repeats
      const lastSpotlight = db.prepare('SELECT painting_id FROM spotlights ORDER BY created_at DESC LIMIT 1').get();
      const excludeId = lastSpotlight ? lastSpotlight.painting_id : -1;

      // Pick a random available painting (prefer one not recently spotlighted)
      let painting = db.prepare(`
        SELECT p.*, u.name as artist_name
        FROM paintings p JOIN users u ON p.artist_id = u.id
        WHERE p.status = 'available' AND p.id != ?
        ORDER BY RANDOM() LIMIT 1
      `).get(excludeId);

      // Fallback: if only one painting exists, allow repeats
      if (!painting) {
        painting = db.prepare(`
          SELECT p.*, u.name as artist_name
          FROM paintings p JOIN users u ON p.artist_id = u.id
          WHERE p.status = 'available'
          ORDER BY RANDOM() LIMIT 1
        `).get();
      }

      if (!painting) {
        console.log('[SPOTLIGHT] No available paintings to spotlight.');
        return;
      }

      // Insert the auto-selected spotlight
      db.prepare(
        'INSERT INTO spotlights (painting_id, message, week_start, week_end, auto_selected) VALUES (?, ?, ?, ?, 1)'
      ).run(painting.id, null, weekStart, weekEnd);

      console.log(`[SPOTLIGHT] Auto-selected: "${painting.title}" by ${painting.artist_name}`);

      // Send announcement email to all users
      const users = db.prepare('SELECT email FROM users').all();
      let sent = 0;
      for (const user of users) {
        try {
          await sendSpotlightAnnouncement(user.email, painting, painting.artist_name, null);
          sent++;
        } catch (e) {
          console.error(`[SPOTLIGHT] Failed to email ${user.email}:`, e.message);
        }
      }
      console.log(`[SPOTLIGHT] Announcement sent to ${sent}/${users.length} users.`);

      // Auto-post to Instagram
      try {
        const domain = process.env.DOMAIN || 'https://thebrushcollective.com';
        const imageUrl = domain + painting.image_path;
        const caption = buildSpotlightCaption(painting, painting.artist_name, null);
        const postId = await postToInstagram(imageUrl, caption);
        if (postId) console.log(`[SPOTLIGHT] Instagram auto-post published: ${postId}`);
      } catch (igErr) {
        console.error('[SPOTLIGHT] Instagram auto-post failed:', igErr.message);
      }

    } catch (e) {
      console.error('[SPOTLIGHT] Error:', e.message);
    }
  });

  console.log('[SPOTLIGHT] Weekly spotlight cron scheduled (Monday 9:00 AM UTC)');
}

module.exports = { startSpotlightCron };
