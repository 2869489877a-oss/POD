export const fissionEffects = {
  pattern_block: {
    category: "pattern",
    description: "标准整齐重复，适合最快生成 AOP 满版图和基础背景图。",
    descriptionEn: "Standard repeat for quick all-over prints and background fills.",
    label: "标准铺满",
    labelEn: "Block Repeat",
  },
  pattern_brick: {
    category: "pattern",
    description: "每行错开半格，减少图案接缝感，适合服装满版印花。",
    descriptionEn: "Offsets every row by half a tile to soften visible seams.",
    label: "砖墙错位",
    labelEn: "Brick Repeat",
  },
  pattern_half_drop: {
    category: "pattern",
    description: "半落差重复，生成更自然的连续图案和布料纹理。",
    descriptionEn: "Half-drop repeat for more natural continuous fabric patterns.",
    label: "半落差铺满",
    labelEn: "Half-Drop Repeat",
  },
  pattern_reflect: {
    category: "pattern",
    description: "镜像重复单元，适合做对称纹样、围巾、家居布艺和满版商品。",
    descriptionEn: "Mirrored repeat cell for symmetric apparel and home textile patterns.",
    label: "镜像铺满",
    labelEn: "Reflect Repeat",
  },
  pattern_stripe: {
    category: "pattern",
    description: "按条带节奏重复，适合把小图案扩展成壁纸式连续设计。",
    descriptionEn: "Stripe-style repeat for wallpaper-like continuous designs.",
    label: "条带铺满",
    labelEn: "Stripe Repeat",
  },
  pattern_toss: {
    category: "pattern",
    description: "随机散点式满版重复，适合 AOP 衣服、睡衣、泳装和布料花型。",
    descriptionEn: "Tossed scatter repeat for AOP apparel, pajamas, swimwear, and fabric-style prints.",
    label: "散点满版",
    labelEn: "Toss Repeat",
  },
  pattern_diagonal: {
    category: "pattern",
    description: "斜向节奏铺排，适合做运动服、街头风满版和视觉动感图案。",
    descriptionEn: "Diagonal repeat rhythm for sportswear, streetwear AOP, and motion-heavy patterns.",
    label: "斜向铺排",
    labelEn: "Diagonal Repeat",
  },
  echo: {
    category: "creative",
    description: "多层残影向外扩散，适合做潮牌贴纸、海报感印花。",
    descriptionEn: "Layered echo copies spread outward for poster-like POD graphics.",
    label: "残影扩散",
    labelEn: "Echo Spread",
  },
  kaleidoscope: {
    category: "creative",
    description: "中心区域镜像重组，生成更强装饰感的万花镜图案。",
    descriptionEn: "Mirrors the center into a decorative kaleidoscope pattern.",
    label: "万花镜裂变",
    labelEn: "Kaleidoscope",
  },
  mirror_grid: {
    category: "creative",
    description: "四宫格镜像复制，快速生成对称图案和方形装饰图。",
    descriptionEn: "Creates a mirrored 2x2 grid for symmetrical square designs.",
    label: "镜像四宫格",
    labelEn: "Mirror Grid",
  },
  slice_shift: {
    category: "creative",
    description: "横向切片错位，制造速度感和故障风裂变效果。",
    descriptionEn: "Offsets horizontal slices for a glitch-like fission effect.",
    label: "错位切片",
    labelEn: "Slice Shift",
  },
  tile_bloom: {
    category: "creative",
    description: "平铺缩放并旋转复制，适合把单张素材扩展为满版图案。",
    descriptionEn: "Tiles, scales, and rotates copies into an all-over pattern.",
    label: "满版平铺",
    labelEn: "Tile Bloom",
  },
  sticker_outline: {
    category: "creative",
    description: "给透明印花增加白色贴纸描边，适合胸前印花、贴纸包和电商主图。",
    descriptionEn: "Adds a white sticker-style outline for chest prints, sticker sheets, and listing images.",
    label: "贴纸描边",
    labelEn: "Sticker Outline",
  },
  vintage_distress: {
    category: "creative",
    description: "叠加旧化磨损纹理，适合复古 T 恤、乐队风和美式做旧印花。",
    descriptionEn: "Applies a worn distressed texture for vintage tees, band-style art, and retro prints.",
    label: "复古做旧",
    labelEn: "Vintage Distress",
  },
  halftone_pop: {
    category: "creative",
    description: "把印花转成网点半调质感，适合街头风、漫画风和复古丝网印刷效果。",
    descriptionEn: "Turns the print into a halftone dot treatment for streetwear, comic, and retro screen-print looks.",
    label: "半调网点",
    labelEn: "Halftone Pop",
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
    label: "AOP 满版 5400",
    labelEn: "AOP Square 5400",
    width: 5400,
  },
  seamless_4096: {
    height: 4096,
    label: "连续图案 4096",
    labelEn: "Seamless 4096",
    width: 4096,
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

export const fissionPresets = {
  aop_fabric: {
    backgroundKey: "transparent",
    effectKey: "pattern_half_drop",
    format: "png",
    label: "服装满版",
    labelEn: "AOP Fabric",
    outputSize: "aop_5400",
    rotation: 0,
    spacing: 10,
    strength: 72,
  },
  seamless_tile: {
    backgroundKey: "transparent",
    effectKey: "pattern_reflect",
    format: "png",
    label: "连续图案",
    labelEn: "Seamless Tile",
    outputSize: "seamless_4096",
    rotation: 0,
    spacing: 4,
    strength: 66,
  },
  toss_aop: {
    backgroundKey: "transparent",
    effectKey: "pattern_toss",
    format: "png",
    label: "散点满版",
    labelEn: "Tossed AOP",
    outputSize: "aop_5400",
    rotation: -12,
    spacing: 28,
    strength: 62,
  },
  diagonal_sportswear: {
    backgroundKey: "transparent",
    effectKey: "pattern_diagonal",
    format: "png",
    label: "运动斜纹",
    labelEn: "Diagonal Sportswear",
    outputSize: "seamless_4096",
    rotation: 12,
    spacing: 14,
    strength: 70,
  },
  sticker_sheet: {
    backgroundKey: "white",
    effectKey: "pattern_brick",
    format: "jpg",
    label: "贴纸铺版",
    labelEn: "Sticker Sheet",
    outputSize: "square_3000",
    rotation: -8,
    spacing: 24,
    strength: 54,
  },
  chest_sticker: {
    backgroundKey: "transparent",
    effectKey: "sticker_outline",
    format: "png",
    label: "胸前贴纸印花",
    labelEn: "Chest Sticker Print",
    outputSize: "print_4500",
    rotation: 0,
    spacing: 0,
    strength: 68,
  },
  vintage_tee: {
    backgroundKey: "transparent",
    effectKey: "vintage_distress",
    format: "png",
    label: "复古做旧 T 恤",
    labelEn: "Vintage Tee",
    outputSize: "print_4500",
    rotation: 0,
    spacing: 0,
    strength: 58,
  },
  halftone_street: {
    backgroundKey: "transparent",
    effectKey: "halftone_pop",
    format: "png",
    label: "街头半调",
    labelEn: "Street Halftone",
    outputSize: "print_4500",
    rotation: 0,
    spacing: 0,
    strength: 70,
  },
  poster_variant: {
    backgroundKey: "black",
    effectKey: "echo",
    format: "png",
    label: "海报变体",
    labelEn: "Poster Variant",
    outputSize: "square_2048",
    rotation: 0,
    spacing: 0,
    strength: 78,
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

export function getFissionBackground(value: unknown) {
  return typeof value === "string" && value in fissionBackgroundOptions
    ? fissionBackgroundOptions[value as FissionBackgroundKey]
    : fissionBackgroundOptions.transparent;
}

export function normalizeFissionOutputFormat(value: unknown): FissionOutputFormat {
  return value === "jpg" || value === "jpeg" ? "jpg" : "png";
}
