export const fissionEffects = {
  flip_horizontal: {
    category: "quick",
    description: "整张图左右翻转，适合快速生成反向构图。",
    descriptionEn: "Mirrors the whole image horizontally for a quick opposite-facing variant.",
    label: "左右镜像",
    labelEn: "Horizontal Flip",
  },
  flip_vertical: {
    category: "quick",
    description: "整张图上下翻转，适合做倒影、对称或特殊构图。",
    descriptionEn: "Flips the whole image vertically for reflection or symmetric layouts.",
    label: "上下镜像",
    labelEn: "Vertical Flip",
  },
  rotate_canvas: {
    category: "quick",
    description: "在画布中旋转素材，透明底会保留透明通道。",
    descriptionEn: "Rotates the artwork inside the output canvas while preserving transparency.",
    label: "旋转变体",
    labelEn: "Rotate Variant",
  },
  scale_center: {
    category: "quick",
    description: "按中心缩放素材，适合快速做放大、缩小和留白版本。",
    descriptionEn: "Scales the artwork from the center to create enlarged or padded variants.",
    label: "缩放变体",
    labelEn: "Scale Variant",
  },
  background_fill: {
    category: "quick",
    description: "保持主体居中，快速换透明、白色、黑色或浅色底。",
    descriptionEn: "Centers the source and changes the background color.",
    label: "换底色",
    labelEn: "Background Fill",
  },
  tile_repeat: {
    category: "quick",
    description: "把单张素材平铺成基础满版图案。",
    descriptionEn: "Repeats the source into a simple tiled all-over pattern.",
    label: "基础平铺",
    labelEn: "Basic Tile",
  },
  mirror_grid: {
    category: "quick",
    description: "生成 2x2 镜像格，适合做机械对称图。",
    descriptionEn: "Builds a 2x2 mirrored grid for mechanical symmetry.",
    label: "镜像四宫格",
    labelEn: "Mirror Grid",
  },
  entropy_variant: {
    category: "entropy",
    description: "基于同一张图自动组合镜像、旋转、缩放和偏移，一次生成多张相似但不同的结果。",
    descriptionEn: "Combines flip, rotation, scale, and offsets to create multiple similar-but-different variants.",
    label: "多次裂变",
    labelEn: "Entropy Variants",
  },
} as const;

export type FissionEffectKey = keyof typeof fissionEffects;

export const fissionOutputSizes = {
  original: {
    height: null,
    label: "跟随原图",
    labelEn: "Original Size",
    width: null,
  },
  square_2048: {
    height: 2048,
    label: "方图 2048",
    labelEn: "Square 2048",
    width: 2048,
  },
  square_3000: {
    height: 3000,
    label: "方图 3000",
    labelEn: "Square 3000",
    width: 3000,
  },
  print_4500: {
    height: 5400,
    label: "印花 4500x5400",
    labelEn: "Print 4500x5400",
    width: 4500,
  },
  aop_5400: {
    height: 5400,
    label: "满版 5400",
    labelEn: "AOP Square 5400",
    width: 5400,
  },
} as const;

export type FissionOutputSizeKey = keyof typeof fissionOutputSizes;
export type FissionOutputFormat = "png" | "jpg";

export const fissionBackgroundOptions = {
  transparent: {
    color: "transparent",
    label: "透明",
    labelEn: "Transparent",
  },
  white: {
    color: "#ffffff",
    label: "白色",
    labelEn: "White",
  },
  black: {
    color: "#000000",
    label: "黑色",
    labelEn: "Black",
  },
  ivory: {
    color: "#f4ead4",
    label: "米色",
    labelEn: "Ivory",
  },
  charcoal: {
    color: "#1f2933",
    label: "炭灰",
    labelEn: "Charcoal",
  },
} as const;

export type FissionBackgroundKey = keyof typeof fissionBackgroundOptions;

export const fissionVariantCounts = {
  one: {
    label: "生成 1 张",
    labelEn: "1 output",
    value: 1,
  },
  four: {
    label: "生成 4 张",
    labelEn: "4 outputs",
    value: 4,
  },
  nine: {
    label: "生成 9 张",
    labelEn: "9 outputs",
    value: 9,
  },
} as const;

export type FissionVariantCountKey = keyof typeof fissionVariantCounts;

export const fissionPresets = {
  quick_flip: {
    backgroundKey: "transparent",
    effectKey: "flip_horizontal",
    format: "png",
    label: "反向构图",
    labelEn: "Opposite Direction",
    outputSize: "original",
    rotation: 0,
    spacing: 0,
    strength: 70,
    variantCount: 1,
  },
  quick_rotate: {
    backgroundKey: "transparent",
    effectKey: "rotate_canvas",
    format: "png",
    label: "轻微旋转",
    labelEn: "Soft Rotation",
    outputSize: "original",
    rotation: 12,
    spacing: 0,
    strength: 70,
    variantCount: 1,
  },
  quick_scale: {
    backgroundKey: "transparent",
    effectKey: "scale_center",
    format: "png",
    label: "缩放留白",
    labelEn: "Scale Padding",
    outputSize: "original",
    rotation: 0,
    spacing: 0,
    strength: 58,
    variantCount: 1,
  },
  quick_background: {
    backgroundKey: "white",
    effectKey: "background_fill",
    format: "jpg",
    label: "白底版本",
    labelEn: "White Background",
    outputSize: "original",
    rotation: 0,
    spacing: 0,
    strength: 72,
    variantCount: 1,
  },
  quick_tile: {
    backgroundKey: "transparent",
    effectKey: "tile_repeat",
    format: "png",
    label: "基础满版",
    labelEn: "Basic AOP Tile",
    outputSize: "aop_5400",
    rotation: 0,
    spacing: 10,
    strength: 62,
    variantCount: 1,
  },
  entropy_nine: {
    backgroundKey: "transparent",
    effectKey: "entropy_variant",
    format: "png",
    label: "一图九裂变",
    labelEn: "One to Nine",
    outputSize: "original",
    rotation: 18,
    spacing: 10,
    strength: 72,
    variantCount: 9,
  },
} as const satisfies Record<
  string,
  {
    backgroundKey: FissionBackgroundKey;
    effectKey: FissionEffectKey;
    format: FissionOutputFormat;
    label: string;
    labelEn: string;
    outputSize: FissionOutputSizeKey;
    rotation: number;
    spacing: number;
    strength: number;
    variantCount: number;
  }
>;

export type FissionPresetKey = keyof typeof fissionPresets;

export function getFissionEffect(value: unknown) {
  return typeof value === "string" && value in fissionEffects
    ? fissionEffects[value as FissionEffectKey]
    : null;
}

export function getFissionOutputSize(value: unknown) {
  return typeof value === "string" && value in fissionOutputSizes
    ? fissionOutputSizes[value as FissionOutputSizeKey]
    : null;
}

export function normalizeFissionStrength(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 70;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function normalizeFissionSpacing(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 12;
  return Math.max(0, Math.min(80, Math.round(numeric)));
}

export function normalizeFissionRotation(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-180, Math.min(180, Math.round(numeric)));
}

export function normalizeFissionVariantCount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(9, Math.round(numeric)));
}

export function getFissionBackground(value: unknown) {
  return typeof value === "string" && value in fissionBackgroundOptions
    ? fissionBackgroundOptions[value as FissionBackgroundKey]
    : fissionBackgroundOptions.transparent;
}

export function normalizeFissionOutputFormat(value: unknown): FissionOutputFormat {
  return value === "jpg" || value === "jpeg" ? "jpg" : "png";
}
