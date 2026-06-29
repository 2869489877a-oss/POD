export const fissionEffects = {
  echo: {
    description: "多层残影向外扩散，适合做潮牌贴纸、海报感印花。",
    descriptionEn: "Layered echo copies spread outward for poster-like POD graphics.",
    label: "残影扩散",
    labelEn: "Echo Spread",
  },
  kaleidoscope: {
    description: "中心区域镜像重组，生成更强装饰感的万花镜图案。",
    descriptionEn: "Mirrors the center into a decorative kaleidoscope pattern.",
    label: "万花镜裂变",
    labelEn: "Kaleidoscope",
  },
  mirror_grid: {
    description: "四宫格镜像复制，快速生成对称图案和方形装饰图。",
    descriptionEn: "Creates a mirrored 2x2 grid for symmetrical square designs.",
    label: "镜像四宫格",
    labelEn: "Mirror Grid",
  },
  slice_shift: {
    description: "横向切片错位，制造速度感和故障风裂变效果。",
    descriptionEn: "Offsets horizontal slices for a glitch-like fission effect.",
    label: "错位切片",
    labelEn: "Slice Shift",
  },
  tile_bloom: {
    description: "平铺缩放并旋转复制，适合把单张素材扩展为满版图案。",
    descriptionEn: "Tiles, scales, and rotates copies into an all-over pattern.",
    label: "满版平铺",
    labelEn: "Tile Bloom",
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
} as const;

export type FissionOutputSizeKey = keyof typeof fissionOutputSizes;
export type FissionOutputFormat = "png" | "jpg";

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

export function normalizeFissionOutputFormat(value: unknown): FissionOutputFormat {
  return value === "jpg" || value === "jpeg" ? "jpg" : "png";
}
