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

  const buffer = mongoImage.data instanceof Buffer
    ? mongoImage.data
    : Buffer.from(mongoImage.data);

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
