/* global chrome */

const ALARM_NAME = "pod-image-collector-schedule";
const LEGACY_ROOT_FOLDER_NAME = "杨文韬文件";
const SERVER_UPLOAD_BASE_URL = "http://8.209.98.115:3000";
const SERVER_UPLOAD_ENDPOINT = "/api/collector-library";
const IMAGE_SETTLE_DELAY_MS = 3000;
const MAX_TARGET = 2000;

let runningSchedule = false;

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

function createAlarm(name, info) {
  return new Promise((resolve) => {
    chrome.alarms.create(name, info);
    resolve();
  });
}

function clearAlarm(name) {
  return new Promise((resolve) => {
    chrome.alarms.clear(name, resolve);
  });
}

function getAlarm(name) {
  return new Promise((resolve) => {
    chrome.alarms.get(name, resolve);
  });
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ active: false, url }, (tab) => {
      const error = chrome.runtime.lastError;

      if (error || !tab?.id) {
        reject(new Error(error?.message || "无法打开定时采集页面。"));
        return;
      }

      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => resolve());
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

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function finish() {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    const tick = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error("定时采集页面已关闭。"));
          return;
        }

        if (tab?.status === "complete") {
          finish();
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          finish();
          return;
        }

        setTimeout(tick, 500);
      });
    };

    tick();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sanitizePathSegment(value, fallback) {
  const sanitized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 120);

  return sanitized || fallback;
}

function sanitizeOssFolderPath(value, fallback) {
  const parts = String(value || "")
    .split(/[\\/]+/g)
    .map((part) => sanitizePathSegment(part, ""))
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
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    image.close();
    throw new Error("当前浏览器无法转换 JPG 图片。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  image.close();

  return canvas.convertToBlob({
    quality: 0.95,
    type: "image/jpeg",
  });
}

function imageIdentity(url) {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").pop() || parsed.pathname;
    const sheinPrefix = filename.match(/^([a-f0-9]{24,})/i)?.[1];

    if (sheinPrefix) {
      return `${parsed.hostname}/${sheinPrefix}`;
    }

    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "spm"].forEach((key) =>
      parsed.searchParams.delete(key),
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

function scheduledUploadedKey(config, imageUrl) {
  return [sanitizeOssFolderPath(config.employeeName, "未分类"), normalizeSiteType(config.siteType), imageIdentity(imageUrl)].join("|");
}

function normalizeSiteType(value) {
  return ["pinterest", "shein", "temu"].includes(value) ? value : "temu";
}

function serverUploadUrl() {
  return SERVER_UPLOAD_BASE_URL.replace(/\/+$/, "") + SERVER_UPLOAD_ENDPOINT;
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

function collectorFolderName(config) {
  const employee = sanitizeOssFolderPath(config.employeeName, "未分类");
  return [employee, serverDateFolderName(), normalizeSiteType(config.siteType)].join("/");
}

function pinterestUrlCandidates(url) {
  try {
    const parsed = new URL(url);

    if (!/(^|\.)pinimg\.com$/i.test(parsed.hostname)) {
      return [url];
    }

    const segments = parsed.pathname.split("/").filter(Boolean);

    if (segments.length < 2) {
      return [url];
    }

    const rest = segments.slice(1).join("/");
    const extMatch = rest.match(/\.(avif|jpe?g|png|webp|gif)$/i);
    const originalExt = (extMatch?.[1] || "jpg").toLowerCase();
    const restNoExt = extMatch ? rest.slice(0, -extMatch[0].length) : rest;
    const base = parsed.protocol + "//" + parsed.host;
    const exts = [originalExt, "jpg", "png", "webp", "jpeg", "gif"].filter(
      (ext, index, all) => all.indexOf(ext) === index,
    );
    const candidates = [];

    for (const ext of exts) {
      candidates.push(base + "/originals/" + restNoExt + "." + ext);
    }

    for (const size of ["1200x", "736x"]) {
      candidates.push(base + "/" + size + "/" + restNoExt + "." + originalExt);
    }

    candidates.push(url);

    return candidates.filter((item, index, all) => all.indexOf(item) === index);
  } catch {
    return [url];
  }
}

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
        lastError = "HTTP " + response.status;
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

  throw new Error("读取图片失败：" + (lastError || "无可用画质"));
}

async function uploadImageToServer(config, imageUrl, index) {
  const { blob: sourceBlob, url: resolvedUrl } = await fetchBestImageBlob(imageUrl);
  const blob = await blobToJpegBlob(sourceBlob);
  const filename =
    String(index + 1).padStart(3, "0") + "-" + crypto.randomUUID() + "-" + sanitizePathSegment(jpegFilenameFromUrl(imageUrl), "image.jpg");
  const formData = new FormData();
  formData.append("files", blob, filename);
  formData.append("employee_name", sanitizeOssFolderPath(config.employeeName, "未分类"));
  formData.append("site_type", normalizeSiteType(config.siteType));
  formData.append("source_url", resolvedUrl || imageUrl);
  formData.append("page_url", config.url || "");
  formData.append("source", "browser_extension_schedule");

  const uploadResponse = await fetch(serverUploadUrl(), {
    body: formData,
    method: "POST",
  });
  const data = await uploadResponse.json().catch(() => null);

  if (!uploadResponse.ok || !data || data.success_count === 0) {
    const failed = data?.results?.find?.((result) => !result.success);
    const message = failed?.error || data?.error || "服务器传输失败";
    throw new Error("服务器传输失败：HTTP " + uploadResponse.status + " " + message);
  }

  return { folder: collectorFolderName(config), url: data.results?.[0]?.public_url || "" };
}

function collectScheduledImagesInPage(siteType, limit) {
  const badPattern = /(avatar|badge|banner|brand|coupon|favicon|icon|logo|placeholder|sprite|truck)/i;
  const imageExtPattern = /\.(avif|jpe?g|png|webp)(?:[?#]|$)/i;
  const site = ["pinterest", "shein", "temu"].includes(siteType) ? siteType : "temu";

  function srcsetUrls(value) {
    return String(value || "")
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function urlValues(img) {
    return [
      img.currentSrc,
      img.src,
      img.getAttribute("src"),
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-image"),
      ...srcsetUrls(img.getAttribute("srcset")),
      ...srcsetUrls(img.getAttribute("data-srcset")),
    ].filter(Boolean);
  }

  function normalizeUrl(value) {
    try {
      const cleaned = String(value || "")
        .replace(/\\u002F/gi, "/")
        .replace(/&amp;/g, "&")
        .trim();
      const parsed = new URL(cleaned, location.href);

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "";
      }

      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function contextFor(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && depth < 5) {
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

  function isLargeVisible(img) {
    const rect = img.getBoundingClientRect();
    return rect.width >= 110 && rect.height >= 110 && rect.bottom > -1200 && rect.top < window.innerHeight + 1800;
  }

  function isAllowedForSite(url, img) {
    const lower = `${url} ${contextFor(img)}`.toLowerCase();

    if (!url || badPattern.test(lower)) {
      return false;
    }

    if (site === "temu") {
      return lower.includes("kwcdn.com") || Boolean(img.closest("a[href*='temu.'], [data-testid*='goods'], [class*='goods']"));
    }

    if (site === "pinterest") {
      return (
        /pinimg\.com/i.test(url) &&
        Boolean(img.closest("a[href*='/pin/'], [data-test-id*='pin'], [data-test-id*='masonry'], article"))
      );
    }

    if (site === "shein") {
      const card = img.closest(
        [
          "a[href*='-p-']",
          "a[href*='/product/']",
          "[data-goods-id]",
          "[data-product-id]",
          "[class*='product-card']",
          "[class*='productCard']",
          "[class*='product-item']",
          "[class*='goods']",
        ].join(","),
      );

      if (!card || !/shein|ltwebstatic|romwe/i.test(url)) {
        return false;
      }

      const rect = img.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const inMainImageArea = rect.top <= cardRect.top + cardRect.height * 0.74;
      return inMainImageArea && rect.width >= 130 && rect.height >= 150;
    }

    return imageExtPattern.test(url);
  }

  const found = [];
  const seen = new Set();

  for (const img of Array.from(document.images)) {
    if (!isLargeVisible(img)) {
      continue;
    }

    for (const raw of urlValues(img)) {
      const url = normalizeUrl(raw);

      if (!isAllowedForSite(url, img)) {
        continue;
      }

      const key = url.replace(/([?&](utm_[^=&]+|spm)=[^&]*)/gi, "");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      found.push({
        reason: `${site}:scheduled`,
        sourceType: site,
        url,
      });

      if (found.length >= limit) {
        return found;
      }
    }
  }

  return found;
}

function triggerScheduledMoreInPage(siteType) {
  const site = ["pinterest", "shein", "temu"].includes(siteType) ? siteType : "temu";

  function visible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  if (site === "temu") {
    const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"));
    const loadMore = buttons.find((button) => {
      const text = (button.textContent || button.getAttribute("aria-label") || "").trim().toLowerCase();
      return visible(button) && /(查看更多|更多|show more|view more|load more)/i.test(text);
    });

    if (loadMore) {
      loadMore.click();
      return { action: "click", atBottom: false };
    }
  }

  if (site === "shein") {
    const nearBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 120;

    if (nearBottom) {
      const next = Array.from(document.querySelectorAll("a, button, [role='button']")).find((element) => {
        const text = (element.textContent || element.getAttribute("aria-label") || "").trim().toLowerCase();
        return visible(element) && /(next|następna|下一页|›|>)/i.test(text) && !element.disabled;
      });

      if (next) {
        next.click();
        return { action: "next", atBottom: true };
      }
    }
  }

  window.scrollBy({ behavior: "smooth", left: 0, top: Math.max(700, window.innerHeight * 0.85) });
  return {
    action: "scroll",
    atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 120,
  };
}

async function collectImagesFromScheduledTab(tabId, config) {
  const siteType = normalizeSiteType(config.siteType);
  const targetCount = Math.min(Math.max(Number(config.targetCount || 100), 1), MAX_TARGET);
  const maxRounds = siteType === "shein" ? 80 : siteType === "pinterest" ? 70 : 45;
  const staleLimit = siteType === "shein" ? 8 : 6;
  const images = [];
  const seen = new Set();
  let staleRounds = 0;

  for (let round = 0; images.length < targetCount && round < maxRounds && staleRounds < staleLimit; round += 1) {
    const before = images.length;
    const result = await executeInTab(tabId, collectScheduledImagesInPage, [siteType, targetCount + 60]);

    for (const image of result || []) {
      const key = imageIdentity(image.url);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      images.push(image);

      if (images.length >= targetCount) {
        break;
      }
    }

    if (images.length >= targetCount) {
      break;
    }

    staleRounds = images.length > before ? 0 : staleRounds + 1;
    await executeInTab(tabId, triggerScheduledMoreInPage, [siteType]);
    await delay(IMAGE_SETTLE_DELAY_MS);
  }

  return images.slice(0, targetCount);
}

async function uploadScheduledImages(config, images) {
  const stored = await storageGet(["podUploadedImageKeys"]);
  const uploadedKeys = new Set(Array.isArray(stored.podUploadedImageKeys) ? stored.podUploadedImageKeys : []);
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let index = 0; index < images.length; index += 1) {
    const key = scheduledUploadedKey(config, images[index].url);

    if (uploadedKeys.has(key)) {
      skippedCount += 1;
      continue;
    }

    try {
      await uploadImageToServer(config, images[index].url, index);
      uploadedKeys.add(key);
      successCount += 1;
    } catch {
      failedCount += 1;
    }

    await delay(120);
  }

  const trimmedKeys = Array.from(uploadedKeys).slice(-12000);
  await storageSet({ podUploadedImageKeys: trimmedKeys });

  return { failedCount, skippedCount, successCount };
}

async function updateScheduleStatus(statusPatch) {
  const current = await storageGet(["podScheduleStatus"]);
  const status = {
    ...(current.podScheduleStatus || {}),
    ...statusPatch,
    updatedAt: Date.now(),
  };
  await storageSet({ podScheduleStatus: status });
  return status;
}

async function runScheduledCollection(config) {
  if (runningSchedule) {
    return;
  }

  runningSchedule = true;
  let tabId = null;

  try {
    await updateScheduleStatus({
      lastMessage: "正在打开页面",
      lastStartedAt: Date.now(),
      running: true,
    });

    const tab = await createTab(config.url);
    tabId = tab.id;
    await waitForTabComplete(tabId);
    await delay(IMAGE_SETTLE_DELAY_MS);

    const images = await collectImagesFromScheduledTab(tabId, config);

    if (images.length === 0) {
      await updateScheduleStatus({
        failedCount: 0,
        lastFinishedAt: Date.now(),
        lastMessage: "未发现可上传图片",
        running: false,
        successCount: 0,
      });
      return;
    }

    const uploadResult = await uploadScheduledImages(config, images);
    await updateScheduleStatus({
      failedCount: uploadResult.failedCount,
      lastFinishedAt: Date.now(),
      lastMessage: `完成：上传 ${uploadResult.successCount}/${images.length} 张，跳过重复 ${uploadResult.skippedCount} 张`,
      running: false,
      skippedCount: uploadResult.skippedCount,
      successCount: uploadResult.successCount,
    });
  } catch (error) {
    await updateScheduleStatus({
      lastFinishedAt: Date.now(),
      lastMessage: error instanceof Error ? error.message : "定时采集失败",
      running: false,
    });
  } finally {
    if (tabId) {
      await removeTab(tabId).catch(() => undefined);
    }

    const stored = await storageGet(["podScheduleConfig"]);
    const configNow = stored.podScheduleConfig;
    if (configNow?.enabled) {
      await updateScheduleStatus({ nextRunAt: Date.now() + configNow.intervalMinutes * 60 * 1000 });
    }

    runningSchedule = false;
  }
}

async function scheduleResponse() {
  const alarm = await getAlarm(ALARM_NAME);
  const stored = await storageGet(["podScheduleConfig", "podScheduleStatus"]);
  return {
    config: stored.podScheduleConfig || null,
    status: {
      ...(stored.podScheduleStatus || {}),
      nextRunAt: alarm?.scheduledTime || stored.podScheduleStatus?.nextRunAt || null,
    },
  };
}

async function startSchedule(config) {
  const normalized = {
    employeeName: sanitizeOssFolderPath(config.employeeName, "未分类"),
    enabled: true,
    intervalMinutes: Math.min(Math.max(Number(config.intervalMinutes || 60), 5), 43200),
    siteType: normalizeSiteType(config.siteType),
    targetCount: Math.min(Math.max(Number(config.targetCount || 100), 1), MAX_TARGET),
    url: String(config.url || "").trim(),
  };

  await storageSet({ podScheduleConfig: normalized });
  await createAlarm(ALARM_NAME, {
    delayInMinutes: normalized.intervalMinutes,
    periodInMinutes: normalized.intervalMinutes,
  });
  await updateScheduleStatus({
    lastMessage: "等待执行",
    nextRunAt: Date.now() + normalized.intervalMinutes * 60 * 1000,
    running: false,
  });

  return scheduleResponse();
}

async function stopSchedule() {
  const stored = await storageGet(["podScheduleConfig"]);
  await clearAlarm(ALARM_NAME);
  await storageSet({
    podScheduleConfig: stored.podScheduleConfig ? { ...stored.podScheduleConfig, enabled: false } : null,
  });
  await updateScheduleStatus({
    lastMessage: "已停止",
    nextRunAt: null,
    running: false,
  });

  return scheduleResponse();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) {
    return;
  }

  void storageGet(["podScheduleConfig"]).then((stored) => {
    if (stored.podScheduleConfig?.enabled) {
      void runScheduledCollection(stored.podScheduleConfig);
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "POD_SCHEDULE_GET") {
      sendResponse(await scheduleResponse());
      return;
    }

    if (message?.type === "POD_SCHEDULE_START") {
      sendResponse(await startSchedule(message.config || {}));
      return;
    }

    if (message?.type === "POD_SCHEDULE_STOP") {
      sendResponse(await stopSchedule());
      return;
    }

    if (message?.type === "POD_SCHEDULE_RUN_NOW") {
      const response = await startSchedule(message.config || {});
      void runScheduledCollection(response.config);
      sendResponse(await scheduleResponse());
      return;
    }

    sendResponse({ error: "unknown message" });
  })();

  return true;
});
