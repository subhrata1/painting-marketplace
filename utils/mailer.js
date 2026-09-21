const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error('[MAIL] ERROR: RESEND_API_KEY is not set! All emails will fail.');
  console.error('[MAIL] Set RESEND_API_KEY in your .env file. Get your key from https://resend.com/api-keys');
}

const resend = new Resend(RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'The Brush Collective <hello@thebrushcollective.com>';
const DOMAIN = process.env.DOMAIN || 'http://localhost:3000';
const SITE_NAME = 'The Brush Collective';

// Verify Resend connection on startup
if (RESEND_API_KEY) {
  resend.emails.send({
    from: FROM,
    to: 'delivered@resend.dev',
    subject: 'Startup check',
    text: 'ok',
  }).then(() => console.log('[MAIL] Resend connected OK — emails will be sent from:', FROM))
    .catch(e => console.error('[MAIL] Resend connection check FAILED:', e.message, '— check API key and domain verification'));
}

/**
 * Send welcome email to a newly registered artist.
 */
async function sendWelcomeEmail(email, name) {
  const dashboardUrl = `${DOMAIN}/dashboard.html`;
  const uploadUrl = `${DOMAIN}/upload.html`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.7;">
      <h1 style="font-size: 26px; margin-bottom: 20px;">Welcome to ${SITE_NAME}, ${name}!</h1>
      <p>You've just joined a curated community where every brushstroke finds its buyer. Your first painting is already live in our gallery!</p>
      <h3 style="font-size: 18px; margin-top: 28px;">Here's what to do next:</h3>
      <table style="margin: 16px 0 24px 0; font-size: 15px;">
        <tr><td style="padding: 6px 12px 6px 0; vertical-align: top; font-weight: bold;">1.</td><td style="padding: 6px 0;"><strong>Upload more paintings</strong> — the more you list, the more buyers you reach</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; vertical-align: top; font-weight: bold;">2.</td><td style="padding: 6px 0;"><strong>Connect Stripe</strong> to receive direct payouts (80% of every sale)</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; vertical-align: top; font-weight: bold;">3.</td><td style="padding: 6px 0;"><strong>Share your profile</strong> — send collectors to your artist page</td></tr>
      </table>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${uploadUrl}" style="background: #1a1a1a; color: #fff; padding: 16px 32px; text-decoration: none; font-size: 16px; border-radius: 4px;">
          Upload More Paintings
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        Visit your <a href="${dashboardUrl}" style="color: #1a1a1a;">dashboard</a> any time to manage your listings, track sales, and update your profile.
      </p>
      <p style="margin-top: 28px;">We can't wait to see more of your work.</p>
      <p style="color: #999; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        &mdash; ${SITE_NAME}<br/>
        <em>Where every brushstroke finds its buyer</em>
      </p>
    </div>
  `;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: `Welcome to ${SITE_NAME}, ${name} — Your first painting is live!`,
    html,
  });
}

/**
 * Send 72-hour reminder to artist who hasn't uploaded any paintings.
 */
async function sendUploadReminder(email, name) {
  const uploadUrl = `${DOMAIN}/upload.html`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.7;">
      <h1 style="font-size: 26px; margin-bottom: 20px;">We're still waiting for your art, ${name}.</h1>
      <p>You joined ${SITE_NAME} 3 days ago, but we haven't seen any artwork yet.</p>
      <p style="background: #fff3f3; border-left: 4px solid #c0392b; padding: 14px 18px; margin: 24px 0; font-size: 15px;">
        <strong>Your profile will be automatically removed in 24 hours</strong> unless you upload at least one painting.
      </p>
      <p>It only takes a minute:</p>
      <ul style="margin: 12px 0 24px 0; padding-left: 20px; font-size: 15px;">
        <li style="margin-bottom: 6px;">Snap a photo of your painting</li>
        <li style="margin-bottom: 6px;">Add a title, price, and style</li>
        <li>Hit upload — done!</li>
      </ul>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${uploadUrl}" style="background: #c0392b; color: #fff; padding: 16px 32px; text-decoration: none; font-size: 16px; border-radius: 4px;">
          Upload Now
        </a>
      </p>
      <p style="margin-top: 28px;">We'd hate to see you go. Your art deserves to be seen.</p>
      <p style="color: #999; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        &mdash; ${SITE_NAME}
      </p>
    </div>
  `;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: `${name}, your art is missing — 24 hours before your profile is removed`,
    html,
  });
}

/**
 * Send deletion notice to artist whose profile was auto-deleted.
 */
async function sendDeletionNotice(email, name) {
  const registerUrl = `${DOMAIN}/register.html`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.7;">
      <h1 style="font-size: 26px; margin-bottom: 20px;">Your profile has been removed, ${name}.</h1>
      <p>Since no artwork was uploaded within the required timeframe, your artist profile on ${SITE_NAME} has been automatically removed.</p>
      <p>Changed your mind? You're welcome to sign up again and upload your art — we'd love to have you back.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${registerUrl}" style="background: #1a1a1a; color: #fff; padding: 16px 32px; text-decoration: none; font-size: 16px; border-radius: 4px;">
          Sign Up Again
        </a>
      </p>
      <p style="color: #999; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        &mdash; ${SITE_NAME}
      </p>
    </div>
  `;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your ${SITE_NAME} profile has been removed`,
    html,
  });
}

/**
 * Notify admin when a new artist joins.
 */
async function sendAdminNewArtistNotice(artistEmail, artistName) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 24px;">New Artist Joined!</h1>
      <p><strong>${artistName}</strong> (${artistEmail}) just signed up as an artist on ${SITE_NAME}.</p>
      <p>They uploaded their first painting during registration — it's now live in the gallery.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${DOMAIN}/admin.html" style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; font-size: 16px;">
          View Admin Panel
        </a>
      </p>
      <p style="color: #999; font-size: 12px;">&mdash; ${SITE_NAME}</p>
    </div>
  `;

  return resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `New artist joined: ${artistName} (first painting uploaded)`,
    html,
  });
}

/**
 * Send weekly Spotlight of the Week announcement to all users.
 */
async function sendSpotlightAnnouncement(toEmail, painting, artistName, message) {
  const paintingUrl = `${DOMAIN}/painting.html?id=${painting.id}`;
  const price = (painting.price_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const currencySymbol = { USD: '$', EUR: '\u20AC', GBP: '\u00A3' }[painting.currency] || '$';

  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.7;">
      <div style="text-align: center; padding: 20px 0 10px;">
        <span style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #c9a96e;">Spotlight of the Week</span>
      </div>
      <h1 style="font-size: 28px; text-align: center; margin-bottom: 6px;">${painting.title}</h1>
      <p style="text-align: center; color: #666; font-size: 15px; margin-top: 0;">by ${artistName}</p>
      <div style="text-align: center; margin: 24px 0;">
        <img src="${DOMAIN}${painting.image_path}" alt="${painting.title}" style="max-width: 100%; border-radius: 8px; border: 1px solid #eee;" />
      </div>
      ${message ? `<p style="font-style: italic; color: #444; text-align: center; font-size: 15px;">"${message}"</p>` : ''}
      <table style="margin: 20px auto; font-size: 14px; color: #555;">
        ${painting.style ? `<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Style</td><td>${painting.style}</td></tr>` : ''}
        ${painting.medium ? `<tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Medium</td><td>${painting.medium}</td></tr>` : ''}
        <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Price</td><td>${currencySymbol}${price}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Status</td><td>${painting.status === 'available' ? 'Available' : 'Sold'}</td></tr>
      </table>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${paintingUrl}" style="background: #1a1a1a; color: #fff; padding: 16px 32px; text-decoration: none; font-size: 16px; border-radius: 4px;">
          View This Painting
        </a>
      </p>
      <p style="color: #999; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
        &mdash; ${SITE_NAME}<br/>
        <em>Where every brushstroke finds its buyer</em>
      </p>
    </div>
  `;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Spotlight of the Week: ${painting.title} by ${artistName}`,
    html,
  });
}

module.exports = { sendWelcomeEmail, sendUploadReminder, sendDeletionNotice, sendAdminNewArtistNotice, sendSpotlightAnnouncement };
