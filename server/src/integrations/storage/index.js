import { env } from '../../config/env.js';
import { cloudflareStorage } from './cloudflare.js';
import { localDiskStorage } from './local.js';

export { signUploadToken, verifyUploadToken } from './upload-token.js';

export const storage = env.STORAGE_DRIVER === 'cloudflare' ? cloudflareStorage : localDiskStorage;

/** Photo URL for whichever driver stored it (photos can outlive a driver change). */
export function photoUrl(photo) {
  if (!photo?.imageId) return null;
  return (photo.storage === 'cloudflare' ? cloudflareStorage : localDiskStorage).photoUrl(photo.imageId);
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
