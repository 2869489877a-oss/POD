export type UploadApiResult = {
  error?: string;
  original_url?: string;
  success?: boolean;
  url?: string;
};

export function getUploadedImageUrl(result: UploadApiResult | undefined): string | null {
  if (!result?.success) return null;
  return result.original_url ?? result.url ?? null;
}
