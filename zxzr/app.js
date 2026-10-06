(() => {
  "use strict";

  const PAGE_SIZE = 20;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const FILE_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/avif", "avif"]
  ]);
  const rawConfig = window.ZXZR_CONFIG || {};
  let baseUrl = "";
  try {
    const url = new URL(rawConfig.supabaseUrl || "");
    if (url.protocol === "https:") baseUrl = url.origin;
  } catch { /* An empty config keeps the local album available. */ }
  const anonKey = String(rawConfig.anonKey || "").trim();
  const bucket = String(rawConfig.bucket || "zxzr-photos").trim();
  const onlineReady = Boolean(baseUrl && anonKey && bucket);

  const $ = (id) => document.getElementById(id);
  const stage = $("albumStage");
  const sheet = $("albumSheet");
  const cover = $("albumCover");
  const grid = $("photoGrid");
  const openPrompt = $("openPrompt");
  const closeAlbum = $("closeAlbum");
  const pageControls = $("pageControls");
  const previousPage = $("previousPage");
  const nextPage = $("nextPage");
  const pageIndicator = $("pageIndicator");
  const albumStatus = $("albumStatus");
  const ownerToggle = $("ownerToggle");
  const ownerPanel = $("ownerPanel");
  const ownerMessage = $("ownerMessage");
  const signInForm = $("signInForm");
  const uploadForm = $("uploadForm");
  const viewer = $("photoViewer");

  let photos = [];
  let page = 0;
  let opened = false;
  let viewerIndex = -1;
  let accessToken = "";
  let refreshToken = "";
  let tokenExpiresAt = 0;
  let viewerOpener = null;

  function setStatus(message) { albumStatus.textContent = message; }
  function setOwnerMessage(message) { ownerMessage.textContent = message; }
  function pageTotal() { return Math.max(1, Math.ceil(photos.length / PAGE_SIZE)); }

  function safePhotoUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      return (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
    } catch { return null; }
  }

  function cleanTitle(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 140) : fallback;
  }

  async function loadStaticPhotos() {
    try {
      const response = await fetch("./photos.json", { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取本地照片目录");
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error("照片目录格式不正确");
      return entries.flatMap((entry, index) => {
        const src = safePhotoUrl(entry?.src);
        if (!src) return [];
        const caption = cleanTitle(entry.caption, `照片 ${index + 1}`);
        return [{ src, caption, alt: cleanTitle(entry.alt, caption) }];
      });
    } catch (error) {
      console.warn("Could not load photos.json:", error);
      return [];
    }
  }

  function publicStorageUrl(path) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
  }

  async function apiRequest(path, { method = "GET", body, token = "", contentType = "application/json", extraHeaders = {} } = {}) {
    const headers = { apikey: anonKey, ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (anonKey.startsWith("eyJ")) headers.Authorization = `Bearer ${anonKey}`;
    if (body !== undefined && contentType) headers["Content-Type"] = contentType;
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
    if (!response.ok) {
      let message = `请求失败 (${response.status})`;
      try {
        const data = await response.json();
        message = data.message || data.msg || data.error_description || data.error || message;
      } catch { /* Keep the HTTP status. */ }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return response;
  }

  function captionFromStoredName(name) {
    const bareName = name.replace(/^\d{13}-[0-9a-f-]{16,36}-/i, "").replace(/\.[^.]+$/, "");
    return cleanTitle(bareName, "未命名照片");
  }

  async function loadOnlinePhotos() {
    const found = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const response = await apiRequest(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: "POST",
        body: JSON.stringify({ prefix: "photos", limit, offset, sortBy: { column: "created_at", order: "desc" } })
      });
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error("照片列表格式不正确");
      for (const entry of entries) {
        if (!entry || typeof entry.name !== "string") continue;
        const name = entry.name.split("/").pop();
        if (!/\.(jpe?g|png|webp|gif|avif)$/i.test(name)) continue;
        const path = entry.name.startsWith("photos/") ? entry.name : `photos/${entry.name}`;
        const caption = captionFromStoredName(name);
        found.push({ src: publicStorageUrl(path), caption, alt: caption });
      }
      if (entries.length < limit) break;
    }
    return found;
  }

  async function refreshPhotos() {
    const staticPhotos = await loadStaticPhotos();
    let onlinePhotos = [];
    let onlineError = null;
    if (onlineReady) {
      try { onlinePhotos = await loadOnlinePhotos(); }
      catch (error) { onlineError = error; console.warn("Could not load online photos:", error); }
    }
    const seen = new Set();
    photos = [...onlinePhotos, ...staticPhotos].filter((photo) => {
      if (seen.has(photo.src)) return false;
      seen.add(photo.src);
      return true;
    });
    page = Math.min(page, pageTotal() - 1);
    renderPage();
    if (onlineError) setStatus(`在线照片暂时无法读取${staticPhotos.length ? "，当前展示本地照片" : ""}。请稍后重试。`);
    else if (!onlineReady) setStatus(photos.length ? `已收录 ${photos.length} 张照片。在线上传尚未启用。` : "相簿已就绪。在线上传尚未启用。");
    else setStatus(photos.length ? `已收录 ${photos.length} 张照片，欢迎慢慢翻看。` : "相簿还没有照片，等待第一张照片。 ");
    return !onlineError;
  }

  function renderPage() {
    page = Math.max(0, Math.min(page, pageTotal() - 1));
    const fragment = document.createDocumentFragment();
    for (let slot = 0; slot < PAGE_SIZE; slot += 1) {
      const index = page * PAGE_SIZE + slot;
      const pocket = document.createElement("div");
      pocket.className = "pocket";
      pocket.setAttribute("role", "listitem");
      const photo = photos[index];
      if (photo) {
        const button = document.createElement("button");
        button.className = "photo-button";
        button.type = "button";
        button.setAttribute("aria-label", `查看第 ${index + 1} 张照片：${photo.caption}`);
        button.addEventListener("click", () => openViewer(index));
        const image = document.createElement("img");
        image.src = photo.src;
        image.alt = photo.alt;
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => { image.hidden = true; button.classList.add("is-broken"); });
        button.append(image);
        pocket.append(button);
      } else {
        pocket.classList.add("pocket--empty");
        const number = document.createElement("span");
        number.textContent = String(index + 1).padStart(2, "0");
        pocket.setAttribute("aria-label", `空相片位 ${index + 1}`);
        pocket.append(number);
      }
      fragment.append(pocket);
    }
    grid.replaceChildren(fragment);
    grid.setAttribute("aria-label", `第 ${page + 1} 页照片，共 ${pageTotal()} 页`);
    $("sheetPageNumber").textContent = String(page + 1).padStart(2, "0");
    $("sheetPhotoCount").textContent = photos.length ? `本页 ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, photos.length)} / 共 ${photos.length} 张` : "等待第一张照片";
    pageIndicator.textContent = `${page + 1} / ${pageTotal()}`;
    previousPage.disabled = page === 0;
    nextPage.disabled = page >= pageTotal() - 1;
  }

  function setOpen(value) {
    opened = value;
    stage.classList.toggle("is-open", value);
    cover.inert = value;
    cover.setAttribute("aria-hidden", String(value));
    sheet.inert = !value;
    sheet.setAttribute("aria-hidden", String(!value));
    openPrompt.hidden = value;
    closeAlbum.hidden = !value;
    pageControls.hidden = !value;
    if (value) closeAlbum.focus();
    else cover.focus();
  }

  function changePage(delta) {
    const next = page + delta;
    if (next < 0 || next >= pageTotal()) return;
    page = next;
    renderPage();
  }

  function updateViewer() {
    const photo = photos[viewerIndex];
    if (!photo) return;
    $("viewerImage").src = photo.src;
    $("viewerImage").alt = photo.alt;
    $("viewerCaption").textContent = photo.caption;
    $("viewerCounter").textContent = `${viewerIndex + 1} / ${photos.length}`;
    $("previousPhoto").disabled = viewerIndex === 0;
    $("nextPhoto").disabled = viewerIndex === photos.length - 1;
    const viewerPage = Math.floor(viewerIndex / PAGE_SIZE);
    if (page !== viewerPage) { page = viewerPage; renderPage(); }
  }

  function openViewer(index) {
    if (!photos[index]) return;
    viewerOpener = document.activeElement;
    viewerIndex = index;
    updateViewer();
    viewer.showModal();
    $("closeViewer").focus();
  }

  function changeViewer(delta) {
    const next = viewerIndex + delta;
    if (next < 0 || next >= photos.length) return;
    viewerIndex = next;
    updateViewer();
  }

  function updateOwnerPanel() {
    signInForm.hidden = !onlineReady || Boolean(accessToken);
    uploadForm.hidden = !onlineReady || !accessToken;
    if (!onlineReady) setOwnerMessage("在线上传尚未启用，站长配置照片存储后即可从这里上传。");
    else if (accessToken) setOwnerMessage("已登录。选取照片后即可上传到公开相簿。");
    else setOwnerMessage("仅相簿站长可以上传。请使用站长账号登录。");
  }

  function storeSession(session) {
    if (!session.access_token) throw new Error("未收到登录凭证");
    accessToken = session.access_token;
    refreshToken = session.refresh_token || "";
    tokenExpiresAt = (session.expires_at ? session.expires_at * 1000 : Date.now() + (session.expires_in || 3600) * 1000);
  }

  async function refreshSession() {
    if (!refreshToken) throw new Error("登录已过期，请重新登录后上传。");
    try {
      const response = await apiRequest("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      storeSession(await response.json());
    } catch (error) {
      accessToken = "";
      refreshToken = "";
      tokenExpiresAt = 0;
      updateOwnerPanel();
      throw new Error("登录已过期，请重新登录后上传。");
    }
  }

  async function ensureSession() {
    if (!accessToken) throw new Error("请先登录。");
    if (Date.now() > tokenExpiresAt - 60000) await refreshSession();
  }

  function setPanelOpen(value) {
    ownerPanel.hidden = !value;
    ownerToggle.setAttribute("aria-expanded", String(value));
    if (value) {
      updateOwnerPanel();
      ownerPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (onlineReady) (accessToken ? $("photoFiles") : $("ownerEmail")).focus();
    } else ownerToggle.focus();
  }

  async function signIn(event) {
    event.preventDefault();
    const button = $("signInButton");
    button.disabled = true;
    setOwnerMessage("正在登录…");
    try {
      const response = await apiRequest("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email: $("ownerEmail").value.trim(), password: $("ownerPassword").value })
      });
      const session = await response.json();
      storeSession(session);
      $("ownerPassword").value = "";
      updateOwnerPanel();
      $("photoFiles").focus();
    } catch (error) {
      setOwnerMessage(`登录失败：${error.message}`);
    } finally { button.disabled = false; }
  }

  function uploadName(file) {
    const extension = FILE_TYPES.get(file.type);
    const originalStem = file.name.replace(/\.[^.]+$/, "");
    const stem = originalStem.normalize("NFC").replace(/[\\/?#%\u0000-\u001f\u007f]/g, "_").trim().slice(0, 80) || "照片";
    const random = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("");
    return `${Date.now()}-${random}-${stem}.${extension}`;
  }

  async function uploadPhotos(event) {
    event.preventDefault();
    const files = Array.from($("photoFiles").files || []);
    if (!files.length) return;
    const invalid = files.find((file) => !FILE_TYPES.has(file.type) || file.size > MAX_FILE_BYTES || file.size === 0);
    if (invalid) {
      setOwnerMessage(`“${invalid.name}”格式不支持、为空，或超过 10 MB。请重新选择。`);
      return;
    }
    const button = $("uploadButton");
    button.disabled = true;
    let uploaded = 0;
    try {
      for (const file of files) {
        setOwnerMessage(`正在上传 ${uploaded + 1} / ${files.length}：${file.name}`);
        const path = `photos/${uploadName(file)}`;
        const endpoint = `/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
        const uploadOne = () => apiRequest(endpoint, {
          method: "POST", body: file, token: accessToken, contentType: file.type,
          extraHeaders: { "x-upsert": "false", "cache-control": "3600" }
        });
        await ensureSession();
        try { await uploadOne(); }
        catch (error) {
          if (error.status !== 401) throw error;
          await refreshSession();
          await uploadOne();
        }
        uploaded += 1;
      }
      $("photoFiles").value = "";
      page = 0;
      const refreshed = await refreshPhotos();
      setOwnerMessage(refreshed ? `已上传 ${uploaded} 张照片，相簿已更新。` : `已上传 ${uploaded} 张照片，但列表暂时无法刷新。请稍后重试。`);
    } catch (error) {
      setOwnerMessage(`已上传 ${uploaded} / ${files.length} 张。上传中断：${error.message}`);
      if (uploaded) await refreshPhotos();
    } finally { button.disabled = false; }
  }

  async function signOut() {
    const token = accessToken;
    accessToken = "";
    refreshToken = "";
    tokenExpiresAt = 0;
    updateOwnerPanel();
    if (token) {
      try { await apiRequest("/auth/v1/logout", { method: "POST", token }); }
      catch (error) { console.warn("Remote sign-out failed; local session was cleared:", error); }
    }
  }

  cover.addEventListener("click", () => setOpen(true));
  openPrompt.addEventListener("click", () => setOpen(true));
  closeAlbum.addEventListener("click", () => setOpen(false));
  previousPage.addEventListener("click", () => changePage(-1));
  nextPage.addEventListener("click", () => changePage(1));
  ownerToggle.addEventListener("click", () => setPanelOpen(ownerPanel.hidden));
  $("ownerClose").addEventListener("click", () => setPanelOpen(false));
  signInForm.addEventListener("submit", signIn);
  uploadForm.addEventListener("submit", uploadPhotos);
  $("signOutButton").addEventListener("click", signOut);
  $("closeViewer").addEventListener("click", () => viewer.close());
  $("previousPhoto").addEventListener("click", () => changeViewer(-1));
  $("nextPhoto").addEventListener("click", () => changeViewer(1));
  viewer.addEventListener("click", (event) => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener("close", () => {
    if (viewerOpener?.isConnected) viewerOpener.focus();
    else grid.querySelector(".photo-button")?.focus();
  });

  let touchStart = null;
  stage.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (!touchStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    if (!opened && dx > 0) setOpen(true);
    else if (opened) changePage(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (viewer.open) {
      if (event.key === "ArrowLeft") { event.preventDefault(); changeViewer(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); changeViewer(1); }
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (opened) changePage(1);
      else setOpen(true);
    } else if (event.key === "ArrowLeft" && opened) {
      event.preventDefault();
      changePage(-1);
    }
  });

  renderPage();
  refreshPhotos();
})();
