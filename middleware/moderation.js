const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const fs = require('fs');

let model = null;

async function loadModel() {
  if (!model) {
    model = await nsfw.load();
    console.log('Content moderation model loaded');
  }
  return model;
}

// Load model at startup
loadModel().catch(err => console.error('Failed to load moderation model:', err.message));

/**
 * Classify an image file for inappropriate content.
 * Returns { safe: boolean, reason: string|null, scores: object }
 *
 * NSFW.js categories:
 *   - Neutral: safe content
 *   - Drawing: safe drawings/art
 *   - Sexy: suggestive but not explicit
 *   - Porn: explicit sexual content
 *   - Hentai: explicit animated content
 */
async function moderateImage(imagePath) {
  const m = await loadModel();
  const imageBuffer = fs.readFileSync(imagePath);
  const image = await tf.node.decodeImage(imageBuffer, 3);

  const predictions = await m.classify(image);
  image.dispose();

  const scores = {};
  for (const p of predictions) {
    scores[p.className] = Math.round(p.probability * 100);
  }

  // Block if Porn or Hentai score is above 60%
  const pornScore = scores['Porn'] || 0;
  const hentaiScore = scores['Hentai'] || 0;

  if (pornScore > 60) {
    return { safe: false, reason: 'Image contains explicit content and cannot be listed.', scores };
  }
  if (hentaiScore > 60) {
    return { safe: false, reason: 'Image contains explicit illustrated content and cannot be listed.', scores };
  }

  // Warn but allow if Sexy score is very high
  const sexyScore = scores['Sexy'] || 0;
  if (sexyScore > 80) {
    return { safe: false, reason: 'Image is too suggestive for this marketplace. Please upload artwork suitable for all audiences.', scores };
  }

  return { safe: true, reason: null, scores };
}

module.exports = { moderateImage };
