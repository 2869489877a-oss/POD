export type ImageProviderType = "gemini" | "openai" | "doubao" | "tongyi" | "jimeng";

export type ImageGenParams = {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  style?: string;
  referenceUrl?: string;
};

export type ImageGenResult = {
  imageBase64: string;
  mimeType: string;
};

export type ProviderConfig = {
  apiKey: string;
  baseUrl?: string | null;
  modelId: string;
};

export interface ImageProvider {
  generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult>;
}
