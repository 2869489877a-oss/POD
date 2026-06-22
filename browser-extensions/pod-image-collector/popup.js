/* global chrome */

const DEFAULT_TARGET = 100;
const MAX_TARGET = 2000;
const TEMU_MAX_ROUNDS = 45;
const TEMU_STALE_ROUNDS = 6;
const GENERIC_MAX_ROUNDS = 70;
const GENERIC_STALE_ROUNDS = 8;
const PINTEREST_MAX_ROUNDS = 80;
const PINTEREST_STALE_ROUNDS = 8;
const SHEIN_MAX_ROUNDS = 60;
const SHEIN_STALE_ROUNDS = 5;
const SHEIN_PAGE_SCAN_STEPS = 16;
const SHEIN_CANDIDATES_PER_CARD = 2;
const SHEIN_OUTPUT_IMAGES_PER_CARD = 1;
const DOWNLOAD_DELAY_MS = 250;
const IMAGE_SETTLE_DELAY_MS = 3000;
const LEGACY_ROOT_FOLDER_NAME = "杨文韬文件";
const SERVER_UPLOAD_BASE_URL = "http://8.209.98.115:3000";
const SERVER_UPLOAD_ENDPOINT = "/api/collector-library";
const AUTO_FOLDER_NAMES = new Set(["", "auto", "generic", "pinterest", "shein", "temu"]);
const OLD_OSS_FOLDER_NAMES = new Set(["generic", "pinterest", "shein", "shein/tops", "temu", "temu/shirts"]);
const SITE_TYPE_LABELS = {
  auto: "自动",
  generic: "通用",
  pinterest: "Pinterest",
  shein: "SHEIN",
  temu: "Temu",
};

const state = {
  images: [],
  pageUrl: "",
  selected: new Set(),
  siteType: "generic",
};

const clearButton = document.getElementById("clearButton");
const countText = document.getElementById("countText");
const downloadButton = document.getElementById("downloadButton");
const folderInput = document.getElementById("folderInput");
const genericAutoButton = document.getElementById("genericAutoButton");
const genericModule = document.getElementById("genericModule");
const imageList = document.getElementById("imageList");
const ossFolderInput = document.getElementById("ossFolderInput");
const ossUploadButton = document.getElementById("ossUploadButton");
const pageText = document.getElementById("pageText");
const scanButton = document.getElementById("scanButton");
const scheduleCountInput = document.getElementById("scheduleCountInput");
const scheduleIntervalDaysInput = document.getElementById("scheduleIntervalDaysInput");
const scheduleIntervalHoursInput = document.getElementById("scheduleIntervalHoursInput");
const scheduleIntervalMinutesInput = document.getElementById("scheduleIntervalMinutesInput");
const scheduleRunNowButton = document.getElementById("scheduleRunNowButton");
const scheduleSiteInput = document.getElementById("scheduleSiteInput");
const scheduleStartButton = document.getElementById("scheduleStartButton");
const scheduleStatusText = document.getElementById("scheduleStatusText");
const scheduleStopButton = document.getElementById("scheduleStopButton");
const scheduleUrlInput = document.getElementById("scheduleUrlInput");
const selectAllButton = document.getElementById("selectAllButton");
const selectedText = document.getElementById("selectedText");
const siteTypeText = document.getElementById("siteTypeText");
const statusText = document.getElementById("statusText");
const targetInput = document.getElementById("targetInput");
const pinterestAutoButton = document.getElementById("pinterestAutoButton");
const pinterestModule = document.getElementById("pinterestModule");
const sheinAutoButton = document.getElementById("sheinAutoButton");
const sheinModule = document.getElementById("sheinModule");
const temuAutoButton = document.getElementById("temuAutoButton");
const temuModule = document.getElementById("temuModule");

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function beijingDateFolderName(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "numeric",
    timeZone: "Asia/Shanghai",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "1";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return `${Number(month)}-${day}`;
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        reject(new Error("无法读取当前标签页。"));
        return;
      }

      resolve(tab);
    });
  });
}

function executeInTab(tabId, func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        args,
        func,
        target: { tabId },
      },
      (frames) => {
        const error = chrome.runtime.lastError;

        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(frames?.[0]?.result);
      },
    );
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getTargetCount() {
  const parsed = Number(targetInput.value || DEFAULT_TARGET);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TARGET;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TARGET);
}

function getScheduledCount() {
  const parsed = Number(scheduleCountInput.value || DEFAULT_TARGET);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TARGET;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TARGET);
}

function getScheduleIntervalMinutes() {
  const days = Number(scheduleIntervalDaysInput.value || 0);
  const hours = Number(scheduleIntervalHoursInput.value || 0);
  const minutes = Number(scheduleIntervalMinutesInput.value || 0);
  const parsed =
    Math.max(Number.isFinite(days) ? Math.trunc(days) : 0, 0) * 24 * 60 +
    Math.max(Number.isFinite(hours) ? Math.trunc(hours) : 0, 0) * 60 +
    Math.max(Number.isFinite(minutes) ? Math.trunc(minutes) : 0, 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60;
  }

  return Math.min(Math.max(Math.trunc(parsed), 5), 43200);
}

function intervalPartsFromMinutes(totalMinutes) {
  const normalized = Math.min(Math.max(Math.trunc(Number(totalMinutes) || 60), 5), 43200);
  const days = Math.floor(normalized / 1440);
  const remainderAfterDays = normalized % 1440;
  const hours = Math.floor(remainderAfterDays / 60);
  const minutes = remainderAfterDays % 60;

  return { days, hours, minutes };
}

function setScheduleIntervalInputs(totalMinutes) {
  const parts = intervalPartsFromMinutes(totalMinutes);
  scheduleIntervalDaysInput.value = String(parts.days);
  scheduleIntervalHoursInput.value = String(parts.hours);
  scheduleIntervalMinutesInput.value = String(parts.minutes);
}

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status ${type}`.trim();
}

function setBusy(isBusy) {
  scanButton.disabled = isBusy;
  selectAllButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  genericAutoButton.disabled = isBusy;
  pinterestAutoButton.disabled = isBusy;
  sheinAutoButton.disabled = isBusy;
  temuAutoButton.disabled = isBusy;
  scheduleRunNowButton.disabled = isBusy;
  scheduleStartButton.disabled = isBusy;
  scheduleStopButton.disabled = isBusy;
  downloadButton.disabled = isBusy || state.selected.size === 0;
  ossUploadButton.disabled = isBusy || state.selected.size === 0;
}

function sanitizePathSegment(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

function sanitizeFolderPath(value, fallback) {
  const parts = String(value || "")
    .split(/[\\/]+/g)
    .map((part) => sanitizePathSegment(part, ""))
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..");

  return parts.length > 0 ? parts.join("/") : fallback;
}

function sanitizeOssFolderPath(value, fallback) {
  const parts = String(value || "")
    .normalize("NFKC")
    .split(/[\\/]+/g)
    .map((part) =>
      part
        .trim()
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/^\.+|\.+$/g, "")
        .replace(/-+/g, "-")
        .slice(0, 120),
    )
    .filter(Boolean)
    .filter((part) => part !== "." && part !== ".." && part !== LEGACY_ROOT_FOLDER_NAME);

  return parts.length > 0 ? parts.join("/") : fallback;
}

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const rawName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    const filename = sanitizePathSegment(rawName, "image.jpg");
    const format = parsed.searchParams.get("format") || parsed.searchParams.get("fm") || parsed.searchParams.get("type");
    const extension = String(format || "").toLowerCase().match(/^(avif|jpe?g|png|webp)$/)?.[1] || "jpg";

    if (/\.(avif|jpe?g|png|webp)$/i.test(filename)) {
      return filename;
    }

    return `${filename.replace(/\.+$/g, "") || "image"}.${extension.replace("jpeg", "jpg")}`;
  } catch {
    return "image.jpg";
  }
}

function jpegFilenameFromUrl(url) {
  return filenameFromUrl(url).replace(/\.(avif|jpe?g|png|webp)$/i, "") + ".jpg";
}

async function blobToJpegBlob(blob) {
  const image = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    image.close();
    throw new Error("当前浏览器无法转换 JPG 图片。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  image.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (jpegBlob) => {
        if (jpegBlob) {
          resolve(jpegBlob);
          return;
        }

        reject(new Error("图片转换为 JPG 失败。"));
      },
      "image/jpeg",
      0.95,
    );
  });
}

function detectSiteTypeFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();

    if (host.includes("temu.com")) {
      return "temu";
    }

    if (host.includes("shein.")) {
      return "shein";
    }

    if (host.includes("pinterest.") || host === "pin.it") {
      return "pinterest";
    }
  } catch {
    return "generic";
  }

  return "generic";
}

function siteTypeLabel(siteType) {
  return SITE_TYPE_LABELS[siteType] || siteType || "通用";
}

function updateSiteType(siteType) {
  state.siteType = siteType || "generic";
  siteTypeText.textContent = siteTypeLabel(state.siteType);
  genericModule.hidden = state.siteType !== "generic";
  pinterestModule.hidden = state.siteType !== "pinterest";
  sheinModule.hidden = state.siteType !== "shein";
  temuModule.hidden = state.siteType !== "temu";
}

function shouldAutoSetFolder(value) {
  return AUTO_FOLDER_NAMES.has(String(value || "").trim().toLowerCase());
}

function isSheinAssetHost(hostname) {
  return /(^|\.)(ltwebstatic|shein)\.(com|net)$/i.test(hostname);
}

function sheinImagePrefixFromPath(pathname) {
  const rawFilename = pathname.split("/").filter(Boolean).pop() || "";
  let filename = rawFilename;

  try {
    filename = decodeURIComponent(rawFilename);
  } catch {
    filename = rawFilename;
  }

  const match = filename.match(/^([a-z0-9]{20,})(?=[._-])/i);
  return match?.[1]?.toLowerCase() || "";
}

function canonicalSheinDedupeKey(parsed) {
  if (!isSheinAssetHost(parsed.hostname)) {
    return "";
  }

  const prefix = sheinImagePrefixFromPath(parsed.pathname);
  return prefix ? `shein-image:${prefix}` : "";
}

function isPinterestAssetHost(hostname) {
  return /(^|\.)pinimg\.com$/i.test(hostname);
}

function pinterestImageIdFromPath(pathname) {
  const rawFilename = pathname.split("/").filter(Boolean).pop() || "";
  let filename = rawFilename;

  try {
    filename = decodeURIComponent(rawFilename);
  } catch {
    filename = rawFilename;
  }

  // Pinterest 的文件名就是图片内容 hash，同一张图的所有尺寸（236x/474x/736x/originals…）
  // 共用同一个 hash，所以用 hash 去重即可保证“每张图只留一张”。
  const hashMatch = filename.match(/^[a-f0-9]{16,}/i);
  if (hashMatch) {
    return hashMatch[0].toLowerCase();
  }

  return filename
    .replace(/\.(avif|jpe?g|png|webp|gif)$/i, "")
    .replace(/_\d+x\d*(?:_rs)?$/i, "")
    .toLowerCase();
}

function canonicalPinterestDedupeKey(parsed) {
  if (!isPinterestAssetHost(parsed.hostname)) {
    return "";
  }

  const id = pinterestImageIdFromPath(parsed.pathname);
  return id ? `pinterest-image:${id}` : "";
}

function dedupeKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const isSheinAsset = isSheinAssetHost(parsed.hostname);
    const sheinKey = canonicalSheinDedupeKey(parsed);

    if (sheinKey) {
      return sheinKey;
    }

    const pinterestKey = canonicalPinterestDedupeKey(parsed);

    if (pinterestKey) {
      return pinterestKey;
    }

    for (const key of Array.from(parsed.searchParams.keys())) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.startsWith("utm_") ||
        lowerKey === "spm" ||
        lowerKey === "refer_page" ||
        lowerKey === "refer_page_name" ||
        (isSheinAsset &&
          [
            "crop",
            "format",
            "height",
            "h",
            "quality",
            "qlt",
            "resize",
            "thumbnail",
            "width",
            "w",
          ].includes(lowerKey))
      ) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return url;
  }
}

function updateSummary() {
  countText.textContent = state.images.length > 0 ? `发现 ${state.images.length} 张` : "未发现图片";
  selectedText.textContent = `已选 ${state.selected.size} 张`;
  downloadButton.disabled = state.selected.size === 0;
  ossUploadButton.disabled = state.selected.size === 0;
  selectAllButton.textContent =
    state.images.length > 0 && state.selected.size === state.images.length ? "取消全选" : "全选";
}

function renderImages() {
  imageList.textContent = "";

  if (state.images.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "点击“扫描当前页”或对应网站的自动采集后，这里会显示商品图片。";
    imageList.append(empty);
    updateSummary();
    return;
  }

  for (const image of state.images) {
    const item = document.createElement("label");
    item.className = "imageItem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(image.url);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selected.add(image.url);
      } else {
        state.selected.delete(image.url);
      }

      updateSummary();
    });

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    thumb.src = image.url;

    const meta = document.createElement("div");
    meta.className = "imageMeta";

    const title = document.createElement("strong");
    title.textContent = filenameFromUrl(image.url);
    title.title = image.url;

    const source = document.createElement("span");
    source.textContent = `${image.reason || "页面"} · ${siteTypeLabel(image.siteType || state.siteType)} · 优先级 ${
      image.priority
    }`;

    meta.append(title, source);
    item.append(checkbox, thumb, meta);
    imageList.append(item);
  }

  updateSummary();
}

function replaceImages(images, targetCount) {
  state.images = [];
  state.selected.clear();
  mergeImages(images, targetCount);
}

function mergeImages(images, targetCount) {
  const existing = new Set(state.images.map((image) => dedupeKey(image.url)));
  let added = 0;

  for (const image of Array.isArray(images) ? images : []) {
    if (!image?.url || state.images.length >= targetCount) {
      continue;
    }

    const key = dedupeKey(image.url);
    if (existing.has(key)) {
      continue;
    }

    existing.add(key);
    state.images.push({
      priority: Number(image.priority || 0),
      reason: String(image.reason || "page"),
      siteType: String(image.siteType || state.siteType || "generic"),
      url: image.url,
    });
    state.selected.add(image.url);
    added += 1;
  }

  return added;
}

function clearImages() {
  state.images = [];
  state.selected.clear();
  renderImages();
  setStatus("");
}

function collectProductImagesFromPage(limit) {
  const imageExtensionPattern = /\.(avif|jpe?g|png|webp)(?:$|[?#])/i;
  const imageQueryPattern = /[?&](format|fm|output|type)=(avif|jpe?g|png|webp)\b/i;
  const kwcdnHostPattern = /(^|\.)kwcdn\.com$/i;
  const sheinImageHostPattern = /(^|\.)(ltwebstatic|shein)\.(com|net)$/i;
  const pinterestImageHostPattern = /(^|\.)pinimg\.com$/i;
  const siteChromePattern =
    /(account|app|avatar|cart|coupon|download|facebook_share|filter|footer|header|icon|logo|nav|navbar|payment|privacy|search|shipping|sprite|toolbar|user|wallet)/i;
  const productContextPattern =
    /(card|goods|gallery|item|main|photo|picture|pin|product|product-card|productitem|sku|tile)/i;
  const smallAssetPattern =
    /(avatar|favicon|facebook_share|icon|logo|placeholder|sprite|transparent|empty|app-logo|pinterest-logo|shein-logo|temu-app)/i;
  const sheinNoisePattern =
    /(adservice|advert|banner|badge|coupon|delivery|discount|dostawa|express|free-shipping|icon|label|logo|mall|magazyn|overlay|promo|promotion|quickship|rating|seller|service|shipping|star|store|tag|trendy|truck|warehouse|wplay|zaoszcz|oszcz)/i;
  const sheinProductImageUrlPattern =
    /\/(?:images\d+_(?:pi|spmp|mp|si|smp|sku)|v\d+\/[a-z0-9]+\/(?:pi|spmp|mp|si|smp|sku))\//i;
  const sheinImageBucketPattern =
    /\/(?:images\d+_[a-z0-9]+|v\d+\/[a-z0-9]+\/[a-z0-9]+)\/[^"'<>\\\s]+?(?:\.(?:avif|jpe?g|png|webp))?(?:[?#][^"'<>\\\s]*)?/i;
  const temuProductUrlPattern =
    /(\bgoods_id=|\bproduct_id=|\bitem_id=|\/goods(?:\.html)?(?:$|[/?#])|\/product(?:s)?(?:\/|\.html|$)|\/item(?:\/|\.html|$)|\/p\/|-g-\d+|\/g-\d+)/i;
  const sheinProductUrlPattern = /(\bproduct_id=|\bgoods_id=|\/product\/|\/[^/?#]+-p-\d+(?:-[^/?#]+)?\.html)/i;
  const pinterestPinUrlPattern = /\/pin\/\d+/i;
  const kwcdnTextPatterns = [
    /https?:\/\/(?:aimg|img|static)\.kwcdn\.com\/[^"'<>\\\s]+/gi,
    /https?:\/\/[^"'<>\\\s]+kwcdn\.com\/[^"'<>\\\s]+?\.(?:avif|jpe?g|png|webp)(?:[?#][^"'<>\\\s]*)?/gi,
  ];
  const host = location.hostname.toLowerCase();
  const pathAndSearch = `${location.pathname}${location.search}`;
  const siteType = host.includes("temu.com")
    ? "temu"
    : host.includes("shein.")
      ? "shein"
      : host.includes("pinterest.") || host === "pin.it"
        ? "pinterest"
        : "generic";
  const isTemuProductPage = siteType === "temu" && temuProductUrlPattern.test(pathAndSearch);
  const isSheinProductPage = siteType === "shein" && sheinProductUrlPattern.test(pathAndSearch);
  const isPinterestPinPage = siteType === "pinterest" && pinterestPinUrlPattern.test(pathAndSearch);
  const isPinterestPage = siteType === "pinterest";
  const allowDocumentLevelImages =
    siteType === "generic" || isTemuProductPage || isSheinProductPage || isPinterestPinPage;
  const candidates = [];

  const sheinPrimaryResult = siteType === "shein" ? collectSheinMainImages(limit) : null;

  if (sheinPrimaryResult?.images?.length > 0) {
    return sheinPrimaryResult;
  }

  const genericPrimaryResult = siteType === "generic" ? collectGenericMainImages(limit) : null;

  if (genericPrimaryResult?.images?.length > 0) {
    return genericPrimaryResult;
  }

  // 自包含的通用站主图采集：不强求扩展名/特定路径，宽松抓取页面里尺寸合理的 <img>，
  // 用 naturalWidth 兜住懒加载，自动跳过图标 / logo / 占位图 / 头尾导航。
  // 修复部分通用站“找不到图片”的问题（共用的 add() 对 generic 要求 140×140 渲染尺寸 + 扩展名，过严）。
  function collectGenericMainImages(maxImages) {
    const noisePattern =
      /(sprite|favicon|[/_-]logo|[/_-]icon|avatar|placeholder|[/_-]blank|transparent|spinner|loading[/_-]|emoji|qrcode|1x1|pixel\.)/i;
    const rasterExtPattern = /\.(avif|jpe?g|png|webp|gif)(?:$|[?#])/i;
    const MIN_SIDE = 120;

    function largestFromSrcset(value) {
      if (!value) {
        return "";
      }

      let bestUrl = "";
      let bestWeight = -1;

      for (const part of String(value).split(",")) {
        const piece = part.trim();
        if (!piece) {
          continue;
        }

        const bits = piece.split(/\s+/);
        const candidate = bits[0];
        if (!candidate) {
          continue;
        }

        const descriptor = bits[1] || "";
        let weight = 1;
        if (/^\d+w$/.test(descriptor)) {
          weight = Number(descriptor.replace(/w$/, ""));
        } else if (/^\d+(?:\.\d+)?x$/.test(descriptor)) {
          weight = Number(descriptor.replace(/x$/, "")) * 1000;
        }

        if (weight >= bestWeight) {
          bestWeight = weight;
          bestUrl = candidate;
        }
      }

      return bestUrl;
    }

    function bestUrlFor(image) {
      const raws = [
        image.currentSrc,
        largestFromSrcset(image.getAttribute("srcset")),
        largestFromSrcset(image.getAttribute("data-srcset")),
        image.getAttribute("data-src"),
        image.getAttribute("data-original"),
        image.getAttribute("data-lazy-src"),
        image.getAttribute("data-image"),
        image.getAttribute("src"),
      ];

      for (const raw of raws) {
        const url = normalizeUrl(raw);
        if (!url) {
          continue;
        }

        const lower = url.toLowerCase();
        if (lower.includes("base64,") || lower.includes(".svg")) {
          continue;
        }

        if (noisePattern.test(lower)) {
          continue;
        }

        return url;
      }

      return "";
    }

    function passesSize(image, url) {
      const rect = image.getBoundingClientRect();
      const big = Math.max(rect.width, image.naturalWidth || 0);
      const tall = Math.max(rect.height, image.naturalHeight || 0);

      if (big >= MIN_SIDE && tall >= MIN_SIDE) {
        return true;
      }

      // 完全没有尺寸信息（懒加载未渲染）时，只接受明显是图片文件的 URL
      if (big === 0 && tall === 0) {
        try {
          return rasterExtPattern.test(new URL(url).pathname);
        } catch {
          return false;
        }
      }

      return false;
    }

    function dedupeKey(url) {
      try {
        const parsed = new URL(url);
        const file = (parsed.pathname.split("/").filter(Boolean).pop() || parsed.pathname)
          .replace(/_\d+x\d+/i, "")
          .replace(/\.(avif|jpe?g|png|webp|gif)$/i, "");
        return `${parsed.hostname}/${file}`;
      } catch {
        return url;
      }
    }

    const seen = new Set();
    const images = [];

    for (const image of Array.from(document.querySelectorAll("img"))) {
      if (image.closest("header, nav, footer")) {
        continue;
      }

      const url = bestUrlFor(image);
      if (!url || !passesSize(image, url)) {
        continue;
      }

      const key = dedupeKey(url);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      images.push({
        priority: 760,
        reason: `通用:商品${images.length + 1}-图`,
        siteType,
        url,
      });

      if (images.length >= maxImages) {
        break;
      }
    }

    return {
      images,
      pageTitle: document.title || "",
      pageUrl: location.href,
      siteType,
    };
  }

  // 自包含的 SHEIN 主图采集：不依赖任何外部 helper（注入页面后模块级函数不可用），
  // 也不依赖易失效的特定路径正则。每个商品卡片只输出一张主图。
  function collectSheinMainImages(maxImages) {
    const hostPattern = /(^|\.)(ltwebstatic|shein)\.(com|net)$/i;
    const noisePattern =
      /(sprite|favicon|[/_-]logo|placeholder|[/_-]blank|transparent|[/_-]icon|emoji|qrcode|sui_|[/_-]social|app-?download|payment[/_-]|guarantee|[/_-]bg-|solid-color)/i;
    const imageExtPattern = /\.(avif|jpe?g|png|webp)(?:$|[?#])/i;

    function largestFromSrcset(value) {
      if (!value) {
        return "";
      }

      let bestUrl = "";
      let bestWeight = -1;

      for (const part of String(value).split(",")) {
        const piece = part.trim();
        if (!piece) {
          continue;
        }

        const bits = piece.split(/\s+/);
        const candidate = bits[0];
        if (!candidate) {
          continue;
        }

        const descriptor = bits[1] || "";
        let weight = 1;
        if (/^\d+w$/.test(descriptor)) {
          weight = Number(descriptor.replace(/w$/, ""));
        } else if (/^\d+(?:\.\d+)?x$/.test(descriptor)) {
          weight = Number(descriptor.replace(/x$/, "")) * 1000;
        }

        if (weight >= bestWeight) {
          bestWeight = weight;
          bestUrl = candidate;
        }
      }

      return bestUrl;
    }

    // 把同一商品的不同尺寸/缩略图变体归一成同一个 key，避免重复
    function imageIdKey(url) {
      try {
        const parsed = new URL(url);
        const file = parsed.pathname.split("/").filter(Boolean).pop() || parsed.pathname;
        return file
          .replace(/_thumbnail_\d+x\d+/i, "")
          .replace(/_square(?:_\d+)?/i, "")
          .replace(/_\d+x\d+/i, "")
          .replace(/\.(avif|jpe?g|png|webp)$/i, "");
      } catch {
        return url;
      }
    }

    function bestSheinUrl(image) {
      const raws = [
        image.currentSrc,
        image.getAttribute("src"),
        image.getAttribute("data-src"),
        image.getAttribute("data-original"),
        image.getAttribute("data-lazy-src"),
        image.getAttribute("data-image"),
        largestFromSrcset(image.getAttribute("srcset")),
        largestFromSrcset(image.getAttribute("data-srcset")),
      ];

      for (const raw of raws) {
        const url = normalizeUrl(raw);
        if (!url) {
          continue;
        }

        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          continue;
        }

        if (!hostPattern.test(parsed.hostname)) {
          continue;
        }

        if (noisePattern.test(parsed.pathname.toLowerCase())) {
          continue;
        }

        const looksLikeImage =
          imageExtPattern.test(parsed.pathname) ||
          /(format|imageview|x-oss-process|image_process)/i.test(parsed.search);
        if (!looksLikeImage) {
          continue;
        }

        return url;
      }

      return "";
    }

    function productLinkFor(image) {
      return image.closest(
        "a[href*='-p-'], a[href*='/product/'], a[href*='goods_id='], a[href*='item_id=']",
      );
    }

    function cardFor(image, link) {
      return (
        link ||
        image.closest("[class*='product' i], [class*='goods' i], li, section") ||
        image
      );
    }

    const entries = [];
    const byCard = new Map();
    let order = 0;

    for (const image of Array.from(document.querySelectorAll("img"))) {
      const url = bestSheinUrl(image);
      if (!url) {
        continue;
      }

      const rect = image.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      // 已渲染且明显是小图标的跳过；未渲染（懒加载在下方）的保留
      if (width > 0 && height > 0 && (width < 60 || height < 60)) {
        continue;
      }

      const link = productLinkFor(image);
      const card = cardFor(image, link);
      const area = width * height;
      const existing = byCard.get(card);

      if (!existing) {
        const entry = { area, isProduct: Boolean(link), order: order++, url };
        byCard.set(card, entry);
        entries.push(entry);
      } else if (area > existing.area) {
        existing.area = area;
        existing.url = url;
        if (link) {
          existing.isProduct = true;
        }
      }
    }

    // 如果页面里存在“商品链接内的图片”，就只保留这些，过滤掉横幅/导航等噪声
    let chosen = entries;
    if (entries.some((entry) => entry.isProduct)) {
      chosen = entries.filter((entry) => entry.isProduct);
    }

    const seenIds = new Set();
    const images = [];

    for (const entry of chosen.sort((a, b) => a.order - b.order)) {
      const idKey = imageIdKey(entry.url);
      if (seenIds.has(idKey)) {
        continue;
      }
      seenIds.add(idKey);

      images.push({
        priority: 980,
        reason: `shein:商品${images.length + 1}-主图`,
        siteType,
        url: entry.url,
      });

      if (images.length >= maxImages) {
        break;
      }
    }

    return {
      images,
      pageTitle: document.title || "",
      pageUrl: location.href,
      siteType,
    };
  }

  function collectSheinProductImageUrls(maxImages) {
    const sheinCandidates = [];
    const selectedSheinCandidates = [];
    const sheinHostPattern = /(^|\.)(ltwebstatic|shein)\.(com|net)$/i;
    const sheinProductPathPattern =
      /(?:\/images\d+_[a-z0-9]+\/|\/v\d+\/[a-z0-9]+\/[a-z0-9]+\/|_thumbnail_\d+x\d+|_square_|_main_|_crop_|_large_)/i;
    const sheinHardNoisePattern =
      /(avatar|badge|banner|cart|coupon|delivery|discount|empty|favicon|facebook|filter|footer|header|icon|label|logo|nav|placeholder|promo|rating|search|seller|service|shipping|sprite|star|store|tag|trendy|truck|user|warehouse|wplay)/i;
    const sheinImageExtensionPattern = /\.(avif|jpe?g|png|webp)(?:$|[?#])/i;
    const productCardSelector = [
      "a[href*='-p-']",
      "a[href*='/product/']",
      "a[href*='goods_id=']",
      "a[href*='product_id=']",
      "[data-sku]",
      "[data-goods-id]",
      "[data-product-id]",
      "[class*='ProductItem']",
      "[class*='product-card']",
      "[class*='productCard']",
      "[class*='product-item']",
      "[class*='goods-item']",
      "[class*='goodsItem']",
      "[class*='S-product-item']",
      "li",
    ].join(",");

    function normalizeSheinUrl(value) {
      const normalized = normalizeUrl(value);

      if (!normalized) {
        return null;
      }

      try {
        const parsed = new URL(normalized);
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return null;
      }
    }

    function isSheinImageUrl(url) {
      try {
        const parsed = new URL(url);
        const combined = `${parsed.pathname}${parsed.search}`.toLowerCase();

        if (!sheinHostPattern.test(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol)) {
          return false;
        }

        if (combined.includes(".svg") || combined.includes("base64,")) {
          return false;
        }

        if (sheinHardNoisePattern.test(combined) && !sheinProductPathPattern.test(combined)) {
          return false;
        }

        return sheinProductPathPattern.test(combined) || sheinImageExtensionPattern.test(combined);
      } catch {
        return false;
      }
    }

    function elementContext(element) {
      if (!element) {
        return "";
      }

      const parts = [];
      let current = element;
      let depth = 0;

      while (current && depth < 4) {
        parts.push(
          current.getAttribute?.("alt"),
          current.getAttribute?.("aria-label"),
          current.getAttribute?.("class"),
          current.getAttribute?.("data-testid"),
          current.getAttribute?.("id"),
          current.getAttribute?.("title"),
        );
        current = current.parentElement;
        depth += 1;
      }

      return parts.filter(Boolean).join(" ").toLowerCase();
    }

    function elementUrlValues(element) {
      const values = [];

      if (!element) {
        return values;
      }

      if (element instanceof HTMLImageElement) {
        values.push(
          element.currentSrc,
          element.src,
          element.getAttribute("src"),
          element.getAttribute("data-src"),
          element.getAttribute("data-lazy"),
          element.getAttribute("data-lazy-src"),
          element.getAttribute("data-original"),
          element.getAttribute("data-original-src"),
          element.getAttribute("data-origin-src"),
          element.getAttribute("data-before-crop-src"),
          element.getAttribute("data-src-origin"),
          element.getAttribute("data-image"),
          element.getAttribute("data-url"),
          ...collectSrcsetValues(element.getAttribute("srcset")),
          ...collectSrcsetValues(element.getAttribute("data-srcset")),
        );

        const picture = element.closest("picture");
        if (picture) {
          picture.querySelectorAll("source").forEach((source) => {
            values.push(
              source.getAttribute("src"),
              source.getAttribute("data-src"),
              source.getAttribute("data-original"),
              ...collectSrcsetValues(source.getAttribute("srcset")),
              ...collectSrcsetValues(source.getAttribute("data-srcset")),
            );
          });
        }
      }

      if (element instanceof HTMLSourceElement) {
        values.push(
          element.getAttribute("src"),
          element.getAttribute("data-src"),
          ...collectSrcsetValues(element.getAttribute("srcset")),
          ...collectSrcsetValues(element.getAttribute("data-srcset")),
        );
      }

      for (const attribute of Array.from(element.attributes || [])) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value || "";

        if (
          name.includes("src") ||
          name.includes("image") ||
          name.includes("img") ||
          name.includes("photo") ||
          name.includes("thumb") ||
          name.includes("origin") ||
          name.includes("url") ||
          value.includes("ltwebstatic") ||
          value.includes("shein")
        ) {
          values.push(value, ...collectSrcsetValues(value));
        }
      }

      const inlineStyle = element.getAttribute("style") || "";
      const computedBackground = getComputedStyle(element).backgroundImage || "";
      for (const styleValue of [inlineStyle, computedBackground]) {
        for (const match of styleValue.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
          values.push(match[1]);
        }
      }

      return values.filter(Boolean);
    }

    function productCardFor(element) {
      if (!element) {
        return null;
      }

      return element.closest(productCardSelector);
    }

    function productHref(card) {
      const selfHref = card.matches?.("a[href]") ? card.getAttribute("href") || "" : "";

      if (selfHref && sheinProductUrlPattern.test(selfHref)) {
        return selfHref;
      }

      const link = card.querySelector?.("a[href*='-p-'], a[href*='/product/'], a[href*='goods_id='], a[href*='product_id=']");
      return link?.getAttribute?.("href") || "";
    }

    function isVisibleCard(card) {
      if (!card) {
        return false;
      }

      const rect = card.getBoundingClientRect();
      const context = elementContext(card);
      const href = productHref(card);

      if (rect.width < 120 || rect.height < 180) {
        return false;
      }

      if (rect.bottom < -600 || rect.top > window.innerHeight + 1200) {
        return false;
      }

      if (card.closest("header, nav, footer, [role='navigation'], [role='banner']")) {
        return false;
      }

      return sheinProductUrlPattern.test(href) || /(goods|item|product)/i.test(context);
    }

    function mainMediaElementFor(element) {
      if (!element) {
        return null;
      }

      if (element instanceof HTMLSourceElement) {
        return element.closest("picture")?.querySelector("img") || element.closest("picture") || element;
      }

      if (element instanceof HTMLImageElement) {
        return element;
      }

      return element.querySelector?.("img") || element;
    }

    function isMainCardImageElement(element, card) {
      const mediaElement = mainMediaElementFor(element);

      if (!mediaElement || !card) {
        return false;
      }

      const rect = mediaElement.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const context = elementContext(mediaElement);
      const imageAreaBottom = cardRect.top + Math.min(cardRect.height * 0.76, Math.max(cardRect.width * 1.55, 260));

      if (rect.width < 90 || rect.height < 110 || rect.height < rect.width * 0.34) {
        return false;
      }

      if (rect.bottom < cardRect.top - 40 || rect.top > cardRect.bottom + 40) {
        return false;
      }

      if (rect.top > imageAreaBottom) {
        return false;
      }

      if (rect.height < cardRect.width * 0.28 && rect.width > cardRect.width * 0.65) {
        return false;
      }

      if (mediaElement.closest("header, nav, footer, [role='navigation'], [role='banner']")) {
        return false;
      }

      if (sheinHardNoisePattern.test(context) && !/(goods|image|img|item|photo|picture|product)/i.test(context)) {
        return false;
      }

      if (
        mediaElement instanceof HTMLImageElement &&
        mediaElement.naturalWidth > 0 &&
        mediaElement.naturalHeight > 0 &&
        (mediaElement.naturalWidth < 160 || mediaElement.naturalHeight < 160)
      ) {
        return false;
      }

      return true;
    }

    function scoreSheinUrl(url, element, basePriority) {
      let score = basePriority;

      try {
        const parsed = new URL(url);
        const text = `${parsed.pathname}${parsed.search}`.toLowerCase();

        if (sheinProductPathPattern.test(text)) {
          score += 500;
        }

        if (/images\d+_(?:pi|spmp|smp|mp|si|sku)\//i.test(text)) {
          score += 220;
        }

        if (/_thumbnail_(\d+)x(\d+)/i.test(text)) {
          const match = text.match(/_thumbnail_(\d+)x(\d+)/i);
          const width = Number(match?.[1] || 0);
          const height = Number(match?.[2] || 0);
          score += Math.min(Math.max(width, height) / 3, 220);
        }

        if (sheinHardNoisePattern.test(text) && !sheinProductPathPattern.test(text)) {
          score -= 900;
        }
      } catch {
        score -= 200;
      }

      if (element) {
        const rect = element.getBoundingClientRect();
        const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
        score += Math.min(area / 900, 260);

        if (rect.top >= -80 && rect.top <= window.innerHeight + 80) {
          score += 80;
        }

        if (element.closest("a[href*='-p-'], a[href*='/product/'], [class*='product'], [class*='goods'], [class*='item']")) {
          score += 120;
        }
      }

      return score;
    }

    function addSheinUrl(value, reason, basePriority, element, card, cardIndex, elementOrder) {
      const normalized = normalizeSheinUrl(value);

      if (!normalized || !isSheinImageUrl(normalized)) {
        return;
      }

      if (element && card && !isMainCardImageElement(element, card)) {
        return;
      }

      sheinCandidates.push({
        cardIndex,
        elementOrder,
        order: sheinCandidates.length,
        priority: Math.round(scoreSheinUrl(normalized, element, basePriority)),
        reason,
        siteType,
        url: normalized,
      });
    }

    function collectCardElements(card) {
      const seen = new Set();
      const elements = [];

      function addElement(element) {
        if (element && !seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
      }

      card.querySelectorAll("img").forEach(addElement);
      card.querySelectorAll("picture source, source").forEach(addElement);
      card
        .querySelectorAll("[style], [data-src], [data-srcset], [data-image], [data-url], [data-original], [data-lazy-src]")
        .forEach(addElement);

      for (const element of Array.from(card.querySelectorAll("*"))) {
        const attrText = Array.from(element.attributes || [])
          .map((attribute) => attribute.value)
          .join(" ");

        if (/(?:ltwebstatic|shein)\.(?:com|net)/i.test(attrText)) {
          addElement(element);
        }
      }

      return elements;
    }

    function collectProductCards() {
      const cards = new Set();

      document.querySelectorAll(productCardSelector).forEach((element) => {
        const card = productCardFor(element) || element;

        if (isVisibleCard(card)) {
          cards.add(card);
        }
      });

      document.querySelectorAll("img").forEach((image) => {
        const card = productCardFor(image);

        if (isVisibleCard(card) && isMainCardImageElement(image, card)) {
          cards.add(card);
        }
      });

      return Array.from(cards).sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      });
    }

    const productCards = collectProductCards();

    productCards.forEach((card, cardIndex) => {
      const perCardCandidates = [];

      collectCardElements(card).forEach((element, elementOrder) => {
        if (!isMainCardImageElement(element, card)) {
          return;
        }

        for (const value of elementUrlValues(element)) {
          const beforeCount = sheinCandidates.length;
          addSheinUrl(value, "shein:product-url", 900, element, card, cardIndex, elementOrder);

          if (sheinCandidates.length > beforeCount) {
            perCardCandidates.push(sheinCandidates[sheinCandidates.length - 1]);
          }
        }
      });

      const byCardKey = new Map();
      for (const candidate of perCardCandidates) {
        const key = candidateDedupeKey(candidate.url);
        const existing = byCardKey.get(key);

        if (!existing || candidate.priority > existing.priority) {
          byCardKey.set(key, candidate);
        }
      }

      Array.from(byCardKey.values())
        .sort((a, b) => {
          const priorityDiff = b.priority - a.priority;
          return priorityDiff === 0 ? a.elementOrder - b.elementOrder : priorityDiff;
        })
        .slice(0, SHEIN_CANDIDATES_PER_CARD)
        .forEach((candidate, imageIndex) => {
          candidate.reason = imageIndex === 0 ? `shein:商品${cardIndex + 1}-主图` : `shein:商品${cardIndex + 1}-第二张`;
          candidate.priority = imageIndex === 0 ? 980 : 940;
          selectedSheinCandidates.push(candidate);
        });
    });

    const byKey = new Map();

    for (const candidate of selectedSheinCandidates) {
      const key = candidateDedupeKey(candidate.url);
      const existing = byKey.get(key);

      if (!existing || candidate.priority > existing.priority) {
        byKey.set(key, candidate);
      }
    }

    const outputCountsByCard = new Map();
    const firstImagesByCard = [];

    for (const image of Array.from(byKey.values())
      .sort((a, b) => {
        const cardDiff = a.cardIndex - b.cardIndex;
        const priorityDiff = b.priority - a.priority;
        return cardDiff === 0 ? (priorityDiff === 0 ? a.order - b.order : priorityDiff) : cardDiff;
      })) {
      const outputCount = outputCountsByCard.get(image.cardIndex) || 0;

      if (outputCount >= SHEIN_OUTPUT_IMAGES_PER_CARD) {
        continue;
      }

      outputCountsByCard.set(image.cardIndex, outputCount + 1);
      firstImagesByCard.push(image);
    }

    const images = firstImagesByCard
      .slice(0, maxImages)
      .map((image) => ({
        priority: 980,
        reason: `shein:商品${image.cardIndex + 1}-主图`,
        siteType: image.siteType,
        url: image.url,
      }));

    return {
      images,
      pageTitle: document.title || "",
      pageUrl: location.href,
      siteType,
    };
  }

  function cleanUrl(value) {
    return String(value || "")
      .trim()
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#34;", '"')
      .replaceAll("&#38;", "&")
      .replaceAll("\\u002F", "/")
      .replaceAll("\\u002f", "/")
      .replaceAll("\\u0026", "&")
      .replaceAll("\\/", "/")
      .replace(/^[("'\\]+/g, "")
      .replace(/[)"'\\,.;]+$/g, "");
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function normalizeUrl(value) {
    const cleaned = cleanUrl(value);
    const variants = [cleaned, safeDecode(cleaned)];

    for (const variant of variants) {
      if (!variant || variant.startsWith("data:") || variant.startsWith("blob:")) {
        continue;
      }

      try {
        const parsed = new URL(variant, location.href);
        parsed.hash = "";

        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.toString();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  function hostnameMatches(url, pattern) {
    try {
      return pattern.test(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  function isLikelyImageUrl(url) {
    const lower = url.toLowerCase();

    if (lower.includes("base64,") || lower.includes(".svg") || smallAssetPattern.test(lower)) {
      return false;
    }

    if (siteType === "shein" && sheinNoisePattern.test(lower) && !sheinProductImageUrlPattern.test(lower)) {
      return false;
    }

    try {
      const parsed = new URL(url);
      const pathWithSearch = `${parsed.pathname}${parsed.search}`;

      return (
        kwcdnHostPattern.test(parsed.hostname) ||
        sheinImageHostPattern.test(parsed.hostname) ||
        pinterestImageHostPattern.test(parsed.hostname) ||
        imageExtensionPattern.test(pathWithSearch) ||
        imageQueryPattern.test(pathWithSearch)
      );
    } catch {
      return false;
    }
  }

  function elementText(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && depth < 6) {
      parts.push(
        current.getAttribute?.("alt"),
        current.getAttribute?.("aria-label"),
        current.getAttribute?.("aria-current"),
        current.getAttribute?.("class"),
        current.getAttribute?.("data-testid"),
        current.getAttribute?.("id"),
        current.getAttribute?.("title"),
      );
      current = current.parentElement;
      depth += 1;
    }

    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function elementLocalText(element, maxDepth = 2) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && depth <= maxDepth) {
      parts.push(
        current.getAttribute?.("alt"),
        current.getAttribute?.("aria-label"),
        current.getAttribute?.("class"),
        current.getAttribute?.("data-testid"),
        current.getAttribute?.("id"),
        current.getAttribute?.("title"),
      );
      current = current.parentElement;
      depth += 1;
    }

    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function elementLink(element) {
    const link = element?.closest?.("a[href]");
    return link?.getAttribute("href") || "";
  }

  function isVisibleProductSize(element, minWidth, minHeight) {
    const rect = element.getBoundingClientRect();
    return rect.width >= minWidth && rect.height >= minHeight;
  }

  function isInSiteChrome(element) {
    if (!element) {
      return false;
    }

    if (element.closest("header, nav, footer, [role='navigation'], [role='banner'], [aria-label*='navigation' i]")) {
      return true;
    }

    const context = elementText(element);
    return siteChromePattern.test(context) && !productContextPattern.test(context);
  }

  function hasSheinProductContext(element) {
    const rect = element.getBoundingClientRect();
    const context = elementText(element);
    const selfContext = elementLocalText(element, 0);
    const localContext = elementLocalText(element, 2);
    const href = elementLink(element);
    const strongMainImageClassPattern =
      /(crop-image|goods-img|goodsImg|item-img|main-img|photo|product-card__img|product-img|productImg|product-item__img)/i;
    const productCard = element.closest(
      [
        "a[href*='-p-']",
        "a[href*='/product/']",
        "a[href*='goods_id=']",
        "a[href*='product_id=']",
        "[data-sku]",
        "[data-goods-id]",
        "[data-product-id]",
        "[class*='ProductItem']",
        "[class*='product-card']",
        "[class*='productCard']",
        "[class*='product-item']",
        "[class*='product-list']",
        "[class*='goods']",
      ].join(","),
    );
    const mainImageLike = Boolean(
      element.closest(
        [
          "picture",
          "[class*='crop-image']",
          "[class*='goods-img']",
          "[class*='goodsImg']",
          "[class*='item-img']",
          "[class*='main-img']",
          "[class*='photo']",
          "[class*='product-card__img']",
          "[class*='product-img']",
          "[class*='productImg']",
          "[class*='product-item__img']",
        ].join(","),
      ),
    );
    const insideNoiseBlock = Boolean(
      element.closest(
        [
          "[class*='ad']",
          "[class*='banner']",
          "[class*='badge']",
          "[class*='coupon']",
          "[class*='delivery']",
          "[class*='discount']",
          "[class*='icon']",
          "[class*='label']",
          "[class*='overlay']",
          "[class*='promo']",
          "[class*='seller']",
          "[class*='service']",
          "[class*='shipping']",
          "[class*='tag']",
          "[class*='trendy']",
          "[class*='truck']",
          "[class*='warehouse']",
        ].join(","),
      ),
    );
    const isLargeMainImage = rect.width >= 135 && rect.height >= 170 && rect.height >= rect.width * 0.72;

    if (siteChromePattern.test(context) && !productContextPattern.test(context)) {
      return false;
    }

    if (!isLargeMainImage) {
      return false;
    }

    if (
      "naturalWidth" in element &&
      "naturalHeight" in element &&
      element.naturalWidth > 0 &&
      element.naturalHeight > 0 &&
      (element.naturalWidth < 220 || element.naturalHeight < 220)
    ) {
      return false;
    }

    if (insideNoiseBlock || sheinNoisePattern.test(selfContext)) {
      return false;
    }

    if (sheinNoisePattern.test(localContext) && !strongMainImageClassPattern.test(localContext)) {
      return false;
    }

    if (isSheinProductPage) {
      return mainImageLike || productContextPattern.test(context);
    }

    return Boolean(productCard) || sheinProductUrlPattern.test(href);
  }

  function hasPinterestProductContext(element) {
    const context = elementText(element);
    const href = elementLink(element);
    const pinLike = Boolean(
      element.closest(
        [
          "[data-test-id*='pin-closeup']",
          "[data-test-id*='closeup']",
          "[data-test-id*='pin']",
          "[data-test-id*='masonry']",
          "[data-grid-item]",
          "a[href*='/pin/']",
          "article",
          "main",
        ].join(","),
      ),
    );
    const linkToPin = pinterestPinUrlPattern.test(href);

    if (!isPinterestPage || (siteChromePattern.test(context) && !productContextPattern.test(context))) {
      return false;
    }

    if (isPinterestPinPage) {
      return (pinLike || linkToPin) && isVisibleProductSize(element, 140, 140);
    }

    return (pinLike || linkToPin || productContextPattern.test(context)) && isVisibleProductSize(element, 150, 150);
  }

  function hasTemuProductContext(element) {
    const rect = element.getBoundingClientRect();
    const context = elementText(element);
    const href = elementLink(element);
    const productLike = Boolean(
      element.closest(
        [
          "a[href*='goods_id=']",
          "a[href*='product_id=']",
          "a[href*='item_id=']",
          "a[href*='-g-']",
          "a[href*='/goods']",
          "a[href*='/product']",
          "[data-goods-id]",
          "[data-product-id]",
          "[class*='goods']",
          "[class*='product']",
          "[class*='card']",
          "[class*='tile']",
        ].join(","),
      ),
    );

    if (isInSiteChrome(element) || rect.width < 100 || rect.height < 100) {
      return false;
    }

    return productLike || temuProductUrlPattern.test(href) || productContextPattern.test(context) || rect.width >= 160;
  }

  function isAllowedElementImage(element) {
    if (!element || isInSiteChrome(element)) {
      return false;
    }

    if (siteType === "shein") {
      return hasSheinProductContext(element);
    }

    if (siteType === "pinterest") {
      return hasPinterestProductContext(element);
    }

    if (siteType === "temu") {
      return hasTemuProductContext(element);
    }

    return isVisibleProductSize(element, 140, 140);
  }

  function add(value, reason, priority, element) {
    if (element && !isAllowedElementImage(element)) {
      return;
    }

    const normalized = normalizeUrl(value);

    if (!normalized || !isLikelyImageUrl(normalized)) {
      return;
    }

    if (siteType === "temu" && !hostnameMatches(normalized, kwcdnHostPattern)) {
      return;
    }

    if (siteType === "shein" && !hostnameMatches(normalized, sheinImageHostPattern)) {
      return;
    }

    if (siteType === "pinterest" && !hostnameMatches(normalized, pinterestImageHostPattern)) {
      return;
    }

    candidates.push({
      order: candidates.length,
      priority,
      reason,
      siteType,
      url: normalized,
    });
  }

  function addSrcset(value, reason, priority, element) {
    for (const chunk of String(value || "").split(",")) {
      add(chunk.trim().split(/\s+/)[0], reason, priority, element);
    }
  }

  function addSheinProductImage(value, reason, priority, element) {
    const normalized = normalizeUrl(value);

    if (!normalized || !isLikelyImageUrl(normalized) || !hostnameMatches(normalized, sheinImageHostPattern)) {
      return;
    }

    const rect = element?.getBoundingClientRect?.();
    const localContext = element ? elementLocalText(element, 2) : "";

    if (rect && (rect.width < 80 || rect.height < 95) && !sheinProductImageUrlPattern.test(normalized)) {
      return;
    }

    if (sheinNoisePattern.test(localContext) && !sheinProductImageUrlPattern.test(normalized)) {
      return;
    }

    candidates.push({
      order: candidates.length,
      priority,
      reason,
      siteType,
      url: normalized,
    });
  }

  function collectSrcsetValues(value) {
    return String(value || "")
      .split(",")
      .map((chunk) => chunk.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function attributeImageValues(element) {
    const values = [];

    for (const attribute of Array.from(element.attributes || [])) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";

      if (
        name.includes("srcset") ||
        name.includes("image") ||
        name.includes("img") ||
        name.includes("origin") ||
        name.includes("photo") ||
        name.includes("src") ||
        name.includes("url")
      ) {
        values.push(...collectSrcsetValues(value));
        values.push(value);
        continue;
      }

      if (value.includes("ltwebstatic") || value.includes("shein")) {
        values.push(...collectSrcsetValues(value));
        values.push(value);
      }
    }

    return values;
  }

  function imageSourceValues(image) {
    const picture = image.closest?.("picture");
    const pictureSourceValues = picture
      ? Array.from(picture.querySelectorAll("source")).flatMap((source) => [
          ...collectSrcsetValues(source.getAttribute("srcset")),
          ...collectSrcsetValues(source.getAttribute("data-srcset")),
          source.getAttribute("data-src"),
          source.getAttribute("data-original"),
          source.getAttribute("data-lazy-src"),
        ])
      : [];

    return [
      image.currentSrc,
      image.getAttribute("src"),
      image.getAttribute("data-src"),
      image.getAttribute("data-lazy"),
      image.getAttribute("data-src-webp"),
      image.getAttribute("data-original"),
      image.getAttribute("data-original-src"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-image"),
      image.getAttribute("data-origin-src"),
      image.getAttribute("data-before-crop-src"),
      image.getAttribute("data-src-origin"),
      image.getAttribute("data-full"),
      image.getAttribute("data-hires"),
      image.getAttribute("data-url"),
      ...collectSrcsetValues(image.getAttribute("srcset")),
      ...collectSrcsetValues(image.getAttribute("data-srcset")),
      ...pictureSourceValues,
      ...attributeImageValues(image),
    ].filter(Boolean);
  }

  function backgroundImageValues(element) {
    const styleValue = element.getAttribute("style") || "";
    const computedValue = getComputedStyle(element).backgroundImage || "";
    const values = [];

    for (const style of [styleValue, computedValue]) {
      for (const match of style.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
        values.push(match[1]);
      }
    }

    return values;
  }

  function sheinUrlCandidateScore(value) {
    const normalized = normalizeUrl(value);

    if (!normalized) {
      return -1000;
    }

    const lower = normalized.toLowerCase();
    let score = sizeScore(normalized);

    if (sheinProductImageUrlPattern.test(lower)) {
      score += 500;
    }

    if (sheinImageBucketPattern.test(lower)) {
      score += 260;
    }

    if (/\.(avif|jpe?g|png|webp)(?:$|[?#])/i.test(lower)) {
      score += 140;
    }

    if (/(?:_thumbnail_\d+x\d+|_square_|_main_|_crop_|_large_)/i.test(lower)) {
      score += 360;
    }

    if (/\/[a-f0-9]{20,}(?=[._-])/i.test(lower)) {
      score += 280;
    }

    if (/\/(?:product|goods|item)\//i.test(lower)) {
      score += 140;
    }

    if (/(placeholder|blank|empty|transparent|loading|spinner|sprite|icon|logo|truck|shipping|delivery|coupon|badge|banner|promo)/i.test(lower)) {
      score -= 700;
    }

    if (/\b(?:crop|thumbnail|thumb|medium|large|original)\b/i.test(lower)) {
      score += 20;
    }

    return score;
  }

  function addSheinFallbackUrl(value, reason, priority) {
    const normalized = normalizeUrl(value);

    if (!normalized || !hostnameMatches(normalized, sheinImageHostPattern) || !isLikelyImageUrl(normalized)) {
      return false;
    }

    if (sheinUrlCandidateScore(normalized) < 230) {
      return false;
    }

    candidates.push({
      order: candidates.length,
      priority,
      reason,
      siteType,
      url: normalized,
    });

    return true;
  }

  function extractSheinUrlsFromText(text, reason, priority) {
    const cleaned = cleanUrl(text);
    const patterns = [
      /https?:\/\/[^"'<>\\\s]+(?:ltwebstatic|shein)\.(?:com|net)\/[^"'<>\\\s]+/gi,
      /\/\/[^"'<>\\\s]+(?:ltwebstatic|shein)\.(?:com|net)\/[^"'<>\\\s]+/gi,
    ];

    for (const pattern of patterns) {
      for (const match of cleaned.matchAll(pattern)) {
        addSheinFallbackUrl(match[0], reason, priority);
      }
    }
  }

  function collectSheinResourceImages() {
    try {
      for (const entry of performance.getEntriesByType("resource")) {
        if (typeof entry.name === "string" && /(?:ltwebstatic|shein)\.(?:com|net)/i.test(entry.name)) {
          addSheinFallbackUrl(entry.name, "shein:resource", 840);
        }
      }
    } catch {
      // Ignore browsers/pages that block performance resource access.
    }

    document.querySelectorAll("script").forEach((script) => {
      if (script.textContent && /(?:ltwebstatic|shein)\.(?:com|net)/i.test(script.textContent)) {
        extractSheinUrlsFromText(script.textContent, "shein:script-url", 820);
      }
    });
  }

  function collectSheinVisibleLargeImages() {
    document.querySelectorAll("img").forEach((image) => {
      if (isInSiteChrome(image)) {
        return;
      }

      const rect = image.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 130 || rect.height < rect.width * 0.42) {
        return;
      }

      const context = elementLocalText(image, 2);
      if (sheinNoisePattern.test(context) && !imageSourceValues(image).some((value) => sheinProductImageUrlPattern.test(value))) {
        return;
      }

      const bestValue = imageSourceValues(image)
        .map((value) => ({
          normalized: normalizeUrl(value),
          score: sheinUrlCandidateScore(value),
          value,
        }))
        .filter((item) => item.normalized && item.score >= 230)
        .sort((a, b) => b.score - a.score)[0]?.value;

      if (bestValue) {
        addSheinFallbackUrl(bestValue, "shein:visible-main", 880);
      }
    });

    document.querySelectorAll("source").forEach((source) => {
      const picture = source.closest("picture");
      const element = picture?.querySelector("img") || picture || source.parentElement;

      if (!element || isInSiteChrome(element)) {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 130) {
        return;
      }

      for (const value of [
        ...collectSrcsetValues(source.getAttribute("srcset")),
        ...collectSrcsetValues(source.getAttribute("data-srcset")),
      ]) {
        addSheinFallbackUrl(value, "shein:visible-source", 860);
      }
    });
  }

  function collectSheinProductCards() {
    const cardSelectors = [
      "a[href*='-p-']",
      "a[href*='/product/']",
      "a[href*='goods_id=']",
      "a[href*='product_id=']",
      "[data-sku]",
      "[data-goods-id]",
      "[data-product-id]",
      "[class*='ProductItem']",
      "[class*='product-card']",
      "[class*='productCard']",
      "[class*='product-item']",
      "[class*='goods-item']",
      "[class*='goodsItem']",
    ];
    const cards = new Set();

    document.querySelectorAll(cardSelectors.join(",")).forEach((element) => {
      const card =
        element.closest(
          [
            "[class*='ProductItem']",
            "[class*='product-card']",
            "[class*='productCard']",
            "[class*='product-item']",
            "[class*='goods-item']",
            "[class*='goodsItem']",
            "li",
          ].join(","),
        ) || element;

      const rect = card.getBoundingClientRect();
      if (rect.width >= 120 && rect.height >= 140) {
        cards.add(card);
      }
    });

    for (const card of cards) {
      const cardRect = card.getBoundingClientRect();
      const imageEntries = Array.from(card.querySelectorAll("img")).map((image) => {
        const rect = image.getBoundingClientRect();
        return {
          area: Math.max(rect.width, 0) * Math.max(rect.height, 0),
          context: elementLocalText(image, 2),
          element: image,
          height: rect.height,
          inUpperCard: rect.top <= cardRect.top + cardRect.height * 0.76,
          values: imageSourceValues(image),
          width: rect.width,
        };
      });
      const backgroundEntries = Array.from(card.querySelectorAll("[style]")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          area: Math.max(rect.width, 0) * Math.max(rect.height, 0),
          context: elementLocalText(element, 2),
          element,
          height: rect.height,
          inUpperCard: rect.top <= cardRect.top + cardRect.height * 0.76,
          values: backgroundImageValues(element),
          width: rect.width,
        };
      });
      const attributeEntries = Array.from(card.querySelectorAll("*")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          area: Math.max(rect.width, 0) * Math.max(rect.height, 0),
          context: elementLocalText(element, 2),
          element,
          height: rect.height,
          inUpperCard:
            rect.height === 0 ||
            rect.top <= cardRect.top + cardRect.height * 0.82 ||
            element.closest("picture, [class*='img'], [class*='photo'], [class*='image']"),
          values: attributeImageValues(element),
          width: rect.width,
        };
      });
      const images = [...imageEntries, ...backgroundEntries, ...attributeEntries]
        .map((entry) => {
          const bestValue = entry.values
            .map((value) => ({
              normalized: normalizeUrl(value),
              score: sheinUrlCandidateScore(value),
              value,
            }))
            .filter((item) => item.normalized && item.score > -500)
            .sort((a, b) => b.score - a.score)[0];

          return {
            ...entry,
            bestScore: bestValue?.score ?? -1000,
            bestValue: bestValue?.value || "",
          };
        })
        .filter((entry) => {
          if (
            !entry.inUpperCard ||
            !entry.bestValue ||
            (entry.bestScore < 500 &&
              (entry.area < 9000 || entry.width < 85 || entry.height < 110 || entry.height < entry.width * 0.45))
          ) {
            return false;
          }

          if (
            sheinNoisePattern.test(entry.context) &&
            !sheinProductImageUrlPattern.test(entry.bestValue) &&
            entry.bestScore < 500
          ) {
            return false;
          }

          return true;
        })
        .sort((a, b) => b.bestScore + b.area / 1000 - (a.bestScore + a.area / 1000));

      const addedKeys = new Set();
      let imageIndex = 0;

      for (const image of images) {
        const key = candidateDedupeKey(image.bestValue);

        if (addedKeys.has(key)) {
          continue;
        }

        addedKeys.add(key);
        addSheinProductImage(
          image.bestValue,
          imageIndex === 0 ? "shein:product-card-main" : "shein:product-card-hover",
          imageIndex === 0 ? 940 : 900,
          image.element,
        );
        imageIndex += 1;

        if (imageIndex >= SHEIN_CANDIDATES_PER_CARD) {
          break;
        }
      }
    }
  }

  function addBackgroundImage(element) {
    const style = getComputedStyle(element).backgroundImage || "";
    const matches = style.matchAll(/url\(["']?([^"')]+)["']?\)/gi);

    for (const match of matches) {
      add(match[1], "background-image", 650, element);
    }
  }

  function collectJsonImageValue(value, priority, depth) {
    if (depth > 8) {
      return;
    }

    if (typeof value === "string") {
      add(value, "json-ld:image", priority);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectJsonImageValue(item, priority, depth + 1);
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const imageValue = value.image || value.images || value.thumbnailUrl || value.contentUrl || value.url;
    if (imageValue) {
      collectJsonImageValue(imageValue, priority, depth + 1);
    }
  }

  function traverseJsonLd(value, priority, depth) {
    if (depth > 8 || !value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        traverseJsonLd(item, priority, depth + 1);
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    collectJsonImageValue(value.image, priority, depth + 1);

    for (const nested of Object.values(value)) {
      traverseJsonLd(nested, priority - 1, depth + 1);
    }
  }

  if (allowDocumentLevelImages) {
    document.querySelectorAll('meta[property="og:image"], meta[property="og:image:url"]')
      .forEach((element) => add(element.getAttribute("content"), "og:image", 1000));

    document.querySelectorAll('meta[name="twitter:image"], meta[property="twitter:image"]')
      .forEach((element) => add(element.getAttribute("content"), "twitter:image", 950));

    document.querySelectorAll('script[type="application/ld+json"]').forEach((element) => {
      try {
        traverseJsonLd(JSON.parse(element.textContent || ""), 900, 0);
      } catch {
        // Ignore invalid JSON-LD.
      }
    });
  }

  if (siteType === "shein") {
    collectSheinProductCards();
    collectSheinVisibleLargeImages();
    collectSheinResourceImages();
  }

  if (siteType !== "shein") {
    document.querySelectorAll("img").forEach((image) => {
      add(image.currentSrc, "img:currentSrc", 760, image);
      add(image.getAttribute("src"), "img:src", 720, image);
      add(image.getAttribute("data-src"), "img:data-src", 740, image);
      add(image.getAttribute("data-original"), "img:data-original", 740, image);
      add(image.getAttribute("data-lazy-src"), "img:data-lazy-src", 740, image);
      add(image.getAttribute("data-image"), "img:data-image", 750, image);
      addSrcset(image.getAttribute("srcset"), "img:srcset", 730, image);
      addSrcset(image.getAttribute("data-srcset"), "img:data-srcset", 730, image);
    });

    document.querySelectorAll("source").forEach((source) => {
      const picture = source.closest("picture");
      const element = picture?.querySelector("img") || picture || source.parentElement;
      addSrcset(source.getAttribute("srcset"), "source:srcset", 680, element);
      addSrcset(source.getAttribute("data-srcset"), "source:data-srcset", 680, element);
    });

    document.querySelectorAll("[style]").forEach((element) => {
      addBackgroundImage(element);
    });
  }

  if (siteType === "temu" && isTemuProductPage) {
    const html = cleanUrl(document.documentElement?.outerHTML || "");
    for (const pattern of kwcdnTextPatterns) {
      for (const match of html.matchAll(pattern)) {
        add(match[0], "kwcdn-url", 560);
      }
    }
  }

  function candidateDedupeKey(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";

      // Pinterest 同一张图只有尺寸目录段（236x/474x/736x/originals…）不同，
      // 文件名 hash 相同，按 hash 去重保证每张图只采集一张。
      if (/(^|\.)pinimg\.com$/i.test(parsed.hostname)) {
        const rawFilename = parsed.pathname.split("/").filter(Boolean).pop() || "";
        let filename = rawFilename;

        try {
          filename = decodeURIComponent(rawFilename);
        } catch {
          filename = rawFilename;
        }

        const hashMatch = filename.match(/^[a-f0-9]{16,}/i);
        const pinterestId = hashMatch
          ? hashMatch[0].toLowerCase()
          : filename
              .replace(/\.(avif|jpe?g|png|webp|gif)$/i, "")
              .replace(/_\d+x\d*(?:_rs)?$/i, "")
              .toLowerCase();

        if (pinterestId) {
          return `pinterest-image:${pinterestId}`;
        }
      }

      const isSheinAsset = isSheinAssetHost(parsed.hostname);
      const sheinKey = canonicalSheinDedupeKey(parsed);

      if (sheinKey) {
        return sheinKey;
      }

      for (const key of Array.from(parsed.searchParams.keys())) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.startsWith("utm_") ||
          lowerKey === "spm" ||
          lowerKey === "refer_page" ||
          lowerKey === "refer_page_name" ||
          (isSheinAsset &&
            [
              "crop",
              "format",
              "height",
              "h",
              "quality",
              "qlt",
              "resize",
              "thumbnail",
              "width",
              "w",
            ].includes(lowerKey))
        ) {
          parsed.searchParams.delete(key);
        }
      }

      parsed.searchParams.sort();
      return parsed.toString();
    } catch {
      return url;
    }
  }

  function sizeScore(url) {
    const matches = url.match(/(?:^|[^\d])(\d{3,5})(?:x|w|h|\/|%2F)/gi) || [];
    const values = matches
      .map((match) => Number((match.match(/\d{3,5}/) || [0])[0]))
      .filter((value) => Number.isFinite(value));

    try {
      const parsed = new URL(url);
      for (const key of ["height", "h", "width", "w"]) {
        const value = Number(parsed.searchParams.get(key));
        if (Number.isFinite(value) && value >= 100) {
          values.push(value);
        }
      }
    } catch {
      // Keep the path-based score when URL parsing fails.
    }

    return values.length > 0 ? Math.min(Math.max(...values) / 100, 60) : 0;
  }

  function hostScore(url) {
    if (siteType === "temu" && hostnameMatches(url, kwcdnHostPattern)) {
      return 60;
    }
    if (siteType === "shein" && hostnameMatches(url, sheinImageHostPattern)) {
      return 60;
    }
    if (siteType === "pinterest" && hostnameMatches(url, pinterestImageHostPattern)) {
      return 60;
    }
    return 0;
  }

  function sortScore(candidate) {
    return candidate.priority + hostScore(candidate.url) + sizeScore(candidate.url);
  }

  const byKey = new Map();

  for (const candidate of candidates) {
    const key = candidateDedupeKey(candidate.url);
    const existing = byKey.get(key);

    if (!existing || sortScore(candidate) > sortScore(existing)) {
      byKey.set(key, candidate);
    }
  }

  const images = Array.from(byKey.values())
    .sort((a, b) => {
      const scoreDiff = sortScore(b) - sortScore(a);
      return scoreDiff === 0 ? a.order - b.order : scoreDiff;
    })
    .slice(0, limit)
    .map((image) => ({
      priority: image.priority,
      reason: image.reason,
      siteType: image.siteType,
      url: image.url,
    }));

  return {
    images,
    pageTitle: document.title || "",
    pageUrl: location.href,
    siteType,
  };
}

async function clickTemuLoadMoreInPage() {
  const labels = ["查看更多", "显示更多", "加载更多", "View more", "Show more", "Load more", "More"];

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return (
      rect.width > 20 &&
      rect.height > 20 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || 1) > 0
    );
  }

  function textOf(element) {
    return String(element.innerText || element.textContent || element.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  window.scrollTo({ behavior: "smooth", top: document.documentElement.scrollHeight });
  await wait(600);

  const interactiveCandidates = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const textCandidates = Array.from(document.querySelectorAll("span, div")).filter(
    (element) => !element.querySelector("button, [role='button'], a"),
  );
  const candidates = [...interactiveCandidates, ...textCandidates].filter(isVisible);

  for (const element of candidates) {
    const text = textOf(element);

    if (text.length > 80 || !text || !labels.some((label) => text.toLowerCase().includes(label.toLowerCase()))) {
      continue;
    }

    const clickable = element.closest("button, [role='button'], a") || element;
    clickable.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    await wait(250);
    clickable.click();

    return {
      clicked: true,
      label: text.slice(0, 40),
      scrollY: window.scrollY,
    };
  }

  window.scrollBy({ behavior: "smooth", top: Math.max(700, window.innerHeight * 0.9) });
  await wait(700);

  return {
    clicked: false,
    label: "",
    scrollY: window.scrollY,
  };
}

async function scrollPinterestForMoreInPage() {
  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  const beforeY = window.scrollY || scrollingElement.scrollTop || 0;
  const beforeHeight = scrollingElement.scrollHeight || document.documentElement.scrollHeight;
  const scrollAmount = Math.max(900, Math.floor(window.innerHeight * 1.35));

  window.scrollBy({ behavior: "smooth", top: scrollAmount });
  await wait(1100);

  const afterY = window.scrollY || scrollingElement.scrollTop || 0;
  const afterHeight = scrollingElement.scrollHeight || document.documentElement.scrollHeight;
  const atBottom = afterY + window.innerHeight >= afterHeight - 120 && Math.abs(afterY - beforeY) < 20;

  return {
    atBottom,
    beforeHeight,
    afterHeight,
    beforeY,
    afterY,
  };
}

async function scrollGenericForMoreInPage() {
  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  const beforeY = window.scrollY || scrollingElement.scrollTop || 0;
  const beforeHeight = scrollingElement.scrollHeight || document.documentElement.scrollHeight;
  const scrollAmount = Math.max(900, Math.floor(window.innerHeight * 1.35));

  window.scrollBy({ behavior: "smooth", top: scrollAmount });
  await wait(1100);

  const afterY = window.scrollY || scrollingElement.scrollTop || 0;
  const afterHeight = scrollingElement.scrollHeight || document.documentElement.scrollHeight;
  const atBottom = afterY + window.innerHeight >= afterHeight - 120 && Math.abs(afterY - beforeY) < 20;

  return {
    atBottom,
    beforeHeight,
    afterHeight,
    beforeY,
    afterY,
  };
}

async function prepareSheinProductImagesInPage() {
  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  window.scrollTo({ behavior: "smooth", top: 0 });
  await wait(950);
  return {
    scrollY: window.scrollY || scrollingElement.scrollTop || 0,
    scrollHeight: scrollingElement.scrollHeight || document.documentElement.scrollHeight,
  };
}

async function primeSheinHoverImagesInPage() {
  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return (
      rect.width >= 100 &&
      rect.height >= 120 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || 1) > 0
    );
  }

  const cardSelectors = [
    "a[href*='-p-']",
    "a[href*='/product/']",
    "a[href*='goods_id=']",
    "a[href*='product_id=']",
    "[data-sku]",
    "[data-goods-id]",
    "[data-product-id]",
    "[class*='ProductItem']",
    "[class*='product-card']",
    "[class*='productCard']",
    "[class*='product-item']",
    "[class*='goods-item']",
    "[class*='goodsItem']",
  ];
  const cards = Array.from(document.querySelectorAll(cardSelectors.join(",")))
    .map(
      (element) =>
        element.closest(
          [
            "[class*='ProductItem']",
            "[class*='product-card']",
            "[class*='productCard']",
            "[class*='product-item']",
            "[class*='goods-item']",
            "[class*='goodsItem']",
            "li",
          ].join(","),
        ) || element,
    )
    .filter((card, index, allCards) => allCards.indexOf(card) === index)
    .filter(isVisible)
    .slice(0, 16);

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const clientX = rect.left + Math.min(Math.max(rect.width / 2, 20), rect.width - 10);
    const clientY = rect.top + Math.min(Math.max(rect.height * 0.35, 20), rect.height - 10);
    const target = card.querySelector("img, picture, a, [class*='img'], [class*='photo']") || card;

    for (const eventName of ["pointerover", "mouseover", "mouseenter", "mousemove"]) {
      target.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          view: window,
        }),
      );
      card.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          view: window,
        }),
      );
    }

    await wait(90);
  }

  await wait(350);
  return {
    primed: cards.length,
  };
}

async function scrollSheinNextViewportInPage() {
  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  const beforeY = window.scrollY || scrollingElement.scrollTop || 0;
  const beforeHeight = scrollingElement.scrollHeight || document.documentElement.scrollHeight;
  const scrollAmount = Math.max(650, Math.floor(window.innerHeight * 0.78));

  window.scrollBy({ behavior: "smooth", top: scrollAmount });
  await wait(750);

  const afterY = window.scrollY || scrollingElement.scrollTop || 0;
  const afterHeight = scrollingElement.scrollHeight || document.documentElement.scrollHeight;
  const atBottom = afterY + window.innerHeight >= afterHeight - 140 || Math.abs(afterY - beforeY) < 20;

  return {
    afterHeight,
    afterY,
    atBottom,
    beforeHeight,
    beforeY,
  };
}

async function clickSheinNextPageInPage() {
  const nextPatterns =
    /(next|right|arrow-right|pagination-next|next-page|sui-pagination__next|下一|后页|下页|dalej|następ|nastep|suivant|siguiente|weiter|proxima|próxima)/i;

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return (
      rect.width >= 8 &&
      rect.height >= 8 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || 1) > 0
    );
  }

  function isDisabled(element) {
    const disabledText = [
      element.getAttribute("disabled"),
      element.getAttribute("aria-disabled"),
      element.getAttribute("class"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return disabledText.includes("true") || disabledText.includes("disabled");
  }

  function textOf(element) {
    return String(
      element.innerText ||
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "",
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function contextOf(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && depth < 5) {
      parts.push(
        current.getAttribute?.("aria-label"),
        current.getAttribute?.("class"),
        current.getAttribute?.("data-testid"),
        current.getAttribute?.("id"),
        current.getAttribute?.("rel"),
        current.getAttribute?.("title"),
      );
      current = current.parentElement;
      depth += 1;
    }

    return parts.filter(Boolean).join(" ");
  }

  function paginationContextScore(element) {
    const parentText = textOf(element.closest("nav, ul, ol, div") || element);
    const context = `${contextOf(element)} ${parentText}`;
    let score = 0;

    if (/pagination|page|pages|stron|liczba|łącznie|laczna|total|共|页|頁/i.test(context)) {
      score += 70;
    }

    if (/\b1\b.*\b2\b.*\b3\b/.test(parentText) || /\b\d+\b\s+\b\d+\b\s+\b\d+\b/.test(parentText)) {
      score += 45;
    }

    return score;
  }

  function scoreCandidate(element) {
    if (!isVisible(element) || isDisabled(element)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    const text = textOf(element);
    const context = contextOf(element);
    const combined = `${text} ${context}`;
    let score = paginationContextScore(element);

    if (nextPatterns.test(combined)) {
      score += 120;
    }

    if (/^(>|›|»|→)$/.test(text)) {
      score += 110;
    }

    if (rect.top > window.innerHeight * 0.4) {
      score += 35;
    }

    if (/^\d+$/.test(text)) {
      score -= 80;
    }

    if (/seller|cart|bag|add|shop|goods|product|carousel/i.test(combined)) {
      score -= 80;
    }

    return score;
  }

  function clickElement(element) {
    const clickable = element.closest("button, a, [role='button']") || element;
    clickable.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickable.click();
  }

  const beforeUrl = location.href;
  const beforeScrollY = window.scrollY;
  window.scrollTo({ behavior: "smooth", top: document.documentElement.scrollHeight });
  await wait(900);

  const candidates = Array.from(document.querySelectorAll("a, button, [role='button'], span, i, svg"))
    .map((element) => ({
      element,
      score: scoreCandidate(element),
      text: textOf(element),
    }))
    .filter((candidate) => candidate.score >= 100)
    .sort((a, b) => b.score - a.score);

  if (candidates[0]) {
    clickElement(candidates[0].element);
    return {
      beforeScrollY,
      beforeUrl,
      clicked: true,
      label: candidates[0].text || "next",
      score: candidates[0].score,
    };
  }

  const activePage = Array.from(document.querySelectorAll("a, button, [role='button'], span"))
    .filter(isVisible)
    .map((element) => ({
      element,
      text: textOf(element),
      context: contextOf(element),
    }))
    .find((candidate) => /^\d+$/.test(candidate.text) && /active|current|selected|aria-current/i.test(candidate.context));
  const currentPage = Number(activePage?.text || new URL(location.href).searchParams.get("page") || 0);

  if (Number.isFinite(currentPage) && currentPage > 0) {
    const nextNumber = String(currentPage + 1);
    const numberedCandidate = Array.from(document.querySelectorAll("a, button, [role='button'], span"))
      .filter(isVisible)
      .find((element) => textOf(element) === nextNumber && paginationContextScore(element) > 40);

    if (numberedCandidate) {
      clickElement(numberedCandidate);
      return {
        beforeScrollY,
        beforeUrl,
        clicked: true,
        label: nextNumber,
        score: 90,
      };
    }
  }

  return {
    beforeScrollY,
    beforeUrl,
    clicked: false,
    label: "",
    score: 0,
  };
}

async function saveSettings() {
  await storageSet({
    folderName: folderInput.value.trim(),
    ossFolderName: ossFolderInput.value.trim(),
    scheduleCount: getScheduledCount(),
    scheduleIntervalMinutes: getScheduleIntervalMinutes(),
    scheduleSiteType: scheduleSiteInput.value,
    scheduleUrl: scheduleUrlInput.value.trim(),
    targetCount: getTargetCount(),
  });
}

async function applyPageInfo(result, fallbackTab) {
  state.pageUrl = result?.pageUrl || fallbackTab?.url || "";
  updateSiteType(result?.siteType || detectSiteTypeFromUrl(state.pageUrl));

  if (shouldAutoSetFolder(folderInput.value)) {
    folderInput.value = state.siteType;
    await saveSettings();
  }

  pageText.textContent = result?.pageTitle || state.pageUrl || "当前页面";
}

async function scanCurrentPage() {
  setBusy(true);
  setStatus("正在等待页面图片加载完成...");

  try {
    await saveSettings();
    await delay(IMAGE_SETTLE_DELAY_MS);
    const targetCount = getTargetCount();
    const tab = await getActiveTab();
    const result = await executeInTab(tab.id, collectProductImagesFromPage, [targetCount]);

    await applyPageInfo(result, tab);
    replaceImages(result?.images || [], targetCount);
    renderImages();

    setStatus(
      state.images.length > 0
        ? `扫描完成，已发现 ${state.images.length} 张 ${siteTypeLabel(state.siteType)} 商品图。`
        : "当前页面未发现可采集商品图。",
      state.images.length > 0 ? "success" : "",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "扫描失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

async function autoCollectTemu() {
  setBusy(true);
  setStatus("Temu 自动采集准备中...");

  try {
    await saveSettings();
    const targetCount = getTargetCount();
    const tab = await getActiveTab();
    let staleRounds = 0;
    let round = 0;

    await delay(IMAGE_SETTLE_DELAY_MS);

    while (state.images.length < targetCount && round < TEMU_MAX_ROUNDS && staleRounds < TEMU_STALE_ROUNDS) {
      const beforeCount = state.images.length;
      const scanLimit = Math.min(MAX_TARGET, Math.max(targetCount, beforeCount + 40));
      const result = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);

      await applyPageInfo(result, tab);

      if (state.siteType !== "temu") {
        throw new Error("当前不是 Temu 页面，Temu 自动采集模块不会执行。");
      }

      const added = mergeImages(result?.images || [], targetCount);
      renderImages();

      if (state.images.length >= targetCount) {
        break;
      }

      staleRounds = added > 0 ? 0 : staleRounds + 1;
      setStatus(`Temu 自动采集中：已发现 ${state.images.length}/${targetCount} 张，正在加载更多...`);

      const clickResult = await executeInTab(tab.id, clickTemuLoadMoreInPage, []);

      if (clickResult?.clicked) {
        setStatus(`已点击“${clickResult.label || "查看更多"}”，等待新商品加载...`);
        await delay(IMAGE_SETTLE_DELAY_MS);
      } else {
        setStatus("没有找到“查看更多”，已继续向下滚动等待懒加载...");
        await delay(IMAGE_SETTLE_DELAY_MS);
      }

      if (state.images.length === beforeCount && !clickResult?.clicked) {
        staleRounds += 1;
      }

      round += 1;
    }

    renderImages();

    if (state.images.length >= targetCount) {
      setStatus(`Temu 自动采集完成，已达到目标 ${targetCount} 张。`, "success");
    } else if (state.images.length > 0) {
      setStatus(`Temu 自动采集结束，当前发现 ${state.images.length}/${targetCount} 张。页面可能没有更多公开商品图。`);
    } else {
      setStatus("Temu 自动采集没有发现商品图，请确认页面已正常加载。", "error");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Temu 自动采集失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

async function autoCollectPinterest() {
  setBusy(true);
  setStatus("Pinterest 自动采集准备中...");

  try {
    await saveSettings();
    const targetCount = getTargetCount();
    const tab = await getActiveTab();
    let staleRounds = 0;
    let round = 0;

    await delay(IMAGE_SETTLE_DELAY_MS);

    while (
      state.images.length < targetCount &&
      round < PINTEREST_MAX_ROUNDS &&
      staleRounds < PINTEREST_STALE_ROUNDS
    ) {
      const scanLimit = Math.min(MAX_TARGET, Math.max(targetCount, state.images.length + 60));
      const result = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);

      await applyPageInfo(result, tab);

      if (state.siteType !== "pinterest") {
        throw new Error("当前不是 Pinterest 页面，Pinterest 自动采集模块不会执行。");
      }

      const added = mergeImages(result?.images || [], targetCount);
      renderImages();

      if (state.images.length >= targetCount) {
        break;
      }

      staleRounds = added > 0 ? 0 : staleRounds + 1;
      setStatus(`Pinterest 自动采集中：已发现 ${state.images.length}/${targetCount} 张，正在向下加载...`);

      const scrollResult = await executeInTab(tab.id, scrollPinterestForMoreInPage, []);

      if (scrollResult?.atBottom && added === 0) {
        staleRounds += 1;
      }

      await delay(IMAGE_SETTLE_DELAY_MS);
      round += 1;
    }

    renderImages();

    if (state.images.length >= targetCount) {
      setStatus(`Pinterest 自动采集完成，已达到目标 ${targetCount} 张。`, "success");
    } else if (state.images.length > 0) {
      setStatus(`Pinterest 自动采集结束，当前发现 ${state.images.length}/${targetCount} 张。页面可能没有更多新图片。`);
    } else {
      setStatus("Pinterest 自动采集没有发现图片，请确认页面已正常加载。", "error");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Pinterest 自动采集失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

async function autoCollectGeneric() {
  setBusy(true);
  setStatus("通用网站自动采集准备中...");

  try {
    await saveSettings();
    const targetCount = getTargetCount();
    const tab = await getActiveTab();
    let staleRounds = 0;
    let round = 0;

    await delay(IMAGE_SETTLE_DELAY_MS);

    while (
      state.images.length < targetCount &&
      round < GENERIC_MAX_ROUNDS &&
      staleRounds < GENERIC_STALE_ROUNDS
    ) {
      const scanLimit = Math.min(MAX_TARGET, Math.max(targetCount, state.images.length + 60));
      const result = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);

      await applyPageInfo(result, tab);

      if (state.siteType !== "generic") {
        throw new Error("当前网站已有专属采集模块，请使用对应网站的自动采集按钮。");
      }

      const added = mergeImages(result?.images || [], targetCount);
      renderImages();

      if (state.images.length >= targetCount) {
        break;
      }

      staleRounds = added > 0 ? 0 : staleRounds + 1;
      setStatus(`通用网站自动采集中：已发现 ${state.images.length}/${targetCount} 张，正在向下加载...`);

      const scrollResult = await executeInTab(tab.id, scrollGenericForMoreInPage, []);

      if (scrollResult?.atBottom && added === 0) {
        staleRounds += 1;
      }

      await delay(IMAGE_SETTLE_DELAY_MS);
      round += 1;
    }

    renderImages();

    if (state.images.length >= targetCount) {
      setStatus(`通用网站自动采集完成，已达到目标 ${targetCount} 张。`, "success");
    } else if (state.images.length > 0) {
      setStatus(`通用网站自动采集结束，当前发现 ${state.images.length}/${targetCount} 张。页面可能没有更多新图片。`);
    } else {
      setStatus("通用网站自动采集没有发现图片，请确认页面已正常加载。", "error");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "通用网站自动采集失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

async function autoCollectShein() {
  setBusy(true);
  setStatus("SHEIN 自动采集准备中...");

  try {
    await saveSettings();
    const targetCount = getTargetCount();
    const tab = await getActiveTab();
    let staleRounds = 0;
    let round = 0;

    while (state.images.length < targetCount && round < SHEIN_MAX_ROUNDS && staleRounds < SHEIN_STALE_ROUNDS) {
      const scanLimit = Math.min(MAX_TARGET, Math.max(targetCount, state.images.length + 60));
      let pageAdded = 0;

      setStatus(`SHEIN 自动采集中：正在从当前页顶部开始逐屏扫描...`);
      await executeInTab(tab.id, prepareSheinProductImagesInPage, []);
      await delay(IMAGE_SETTLE_DELAY_MS);

      for (let step = 0; step < SHEIN_PAGE_SCAN_STEPS && state.images.length < targetCount; step += 1) {
        const mainResult = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);

        await applyPageInfo(mainResult, tab);

        if (state.siteType !== "shein") {
          throw new Error("当前不是 SHEIN 页面，SHEIN 自动采集模块不会执行。");
        }

        const mainAdded = mergeImages(mainResult?.images || [], targetCount);
        pageAdded += mainAdded;
        renderImages();

        if (state.images.length >= targetCount) {
          break;
        }

        await executeInTab(tab.id, primeSheinHoverImagesInPage, []);
        const result = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);

        await applyPageInfo(result, tab);

        if (state.siteType !== "shein") {
          throw new Error("当前不是 SHEIN 页面，SHEIN 自动采集模块不会执行。");
        }

        const added = mergeImages(result?.images || [], targetCount);
        pageAdded += added;
        renderImages();

        if (state.images.length >= targetCount) {
          break;
        }

        setStatus(
          `SHEIN 自动采集中：当前页第 ${step + 1} 屏，已发现 ${state.images.length}/${targetCount} 张...`,
        );

        const scrollResult = await executeInTab(tab.id, scrollSheinNextViewportInPage, []);
        await delay(IMAGE_SETTLE_DELAY_MS);

        if (scrollResult?.atBottom) {
          const bottomMainResult = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);
          const bottomMainAdded = mergeImages(bottomMainResult?.images || [], targetCount);
          pageAdded += bottomMainAdded;
          renderImages();

          if (state.images.length >= targetCount) {
            break;
          }

          await executeInTab(tab.id, primeSheinHoverImagesInPage, []);
          const bottomResult = await executeInTab(tab.id, collectProductImagesFromPage, [scanLimit]);
          const bottomAdded = mergeImages(bottomResult?.images || [], targetCount);
          pageAdded += bottomAdded;
          renderImages();
          break;
        }
      }

      if (state.images.length >= targetCount) {
        break;
      }

      staleRounds = pageAdded > 0 ? 0 : staleRounds + 1;
      setStatus(`SHEIN 自动采集中：已发现 ${state.images.length}/${targetCount} 张，正在点击下一页...`);

      const pageResult = await executeInTab(tab.id, clickSheinNextPageInPage, []);

      if (pageResult?.clicked) {
        setStatus(`已点击 SHEIN 下一页“${pageResult.label || "next"}”，等待新页面加载...`);
        await delay(IMAGE_SETTLE_DELAY_MS);
      } else {
        staleRounds += 1;
        setStatus("没有找到 SHEIN 下一页按钮，可能已经到最后一页。");
        await delay(IMAGE_SETTLE_DELAY_MS);
      }

      round += 1;
    }

    renderImages();

    if (state.images.length >= targetCount) {
      setStatus(`SHEIN 自动采集完成，已达到目标 ${targetCount} 张。`, "success");
    } else if (state.images.length > 0) {
      setStatus(`SHEIN 自动采集结束，当前发现 ${state.images.length}/${targetCount} 张。页面可能没有更多新商品图。`);
    } else {
      setStatus("SHEIN 自动采集没有发现商品图，请确认页面已正常加载。", "error");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "SHEIN 自动采集失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

function downloadFile(url, filename) {
  return new Promise((resolve) => {
    if (!chrome.downloads?.download) {
      resolve({ errorMessage: "浏览器下载权限不可用，请重新加载扩展。", ok: false, url });
      return;
    }

    chrome.downloads.download(
      {
        conflictAction: "uniquify",
        filename,
        saveAs: false,
        url,
      },
      (downloadId) => {
        const error = chrome.runtime.lastError;

        if (error) {
          resolve({ errorMessage: error.message, ok: false, url });
          return;
        }

        resolve({ downloadId, ok: true, url });
      },
    );
  });
}

// Pinterest 缩略图（236x/474x/736x…）和原图只差 URL 里的尺寸目录段，hash 路径相同。
// 把尺寸段重写为 originals 即可拿到上传原图；originals 的扩展名可能与缩略图不同，
// 所以按画质从高到低生成多个候选，逐个探测，谁先返回有效图片就用谁。
function pinterestUrlCandidates(url) {
  try {
    const parsed = new URL(url);

    if (!/(^|\.)pinimg\.com$/i.test(parsed.hostname)) {
      return [url];
    }

    const segments = parsed.pathname.split("/").filter(Boolean);

    // 形如 /{size}/{a}/{b}/{c}/{hash}.{ext}，至少要有尺寸段 + 文件段。
    if (segments.length < 2) {
      return [url];
    }

    const rest = segments.slice(1).join("/");
    const extMatch = rest.match(/\.(avif|jpe?g|png|webp|gif)$/i);
    const originalExt = (extMatch?.[1] || "jpg").toLowerCase();
    const restNoExt = extMatch ? rest.slice(0, -extMatch[0].length) : rest;
    const base = `${parsed.protocol}//${parsed.host}`;
    const exts = [originalExt, "jpg", "png", "webp", "jpeg", "gif"].filter(
      (ext, index, all) => all.indexOf(ext) === index,
    );

    const candidates = [];

    // 1) 原图目录 originals，多扩展名探测（最高清）。
    for (const ext of exts) {
      candidates.push(`${base}/originals/${restNoExt}.${ext}`);
    }

    // 2) originals 不存在时，退到最大的固定尺寸。
    for (const size of ["1200x", "736x"]) {
      candidates.push(`${base}/${size}/${restNoExt}.${originalExt}`);
    }

    // 3) 最后兜底用采集到的原始缩略图 URL。
    candidates.push(url);

    return candidates.filter((item, index, all) => all.indexOf(item) === index);
  } catch {
    return [url];
  }
}

// 按画质降序探测候选 URL，返回第一张有效原图。
// 严格校验：必须是图片、体积达标，排除 404 占位 / 1px 透明图等无效内容。
async function fetchBestImageBlob(url) {
  const candidates = pinterestUrlCandidates(url);
  let lastError = "";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const blob = await response.blob();

      if (!/^image\//i.test(blob.type) || blob.size < 1024) {
        lastError = "返回内容不是有效图片";
        continue;
      }

      return { blob, url: candidate };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`读取图片失败：${lastError || "无可用画质"}`);
}

async function downloadImageAsJpeg(url, filename) {
  try {
    const { blob } = await fetchBestImageBlob(url);
    const objectUrl = URL.createObjectURL(await blobToJpegBlob(blob));

    try {
      return await downloadFile(objectUrl, filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "图片转换为 JPG 失败。",
      ok: false,
      url,
    };
  }
}

async function downloadSelectedImages() {
  const selectedUrls = state.images.filter((image) => state.selected.has(image.url)).map((image) => image.url);

  if (selectedUrls.length === 0) {
    setStatus("请先选择图片。", "error");
    return;
  }

  setBusy(true);

  try {
    await saveSettings();
    const configuredFolder = sanitizeFolderPath(folderInput.value || "images", "images");
    const websiteFolder = sanitizeFolderPath(state.siteType || "generic", "generic");
    const folderParts = configuredFolder.split("/");
    const folderName =
      folderParts.at(-1)?.toLowerCase() === websiteFolder.toLowerCase()
        ? configuredFolder
        : `${configuredFolder}/${websiteFolder}`;
    const results = [];

    for (let index = 0; index < selectedUrls.length; index += 1) {
      const url = selectedUrls[index];
      const sequence = String(index + 1).padStart(3, "0");
      const filename = `${folderName}/${sequence}-${jpegFilenameFromUrl(url)}`;

      setStatus(`正在下载 ${index + 1}/${selectedUrls.length} 到 ${folderName}...`);
      results.push(await downloadImageAsJpeg(url, filename));
      await delay(DOWNLOAD_DELAY_MS);
    }

    const successCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - successCount;
    setStatus(
      `下载任务已提交。成功 ${successCount} 张，失败 ${failedCount} 张。保存位置在浏览器默认下载目录/${folderName}`,
      failedCount > 0 ? "" : "success",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "下载失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

async function imageUrlToFile(url, index) {
  const { blob: sourceBlob } = await fetchBestImageBlob(url);
  const blob = await blobToJpegBlob(sourceBlob);
  const baseFilename = jpegFilenameFromUrl(url);
  const sequence = String(index + 1).padStart(3, "0");
  return new File([blob], `${sequence}-${baseFilename}`, {
    type: "image/jpeg",
  });
}

function siteFolderName() {
  return sanitizeOssFolderPath(state.siteType || folderInput.value || "generic", "generic");
}

function normalizeEmployeeName(value) {
  const trimmed = String(value || "").trim();

  return OLD_OSS_FOLDER_NAMES.has(trimmed.toLowerCase()) ? "" : trimmed;
}

function serverUploadBaseUrl() {
  return SERVER_UPLOAD_BASE_URL.replace(/\/+$/, "");
}

function serverUploadUrl() {
  return serverUploadBaseUrl() + SERVER_UPLOAD_ENDPOINT;
}

function serverDateFolderName(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return year + "-" + month + "-" + day;
}

function collectorFolderName(employeeName, siteType) {
  return [employeeName, serverDateFolderName(), siteType].filter(Boolean).join("/");
}

async function uploadFileToServer(file, metadata) {
  const formData = new FormData();
  formData.append("files", file, file.name || "image.jpg");
  formData.append("employee_name", metadata.employeeName || "未分类");
  formData.append("site_type", metadata.siteType || "generic");
  formData.append("source_url", metadata.sourceUrl || "");
  formData.append("page_url", metadata.pageUrl || "");
  formData.append("source", "browser_extension");

  const response = await fetch(serverUploadUrl(), {
    body: formData,
    method: "POST",
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.success_count === 0) {
    const failed = data?.results?.find?.((result) => !result.success);
    const message = failed?.error || data?.error || "服务器传输失败";
    throw new Error("服务器传输失败：HTTP " + response.status + " " + message);
  }

  return data.results?.[0] || null;
}

async function uploadSelectedImagesToServer() {
  const selectedImages = state.images.filter((image) => state.selected.has(image.url));

  if (selectedImages.length === 0) {
    setStatus("请先选择图片。", "error");
    return;
  }

  setBusy(true);

  try {
    await saveSettings();
    const employeeName = sanitizeOssFolderPath(normalizeEmployeeName(ossFolderInput.value) || "未分类", "未分类");
    const siteType = siteFolderName();
    const collectorFolder = collectorFolderName(employeeName, siteType);
    let successCount = 0;
    let failedCount = 0;

    for (let index = 0; index < selectedImages.length; index += 1) {
      const image = selectedImages[index];

      try {
        setStatus("正在读取图片 " + (index + 1) + "/" + selectedImages.length + "，准备传输到服务器采集库/" + collectorFolder + "...");
        const file = await imageUrlToFile(image.url, index);
        await uploadFileToServer(file, {
          employeeName,
          pageUrl: state.pageUrl || "",
          siteType,
          sourceUrl: image.url,
        });
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        setStatus(error instanceof Error ? error.message : "服务器传输单张图片失败。", "error");
      }

      await delay(120);
    }

    setStatus(
      "服务器传输完成：成功 " + successCount + " 张，失败 " + failedCount + " 张。保存位置：/wmsFile/pod-ai-data/collector-library/" + collectorFolder,
      failedCount > 0 ? "" : "success",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "服务器传输失败。", "error");
  } finally {
    setBusy(false);
    updateSummary();
  }
}

function normalizedScheduleSiteType(value) {
  return ["pinterest", "shein", "temu"].includes(value) ? value : "temu";
}

function schedulePayload() {
  const employeeName = normalizeEmployeeName(ossFolderInput.value);
  const siteType = normalizedScheduleSiteType(scheduleSiteInput.value);
  const url = scheduleUrlInput.value.trim();

  if (!employeeName) {
    throw new Error("请先填写员工姓名。");
  }

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("");
    }
  } catch {
    throw new Error("请填写正确的目标网址，例如 https://www.temu.com/...");
  }

  return {
    employeeName,
    intervalMinutes: getScheduleIntervalMinutes(),
    siteType,
    targetCount: getScheduledCount(),
    url,
  };
}

function formatScheduleTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function renderScheduleState(response) {
  const config = response?.config;
  const status = response?.status;

  if (config) {
    scheduleSiteInput.value = normalizedScheduleSiteType(config.siteType);
    scheduleUrlInput.value = config.url || scheduleUrlInput.value;
    scheduleCountInput.value = String(config.targetCount || getScheduledCount());
    setScheduleIntervalInputs(config.intervalMinutes || getScheduleIntervalMinutes());

    if (config.employeeName && !ossFolderInput.value.trim()) {
      ossFolderInput.value = config.employeeName;
    }
  }

  if (!config?.enabled) {
    scheduleStatusText.textContent = "未开启定时采集";
    return;
  }

  const nextText = status?.nextRunAt ? `下次：${formatScheduleTime(status.nextRunAt)}` : "等待下次执行";
  const lastText = status?.lastMessage ? `；${status.lastMessage}` : "";
  scheduleStatusText.textContent = `已开启，${nextText}${lastText}`;
}

async function refreshScheduleState() {
  try {
    renderScheduleState(await sendRuntimeMessage({ type: "POD_SCHEDULE_GET" }));
  } catch {
    scheduleStatusText.textContent = "定时后台未就绪，请重新加载插件。";
  }
}

async function startSchedule() {
  try {
    await saveSettings();
    const config = schedulePayload();
    const response = await sendRuntimeMessage({ config, type: "POD_SCHEDULE_START" });
    renderScheduleState(response);
    setStatus("定时采集已开启。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "开启定时采集失败。", "error");
  }
}

async function stopSchedule() {
  try {
    const response = await sendRuntimeMessage({ type: "POD_SCHEDULE_STOP" });
    renderScheduleState(response);
    setStatus("定时采集已停止。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "停止定时采集失败。", "error");
  }
}

async function runScheduleNow() {
  try {
    await saveSettings();
    const config = schedulePayload();
    const response = await sendRuntimeMessage({ config, type: "POD_SCHEDULE_RUN_NOW" });
    renderScheduleState(response);
    setStatus("已提交立即执行任务，后台会打开页面采集并上传。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "立即执行失败。", "error");
  }
}

function toggleSelectAll() {
  if (state.images.length === 0) {
    return;
  }

  if (state.selected.size === state.images.length) {
    state.selected.clear();
  } else {
    state.selected = new Set(state.images.map((image) => image.url));
  }

  renderImages();
}

async function init() {
  const settings = await storageGet([
    "folderName",
    "ossFolderName",
    "scheduleCount",
    "scheduleIntervalMinutes",
    "scheduleSiteType",
    "scheduleUrl",
    "targetCount",
  ]);
  const tab = await getActiveTab().catch(() => null);

  folderInput.value = settings.folderName || "";
  ossFolderInput.value = normalizeEmployeeName(settings.ossFolderName);
  scheduleCountInput.value = String(settings.scheduleCount || DEFAULT_TARGET);
  setScheduleIntervalInputs(settings.scheduleIntervalMinutes || 60);
  scheduleSiteInput.value = normalizedScheduleSiteType(settings.scheduleSiteType || state.siteType);
  scheduleUrlInput.value = settings.scheduleUrl || "";
  targetInput.value = String(settings.targetCount || DEFAULT_TARGET);
  state.pageUrl = tab?.url || "";
  pageText.textContent = tab?.title || tab?.url || "当前页面";
  updateSiteType(detectSiteTypeFromUrl(state.pageUrl));

  if (shouldAutoSetFolder(folderInput.value)) {
    folderInput.value = state.siteType;
  }

  if (!settings.scheduleSiteType && ["pinterest", "shein", "temu"].includes(state.siteType)) {
    scheduleSiteInput.value = state.siteType;
  }

  if (!scheduleUrlInput.value && ["pinterest", "shein", "temu"].includes(state.siteType)) {
    scheduleUrlInput.value = state.pageUrl;
  }

  await refreshScheduleState();
  renderImages();
}

clearButton.addEventListener("click", clearImages);
downloadButton.addEventListener("click", () => void downloadSelectedImages());
folderInput.addEventListener("change", () => void saveSettings());
genericAutoButton.addEventListener("click", () => void autoCollectGeneric());
ossFolderInput.addEventListener("change", () => void saveSettings());
ossUploadButton.addEventListener("click", () => void uploadSelectedImagesToServer());
scanButton.addEventListener("click", () => void scanCurrentPage());
scheduleCountInput.addEventListener("change", () => void saveSettings());
scheduleIntervalDaysInput.addEventListener("change", () => void saveSettings());
scheduleIntervalHoursInput.addEventListener("change", () => void saveSettings());
scheduleIntervalMinutesInput.addEventListener("change", () => void saveSettings());
scheduleRunNowButton.addEventListener("click", () => void runScheduleNow());
scheduleSiteInput.addEventListener("change", () => void saveSettings());
scheduleStartButton.addEventListener("click", () => void startSchedule());
scheduleStopButton.addEventListener("click", () => void stopSchedule());
scheduleUrlInput.addEventListener("change", () => void saveSettings());
selectAllButton.addEventListener("click", toggleSelectAll);
targetInput.addEventListener("change", () => void saveSettings());
pinterestAutoButton.addEventListener("click", () => void autoCollectPinterest());
sheinAutoButton.addEventListener("click", () => void autoCollectShein());
temuAutoButton.addEventListener("click", () => void autoCollectTemu());

void init();
