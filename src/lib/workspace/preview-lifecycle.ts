/** Focus/visibility changes alone must never restart a healthy Vivari server. */
export function canReuseLivePreview({ previewUrl, hasProcess, filesystemHealthy }: {
  previewUrl: string | null;
  hasProcess: boolean;
  filesystemHealthy: boolean;
}): boolean {
  return !!previewUrl && hasProcess && filesystemHealthy;
}
