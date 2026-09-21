const GRAPH_URL = 'https://graph.facebook.com/v19.0';

/**
 * Post a photo to Instagram using the Content Publishing API.
 *
 * Requires env vars:
 *   INSTAGRAM_ACCOUNT_ID  — your Instagram Business/Creator account ID
 *   INSTAGRAM_ACCESS_TOKEN — long-lived page access token with instagram_content_publish permission
 *
 * Flow:
 *   1. Create a media container (upload image URL + caption)
 *   2. Publish the container
 *
 * The image_url must be publicly accessible (HTTPS).
 */
async function postToInstagram(imageUrl, caption) {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!accountId || !accessToken) {
    console.log('[INSTAGRAM] Skipping — INSTAGRAM_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN not set');
    return null;
  }

  // Step 1: Create media container
  const createRes = await fetch(`${GRAPH_URL}/${accountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption: caption,
      access_token: accessToken,
    }),
  });

  const createData = await createRes.json();

  if (createData.error) {
    throw new Error('Instagram container error: ' + createData.error.message);
  }

  const containerId = createData.id;
  console.log('[INSTAGRAM] Media container created:', containerId);

  // Step 2: Wait briefly for processing then publish
  await new Promise(resolve => setTimeout(resolve, 5000));

  const publishRes = await fetch(`${GRAPH_URL}/${accountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error('Instagram publish error: ' + publishData.error.message);
  }

  console.log('[INSTAGRAM] Post published! ID:', publishData.id);
  return publishData.id;
}

/**
 * Build a caption for the spotlight post.
 */
function buildSpotlightCaption(painting, artistName, message) {
  const currencySymbol = { USD: '$', EUR: '\u20AC', GBP: '\u00A3' }[painting.currency] || '$';
  const price = currencySymbol + (painting.price_cents / 100).toFixed(2);

  let caption = '\u2728 Spotlight of the Week \u2728\n\n';
  caption += '\u201C' + painting.title + '\u201D by ' + artistName + '\n';
  if (message) caption += '\n' + message + '\n';
  caption += '\n';
  if (painting.style) caption += '\uD83C\uDFA8 Style: ' + painting.style + '\n';
  if (painting.medium) caption += '\uD83D\uDD8C\uFE0F Medium: ' + painting.medium + '\n';
  caption += '\uD83D\uDCB0 Price: ' + price + '\n';
  caption += '\uD83D\uDFE2 Status: ' + (painting.status === 'available' ? 'Available' : 'Sold') + '\n';
  caption += '\nDiscover this piece and explore our curated gallery of original paintings from artists worldwide.\n';
  caption += '\n\uD83D\uDC49 Link in bio — thebrushcollective.com\n';
  caption += '\n#art #painting #originalart #artcollector #contemporaryart #artforsale #thebrushcollective #spotlightoftheweek #artgallery #fineart #artistsoninstagram #buyart';

  return caption;
}

module.exports = { postToInstagram, buildSpotlightCaption };
