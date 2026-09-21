const cron = require('node-cron');
const db = require('../db');
const { postToInstagram } = require('./instagram');

/**
 * Build an Instagram caption for the "New This Week" post.
 * Lists all paintings added in the last 7 days.
 */
function buildNewThisWeekCaption(paintings) {
  const currencySymbol = { USD: '$', EUR: '\u20AC', GBP: '\u00A3' };

  let caption = '\u2728 Just Added — New This Week \u2728\n\n';
  caption += 'Fresh original works have arrived at The Brush Collective:\n\n';

  paintings.forEach((p, i) => {
    const sym = currencySymbol[p.currency] || '$';
    const price = sym + (p.price_cents / 100).toFixed(2);
    caption += (i + 1) + '. \u201C' + p.title + '\u201D by ' + p.artist_name;
    if (p.style) caption += ' | ' + p.style;
    caption += ' \u2014 ' + price + '\n';
  });

  caption += '\nExplore these pieces and more in our curated gallery of original paintings from artists worldwide.\n';
  caption += '\n\uD83D\uDC49 Link in bio \u2014 thebrushcollective.com\n';
  caption += '\n#art #painting #originalart #newart #artcollector #contemporaryart #artforsale #thebrushcollective #justadded #artgallery #fineart #artistsoninstagram #buyart #newthisweek';

  return caption;
}

/**
 * Runs every Friday at 10:00 AM UTC.
 * Posts a "New This Week" carousel/image to Instagram featuring
 * the first painting added that week as the hero image.
 *
 * If no new paintings were added, it skips silently.
 */
function startNewThisWeekCron() {
  // Every Friday at 10:00 AM UTC
  cron.schedule('0 10 * * 5', async () => {
    console.log('[NEW-THIS-WEEK] Running Friday Instagram post...');

    try {
      // Get paintings added in the last 7 days
      const paintings = db.prepare(`
        SELECT p.*, u.name as artist_name
        FROM paintings p
        JOIN users u ON p.artist_id = u.id
        WHERE p.status IN ('available', 'sold')
          AND p.created_at >= date('now', '-7 days')
        ORDER BY p.created_at DESC
      `).all();

      if (!paintings.length) {
        console.log('[NEW-THIS-WEEK] No new paintings this week, skipping.');
        return;
      }

      console.log(`[NEW-THIS-WEEK] Found ${paintings.length} new painting(s) this week.`);

      // Use the first (most recent) painting's image as the post image
      const heroPainting = paintings[0];
      const domain = process.env.DOMAIN || 'https://thebrushcollective.com';
      const imageUrl = domain + heroPainting.image_path;
      const caption = buildNewThisWeekCaption(paintings);

      const postId = await postToInstagram(imageUrl, caption);
      if (postId) {
        console.log(`[NEW-THIS-WEEK] Instagram post published: ${postId}`);
      }

    } catch (e) {
      console.error('[NEW-THIS-WEEK] Error:', e.message);
    }
  });

  console.log('[NEW-THIS-WEEK] Friday Instagram post cron scheduled (Friday 10:00 AM UTC)');
}

module.exports = { startNewThisWeekCron, buildNewThisWeekCaption };
