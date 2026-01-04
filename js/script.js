/* ============================
   QuickConvert — script.js
   Conversão em lote (PNG/JPG/WEBP) usando Canvas
   ============================ */

(() => {
  "use strict";

  // ------- Elementos
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const fileListEl = document.getElementById("fileList");
  const emptyStateEl = document.getElementById("emptyState");
  const fileItemTpl = document.getElementById("fileItemTpl");

    const EMPTY_STATE_HTML = `
    <div class="qc-empty-inner">
      <i class="bi bi-images qc-empty-icon"></i>
      <div class="fw-semibold">Nenhuma imagem adicionada ainda</div>
      <div class="text-secondary small">Envie arquivos pelo painel ao lado para começar.</div>
    </div>
  `;

  const outputFormatEl = document.getElementById("outputFormat");
  const qualityWrap = document.getElementById("qualityWrap");
  const qualityRange = document.getElementById("qualityRange");
  const qualityLabel = document.getElementById("qualityLabel");
  const jpgBackgroundEl = document.getElementById("jpgBackground");
  const bgWrap = document.getElementById("bgWrap");

  const resizeWEl = document.getElementById("resizeW");
  const resizeHEl = document.getElementById("resizeH");
  const lockRatioEl = document.getElementById("lockRatio");

  const btnConvertAll = document.getElementById("btnConvertAll");
  const btnDownloadAll = document.getElementById("btnDownloadAll");
  const btnClearAll = document.getElementById("btnClearAll");
  const btnTheme = document.getElementById("btnTheme");

  const countSelectedEl = document.getElementById("countSelected");
  const countConvertedEl = document.getElementById("countConverted");
  const alertArea = document.getElementById("alertArea");

  // ------- Estado
  // items: { id, file, url, imgW, imgH, convertedBlob, outName, outType, outSize, status }
  const items = [];
  let nextId = 1;

  // ------- Utils
  const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function showAlert(message, type = "info") {
  alertArea.innerHTML = `
    <div class="alert alert-${type} fade show" role="alert">
      ${escapeHtml(message)}
      <button type="button" class="btn-close" aria-label="Fechar"></button>
    </div>
  `;

  const alertEl = alertArea.querySelector(".alert");
  const closeBtn = alertArea.querySelector(".btn-close");

  if (!alertEl) return;

  // ❌ Fechar manualmente no clique do botão X
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      alertEl.classList.remove("show");
      alertEl.classList.add("hide");

      setTimeout(() => {
        if (alertEl.parentNode) {
          alertEl.parentNode.removeChild(alertEl);
        }
      }, 400);
    });
  }

  // ⏱️ Auto-fechar após 5 segundos
  setTimeout(() => {
    if (!alertEl.parentNode) return;

    alertEl.classList.remove("show");
    alertEl.classList.add("hide");

    setTimeout(() => {
      if (alertEl.parentNode) {
        alertEl.parentNode.removeChild(alertEl);
      }
    }, 400);
  }, 5000);
}

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  function mimeToExt(mime) {
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/webp") return "webp";
    return "img";
  }

  function safeBaseName(filename) {
    const name = String(filename || "arquivo")
      .replace(/\.[^/.]+$/, "")
      .trim()
      .slice(0, 80);
    return name || "arquivo";
  }

  function updateCounters() {
    countSelectedEl.textContent = String(items.length);
    const converted = items.filter(it => it.status === "converted").length;
    countConvertedEl.textContent = String(converted);
    btnDownloadAll.disabled = converted === 0;
  }

  /**
   * ✅ Sync robusto de UI (vazio vs lista)
   * - não depende só de d-none (força display)
   * - garante que lista vazia não fique aparecendo como “retângulo branco”
   */
    function syncEmptyUI() {
    const isEmpty = items.length === 0;

    if (isEmpty) {
        // ✅ Garante que o conteúdo do empty state exista
        if (!emptyStateEl.querySelector(".qc-empty-inner")) {
        emptyStateEl.innerHTML = EMPTY_STATE_HTML;
        }

        emptyStateEl.classList.remove("d-none");
        emptyStateEl.style.display = "block";

        fileListEl.classList.add("d-none");
        fileListEl.style.display = "none";
        fileListEl.innerHTML = ""; // evita “retângulo branco” residual
    } else {
        emptyStateEl.classList.add("d-none");
        emptyStateEl.style.display = "none";

        fileListEl.classList.remove("d-none");
        fileListEl.style.display = "";
    }
    }

  function currentSettings() {
    const outType = outputFormatEl.value;

    const q = clamp(Number(qualityRange.value), 0.1, 1);
    const quality = (outType === "image/jpeg" || outType === "image/webp") ? q : 1;

    const bg = jpgBackgroundEl.value;

    const desiredW = toPositiveIntOrNull(resizeWEl.value);
    const desiredH = toPositiveIntOrNull(resizeHEl.value);
    const lockRatio = !!lockRatioEl.checked;

    return { outType, quality, bg, desiredW, desiredH, lockRatio };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function toPositiveIntOrNull(v) {
    const n = Number(String(v || "").trim());
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    return i > 0 ? i : null;
  }

  function setFormatDependentUI() {
    const outType = outputFormatEl.value;

    const qualityEnabled = (outType === "image/jpeg" || outType === "image/webp");
    qualityWrap.style.display = qualityEnabled ? "" : "none";

    bgWrap.style.display = (outType === "image/jpeg") ? "" : "none";
  }

  function setQualityLabel() {
    qualityLabel.textContent = Number(qualityRange.value).toFixed(2);
  }

  // ------- Render
  function renderList() {
    fileListEl.innerHTML = "";

    for (const it of items) {
      const node = fileItemTpl.content.cloneNode(true);
      const root = node.querySelector(".qc-fileitem");
      const img = node.querySelector(".qc-thumb img");
      const nameEl = node.querySelector(".qc-filename");
      const subEl = node.querySelector(".qc-filesub");
      const badgeStatus = node.querySelector(".qc-badge-status");
      const badgeOut = node.querySelector(".qc-badge-out");

      const btnConvert = node.querySelector(".qc-btn-convert");
      const btnDownload = node.querySelector(".qc-btn-download");
      const btnRemove = node.querySelector(".qc-btn-remove");

      img.src = it.url;
      img.alt = `Preview de ${it.file.name}`;

      nameEl.textContent = it.file.name;

      const originalInfo = `${formatBytes(it.file.size)} • ${it.imgW}×${it.imgH}px`;
      subEl.textContent = originalInfo;

      applyStatusUI(it, badgeStatus, badgeOut, btnDownload);

      btnConvert.addEventListener("click", async () => {
        await convertOne(it.id);
      });

      btnDownload.addEventListener("click", () => {
        if (it.convertedBlob && it.outName) downloadBlob(it.convertedBlob, it.outName);
      });

      btnRemove.addEventListener("click", () => removeItem(it.id));

      root.dataset.id = String(it.id);
      fileListEl.appendChild(node);
    }

    updateCounters();
    syncEmptyUI();
  }

  function applyStatusUI(it, badgeStatus, badgeOut, btnDownload) {
    badgeOut.classList.add("d-none");
    btnDownload.disabled = true;

    if (it.status === "pending") {
      badgeStatus.className = "badge text-bg-secondary qc-badge-status";
      badgeStatus.textContent = "Pendente";
    } else if (it.status === "converting") {
      badgeStatus.className = "badge text-bg-warning qc-badge-status";
      badgeStatus.textContent = "Convertendo...";
    } else if (it.status === "converted") {
      badgeStatus.className = "badge text-bg-success qc-badge-status";
      badgeStatus.textContent = "Convertido";
      if (it.outType && it.outSize != null) {
        badgeOut.classList.remove("d-none");
        badgeOut.textContent = `${mimeToExt(it.outType).toUpperCase()} • ${formatBytes(it.outSize)}`;
      }
      btnDownload.disabled = false;
    } else if (it.status === "error") {
      badgeStatus.className = "badge text-bg-danger qc-badge-status";
      badgeStatus.textContent = "Erro";
    }
  }

  function patchItemUI(id) {
    const row = fileListEl.querySelector(`.qc-fileitem[data-id="${CSS.escape(String(id))}"]`);
    if (!row) return;

    const it = items.find(x => x.id === id);
    if (!it) return;

    const badgeStatus = row.querySelector(".qc-badge-status");
    const badgeOut = row.querySelector(".qc-badge-out");
    const btnDownload = row.querySelector(".qc-btn-download");

    applyStatusUI(it, badgeStatus, badgeOut, btnDownload);
    updateCounters();
    syncEmptyUI();
  }

  // ------- Files handling
  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    let added = 0;
    let rejected = 0;

    for (const f of files) {
      if (!ACCEPTED_TYPES.has(f.type)) {
        rejected++;
        continue;
      }

      const id = nextId++;
      const url = URL.createObjectURL(f);

      const it = {
        id,
        file: f,
        url,
        imgW: 0,
        imgH: 0,
        convertedBlob: null,
        outName: null,
        outType: null,
        outSize: null,
        status: "pending"
      };

      items.push(it);
      added++;

      loadImageMeta(it).catch(() => {
        it.status = "error";
        patchItemUI(it.id);
      });
    }

    if (added > 0) renderList();

    if (rejected > 0) {
      showAlert(`Alguns arquivos foram ignorados porque não são PNG/JPG/WEBP.`, "warning");
    }
  }

  function removeItem(id) {
    const idx = items.findIndex(it => it.id === id);
    if (idx < 0) return;

    const it = items[idx];
    try { URL.revokeObjectURL(it.url); } catch (_) {}

    items.splice(idx, 1);
    renderList();
  }

  function clearAll() {
    for (const it of items) {
      try { URL.revokeObjectURL(it.url); } catch (_) {}
    }
    items.length = 0;
    renderList();
  }

  async function loadImageMeta(it) {
    const img = await loadImageFromUrl(it.url);
    it.imgW = img.naturalWidth || img.width || 0;
    it.imgH = img.naturalHeight || img.height || 0;
    patchItemUI(it.id);
  }

  function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Falha ao carregar imagem"));
      img.src = url;
    });
  }

  // ------- Conversion
  async function convertOne(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;

    it.status = "converting";
    patchItemUI(it.id);

    const settings = currentSettings();

    try {
      const img = await loadImageFromUrl(it.url);
      const { targetW, targetH } = resolveTargetSize(img, settings.desiredW, settings.desiredH, settings.lockRatio);
      const blob = await convertImageViaCanvas(img, targetW, targetH, settings.outType, settings.quality, settings.bg);

      const outExt = mimeToExt(settings.outType);
      const base = safeBaseName(it.file.name);
      const outName = `${base}-converted.${outExt}`;

      it.convertedBlob = blob;
      it.outName = outName;
      it.outType = settings.outType;
      it.outSize = blob.size;

      it.status = "converted";
      patchItemUI(it.id);
    } catch (err) {
      console.error(err);
      it.status = "error";
      patchItemUI(it.id);
      showAlert(`Erro ao converter "${it.file.name}". Tente outra imagem ou formato.`, "danger");
    }
  }

  function resolveTargetSize(img, desiredW, desiredH, lockRatio) {
    const ow = img.naturalWidth || img.width;
    const oh = img.naturalHeight || img.height;

    if (!desiredW && !desiredH) return { targetW: ow, targetH: oh };

    if (desiredW && desiredH) {
      if (!lockRatio) return { targetW: desiredW, targetH: desiredH };
      const ratio = ow / oh;
      const calcH = Math.max(1, Math.round(desiredW / ratio));
      return { targetW: desiredW, targetH: calcH };
    }

    if (desiredW && !desiredH) {
      if (!lockRatio) return { targetW: desiredW, targetH: oh };
      const ratio = ow / oh;
      const th = Math.max(1, Math.round(desiredW / ratio));
      return { targetW: desiredW, targetH: th };
    }

    if (!desiredW && desiredH) {
      if (!lockRatio) return { targetW: ow, targetH: desiredH };
      const ratio = ow / oh;
      const tw = Math.max(1, Math.round(desiredH * ratio));
      return { targetW: tw, targetH: desiredH };
    }

    return { targetW: ow, targetH: oh };
  }

  function convertImageViaCanvas(img, w, h, outType, quality, jpgBg) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return reject(new Error("Canvas não suportado"));

      if (outType === "image/jpeg") {
        ctx.save();
        ctx.fillStyle = jpgBg || "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);

      const q = (outType === "image/jpeg" || outType === "image/webp") ? quality : undefined;

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Falha ao exportar imagem"));
        resolve(blob);
      }, outType, q);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }, 1200);
  }

  async function convertAll() {
    if (items.length === 0) {
      showAlert("Adicione pelo menos uma imagem para converter.", "warning");
      return;
    }

    const pendings = items.filter(it => it.status !== "converted");
    if (pendings.length === 0) {
      showAlert("Tudo já está convertido. Você pode clicar em “Baixar tudo”.", "info");
      return;
    }

    for (const it of pendings) {
      await convertOne(it.id);
    }

    const okCount = items.filter(it => it.status === "converted").length;
    if (okCount > 0) showAlert(`Conversão concluída! ${okCount} arquivo(s) convertido(s).`, "success");
  }

  async function downloadAllSequential() {
    const converted = items.filter(it => it.status === "converted" && it.convertedBlob && it.outName);
    if (converted.length === 0) {
      showAlert("Nenhum arquivo convertido ainda. Clique em “Converter tudo”.", "warning");
      return;
    }

    showAlert(`Iniciando downloads… (${converted.length} arquivo(s))`, "info");

    for (let i = 0; i < converted.length; i++) {
      const it = converted[i];
      downloadBlob(it.convertedBlob, it.outName);
      await sleep(450);
    }

    showAlert("Downloads iniciados. Se o navegador bloquear, permita downloads múltiplos.", "success");
  }

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // ------- Drag & Drop
  function setupDnD() {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
      dropZone.addEventListener(evt, prevent);
    });

    dropZone.addEventListener("dragover", () => dropZone.classList.add("dragover"));
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
      dropZone.classList.remove("dragover");
      const files = e.dataTransfer?.files;
      if (files && files.length) addFiles(files);
    });

    const labelBtn = dropZone.querySelector('label[for="fileInput"]');
    if (labelBtn) {
      labelBtn.addEventListener("click", (e) => e.stopPropagation());
    }

    dropZone.addEventListener("click", (e) => {
      if (e.target.closest("label, button, input")) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      const files = e.target.files;
      if (files && files.length) addFiles(files);
      fileInput.value = "";
    });
  }

  // ------- Tema
  function setupTheme() {
    const saved = localStorage.getItem("qc_theme");
    const startDark = saved === "dark";

    document.body.classList.toggle("qc-dark", startDark);
    document.body.classList.toggle("qc-theme-black", startDark);
    document.body.classList.toggle("qc-theme-white", !startDark);

    updateThemeButton();

    btnTheme.addEventListener("click", () => {
      const goingDark = !document.body.classList.contains("qc-dark");

      document.body.classList.toggle("qc-dark", goingDark);
      document.body.classList.toggle("qc-theme-black", goingDark);
      document.body.classList.toggle("qc-theme-white", !goingDark);

      localStorage.setItem("qc_theme", goingDark ? "dark" : "light");
      updateThemeButton();

      // ✅ garante que o empty state continue certo após repaint
      syncEmptyUI();
    });
  }

  function updateThemeButton() {
    const isDark = document.body.classList.contains("qc-dark");
    btnTheme.setAttribute("aria-pressed", String(isDark));
    btnTheme.innerHTML = isDark
      ? `<i class="bi bi-sun"></i> Tema`
      : `<i class="bi bi-moon-stars"></i> Tema`;
  }

  // ------- Events
  function setupEvents() {
    outputFormatEl.addEventListener("change", () => {
      setFormatDependentUI();
    });

    qualityRange.addEventListener("input", setQualityLabel);

    btnConvertAll.addEventListener("click", convertAll);
    btnDownloadAll.addEventListener("click", downloadAllSequential);

    btnClearAll.addEventListener("click", () => {
      clearAll();
      showAlert("Lista limpa.", "info");
    });

    [resizeWEl, resizeHEl].forEach(el => {
      el.addEventListener("input", () => {
        const v = String(el.value || "").trim();
        if (!v) return;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) {
          el.value = "";
          showAlert("Use valores positivos para largura/altura (px).", "warning");
        }
      });
    });
  }

  // ------- Breakpoint sync (o que resolve o “só acontece ao redimensionar”)
    function setupResponsiveSync() {
    const mq = window.matchMedia("(max-width: 991.98px)");

    const forceRepaintAndSync = () => {
        // força repaint do container (corrige sumiço do conteúdo)
        emptyStateEl.style.transform = "translateZ(0)";
        void emptyStateEl.offsetHeight; // força reflow
        emptyStateEl.style.transform = "";

        syncEmptyUI();
    };

    const onChange = () => {
        requestAnimationFrame(() => {
        requestAnimationFrame(forceRepaintAndSync);
        });
    };

    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    let t = null;
    window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(onChange, 120);
    });
    }

  // ------- Init
  function init() {
    setQualityLabel();
    setFormatDependentUI();
    setupDnD();
    setupTheme();
    setupEvents();
    setupResponsiveSync();
    renderList();
  }

  init();
})();
