'use strict';

/**
 * Converts a multer file object (req.file) into the MongoDB BinData shape.
 *
 * Schema convention: { data: Buffer, content_type: String }
 *
 * @param {Express.Multer.File} file - multer file from memoryStorage
 * @returns {{ data: Buffer, content_type: string } | null}
 */
function toMongoImage(file) {
  if (!file) return null;
  return {
    data: file.buffer,
    content_type: file.mimetype,
  };
}

/**
 * Converts a MongoDB image document into a base64 data URI for API responses.
 * This lets the frontend display the image directly without a separate endpoint.
 *
 * @param {{ data: Buffer, content_type: string } | null} mongoImage
 * @returns {string | null} Base64 data URI e.g. "data:image/jpeg;base64,..."
 */
function toDataUri(mongoImage) {
  if (!mongoImage || !mongoImage.data) return null;

  const raw = mongoImage.data;
  let buffer;

  try {
    if (Buffer.isBuffer(raw)) {
      // Already a proper Node.js Buffer (normal Mongoose retrieval)
      buffer = raw;

    } else if (raw && raw.type === 'Buffer' && Array.isArray(raw.data)) {
      // Node.js Buffer.toJSON() format returned by .lean() queries
      // e.g. { type: 'Buffer', data: [255, 216, ...] }
      buffer = Buffer.from(raw.data);

    } else if (raw && raw._bsontype === 'Binary') {
      // BSON Binary object from MongoDB driver / lean queries
      // raw.buffer is the underlying ArrayBuffer or Buffer
      buffer = Buffer.from(raw.buffer);

    } else if (raw && raw.buffer instanceof ArrayBuffer) {
      // Uint8Array / other TypedArray
      buffer = Buffer.from(raw.buffer);

    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      // Plain object with numeric keys — Mongoose sometimes returns
      // Buffers as { '0': 255, '1': 216, ... } after toObject()
      buffer = Buffer.from(Object.values(raw));

    } else {
      // Last resort — let Buffer.from figure it out
      buffer = Buffer.from(raw);
    }
  } catch {
    return null;
  }

  if (!buffer || !buffer.length) return null;
  return `data:${mongoImage.content_type};base64,${buffer.toString('base64')}`;
}

/**
 * Strips image binary data from a plain object for lean API responses
 * where you don't want to transmit the full image.
 *
 * Replaces { data, content_type } with { content_type, has_image: true }.
 *
 * @param {{ data: Buffer, content_type: string } | null} mongoImage
 * @returns {{ content_type: string, has_image: boolean } | null}
 */
function toImageMeta(mongoImage) {
  if (!mongoImage || !mongoImage.data) return null;
  return {
    content_type: mongoImage.content_type,
    has_image: true,
  };
}

module.exports = { toMongoImage, toDataUri, toImageMeta };