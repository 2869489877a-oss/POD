export const APPROVED_COPYRIGHT_STATUSES = new Set(["owned", "commercial_ok"]);

export type AssetCopyrightGate = {
  copyright_status?: string | null;
  filename?: string | null;
  id: string;
};

export function isBlockedCopyrightStatus(status?: string | null) {
  return !APPROVED_COPYRIGHT_STATUSES.has(status ?? "");
}

export function getBlockedCopyrightAssets<T extends AssetCopyrightGate>(assets: T[]) {
  return assets.filter((asset) => isBlockedCopyrightStatus(asset.copyright_status));
}

export function buildBlockedCopyrightMessage(assets: AssetCopyrightGate[]) {
  const names = assets
    .slice(0, 3)
    .map((asset) => asset.filename || asset.id)
    .join("、");
  const suffix = assets.length > 3 ? ` 等 ${assets.length} 张素材` : names;

  return suffix
    ? `包含未确认可商用、有风险或禁用的版权素材：${suffix}。请先完成侵权检测复核后再继续。`
    : "包含未确认可商用、有风险或禁用的版权素材，请先完成侵权检测复核后再继续。";
}

export function assertAssetsPassCopyrightGate(assets: AssetCopyrightGate[]) {
  const blockedAssets = getBlockedCopyrightAssets(assets);

  if (blockedAssets.length > 0) {
    throw new Error(buildBlockedCopyrightMessage(blockedAssets));
  }
}
