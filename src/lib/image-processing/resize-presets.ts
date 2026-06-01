export type ResizePresetKey = "tshirt-print" | "square-product";

export type ResizePreset = {
  background: "transparent" | "white";
  description: string;
  extension: "png" | "jpg";
  format: "png" | "jpeg";
  height: number;
  key: ResizePresetKey;
  label: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
};

export const resizePresets: Record<ResizePresetKey, ResizePreset> = {
  "square-product": {
    background: "white",
    description: "2000 x 2000 JPG，白色背景，居中",
    extension: "jpg",
    format: "jpeg",
    height: 2000,
    key: "square-product",
    label: "方形商品图",
    mimeType: "image/jpeg",
    width: 2000,
  },
  "tshirt-print": {
    background: "transparent",
    description: "4500 x 5400 PNG，透明背景，居中",
    extension: "png",
    format: "png",
    height: 5400,
    key: "tshirt-print",
    label: "T恤印花",
    mimeType: "image/png",
    width: 4500,
  },
};

export function getResizePreset(value: unknown) {
  if (value === "tshirt-print" || value === "square-product") {
    return resizePresets[value];
  }

  return null;
}
