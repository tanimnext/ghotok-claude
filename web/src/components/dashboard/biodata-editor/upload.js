import { uploadFile } from '@/lib/api/client';

export const MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Returns a dictionary key describing why a file cannot be uploaded, or null. */
export function fileProblem(file) {
  if (!IMAGE_TYPES.includes(file.type)) return 'editor.fileType';
  if (file.size > MAX_BYTES) return 'editor.fileTooBig';
  return null;
}

/** Asks the API for an upload target, uploads the file to it and returns the ticket. */
export async function uploadWithTicket(getTarget, file) {
  const target = await getTarget();
  await uploadFile(target, file);
  return target.ticket;
}
