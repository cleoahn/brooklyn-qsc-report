(() => {
  "use strict";

  // =========================
  // DOM 안전 선택
  // =========================
  const pick = (...ids) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  };

  const fileInput = pick("csvFile", "fileInput");
  const generateBtn = pick("generateBtn", "generateReportBtn", "reportGenerateBtn");
  const resetHistoryBtn = pick("resetHistoryBtn", "historyResetBtn");
  const resultBox = pick("result", "reportList", "storeList", "storeReportList");
  const statusBox = pick("status", "statusBox");
  const debugBox = pick("debug", "debugBox");

  const photoStoreSelect = pick("photoStoreSelect", "storeSelect");
  const photoTypeSelect = pick("photoTypeSelect", "photoType");
  const photoSectionSelect = pick("photoSectionSelect", "sectionSelect");
  const photoItemSelect = pick("photoItemSelect", "codeSelect", "itemCodeSelect");
  const photoCaption = pick("photoCaption", "photoComment", "photoDesc");
  const photoFiles = pick("photoFiles", "photoFile");
  const savePhotoBtn = pick("savePhotoBtn");
  const clearStorePhotoBtn = pick("clearStorePhotoBtn");
  const photoPreviewArea = pick("photoPreviewArea", "photoPreview");

  // =========================
  // 상태
  // =========================
  let csvData = [];
  let detectedStoreColumn = "";
  let storeMap = {};

  const HISTORY_KEY = "brooklyn_qsc_history_v31_final_safe";
  const PHOTO_KEY = "brooklyn_qsc_photo_v31_final_safe";

  const SECTION_ORDER = ["DOC", "COOK", "INV", "SVC", "CLN"];
  const SECTION_LABELS = {
    ALL: "공통",
    DOC: "서류",
    COOK: "조리",
    INV: "식재료",
    SVC: "서비스",
    CLN: "청결"
  };

  const PHOTO_TYPE_LABELS = {
    ISSUE: "문제 사진",
    GOOD: "잘한 사례",
    COMMON: "공통 참고"
  };

  // =========================
  // 공통 유틸
  // =========================
  function cleanKey(v) {
    return String(v || "").replace(/^\uFEFF/, "").trim();
  }

  function cleanValue(v) {
    return String(v || "").trim();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeQuestionKey(key) {
    return cleanKey(key)
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/__+/g, "_")
      .replace(/-+/g, "_");
  }

  function normalizeSectionValue(section) {
    const s = cleanValue(section).toUpperCase();

    if (!s) return "ALL";
    if (s === "ALL" || s === "공통") return "ALL";
    if (s === "DOC" || s === "서류") return "DOC";
    if (s === "COOK" || s === "조리") return "COOK";
    if (s === "INV" || s === "식재료") return "INV";
    if (s === "SVC" || s === "서비스") return "SVC";
    if (s === "CLN" || s === "청결") return "CLN";

    return s;
  }

  function normalizePhotoType(v) {
    const s = cleanValue(v).toUpperCase();
    if (s.includes("ISSUE")) return "ISSUE";
    if (s.includes("GOOD")) return "GOOD";
    if (s.includes("COMMON")) return "COMMON";
    return s || "ISSUE";
  }

  function normalizeRow(row) {
    const obj = {};
    Object.keys(row || {}).forEach((k) => {
      obj[cleanKey(k)] = row[k];
    });
    return obj;
  }

  function setStatus(message, isError = false) {
    if (!statusBox) return;
    statusBox.innerHTML = isError
      ? `<span class="error">${escapeHtml(message)}</span>`
      : message;
  }

  function showDebug(text) {
    if (!debugBox) return;
    debugBox.style.display = "block";
    debugBox.textContent = text;
  }

  function hideDebug() {
    if (!debugBox) return;
    debugBox.style.display = "none";
    debugBox.textContent = "";
  }

  function formatDateTime(v) {
    if (!v) return "-";
    return cleanValue(v);
  }

  // =========================
  // CSV 구조
  // =========================
  function detectStoreColumn(headers) {
    const exact = ["매장명", "매장", "매장 선택", "점검 매장"];
    for (const c of exact) {
      const found = headers.find((h) => cleanKey(h) === c);
      if (found) return found;
    }
    const partial = ["매장"];
    for (const c of partial) {
      const found = headers.find((h) => cleanKey(h).includes(c));
      if (found) return found;
    }
    return "";
  }

  function getStoreValueFromRow(row, storeColumn) {
    const direct = cleanValue(row[storeColumn]);
    if (direct) return direct;

    for (const key of Object.keys(row || {})) {
      if (cleanKey(key).includes("매장")) {
        const v = cleanValue(row[key]);
        if (v) return v;
      }
    }
    return "";
  }

  function isQuestionColumn(key) {
    const k = normalizeQuestionKey(key);
    return /^(DOC|COOK|INV|SVC|CLN)_+\d+/.test(k);
  }

  function getSectionFromKey(key) {
    const k = normalizeQuestionKey(key);
    if (k.startsWith("DOC_")) return "DOC";
    if (k.startsWith("COOK_")) return "COOK";
    if (k.startsWith("INV_")) return "INV";
    if (k.startsWith("SVC_")) return "SVC";
    if (k.startsWith("CLN_")) return "CLN";
    return "ETC";
  }

  function getResultType(value) {
    const raw = cleanValue(value);
    if (!raw) return null;

    const compact = raw.replace(/\s+/g, "").toLowerCase();

    if (
      raw.includes("❌") ||
      compact.includes("안된다") ||
      compact.includes("안됨") ||
      compact.includes("미준수") ||
      compact.includes("불량") ||
      compact === "fail"
    ) {
      return "FAIL";
    }

    if (
      raw.includes("△") ||
      compact.includes("흔들린다") ||
      compact.includes("흔들림") ||
      compact.includes("일시적흔들림") ||
      compact.includes("일부만준수") ||
      compact.includes("일부준수") ||
      compact.includes("일부미흡") ||
      compact.includes("부분미흡") ||
      compact.includes("준수미흡") ||
      compact.includes("미흡") ||
      compact.includes("보완필요") ||
      compact.includes("개선필요") ||
      compact === "warn"
    ) {
      return "WARN";
    }

    if (
      raw.includes("⭕") ||
      compact === "ok" ||
      compact.includes("된다") ||
      compact.includes("준수") ||
      compact.includes("양호") ||
      compact.includes("정상")
    ) {
      return "OK";
    }

    // 비어있지 않은데 애매하면 WARN 처리
    return "WARN";
  }

  function getDisplayResult(type) {
    if (type === "OK") return "⭕ 된다";
    if (type === "WARN") return "△ 흔들린다";
    if (type === "FAIL") return "❌ 안 된다";
    return "-";
  }

  function getScoreByType(type) {
    if (type === "OK") return 2;
    if (type === "WARN") return 1;
    if (type === "FAIL") return 0;
    return 0;
  }

  function getPriority(type) {
    if (type === "FAIL") return "높음";
    if (type === "WARN") return "중간";
    return "낮음";
  }

  function getGrade(score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    return "D";
  }

  function getStatusLabel(score) {
    if (score >= 90) return "우수";
    if (score >= 80) return "양호";
    if (score >= 70) return "보통";
    return "개선 필요";
  }

  function getMetaValue(row, candidates) {
    const keys = Object.keys(row || {});
    for (const candidate of candidates) {
      const found = keys.find((k) => cleanKey(k) === candidate || cleanKey(k).includes(candidate));
      if (found) {
        const v = cleanValue(row[found]);
        if (v) return v;
      }
    }
    return "";
  }

  function rebuildStoreMap() {
    storeMap = {};
    csvData.forEach((row) => {
      const store = getStoreValueFromRow(row, detectedStoreColumn);
      if (!store) return;
      if (!storeMap[store]) storeMap[store] = [];
      storeMap[store].push(row);
    });
  }

  function getStoreNames() {
    return Object.keys(storeMap);
  }

  // =========================
  // localStorage - history
  // =========================
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveHistory(data) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
  }

  function upsertHistoryRecord(storeKey, record) {
    const history = loadHistory();
    if (!history[storeKey]) history[storeKey] = [];

    const idx = history[storeKey].findIndex((x) => x.date === record.date);
    if (idx >= 0) history[storeKey][idx] = record;
    else history[storeKey].push(record);

    history[storeKey].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    saveHistory(history);
  }

  function getLatestPreviousRecord(storeKey, currentDate) {
    const history = loadHistory();
    const list = history[storeKey] || [];
    const filtered = list.filter((x) => x.date !== currentDate);
    return filtered.length ? filtered[filtered.length - 1] : null;
  }

  // =========================
  // localStorage - photos
  // =========================
  function loadPhotosAll() {
    try {
      return JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function savePhotosAll(data) {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(data));
  }

  function getPhotosByStore(store) {
    const all = loadPhotosAll();
    return all[store] || [];
  }

  function savePhotoRecord(store, record) {
    const all = loadPhotosAll();
    if (!all[store]) all[store] = [];
    all[store].push(record);
    savePhotosAll(all);
  }

  function deletePhotoRecord(store, id) {
    const all = loadPhotosAll();
    if (!all[store]) return;
    all[store] = all[store].filter((x) => x.id !== id);
    savePhotosAll(all);
  }

  function clearStorePhotos(store) {
    const all = loadPhotosAll();
    delete all[store];
    savePhotosAll(all);
  }

  // =========================
  // 이미지 압축
  // =========================
  function compressImageToBase64(file, maxWidth = 1400, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("이미지 파일이 아닙니다."));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;

          if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // =========================
  // 분석
  // =========================
  function analyzeStoreRows(store, rows, options = {}) {
    const firstRow = rows[0] || {};
    const keys = Object.keys(firstRow);

    const sectionSummary = {};
    SECTION_ORDER.forEach((s) => {
      sectionSummary[s] = {
        section: s,
        label: SECTION_LABELS[s],
        totalQuestions: 0,
        ok: 0,
        warn: 0,
        fail: 0,
        earned: 0,
        max: 0,
        score: 0
      };
    });

    const allItems = [];

    rows.forEach((row) => {
      keys.forEach((key) => {
        if (!isQuestionColumn(key)) return;

        const rawValue = row[key];
        const type = getResultType(rawValue);
        if (!type) return;

        const section = getSectionFromKey(key);
        if (!sectionSummary[section]) return;

        sectionSummary[section].totalQuestions += 1;
        sectionSummary[section].max += 2;
        sectionSummary[section].earned += getScoreByType(type);

        if (type === "OK") sectionSummary[section].ok += 1;
        if (type === "WARN") sectionSummary[section].warn += 1;
        if (type === "FAIL") sectionSummary[section].fail += 1;

        allItems.push({
          code: normalizeQuestionKey(key),
          section,
          sectionLabel: SECTION_LABELS[section],
          resultType: type,
          resultDisplay: getDisplayResult(type),
          priority: getPriority(type),
          rawValue: cleanValue(rawValue)
        });
      });
    });

    let totalEarned = 0;
    let totalMax = 0;
    let totalWarn = 0;
    let totalFail = 0;

    SECTION_ORDER.forEach((s) => {
      const sec = sectionSummary[s];
      sec.score = sec.max ? Math.round((sec.earned / sec.max) * 100) : 0;
      totalEarned += sec.earned;
      totalMax += sec.max;
      totalWarn += sec.warn;
      totalFail += sec.fail;
    });

    const totalScore = totalMax ? Math.round((totalEarned / totalMax) * 100) : 0;
    const grade = getGrade(totalScore);

    allItems.sort((a, b) => {
      const orderA = a.resultType === "FAIL" ? 0 : a.resultType === "WARN" ? 1 : 2;
      const orderB = b.resultType === "FAIL" ? 0 : b.resultType === "WARN" ? 1 : 2;
      if (orderA !== orderB) return orderA - orderB;
      return a.code.localeCompare(b.code);
    });

    const keyIssues = allItems.filter((x) => x.resultType !== "OK").slice(0, 10);

    const weakSections = SECTION_ORDER
      .map((s) => sectionSummary[s])
      .filter((x) => x.totalQuestions > 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);

    const actionComments = buildActionComments(weakSections, totalWarn, totalFail);

    const meta = {
      store,
      inspectDate: getMetaValue(firstRow, ["점검일자", "점검 날짜", "점검일"]),
      quarter: getMetaValue(firstRow, ["분기"]),
      inspector: getMetaValue(firstRow, ["점검 IST 이름", "점검자", "IST 이름"]),
      inspectType: getMetaValue(firstRow, ["점검 유형", "점검유형"]),
      timestamp: getMetaValue(firstRow, ["타임스탬프", "Timestamp"])
    };

    const currentDate = meta.inspectDate || meta.timestamp || new Date().toISOString().slice(0, 10);
    const prev = getLatestPreviousRecord(store, currentDate);

    if (!options.skipHistorySave) {
      upsertHistoryRecord(store, {
        date: currentDate,
        score: totalScore,
        fail: totalFail,
        warn: totalWarn
      });
    }

    let trend = null;
    if (prev) {
      const scoreDiff = totalScore - prev.score;
      const failDiff = totalFail - prev.fail;
      trend = {
        prevScore: prev.score,
        currentScore: totalScore,
        scoreDiff,
        failDiff,
        label: scoreDiff >= 5 ? "개선" : scoreDiff <= -5 ? "악화" : "유지"
      };
    }

    return {
      meta,
      totalScore,
      grade,
      totalWarn,
      totalFail,
      sectionSummary,
      keyIssues,
      actionComments,
      detailedItems: allItems,
      trend
    };
  }

  function buildActionComments(weakSections, totalWarn, totalFail) {
    const immediate = [];
    const education = [];

    if (totalFail > 0) immediate.push("❌ 항목 우선 재점검 및 즉시 시정 조치");
    if (totalWarn > 0) immediate.push("△ 항목 현장 재확인 후 기준 재정렬");

    weakSections.forEach((s) => {
      if (s.section === "DOC") {
        immediate.push("서류·라벨링·보관 기준 재점검");
        education.push("서류 관리 기준 재교육");
      }
      if (s.section === "COOK") {
        immediate.push("조리 상태·제품 완성도 기준 즉시 재확인");
        education.push("조리 표준 및 제품 기준 재교육");
      }
      if (s.section === "INV") {
        immediate.push("식재료 보관·라벨·원산지 기준 재점검");
        education.push("식재료 관리 및 라벨링 기준 재교육");
      }
      if (s.section === "SVC") {
        immediate.push("고객 응대·추가 요청 대응 기준 재점검");
        education.push("서비스 응대 멘트 및 MOT 기준 재교육");
      }
      if (s.section === "CLN") {
        immediate.push("청결 취약 구역 즉시 정비 및 오픈/마감 체크 강화");
        education.push("청결 기준과 점검 루틴 재교육");
      }
    });

    return {
      immediate: [...new Set(immediate)].slice(0, 4),
      education: [...new Set(education)].slice(0, 4)
    };
  }

  // =========================
  // 사진 문항 드롭다운
  // =========================
  function buildIssueOptionsForStore(store) {
    const rows = storeMap[store] || [];
    const map = new Map();
    const counts = { DOC: 0, COOK: 0, INV: 0, SVC: 0, CLN: 0 };

    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!isQuestionColumn(key)) return;

        const rawValue = cleanValue(row[key]);
        if (!rawValue) return;

        const type = getResultType(rawValue);
        if (!type || type === "OK") return;

        const code = normalizeQuestionKey(key);
        const section = getSectionFromKey(key);
        const label = `${code} | ${SECTION_LABELS[section]} | ${getDisplayResult(type)}`;

        if (!map.has(code)) {
          map.set(code, {
            code,
            section,
            label,
            resultType: type
          });
          if (counts[section] !== undefined) counts[section] += 1;
        }
      });
    });

    showDebug(
      `ISSUE 옵션 수\nDOC: ${counts.DOC}\nCOOK: ${counts.COOK}\nINV: ${counts.INV}\nSVC: ${counts.SVC}\nCLN: ${counts.CLN}`
    );

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  function buildAllQuestionOptionsForStore(store) {
    const rows = storeMap[store] || [];
    if (!rows.length) return [];

    const firstRow = rows[0];
    const keys = Object.keys(firstRow).filter(isQuestionColumn);

    return keys.map((key) => {
      const code = normalizeQuestionKey(key);
      const section = getSectionFromKey(key);
      return {
        code,
        section,
        label: `${code} | ${SECTION_LABELS[section]}`
      };
    });
  }

  function setPhotoItemPlaceholder(text) {
    if (!photoItemSelect) return;
    photoItemSelect.innerHTML = `<option value="">${escapeHtml(text)}</option>`;
  }

  function updateStoreSelectOptions() {
    if (!photoStoreSelect) return;

    const names = getStoreNames();
    const current = photoStoreSelect.value;

    photoStoreSelect.innerHTML = '<option value="">매장을 선택하세요</option>';
    names.forEach((store) => {
      const opt = document.createElement("option");
      opt.value = store;
      opt.textContent = store;
      photoStoreSelect.appendChild(opt);
    });

    if (names.includes(current)) {
      photoStoreSelect.value = current;
    }
  }

  function updateItemSelectOptions() {
    if (!photoStoreSelect || !photoTypeSelect || !photoSectionSelect || !photoItemSelect) return;

    const store = photoStoreSelect.value;
    const type = normalizePhotoType(photoTypeSelect.value);
    const section = normalizeSectionValue(photoSectionSelect.value);

    if (!store) {
      photoItemSelect.disabled = true;
      setPhotoItemPlaceholder("먼저 매장을 선택하세요");
      return;
    }

    if (type === "COMMON") {
      photoItemSelect.disabled = true;
      setPhotoItemPlaceholder("COMMON은 문항코드 없이 저장합니다");
      return;
    }

    photoItemSelect.disabled = false;
    let options = [];

    if (type === "ISSUE") {
      options = buildIssueOptionsForStore(store);
      if (section !== "ALL") {
        options = options.filter((x) => normalizeSectionValue(x.section) === section);
      }
    }

    if (type === "GOOD") {
      options = buildAllQuestionOptionsForStore(store);
      if (section !== "ALL") {
        options = options.filter((x) => normalizeSectionValue(x.section) === section);
      }
    }

    if (!options.length) {
      setPhotoItemPlaceholder(type === "ISSUE" ? "해당 조건의 ISSUE 문항이 없습니다" : "해당 조건의 문항이 없습니다");
      return;
    }

    photoItemSelect.innerHTML = '<option value="">문항코드를 선택하세요</option>';
    options.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.code;
      opt.textContent = item.label;
      photoItemSelect.appendChild(opt);
    });
  }

  function updatePhotoFormRules() {
    if (!photoTypeSelect || !photoSectionSelect) return;

    const type = normalizePhotoType(photoTypeSelect.value);

    if (type === "COMMON") {
      // 공통 참고는 문항코드 없이 저장
      if (photoSectionSelect.querySelector('option[value="ALL"]')) {
        photoSectionSelect.value = "ALL";
      }
    }

    updateItemSelectOptions();
  }

  // =========================
  // 사진 저장/미리보기
  // =========================
  function renderPhotoPreview() {
    if (!photoStoreSelect || !photoPreviewArea) return;

    const store = photoStoreSelect.value;
    if (!store) {
      photoPreviewArea.className = "empty-box";
      photoPreviewArea.innerHTML = "매장을 선택하면 저장된 사진이 표시됩니다.";
      return;
    }

    const photos = getPhotosByStore(store);
    if (!photos.length) {
      photoPreviewArea.className = "empty-box";
      photoPreviewArea.innerHTML = "저장된 사진이 없습니다.";
      return;
    }

    let html = '<div class="photo-preview-grid">';
    photos.forEach((p) => {
      html += `
        <div class="photo-card">
          <img src="${p.dataUrl}" alt="photo">
          <div class="photo-card-body">
            <div class="photo-card-title">
              ${escapeHtml(PHOTO_TYPE_LABELS[p.photoType] || p.photoType)} |
              ${escapeHtml(p.itemCode || "문항없음")} |
              ${escapeHtml(SECTION_LABELS[p.section] || p.section)}
            </div>
            <div class="photo-card-desc">${escapeHtml(p.caption || "설명 없음")}</div>
            <div class="photo-card-meta">저장일: ${escapeHtml(p.createdAt || "-")}</div>
            <div class="photo-card-actions">
              <button type="button" onclick="window.__deletePhoto('${encodeURIComponent(store)}','${encodeURIComponent(p.id)}')">삭제</button>
            </div>
          </div>
        </div>
      `;
    });
    html += "</div>";

    photoPreviewArea.className = "";
    photoPreviewArea.innerHTML = html;
  }

  window.__deletePhoto = function (storeEncoded, idEncoded) {
    const store = decodeURIComponent(storeEncoded);
    const id = decodeURIComponent(idEncoded);
    if (!confirm("이 사진을 삭제할까요?")) return;
    deletePhotoRecord(store, id);
    renderPhotoPreview();
    createStoreList();
  };

  async function saveSelectedPhotos() {
    if (!photoStoreSelect || !photoTypeSelect || !photoSectionSelect || !photoFiles) return;

    const store = photoStoreSelect.value;
    const photoType = normalizePhotoType(photoTypeSelect.value);
    const section = normalizeSectionValue(photoSectionSelect.value);
    const itemCode = photoItemSelect ? photoItemSelect.value : "";
    const caption = photoCaption ? cleanValue(photoCaption.value) : "";
    const files = Array.from(photoFiles.files || []);

    if (!store) {
      alert("매장을 선택하세요.");
      return;
    }

    if (photoType === "ISSUE" && !itemCode) {
      alert("ISSUE 사진은 문항코드가 필수입니다.");
      return;
    }

    if (!files.length) {
      alert("사진 파일을 선택하세요.");
      return;
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await compressImageToBase64(files[i], 1400, 0.72);
        savePhotoRecord(store, {
          id: "photo_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 8),
          store,
          photoType,
          section,
          itemCode: itemCode || "",
          caption,
          dataUrl,
          createdAt: new Date().toLocaleString("ko-KR")
        });
      }

      if (photoCaption) photoCaption.value = "";
      photoFiles.value = "";

      renderPhotoPreview();
      createStoreList();
      alert("사진이 저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("사진 저장에 실패했습니다.");
    }
  }

  // =========================
  // PDF 사진 섹션
  // =========================
  function buildPhotoEvidenceHtml(store) {
    const photos = getPhotosByStore(store);

    if (!photos.length) {
      return `<div class="empty-box">저장된 사진 근거가 없습니다.</div>`;
    }

    const issuePhotos = photos.filter((p) => p.photoType === "ISSUE");
    const goodPhotos = photos.filter((p) => p.photoType === "GOOD");
    const commonPhotos = photos.filter((p) => p.photoType === "COMMON");

    let html = "";

    if (issuePhotos.length) {
      html += `<div class="issue-photo-section"><div class="issue-photo-title">문제 근거 (ISSUE)</div>`;
      const issueGroup = {};

      issuePhotos.forEach((p) => {
        const code = p.itemCode || "문항없음";
        if (!issueGroup[code]) issueGroup[code] = [];
        issueGroup[code].push(p);
      });

      Object.keys(issueGroup).sort().forEach((code) => {
        html += `<div style="margin-bottom:18px;"><div style="font-size:14px;font-weight:800;margin-bottom:8px;">${escapeHtml(code)}</div><div class="photo-grid">`;
        issueGroup[code].forEach((p) => {
          html += `
            <div class="photo-box">
              <img src="${p.dataUrl}" alt="issue photo">
              <div class="photo-box-body">
                <div class="photo-box-title">${escapeHtml(p.itemCode || "")}</div>
                <div class="photo-box-caption">${escapeHtml(p.caption || "설명 없음")}</div>
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      });

      html += `</div>`;
    }

    if (goodPhotos.length) {
      html += `<div class="issue-photo-section"><div class="issue-photo-title">잘한 사례 (GOOD)</div><div class="photo-grid">`;
      goodPhotos.forEach((p) => {
        html += `
          <div class="photo-box">
            <img src="${p.dataUrl}" alt="good photo">
            <div class="photo-box-body">
              <div class="photo-box-title">${escapeHtml(p.itemCode || "문항없음")} | ${escapeHtml(SECTION_LABELS[p.section] || p.section)}</div>
              <div class="photo-box-caption">${escapeHtml(p.caption || "설명 없음")}</div>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    if (commonPhotos.length) {
      html += `<div class="issue-photo-section"><div class="issue-photo-title">공통 참고 (COMMON)</div><div class="photo-grid">`;
      commonPhotos.forEach((p) => {
        html += `
          <div class="photo-box">
            <img src="${p.dataUrl}" alt="common photo">
            <div class="photo-box-body">
              <div class="photo-box-title">공통 참고</div>
              <div class="photo-box-caption">${escapeHtml(p.caption || "설명 없음")}</div>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    return html || `<div class="empty-box">저장된 사진 근거가 없습니다.</div>`;
  }

  // =========================
  // PDF 생성
  // =========================
  function sectionCardHtml(sec) {
    return `
      <div style="border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-weight:800;font-size:15px;">${escapeHtml(sec.section)} | ${escapeHtml(sec.label)}</div>
          <div style="font-size:22px;font-weight:800;">${sec.score}점</div>
        </div>
        <div style="font-size:13px;color:#555;">OK ${sec.ok} / WARN ${sec.warn} / FAIL ${sec.fail}</div>
      </div>
    `;
  }

  function openPrintReport(store, rows) {
    const report = analyzeStoreRows(store, rows);
    const reportWindow = window.open("", "_blank");

    if (!reportWindow) {
      alert("팝업이 차단되었습니다.");
      return;
    }

    let sectionCards = "";
    SECTION_ORDER.forEach((s) => {
      const data = report.sectionSummary[s];
      if (data && data.totalQuestions > 0) {
        sectionCards += sectionCardHtml(data);
      }
    });

    let keyIssueRows = "";
    report.keyIssues.forEach((item, idx) => {
      keyIssueRows += `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.sectionLabel)}</td>
          <td>${escapeHtml(item.resultDisplay)}</td>
          <td>${escapeHtml(item.priority)}</td>
        </tr>
      `;
    });

    let detailRows = "";
    report.detailedItems.forEach((item) => {
      detailRows += `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.sectionLabel)}</td>
          <td>${escapeHtml(item.resultDisplay)}</td>
          <td>${escapeHtml(item.priority)}</td>
        </tr>
      `;
    });

    const immediateHtml = report.actionComments.immediate.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    const educationHtml = report.actionComments.education.map((x) => `<li>${escapeHtml(x)}</li>`).join("");

    let trendHtml = "";
    if (!report.trend) {
      trendHtml = `
        <div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fafafa;">
          <div style="font-size:13px;color:#666;margin-bottom:6px;">추세 분석</div>
          <div style="font-size:13px;color:#666;">이전 점검 이력이 없어 비교할 수 없습니다.</div>
        </div>
      `;
    } else {
      const scoreDiffText = report.trend.scoreDiff > 0 ? "+" + report.trend.scoreDiff : String(report.trend.scoreDiff);
      const failDiffText = report.trend.failDiff > 0 ? "+" + report.trend.failDiff : String(report.trend.failDiff);
      const color = report.trend.label === "개선" ? "#0a7b34" : report.trend.label === "악화" ? "#b00020" : "#666";

      trendHtml = `
        <div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fafafa;">
          <div style="font-size:13px;color:#666;margin-bottom:6px;">추세 분석</div>
          <div style="font-size:13px;margin-bottom:4px;"><b>이전 점수:</b> ${report.trend.prevScore}점</div>
          <div style="font-size:13px;margin-bottom:4px;"><b>현재 점수:</b> ${report.trend.currentScore}점</div>
          <div style="font-size:13px;margin-bottom:4px;"><b>점수 변화:</b> ${scoreDiffText}</div>
          <div style="font-size:13px;margin-bottom:4px;"><b>FAIL 변화:</b> ${failDiffText}</div>
          <div style="font-size:13px;"><b>판정:</b> <span style="color:${color};font-weight:800;">${report.trend.label}</span></div>
        </div>
      `;
    }

    const photoHtml = buildPhotoEvidenceHtml(store);

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(store)} QSC REPORT</title>
<style>
body{font-family:Arial,sans-serif;margin:30px;color:#222;line-height:1.45;}
h1{font-size:30px;margin:0 0 6px 0;font-weight:800;}
h2{font-size:20px;margin:28px 0 12px 0;border-bottom:2px solid #eee;padding-bottom:6px;}
.sub{color:#666;margin-bottom:20px;font-size:14px;}
.summary-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1.2fr;gap:14px;margin-bottom:20px;}
.report-table{width:100%;border-collapse:collapse;table-layout:fixed;}
.report-table th,.report-table td{border:1px solid #ddd;padding:8px 10px;text-align:left;vertical-align:top;word-break:break-word;font-size:12px;}
.report-table th{background:#f5f5f5;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.action-box{border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;}
.action-box ul{margin:8px 0 0 18px;padding:0;}
.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.photo-box{border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff;page-break-inside:avoid;}
.photo-box img{width:100%;height:240px;object-fit:cover;display:block;background:#f2f2f2;}
.photo-box-body{padding:12px;}
.photo-box-title{font-size:13px;font-weight:800;margin-bottom:6px;}
.photo-box-caption{font-size:12px;color:#444;white-space:pre-wrap;word-break:break-word;}
.issue-photo-section{margin-bottom:24px;page-break-inside:avoid;}
.issue-photo-title{font-size:15px;font-weight:800;margin-bottom:10px;}
.empty-box{border:1px dashed #ccc;border-radius:10px;padding:14px;background:#fafafa;font-size:13px;color:#666;}
@media print{
  body{margin:14mm;}
  .page-break{page-break-before:always;}
}
</style>
</head>
<body>

<h1>BROOKLYN QSC REPORT</h1>
<div class="sub">${escapeHtml(report.meta.store)} | ${escapeHtml(formatDateTime(report.meta.inspectDate || report.meta.timestamp || "-"))}</div>

<div style="border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;margin-bottom:20px;">
  <div style="margin-bottom:4px;font-size:13px;"><b>매장:</b> ${escapeHtml(report.meta.store)}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>점검일자:</b> ${escapeHtml(report.meta.inspectDate || "-")}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>분기:</b> ${escapeHtml(report.meta.quarter || "-")}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>점검자:</b> ${escapeHtml(report.meta.inspector || "-")}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>점검유형:</b> ${escapeHtml(report.meta.inspectType || "-")}</div>
</div>

<div class="summary-grid">
  <div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fafafa;">
    <div style="font-size:13px;color:#666;margin-bottom:6px;">총점</div>
    <div style="font-size:26px;font-weight:800;">${report.totalScore}점</div>
  </div>

  <div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fafafa;">
    <div style="font-size:13px;color:#666;margin-bottom:6px;">등급</div>
    <div style="font-size:26px;font-weight:800;">${report.grade} | ${getStatusLabel(report.totalScore)}</div>
  </div>

  <div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fafafa;">
    <div style="font-size:13px;color:#666;margin-bottom:6px;">핵심 이슈 수</div>
    <div style="font-size:26px;font-weight:800;">△ ${report.totalWarn} / ❌ ${report.totalFail}</div>
  </div>

  ${trendHtml}
</div>

<h2>섹션 점수</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${sectionCards}</div>

<h2>핵심 이슈</h2>
${
  report.keyIssues.length
    ? `<table class="report-table">
        <thead>
          <tr><th>No</th><th>문항코드</th><th>섹션</th><th>결과</th><th>우선순위</th></tr>
        </thead>
        <tbody>${keyIssueRows}</tbody>
      </table>`
    : `<div class="empty-box">핵심 이슈 없음 (전 문항 OK)</div>`
}

<h2>액션 코멘트</h2>
<div class="two-col">
  <div class="action-box"><b>즉시 조치</b><ul>${immediateHtml}</ul></div>
  <div class="action-box"><b>교육 포인트</b><ul>${educationHtml}</ul></div>
</div>

<div class="page-break"></div>
<h2>상세표</h2>
<table class="report-table">
  <thead>
    <tr><th>문항코드</th><th>섹션</th><th>결과</th><th>우선순위</th></tr>
  </thead>
  <tbody>${detailRows}</tbody>
</table>

<div class="page-break"></div>
<h2>사진 근거</h2>
${photoHtml}

</body>
</html>
`;

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();

    reportWindow.onload = () => {
      reportWindow.focus();
      reportWindow.print();
    };
  }

  // =========================
  // 매장별 목록 생성
  // =========================
  function createStoreList() {
    if (!resultBox) return;

    const names = getStoreNames();
    resultBox.innerHTML = "";

    if (!names.length) {
      resultBox.innerHTML = `<div class="error">매장 데이터가 없습니다.</div>`;
      return;
    }

    names.forEach((store) => {
      const rows = storeMap[store] || [];

      const item = document.createElement("div");
      item.className = "store-item";

      const left = document.createElement("div");
      left.className = "store-left";

      const nameDiv = document.createElement("div");
      nameDiv.className = "store-name";
      nameDiv.textContent = store;

      const countDiv = document.createElement("div");
      countDiv.className = "store-count";
      countDiv.textContent = `점검 ${rows.length}건 | 저장 사진 ${getPhotosByStore(store).length}장`;

      left.appendChild(nameDiv);
      left.appendChild(countDiv);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "PDF 생성";
      btn.addEventListener("click", () => {
        openPrintReport(store, rows);
      });

      item.appendChild(left);
      item.appendChild(btn);
      resultBox.appendChild(item);
    });

    setStatus('<span class="success">매장별 목록 생성 완료</span>');
  }

  // =========================
  // CSV 읽기
  // =========================
  function handleCSVFile(file) {
    if (!file) return;

    csvData = [];
    detectedStoreColumn = "";
    storeMap = {};
    if (resultBox) resultBox.innerHTML = "";
    hideDebug();
    setStatus("CSV 읽는 중...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (results) => {
        const rawRows = results.data || [];
        let rows = rawRows.map(normalizeRow);

        rows = rows.filter((row) =>
          Object.values(row).some((v) => cleanValue(v) !== "")
        );

        csvData = rows;

        if (!csvData.length) {
          setStatus("CSV 데이터가 비어 있습니다.", true);
          return;
        }

        const headers = Object.keys(csvData[0]).map(cleanKey);
        detectedStoreColumn = detectStoreColumn(headers);

        if (!detectedStoreColumn) {
          setStatus("CSV에서 매장 컬럼을 찾지 못했습니다.", true);
          showDebug("현재 헤더:\n" + headers.join("\n"));
          return;
        }

        rebuildStoreMap();
        updateStoreSelectOptions();
        updatePhotoFormRules();
        renderPhotoPreview();

        const sampleStore = getStoreValueFromRow(csvData[0], detectedStoreColumn);
        setStatus(
          `CSV 업로드 완료 | 행 수: ${csvData.length} | 매장 컬럼: ${detectedStoreColumn}` +
          (sampleStore ? ` | 예시값: ${sampleStore}` : "")
        );
      },
      error: (err) => {
        console.error(err);
        setStatus("CSV 파일 읽기 실패", true);
      }
    });
  }

  // =========================
  // 이벤트
  // =========================
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      handleCSVFile(file);
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener("click", () => {
      if (!csvData.length) {
        setStatus("CSV 파일을 먼저 업로드하세요.", true);
        return;
      }
      if (!detectedStoreColumn) {
        setStatus("매장 컬럼을 찾지 못해 리포트를 생성할 수 없습니다.", true);
        return;
      }
      createStoreList();
    });
  }

  if (resetHistoryBtn) {
    resetHistoryBtn.addEventListener("click", () => {
      if (!confirm("이 브라우저에 저장된 추세 기록을 초기화할까요?")) return;
      localStorage.removeItem(HISTORY_KEY);
      alert("추세 기록이 초기화되었습니다.");
    });
  }

  if (photoStoreSelect) {
    photoStoreSelect.addEventListener("change", () => {
      updatePhotoFormRules();
      renderPhotoPreview();
    });
  }

  if (photoTypeSelect) {
    photoTypeSelect.addEventListener("change", updatePhotoFormRules);
  }

  if (photoSectionSelect) {
    photoSectionSelect.addEventListener("change", updateItemSelectOptions);
  }

  if (savePhotoBtn) {
    savePhotoBtn.addEventListener("click", async () => {
      await saveSelectedPhotos();
    });
  }

  if (clearStorePhotoBtn) {
    clearStorePhotoBtn.addEventListener("click", () => {
      if (!photoStoreSelect) return;
      const store = photoStoreSelect.value;
      if (!store) {
        alert("먼저 매장을 선택하세요.");
        return;
      }
      if (!confirm("선택한 매장 사진을 전체 삭제할까요?")) return;
      clearStorePhotos(store);
      renderPhotoPreview();
      createStoreList();
      alert("선택 매장 사진이 삭제되었습니다.");
    });
  }

  // =========================
  // 초기화
  // =========================
  updateStoreSelectOptions();
  updatePhotoFormRules();
  renderPhotoPreview();
})();