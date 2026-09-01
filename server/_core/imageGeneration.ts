/**
 * Image generation placeholder - not available in standalone mode.
 * In production you could integrate with OpenAI DALL-E or similar.
 */
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  model?: string;
  quality?: string;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  _options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  // Placeholder - not available in standalone mode
  throw new Error("Image generation is not available in standalone mode. Set OPENAI_API_KEY to enable.");
}

export type ImageModelInfo = {
  model?: string;
  id?: string;
};

export type ListImageModelsResponse = {
  models: ImageModelInfo[];
};

export async function listImageModels(): Promise<ListImageModelsResponse> {
  return { models: [] };
}
