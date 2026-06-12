(() => {
  const ROOT_ID = "pod-image-collector-floating-root";
  const PANEL_ID = "pod-image-collector-panel";
  const BUTTON_ID = "pod-image-collector-button";

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.style.position = "fixed";
  root.style.left = "24px";
  root.style.top = "160px";
  root.style.zIndex = "2147483647";
  root.style.fontFamily =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.title = "POD image collector";
  button.textContent = "";
  button.style.width = "58px";
  button.style.height = "58px";
  button.style.border = "0";
  button.style.borderRadius = "0";
  button.style.background = "linear-gradient(145deg, #fff7ad 0%, #facc15 34%, #f59e0b 66%, #92400e 100%)";
  button.style.boxShadow = "0 0 0 2px rgba(255,255,255,.55), 0 14px 34px rgba(245,158,11,.45)";
  button.style.clipPath =
    "polygon(50% 0%, 61% 34%, 98% 34%, 68% 55%, 79% 91%, 50% 69%, 21% 91%, 32% 55%, 2% 34%, 39% 34%)";
  button.style.color = "#fff4b8";
  button.style.cursor = "grab";
  button.style.fontSize = "0";
  button.style.lineHeight = "0";

  const panel = document.createElement("iframe");
  panel.id = PANEL_ID;
  panel.src = chrome.runtime.getURL("popup.html?floating=1&v=0.5.30");
  panel.style.display = "none";
  panel.style.position = "absolute";
  panel.style.left = "66px";
  panel.style.top = "0";
  panel.style.width = "min(460px, calc(100vw - 96px))";
  panel.style.height = "min(640px, calc(100vh - 24px))";
  panel.style.border = "1px solid rgba(96,165,250,.42)";
  panel.style.borderRadius = "12px";
  panel.style.background = "#080b1a";
  panel.style.boxShadow = "0 22px 48px rgba(2,6,23,.52), 0 0 34px rgba(37,99,235,.24)";

  root.append(button, panel);
  document.documentElement.append(root);

  let dragging = false;
  let pointerMoved = false;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;

  function clampPosition(left, top) {
    const maxLeft = Math.max(8, window.innerWidth - 74);
    const maxTop = Math.max(8, window.innerHeight - 74);

    return {
      left: Math.min(Math.max(8, left), maxLeft),
      top: Math.min(Math.max(8, top), maxTop),
    };
  }

  function updatePanelPlacement() {
    const panelWidth = Math.min(460, Math.max(280, window.innerWidth - 96));
    const panelHeight = Math.min(640, Math.max(360, window.innerHeight - 24));
    const openToLeft = root.offsetLeft + 54 + 66 + panelWidth > window.innerWidth;
    const maxTopOffset = Math.max(0, panelHeight - 54);
    const topOffset = Math.min(Math.max(0, root.offsetTop + panelHeight + 12 - window.innerHeight), maxTopOffset);

    panel.style.width = `${panelWidth}px`;
    panel.style.height = `${panelHeight}px`;
    panel.style.left = openToLeft ? "auto" : "66px";
    panel.style.right = openToLeft ? "66px" : "auto";
    panel.style.top = `-${topOffset}px`;
  }

  button.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointerMoved = false;
    button.setPointerCapture(event.pointerId);
    button.style.cursor = "grabbing";
    startX = event.clientX;
    startY = event.clientY;
    offsetX = event.clientX - root.offsetLeft;
    offsetY = event.clientY - root.offsetTop;
  });

  button.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    if (!pointerMoved && Math.hypot(event.clientX - startX, event.clientY - startY) < 4) {
      return;
    }

    pointerMoved = true;
    const next = clampPosition(event.clientX - offsetX, event.clientY - offsetY);
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
    updatePanelPlacement();
  });

  button.addEventListener("pointerup", (event) => {
    dragging = false;
    button.releasePointerCapture(event.pointerId);
    button.style.cursor = "grab";

    if (!pointerMoved) {
      updatePanelPlacement();
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  window.addEventListener("resize", () => {
    const next = clampPosition(root.offsetLeft, root.offsetTop);
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
    updatePanelPlacement();
  });

  updatePanelPlacement();
})();
