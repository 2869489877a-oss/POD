export type RgbColor = {
  b: number;
  g: number;
  r: number;
};

export type HsvColor = {
  h: number;
  s: number;
  v: number;
};

export type ProcessingBBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type LoadedImagePixels = {
  channels: 4;
  data: Buffer;
  height: number;
  width: number;
};

export type MaskStats = {
  ratio: number;
  total: number;
  zero: number;
  nonZero: number;
};

export type MaskCombineMode = "and" | "or" | "xor" | "subtract";

export type ConnectedComponent = {
  area: number;
  bbox: ProcessingBBox;
  id: number;
};

export type CutoutMode =
  | "auto_background"
  | "white_background"
  | "black_background"
  | "solid_background"
  | "edge_flood_fill";

export type PrintExtractionMode =
  | "auto"
  | "light_garment"
  | "dark_garment"
  | "high_contrast"
  | "manual_rect";

export type CutoutImageOptions = {
  cropToContent?: boolean;
  featherRadius?: number;
  maxSize?: number;
  padding?: number;
  tolerance?: number;
};

export type CutoutImageInput = {
  imageUrl: string;
  mode: CutoutMode;
  options?: CutoutImageOptions;
};

export type CutoutImageResult = {
  bbox: ProcessingBBox;
  cutoutPng: Buffer;
  height: number;
  maskPng: Buffer;
  metrics: Record<string, unknown>;
  previewJpg: Buffer;
  width: number;
};

export type PrintExtractionOptions = {
  featherRadius?: number;
  maxSize?: number;
  minComponentArea?: number;
  padding?: number;
  preserveBlackInk?: boolean;
  preserveWhiteInk?: boolean;
};

export type PrintExtractionInput = {
  imageUrl: string;
  manualRect?: ProcessingBBox;
  mode: PrintExtractionMode;
  options?: PrintExtractionOptions;
};

export type PrintExtractionResult = {
  bbox: ProcessingBBox;
  finalPng: Buffer;
  height: number;
  maskPng: Buffer;
  metrics: Record<string, unknown>;
  previewJpg: Buffer;
  rawPng: Buffer;
  width: number;
};
