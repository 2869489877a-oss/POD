export type PrintArea = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type MockupScene = {
  background_url: string;
  name: string;
  need_print: boolean;
  output_height: number;
  output_width: number;
  print_area?: PrintArea;
};

function isPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validatePrintArea(value: unknown, sceneIndex: number): PrintArea {
  if (!value || typeof value !== "object") {
    throw new Error(`第 ${sceneIndex + 1} 个场景缺少 print_area`);
  }

  const printArea = value as Record<string, unknown>;

  if (
    !isNonNegativeNumber(printArea.x) ||
    !isNonNegativeNumber(printArea.y) ||
    !isPositiveNumber(printArea.width) ||
    !isPositiveNumber(printArea.height)
  ) {
    throw new Error(`第 ${sceneIndex + 1} 个场景的 print_area 坐标不合法`);
  }

  const x = printArea.x as number;
  const y = printArea.y as number;
  const width = printArea.width as number;
  const height = printArea.height as number;

  return {
    height,
    width,
    x,
    y,
  };
}

export function parseScenesJson(value: string): MockupScene[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("scenes JSON 格式不正确");
  }

  return validateScenes(parsed);
}

export function validateScenes(value: unknown): MockupScene[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("scenes 必须是非空数组");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${index + 1} 个场景不是对象`);
    }

    const scene = item as Record<string, unknown>;

    if (typeof scene.name !== "string" || scene.name.trim().length === 0) {
      throw new Error(`第 ${index + 1} 个场景缺少 name`);
    }

    if (
      typeof scene.background_url !== "string" ||
      scene.background_url.trim().length === 0
    ) {
      throw new Error(`第 ${index + 1} 个场景缺少 background_url`);
    }

    if (typeof scene.need_print !== "boolean") {
      throw new Error(`第 ${index + 1} 个场景缺少 need_print`);
    }

    if (!isPositiveNumber(scene.output_width) || !isPositiveNumber(scene.output_height)) {
      throw new Error(`第 ${index + 1} 个场景的输出尺寸不合法`);
    }

    const outputWidth = Math.round(scene.output_width as number);
    const outputHeight = Math.round(scene.output_height as number);

    if (outputWidth > 8000 || outputHeight > 8000) {
      throw new Error(`第 ${index + 1} 个场景输出尺寸不能超过 8000`);
    }

    const validatedScene: MockupScene = {
      background_url: scene.background_url.trim(),
      name: scene.name.trim(),
      need_print: scene.need_print,
      output_height: outputHeight,
      output_width: outputWidth,
    };

    if (scene.need_print) {
      validatedScene.print_area = validatePrintArea(scene.print_area, index);
    }

    return validatedScene;
  });
}

export const sampleScenes = [
  {
    name: "主图",
    background_url: "https://example.com/main.jpg",
    need_print: true,
    print_area: {
      x: 400,
      y: 300,
      width: 500,
      height: 600,
    },
    output_width: 2000,
    output_height: 2000,
  },
  {
    name: "尺码图",
    background_url: "https://example.com/size.jpg",
    need_print: false,
    output_width: 2000,
    output_height: 2000,
  },
];
