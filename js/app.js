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

  // 메타 컬럼 목록 (주관식 감지 시 제외)
  const META_COLUMN_KEYWORDS = [
    "매장명", "매장", "점검일자", "점검 날짜", "점검일",
    "분기", "점검 IST 이름", "점검자", "IST 이름",
    "점검 유형", "점검유형", "타임스탬프", "Timestamp"
  ];

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
    if (/^(DOC|COOK|INV|SVC|CLN)_+\d+/.test(k)) return true;
    // 한글 접두사 지원: 서류_, 조리_, 식재료_, 서비스_, 청결_
    const k2 = cleanKey(key).replace(/\s+/g, "");
    if (/^(서류|조리|식재료|서비스|청결)_\d+/.test(k2)) return true;
    return false;
  }

  function isMetaColumn(key) {
    const k = cleanKey(key);
    return META_COLUMN_KEYWORDS.some((m) => k === m || k.includes(m));
  }

  // ▼▼▼ [v3.2 추가] 주관식 컬럼 감지 ▼▼▼
  function isOpenEndedColumn(key) {
    if (isQuestionColumn(key)) return false;
    if (isMetaColumn(key)) return false;
    // 값이 있을 때만 판단하므로 구조 기준은 키만 확인
    return true;
  }

  function getSectionFromKey(key) {
    const k = normalizeQuestionKey(key);
    if (k.startsWith("DOC_")) return "DOC";
    if (k.startsWith("COOK_")) return "COOK";
    if (k.startsWith("INV_")) return "INV";
    if (k.startsWith("SVC_")) return "SVC";
    if (k.startsWith("CLN_")) return "CLN";
    // 한글 접두사 매핑
    const k2 = cleanKey(key).replace(/\s+/g, "");
    if (k2.startsWith("서류_")) return "DOC";
    if (k2.startsWith("조리_")) return "COOK";
    if (k2.startsWith("식재료_")) return "INV";
    if (k2.startsWith("서비스_")) return "SVC";
    if (k2.startsWith("청결_")) return "CLN";
    return "ETC";
  }

  // ▼▼▼ [v3.2 추가] 주관식 컬럼의 섹션 추론 ▼▼▼
  function inferSectionFromColumnName(key) {
    const k = cleanKey(key).toUpperCase();
    if (k.includes("COOK") || k.includes("조리")) return "COOK";
    if (k.includes("INV") || k.includes("식재료") || k.includes("재료")) return "INV";
    if (k.includes("SVC") || k.includes("서비스") || k.includes("고객")) return "SVC";
    if (k.includes("CLN") || k.includes("청결") || k.includes("위생")) return "CLN";
    if (k.includes("DOC") || k.includes("서류") || k.includes("문서")) return "DOC";
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
    ) return "FAIL";

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
    ) return "WARN";

    if (
      raw.includes("⭕") ||
      compact === "ok" ||
      compact.includes("된다") ||
      compact.includes("준수") ||
      compact.includes("양호") ||
      compact.includes("정상")
    ) return "OK";

    return "WARN";
  }

  function getDisplayResult(type) {
    if (type === "OK")   return "⭕ 된다";
    if (type === "WARN") return "△ 흔들린다";
    if (type === "FAIL") return "❌ 안 된다";
    if (type === "NONE") return "- 미입력";
    return "-";
  }

  function getScoreByType(type) {
    if (type === "OK")   return 2;
    if (type === "WARN") return 1;
    if (type === "FAIL") return 0;
    return 0; // NONE도 0점
  }

  function getPriority(type) {
    if (type === "FAIL") return "높음";
    if (type === "WARN") return "중간";
    if (type === "NONE") return "확인필요";
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

  // ▼▼▼ [v3.2 추가] 최신 row 선택 ▼▼▼
  // 날짜 컬럼 기준으로 정렬 후 가장 최근 row 반환
  function getLatestRow(rows) {
    if (!rows || !rows.length) return {};
    if (rows.length === 1) return rows[0];

    const sorted = [...rows].sort((a, b) => {
      const da = getMetaValue(a, ["점검일자", "점검 날짜", "점검일", "타임스탬프", "Timestamp"]);
      const db = getMetaValue(b, ["점검일자", "점검 날짜", "점검일", "타임스탬프", "Timestamp"]);
      return String(db).localeCompare(String(da));
    });
    return sorted[0];
  }

  // =========================
  // localStorage - history
  // =========================
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}"); }
    catch { return {}; }
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
    try { return JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}"); }
    catch { return {}; }
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
  // ▼▼▼ [v3.2 신규] 주관식 코멘트 추출 ▼▼▼
  // 최신 row에서 객관식/메타 컬럼을 제외한 컬럼을 섹션별로 수집
  // =========================
  function extractOpenEndedComments(row) {
    const comments = {}; // { COOK: [{key, value}], INV: [...], ... }
    const keys = Object.keys(row || {});

    keys.forEach((key) => {
      if (isQuestionColumn(key)) return;
      if (isMetaColumn(key)) return;

      const val = cleanValue(row[key]);
      if (!val) return;

      const section = inferSectionFromColumnName(key);
      if (!comments[section]) comments[section] = [];
      comments[section].push({ key: cleanKey(key), value: val });
    });

    return comments;
  }

  // =========================
  // ▼▼▼ [v3.2 수정] 분석 — 최신 row 기준, 문항코드 dedup ▼▼▼
  // =========================
  function analyzeStoreRows(store, rows, options = {}) {

    // ── [수정 핵심 1] 최신 row 1개만 사용 ──
    const latestRow = getLatestRow(rows);
    const keys = Object.keys(latestRow);

    const sectionSummary = {};
    SECTION_ORDER.forEach((s) => {
      sectionSummary[s] = {
        section: s,
        label: SECTION_LABELS[s],
        totalQuestions: 0,
        ok: 0, warn: 0, fail: 0,
        earned: 0, max: 0, score: 0
      };
    });

    // ── [수정 핵심 2] Map 기반 문항코드 dedup ──
    const itemMap = new Map(); // code → item

    keys.forEach((key) => {
      if (!isQuestionColumn(key)) return;

      const rawValue = latestRow[key];
      const type = getResultType(rawValue) || "NONE"; // 빈 값도 NONE으로 포함

      const code = normalizeQuestionKey(key);
      if (itemMap.has(code)) return; // 중복 코드 무시

      const section = getSectionFromKey(key);
      if (!sectionSummary[section]) return;

      sectionSummary[section].totalQuestions += 1;
      sectionSummary[section].max += 2;
      sectionSummary[section].earned += getScoreByType(type);

      if (type === "OK")   sectionSummary[section].ok   += 1;
      if (type === "WARN") sectionSummary[section].warn += 1;
      if (type === "FAIL") sectionSummary[section].fail += 1;

      itemMap.set(code, {
        code,
        section,
        sectionLabel: SECTION_LABELS[section],
        resultType: type,
        resultDisplay: getDisplayResult(type),
        priority: getPriority(type),
        rawValue: cleanValue(rawValue)
      });
    });

    // ── [수정 핵심 3] 주관식 코멘트 추출 ──
    const openEndedComments = extractOpenEndedComments(latestRow);

    // 점수 계산
    let totalEarned = 0, totalMax = 0, totalWarn = 0, totalFail = 0;
    SECTION_ORDER.forEach((s) => {
      const sec = sectionSummary[s];
      sec.score = sec.max ? Math.round((sec.earned / sec.max) * 100) : 0;
      totalEarned += sec.earned;
      totalMax    += sec.max;
      totalWarn   += sec.warn;
      totalFail   += sec.fail;
    });

    const totalScore = totalMax ? Math.round((totalEarned / totalMax) * 100) : 0;
    const grade = getGrade(totalScore);

    // allItems 정렬: FAIL → WARN → OK, 같으면 코드 순
    const allItems = Array.from(itemMap.values()).sort((a, b) => {
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
      inspectDate: getMetaValue(latestRow, ["점검일자", "점검 날짜", "점검일"]),
      quarter:     getMetaValue(latestRow, ["분기"]),
      inspector:   getMetaValue(latestRow, ["점검 IST 이름", "점검자", "IST 이름"]),
      inspectType: getMetaValue(latestRow, ["점검 유형", "점검유형"]),
      timestamp:   getMetaValue(latestRow, ["타임스탬프", "Timestamp"])
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
      const failDiff  = totalFail  - prev.fail;
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
      totalScore, grade,
      totalWarn, totalFail,
      sectionSummary,
      keyIssues,
      actionComments,
      detailedItems: allItems,
      openEndedComments, // ← v3.2 추가
      trend,
      inspectionCount: rows.length // ← 이력 row 수 표시용
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

    // 최신 row 기준으로만 ISSUE 옵션 구성
    const latestRow = getLatestRow(rows);
    Object.keys(latestRow).forEach((key) => {
      if (!isQuestionColumn(key)) return;

      const rawValue = cleanValue(latestRow[key]);
      if (!rawValue) return;

      const type = getResultType(rawValue);
      if (!type || type === "OK") return;

      const code = normalizeQuestionKey(key);
      const section = getSectionFromKey(key);
      const label = `${code} | ${SECTION_LABELS[section]} | ${getDisplayResult(type)}`;

      if (!map.has(code)) {
        map.set(code, { code, section, label, resultType: type });
        if (counts[section] !== undefined) counts[section] += 1;
      }
    });

    showDebug(
      `ISSUE 옵션 수\nDOC: ${counts.DOC}\nCOOK: ${counts.COOK}\nINV: ${counts.INV}\nSVC: ${counts.SVC}\nCLN: ${counts.CLN}`
    );

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  function buildAllQuestionOptionsForStore(store) {
    const rows = storeMap[store] || [];
    if (!rows.length) return [];

    const latestRow = getLatestRow(rows);
    const keys = Object.keys(latestRow).filter(isQuestionColumn);
    const seen = new Set();

    return keys
      .map((key) => {
        const code = normalizeQuestionKey(key);
        const section = getSectionFromKey(key);
        return { code, section, label: `${code} | ${SECTION_LABELS[section]}` };
      })
      .filter((item) => {
        if (seen.has(item.code)) return false;
        seen.add(item.code);
        return true;
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
    if (names.includes(current)) photoStoreSelect.value = current;
  }

  function updateItemSelectOptions() {
    if (!photoStoreSelect || !photoTypeSelect || !photoSectionSelect || !photoItemSelect) return;

    const store = photoStoreSelect.value;
    const type  = normalizePhotoType(photoTypeSelect.value);
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
      if (section !== "ALL") options = options.filter((x) => normalizeSectionValue(x.section) === section);
    }
    if (type === "GOOD") {
      options = buildAllQuestionOptionsForStore(store);
      if (section !== "ALL") options = options.filter((x) => normalizeSectionValue(x.section) === section);
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
      if (photoSectionSelect.querySelector('option[value="ALL"]')) photoSectionSelect.value = "ALL";
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
    const id    = decodeURIComponent(idEncoded);
    if (!confirm("이 사진을 삭제할까요?")) return;
    deletePhotoRecord(store, id);
    renderPhotoPreview();
    createStoreList();
  };

  async function saveSelectedPhotos() {
    if (!photoStoreSelect || !photoTypeSelect || !photoSectionSelect || !photoFiles) return;

    const store     = photoStoreSelect.value;
    const photoType = normalizePhotoType(photoTypeSelect.value);
    const section   = normalizeSectionValue(photoSectionSelect.value);
    const itemCode  = photoItemSelect ? photoItemSelect.value : "";
    const caption   = photoCaption ? cleanValue(photoCaption.value) : "";
    const files     = Array.from(photoFiles.files || []);

    if (!store) { alert("매장을 선택하세요."); return; }
    if (photoType === "ISSUE" && !itemCode) { alert("ISSUE 사진은 문항코드가 필수입니다."); return; }
    if (!files.length) { alert("사진 파일을 선택하세요."); return; }

    try {
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await compressImageToBase64(files[i], 1400, 0.72);
        savePhotoRecord(store, {
          id: "photo_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 8),
          store, photoType, section, itemCode: itemCode || "",
          caption, dataUrl,
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
    if (!photos.length) return `<div class="empty-box">저장된 사진 근거가 없습니다.</div>`;

    const issuePhotos  = photos.filter((p) => p.photoType === "ISSUE");
    const goodPhotos   = photos.filter((p) => p.photoType === "GOOD");
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
        html += `<div style="margin-bottom:18px;"><div style="font-size:14px;font-weight:800;margin-bottom:8px;color:#b00020;">${escapeHtml(code)}</div><div class="photo-grid">`;
        issueGroup[code].forEach((p) => {
          html += `
            <div class="photo-box">
              <img src="${p.dataUrl}" alt="issue photo">
              <div class="photo-box-body">
                <div class="photo-box-meta">${escapeHtml(SECTION_LABELS[p.section] || p.section)} | ${escapeHtml(p.createdAt || "-")}</div>
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
      html += `<div class="issue-photo-section"><div class="issue-photo-title" style="color:#0a7b34;">잘한 사례 (GOOD)</div><div class="photo-grid">`;
      goodPhotos.forEach((p) => {
        html += `
          <div class="photo-box">
            <img src="${p.dataUrl}" alt="good photo">
            <div class="photo-box-body">
              <div class="photo-box-meta">${escapeHtml(SECTION_LABELS[p.section] || p.section)} | ${escapeHtml(p.createdAt || "-")}</div>
              <div class="photo-box-title">${escapeHtml(p.itemCode || "문항없음")}</div>
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
              <div class="photo-box-meta">${escapeHtml(p.createdAt || "-")}</div>
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
  // ▼▼▼ [v3.2 신규] 주관식 코멘트 요약 박스 HTML 생성 ▼▼▼
  // =========================
  function buildCommentSummaryHtml(openEndedComments) {
    const sections = SECTION_ORDER.filter((s) => openEndedComments[s] && openEndedComments[s].length);
    const etcItems = openEndedComments["ETC"] || [];

    if (!sections.length && !etcItems.length) return "";

    let html = `<h2>현장 관찰 코멘트</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;">`;

    sections.forEach((s) => {
      const items = openEndedComments[s];
      html += `
        <div style="border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;page-break-inside:avoid;">
          <div style="font-size:13px;font-weight:800;color:#555;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px;">
            ${escapeHtml(SECTION_LABELS[s])} 코멘트
          </div>
          ${items.map((item) => `
            <div style="margin-bottom:8px;">
              <div style="font-size:11px;color:#888;margin-bottom:2px;">${escapeHtml(item.key)}</div>
              <div style="font-size:13px;color:#333;white-space:pre-wrap;word-break:break-word;">${escapeHtml(item.value)}</div>
            </div>
          `).join("")}
        </div>
      `;
    });

    html += `</div>`;

    if (etcItems.length) {
      html += `
        <div style="border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;margin-bottom:24px;">
          <div style="font-size:13px;font-weight:800;color:#555;margin-bottom:8px;">기타 코멘트</div>
          ${etcItems.map((item) => `
            <div style="margin-bottom:8px;">
              <div style="font-size:11px;color:#888;margin-bottom:2px;">${escapeHtml(item.key)}</div>
              <div style="font-size:13px;color:#333;white-space:pre-wrap;word-break:break-word;">${escapeHtml(item.value)}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    return html;
  }

  // =========================
  // PDF 생성
  // =========================
  function sectionCardHtml(sec) {
    const barColor = sec.score >= 80 ? "#0a7b34" : sec.score >= 60 ? "#8a5a00" : "#b00020";
    return `
      <div style="border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-weight:800;font-size:15px;">${escapeHtml(sec.section)} | ${escapeHtml(sec.label)}</div>
          <div style="font-size:22px;font-weight:800;color:${barColor};">${sec.score}점</div>
        </div>
        <div style="font-size:13px;color:#555;">OK ${sec.ok} / WARN ${sec.warn} / FAIL ${sec.fail}</div>
      </div>
    `;
  }

  function openPrintReport(store, rows) {
    const report = analyzeStoreRows(store, rows);
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) { alert("팝업이 차단되었습니다."); return; }

    let sectionCards = "";
    SECTION_ORDER.forEach((s) => {
      const data = report.sectionSummary[s];
      if (data && data.totalQuestions > 0) sectionCards += sectionCardHtml(data);
    });

    let keyIssueRows = "";
    report.keyIssues.forEach((item, idx) => {
      keyIssueRows += `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${escapeHtml(item.code)}</b></td>
          <td>${escapeHtml(item.sectionLabel)}</td>
          <td>${escapeHtml(item.resultDisplay)}</td>
          <td>${escapeHtml(item.priority)}</td>
        </tr>
      `;
    });

    // ── [v3.2] 상세표: 중복 없는 allItems 사용 ──
    let detailRows = "";
    report.detailedItems.forEach((item) => {
      const rowBg = item.resultType === "FAIL" ? "#fff0f0"
                  : item.resultType === "WARN" ? "#fffbe6"
                  : "";
      detailRows += `
        <tr style="background:${rowBg};">
          <td><b>${escapeHtml(item.code)}</b></td>
          <td>${escapeHtml(item.sectionLabel)}</td>
          <td>${escapeHtml(item.resultDisplay)}</td>
          <td>${escapeHtml(item.priority)}</td>
        </tr>
      `;
    });

    const immediateHtml = report.actionComments.immediate.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    const educationHtml = report.actionComments.education.map((x) => `<li>${escapeHtml(x)}</li>`).join("");

    // 추세
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
      const failDiffText  = report.trend.failDiff  > 0 ? "+" + report.trend.failDiff  : String(report.trend.failDiff);
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

    // ── [v3.2] 주관식 코멘트 박스 ──
    const commentSummaryHtml = buildCommentSummaryHtml(report.openEndedComments);

    const photoHtml = buildPhotoEvidenceHtml(store);

    // 점검 이력 수 표시 (복수 row일 때 안내)
    const inspectionNote = report.inspectionCount > 1
      ? `<div style="font-size:12px;color:#888;margin-top:4px;">※ 이번 리포트는 ${report.inspectionCount}건 이력 중 최신 점검 기준으로 작성되었습니다.</div>`
      : "";

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(store)} QSC REPORT v3.2</title>
<style>
body{font-family:Arial,sans-serif;margin:30px;color:#222;line-height:1.45;}
h1{font-size:30px;margin:0 0 6px 0;font-weight:800;}
h2{font-size:18px;margin:28px 0 12px 0;border-bottom:2px solid #eee;padding-bottom:6px;font-weight:800;}
.sub{color:#666;margin-bottom:4px;font-size:14px;}
.summary-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1.2fr;gap:14px;margin-bottom:20px;}
.report-table{width:100%;border-collapse:collapse;table-layout:fixed;}
.report-table th,.report-table td{border:1px solid #ddd;padding:8px 10px;text-align:left;vertical-align:top;word-break:break-word;font-size:12px;}
.report-table th{background:#f5f5f5;font-weight:800;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.action-box{border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;}
.action-box ul{margin:8px 0 0 18px;padding:0;font-size:13px;}
.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.photo-box{border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff;page-break-inside:avoid;}
.photo-box img{width:100%;height:220px;object-fit:cover;display:block;background:#f2f2f2;}
.photo-box-body{padding:12px;}
.photo-box-meta{font-size:11px;color:#888;margin-bottom:4px;}
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

<h1>BROOKLYN QSC REPORT <span style="font-size:16px;color:#999;font-weight:400;">v3.2</span></h1>
<div class="sub">${escapeHtml(report.meta.store)} | ${escapeHtml(formatDateTime(report.meta.inspectDate || report.meta.timestamp || "-"))}</div>
${inspectionNote}

<div style="border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff;margin:16px 0 20px;">
  <div style="margin-bottom:4px;font-size:13px;"><b>매장:</b> ${escapeHtml(report.meta.store)}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>점검일자:</b> ${escapeHtml(report.meta.inspectDate || "-")}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>분기:</b> ${escapeHtml(report.meta.quarter || "-")}</div>
  <div style="margin-bottom:4px;font-size:13px;"><b>점검자:</b> ${escapeHtml(report.meta.inspector || "-")}</div>
  <div style="font-size:13px;"><b>점검유형:</b> ${escapeHtml(report.meta.inspectType || "-")}</div>
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
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">${sectionCards}</div>

<h2>핵심 이슈</h2>
${
  report.keyIssues.length
    ? `<table class="report-table">
        <thead><tr><th>No</th><th>문항코드</th><th>섹션</th><th>결과</th><th>우선순위</th></tr></thead>
        <tbody>${keyIssueRows}</tbody>
      </table>`
    : `<div class="empty-box">핵심 이슈 없음 (전 문항 OK)</div>`
}

<h2>액션 코멘트</h2>
<div class="two-col" style="margin-bottom:24px;">
  <div class="action-box"><b>즉시 조치</b><ul>${immediateHtml}</ul></div>
  <div class="action-box"><b>교육 포인트</b><ul>${educationHtml}</ul></div>
</div>

<div class="page-break"></div>

${commentSummaryHtml}

<h2>상세 점검표</h2>
<div style="font-size:12px;color:#888;margin-bottom:8px;">최신 점검 기준 | 총 ${report.detailedItems.length}문항</div>
<table class="report-table">
  <thead><tr><th>문항코드</th><th>섹션</th><th>결과</th><th>우선순위</th></tr></thead>
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
      countDiv.textContent = `점검 이력 ${rows.length}건 | 저장 사진 ${getPhotosByStore(store).length}장`;

      left.appendChild(nameDiv);
      left.appendChild(countDiv);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "PDF 생성";
      btn.addEventListener("click", () => { openPrintReport(store, rows); });

      item.appendChild(left);
      item.appendChild(btn);
      resultBox.appendChild(item);
    });

    setStatus('<span class="success">매장별 목록 생성 완료 (v3.2)</span>');
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
        rows = rows.filter((row) => Object.values(row).some((v) => cleanValue(v) !== ""));

        csvData = rows;
        if (!csvData.length) { setStatus("CSV 데이터가 비어 있습니다.", true); return; }

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
    fileInput.addEventListener("change", (e) => { handleCSVFile(e.target.files[0]); });
  }
  if (generateBtn) {
    generateBtn.addEventListener("click", () => {
      if (!csvData.length) { setStatus("CSV 파일을 먼저 업로드하세요.", true); return; }
      if (!detectedStoreColumn) { setStatus("매장 컬럼을 찾지 못해 리포트를 생성할 수 없습니다.", true); return; }
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
    photoStoreSelect.addEventListener("change", () => { updatePhotoFormRules(); renderPhotoPreview(); });
  }
  if (photoTypeSelect) {
    photoTypeSelect.addEventListener("change", updatePhotoFormRules);
  }
  if (photoSectionSelect) {
    photoSectionSelect.addEventListener("change", updateItemSelectOptions);
  }
  if (savePhotoBtn) {
    savePhotoBtn.addEventListener("click", async () => { await saveSelectedPhotos(); });
  }
  if (clearStorePhotoBtn) {
    clearStorePhotoBtn.addEventListener("click", () => {
      if (!photoStoreSelect) return;
      const store = photoStoreSelect.value;
      if (!store) { alert("먼저 매장을 선택하세요."); return; }
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
