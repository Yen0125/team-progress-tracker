const PRESET_SKILLS = [
  "系統程式開發",
  "API 串接",
  "UI/UX 與視覺設計",
  "響應式網頁排版",
  "數據分析與圖表",
  "AI 提示詞工程",
  "問卷統計分析",
  "資料蒐集與文獻整理",
  "文案撰寫與統整",
  "簡報製作與排版",
  "口頭報告與表達",
  "系統測試與除錯",
  "技術文件撰寫",
];

const AVATAR_COLORS = [
  "#2563eb",
  "#db2777",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#e11d48",
  "#4f46e5",
];

const DIFF_META = {
  low: { label: "低難度 (1x)", short: "1x · 10點", weight: 1, points: 10, badgeClass: "diff-low" },
  medium: { label: "中難度 (2x)", short: "2x · 20點", weight: 2, points: 20, badgeClass: "diff-medium" },
  high: { label: "高難度 (3x)", short: "3x · 30點", weight: 3, points: 30, badgeClass: "diff-high" },
};

const STATUS_META = {
  todo: { label: "📝 待開始", colId: "col-todo-list" },
  in_progress: { label: "🚀 進行中", colId: "col-in_progress-list" },
  review: { label: "🔍 審閱與整合", colId: "col-review-list" },
  done: { label: "✅ 已完成", colId: "col-done-list" },
};

let appState = {
  project: {
    title: "小組報告進度追蹤平台",
    course: "專題實作",
    accessCode: "team2026",
    requirePasscode: false,
  },
  members: [],
  tasks: [],
};

let currentAISuggestions = [];
let activeView = "all";

function showToast(msg) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseCommaList(val) {
  return String(val || "")
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDueStatus(dueDateStr, status, progress) {
  if (status === "done" || Number(progress) >= 100) {
    return { code: "done", text: "🟢 已完成", className: "due-done", isOverdue: false, isSoon: false };
  }
  if (!dueDateStr) {
    return { code: "normal", text: "📅 未設期限", className: "due-normal", isOverdue: false, isSoon: false };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + "T00:00:00");
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      code: "overdue",
      text: `🔴 逾期 ${Math.abs(diffDays)} 天 (${dueDateStr})`,
      className: "due-overdue",
      isOverdue: true,
      isSoon: false,
    };
  }
  if (diffDays <= 3) {
    return {
      code: "soon",
      text: `🟠 剩 ${diffDays} 天到期 (${dueDateStr})`,
      className: "due-soon",
      isOverdue: false,
      isSoon: true,
    };
  }
  return {
    code: "normal",
    text: `🔵 剩 ${diffDays} 天 (${dueDateStr})`,
    className: "due-normal",
    isOverdue: false,
    isSoon: false,
  };
}

// Compute multi-dimensional team & member metrics
function computeTeamAnalytics() {
  const members = appState.members || [];
  const tasks = appState.tasks || [];

  const memberStatsMap = {};
  members.forEach((m) => {
    memberStatsMap[m.id] = {
      member: m,
      assignedCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      collabCount: 0,
      assignedPoints: 0, // Primary task difficulty points
      collabPoints: 0, // 0.25x bonus load for collaborating
      earnedPrimaryPoints: 0, // sum(points * progress / 100)
      earnedCollabPoints: 0,
      totalEarnedPoints: 0,
      totalEffectiveLoad: 0,
      highDiffCount: 0,
      medDiffCount: 0,
      lowDiffCount: 0,
      overdueCount: 0,
      soonCount: 0,
      onTrackCount: 0,
      tasksList: [],
    };
  });

  let totalTaskPoints = 0;
  let totalEarnedTaskPoints = 0;
  let statusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
  let overdueTotal = 0;
  let soonTotal = 0;

  tasks.forEach((t) => {
    const diff = DIFF_META[t.difficulty] || DIFF_META.medium;
    const pts = diff.points;
    const prog = Math.max(0, Math.min(100, Number(t.progress ?? 0)));
    const earned = +(pts * (prog / 100)).toFixed(1);

    totalTaskPoints += pts;
    totalEarnedTaskPoints += earned;

    const st = STATUS_META[t.status] ? t.status : "todo";
    statusCounts[st] = (statusCounts[st] || 0) + 1;

    const dueInfo = getDueStatus(t.dueDate, st, prog);
    if (dueInfo.isOverdue) overdueTotal++;
    else if (dueInfo.isSoon) soonTotal++;

    if (t.assigneeId && memberStatsMap[t.assigneeId]) {
      const ms = memberStatsMap[t.assigneeId];
      ms.assignedCount++;
      if (st === "done" || prog >= 100) ms.completedCount++;
      else if (st === "in_progress" || st === "review") ms.inProgressCount++;

      ms.assignedPoints += pts;
      ms.earnedPrimaryPoints += earned;
      if (t.difficulty === "high") ms.highDiffCount++;
      else if (t.difficulty === "medium") ms.medDiffCount++;
      else ms.lowDiffCount++;

      if (dueInfo.isOverdue) ms.overdueCount++;
      else if (dueInfo.isSoon) ms.soonCount++;
      else ms.onTrackCount++;

      ms.tasksList.push({ task: t, role: "主責", points: pts, earned, dueInfo });
    }

    (t.collaboratorIds || []).forEach((cid) => {
      if (cid && cid !== t.assigneeId && memberStatsMap[cid]) {
        const cs = memberStatsMap[cid];
        cs.collabCount++;
        const cLoad = +(pts * 0.25).toFixed(1);
        const cEarned = +(earned * 0.25).toFixed(1);
        cs.collabPoints += cLoad;
        cs.earnedCollabPoints += cEarned;
        cs.tasksList.push({ task: t, role: "協作", points: cLoad, earned: cEarned, dueInfo });
      }
    });
  });

  const memberStats = Object.values(memberStatsMap).map((ms) => {
    ms.totalEffectiveLoad = +(ms.assignedPoints + ms.collabPoints).toFixed(1);
    ms.totalEarnedPoints = +(ms.earnedPrimaryPoints + ms.earnedCollabPoints).toFixed(1);
    ms.weightedCompletionRate =
      ms.totalEffectiveLoad > 0 ? Math.round((ms.totalEarnedPoints / ms.totalEffectiveLoad) * 100) : 0;
    return ms;
  });

  const weightedProgressPct =
    totalTaskPoints > 0 ? Math.round((totalEarnedTaskPoints / totalTaskPoints) * 100) : 0;

  // Schedule health %
  const totalTasks = tasks.length;
  const scheduleHealthPct =
    totalTasks > 0
      ? Math.max(0, Math.round(((totalTasks - overdueTotal - soonTotal * 0.35) / totalTasks) * 100))
      : 100;

  // Workload balance score (100% = perfectly even assigned load across members)
  let balanceScore = 100;
  let avgLoad = 0;
  if (memberStats.length > 1 && totalTaskPoints > 0) {
    const loads = memberStats.map((m) => m.totalEffectiveLoad);
    avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    if (avgLoad > 0) {
      const mad = loads.reduce((acc, v) => acc + Math.abs(v - avgLoad), 0) / loads.length;
      balanceScore = Math.max(20, Math.min(100, Math.round((1 - mad / (avgLoad * 1.25)) * 100)));
    }
  } else if (memberStats.length === 1) {
    avgLoad = memberStats[0].totalEffectiveLoad;
  }

  return {
    totalTaskPoints,
    totalEarnedTaskPoints: +totalEarnedTaskPoints.toFixed(1),
    weightedProgressPct,
    statusCounts,
    overdueTotal,
    soonTotal,
    scheduleHealthPct,
    balanceScore,
    avgLoad: +avgLoad.toFixed(1),
    memberStats,
  };
}

function getDefaultDemoData() {
  const today = new Date();
  const relDate = (days) => {
    const d = new Date(today.getTime() + days * 86400000);
    return d.toISOString().slice(0, 10);
  };
  return {
    project: {
      title: "期末專題：AI 專長適性分工與小組進度追蹤系統研究",
      course: "資訊管理專題實作 (第 04 組)",
      deadline: relDate(14),
      accessCode: "team2026",
      requirePasscode: false,
    },
    members: [
      {
        id: "m1",
        name: "林宥辰",
        role: "組長 / 系統架構",
        avatarColor: "#2563eb",
        skills: ["系統程式開發", "API 串接", "技術文件撰寫"],
        preferences: ["系統程式開發", "架構設計"],
        avoid: ["美編排版"],
        capacityPoints: 60,
        note: "擅長前後端邏輯與系統整合，偏好負責核心功能實作",
      },
      {
        id: "m2",
        name: "陳語彤",
        role: "UI/UX 與前端設計",
        avatarColor: "#db2777",
        skills: ["UI/UX 與視覺設計", "響應式網頁排版", "簡報製作與排版"],
        preferences: ["UI/UX 與視覺設計", "原型設計"],
        avoid: ["資料庫正規化"],
        capacityPoints: 60,
        note: "重視使用者體驗與手機電腦雙端版面美感",
      },
      {
        id: "m3",
        name: "張哲瑋",
        role: "數據分析與演算法",
        avatarColor: "#059669",
        skills: ["數據分析與圖表", "AI 提示詞工程", "問卷統計分析"],
        preferences: ["數據分析與圖表", "AI 提示詞工程"],
        avoid: ["上台口頭報告"],
        capacityPoints: 60,
        note: "擅長量化指標設計與 AI 分工權重模型推導",
      },
      {
        id: "m4",
        name: "黃詩涵",
        name: "黃詩涵",
        role: "文獻研究與內容統整",
        avatarColor: "#d97706",
        skills: ["資料蒐集與文獻整理", "文案撰寫與統整", "會議紀錄與進度追蹤"],
        preferences: ["資料蒐集與文獻整理", "文案撰寫與統整"],
        avoid: ["系統程式開發"],
        capacityPoints: 60,
        note: "細心負責，擅長文獻探討、研究方法撰寫與報告文字潤飾",
      },
      {
        id: "m5",
        name: "周柏翰",
        role: "簡報展演與測試驗證",
        avatarColor: "#7c3aed",
        skills: ["口頭報告與表達", "簡報製作與排版", "系統測試與除錯"],
        preferences: ["口頭報告與表達", "系統測試與除錯"],
        avoid: ["文獻理論推導"],
        capacityPoints: 60,
        note: "台風穩健、邏輯清晰，負責專題發表與跨裝置實測驗證",
      },
    ],
    tasks: [
      {
        id: "t1",
        title: "國內外團隊協作與分工具文獻探討",
        description: "蒐集近五年同儕互評、社會賦閒效應（Social Loafing）與 AI 輔助任務分派之研究文獻並完成第二章草稿。",
        requiredSkills: ["資料蒐集與文獻整理", "文案撰寫與統整"],
        difficulty: "low",
        status: "done",
        progress: 100,
        dueDate: relDate(-3),
        assigneeId: "m4",
        collaboratorIds: [],
        aiReason: "黃詩涵同時具備「資料蒐集與文獻整理」與「文案撰寫與統整」兩項核心專長，且完全符合個人偏好。",
      },
      {
        id: "t2",
        title: "專題研究架構與訪談問卷題目擬定",
        description: "整理大學生小組報告常見痛點，設計需求訪談大綱與前測問卷題項。",
        requiredSkills: ["資料蒐集與文獻整理", "問卷統計分析"],
        difficulty: "low",
        status: "done",
        progress: 100,
        dueDate: relDate(-1),
        assigneeId: "m4",
        collaboratorIds: ["m3"],
        aiReason: "由黃詩涵主責文獻與題項文字、張哲瑋協作統計量表設計，發揮跨專長互補。",
      },
      {
        id: "t3",
        title: "AI 專長適性配對與多維度貢獻權重模型設計",
        description: "設計結合難度權重（1x/2x/3x）、進度百分比與負載平衡之量化演算法與 AI Prompt 結構。",
        requiredSkills: ["數據分析與圖表", "AI 提示詞工程"],
        difficulty: "high",
        status: "in_progress",
        progress: 85,
        dueDate: relDate(2),
        assigneeId: "m3",
        collaboratorIds: ["m1"],
        aiReason: "此為高難度核心任務（3x 權重），張哲瑋完全匹配「數據分析與圖表」及「AI 提示詞工程」專長與偏好。",
      },
      {
        id: "t4",
        title: "平台後端 API 與即時進度計算引擎開發",
        description: "實作組員管理、任務難度加權計算、AI 分工建議 API 與資料持久化儲存機制。",
        requiredSkills: ["系統程式開發", "API 串接"],
        difficulty: "high",
        status: "in_progress",
        progress: 80,
        dueDate: relDate(3),
        assigneeId: "m1",
        collaboratorIds: [],
        aiReason: "林宥辰具備「系統程式開發」與「API 串接」專長，承擔此 3x 高難度開發任務最為合適。",
      },
      {
        id: "t5",
        title: "響應式透明化進度看板與互動介面實作",
        description: "設計支援電腦與手機版的任務看板、貢獻度視覺化圖表與 AI 分工微調介面。",
        requiredSkills: ["UI/UX 與視覺設計", "響應式網頁排版"],
        difficulty: "high",
        status: "review",
        progress: 90,
        dueDate: relDate(1),
        assigneeId: "m2",
        collaboratorIds: ["m1"],
        aiReason: "陳語彤專精於「UI/UX 與視覺設計」及「響應式網頁排版」，目前進度已達 90% 進入審閱階段。",
      },
      {
        id: "t6",
        title: "手機與電腦雙端可用性測試與問題修正紀錄",
        description: "針對不同螢幕尺寸驗證新增組員、AI 配對調整、滑桿更新進度等完整操作流程並撰寫測試報告。",
        requiredSkills: ["系統測試與除錯", "技術文件撰寫"],
        difficulty: "medium",
        status: "in_progress",
        progress: 60,
        dueDate: relDate(5),
        assigneeId: "m5",
        collaboratorIds: ["m2"],
        aiReason: "周柏翰具備「系統測試與除錯」專長與偏好，搭配陳語彤協助檢視雙端介面細節。",
      },
      {
        id: "t7",
        title: "前測與後測使用者評估數據統計圖表繪製",
        description: "比較傳統件數計算與本平台加權透明看板對組員公平感認知之差異圖表。",
        requiredSkills: ["數據分析與圖表", "問卷統計分析"],
        difficulty: "medium",
        status: "todo",
        progress: 20,
        dueDate: relDate(7),
        assigneeId: "m3",
        collaboratorIds: [],
        aiReason: "與張哲瑋之統計分析專長高度契合，能在模型完成後無縫銜接圖表產出。",
      },
      {
        id: "t8",
        title: "期末專題成果簡報製作與口頭發表彩排",
        description: "統整問題意識、系統實機展示流程與量化成效，製作 15 分鐘發表簡報並進行 Q&A 演練。",
        requiredSkills: ["簡報製作與排版", "口頭報告與表達", "文案撰寫與統整"],
        difficulty: "medium",
        status: "todo",
        progress: 15,
        dueDate: relDate(10),
        assigneeId: "m5",
        collaboratorIds: ["m4", "m2"],
        aiReason: "周柏翰具備「口頭報告與表達」及「簡報製作與排版」雙專長，結合黃詩涵與陳語彤共同完善。",
      },
    ],
  };
}

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    const json = await res.json();
    if (json.ok && json.data) {
      appState = json.data;
      localStorage.setItem("team_tracker_backup", JSON.stringify(appState));
      checkPasscodeLock();
      renderAll();
      return;
    }
  } catch (err) {
    // Fallback to localStorage or default demo data when hosted statically
  }
  const cached = localStorage.getItem("team_tracker_backup");
  if (cached) {
    appState = JSON.parse(cached);
  } else {
    appState = getDefaultDemoData();
    localStorage.setItem("team_tracker_backup", JSON.stringify(appState));
  }
  checkPasscodeLock();
  renderAll();
}

async function persistState(toastMsg) {
  localStorage.setItem("team_tracker_backup", JSON.stringify(appState));
  renderAll();
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appState),
    });
    if (toastMsg) showToast(toastMsg);
  } catch (err) {
    if (toastMsg) showToast(toastMsg + " (已儲存於本機)");
  }
}

function checkPasscodeLock() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  const expected = appState.project?.accessCode || "team2026";
  const requireLock = Boolean(appState.project?.requirePasscode);
  const unlockedSession = sessionStorage.getItem("team_tracker_unlocked") === "1";

  const overlay = document.getElementById("lockOverlay");
  if (!overlay) return;

  if (requireLock && token !== expected && !unlockedSession) {
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

function renderAll() {
  const analytics = computeTeamAnalytics();
  renderHeaderAndKPIs(analytics);
  renderMembersSection(analytics);
  renderFilterDropdowns();
  renderKanbanBoard();
  renderContributionAnalytics(analytics);
  if (currentAISuggestions.length > 0) {
    renderAISimulatedLoadBars();
  }
}

function renderHeaderAndKPIs(analytics) {
  const titleEl = document.getElementById("projectTitleDisplay");
  if (titleEl && appState.project?.title) {
    titleEl.textContent = appState.project.title;
  }

  document.getElementById("kpiWeightedProgress").textContent = `${analytics.weightedProgressPct}%`;
  document.getElementById("kpiWeightedPointsSub").textContent =
    `已推進 ${analytics.totalEarnedTaskPoints} / ${analytics.totalTaskPoints} 加權點數`;

  const totalTasks = appState.tasks.length;
  const doneTasks = analytics.statusCounts.done || 0;
  document.getElementById("kpiTaskBreakdown").textContent = `${doneTasks} / ${totalTasks} 件完成`;
  document.getElementById("kpiTaskStatusSub").textContent =
    `進行中 ${analytics.statusCounts.in_progress || 0}・審閱 ${analytics.statusCounts.review || 0}・待辦 ${analytics.statusCounts.todo || 0}`;

  document.getElementById("kpiScheduleHealth").textContent = `${analytics.scheduleHealthPct}%`;
  document.getElementById("kpiScheduleSub").textContent =
    `${analytics.soonTotal} 項即將到期・${analytics.overdueTotal} 項逾期`;

  document.getElementById("kpiBalanceScore").textContent = `${analytics.balanceScore}%`;
  document.getElementById("kpiBalanceSub").textContent =
    `組員平均加權負載 ${analytics.avgLoad} 點`;
}

function renderMembersSection(analytics) {
  const grid = document.getElementById("membersGrid");
  if (!grid) return;

  const statsByMember = {};
  analytics.memberStats.forEach((ms) => {
    statsByMember[ms.member.id] = ms;
  });

  if (!appState.members.length) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 28px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 12px;">
        目前尚無組員資料，請點擊右上角「➕ 新增組員與專長」或「🔄 載入專題範例資料」。
      </div>
    `;
    return;
  }

  grid.innerHTML = appState.members
    .map((m) => {
      const ms = statsByMember[m.id] || {
        assignedPoints: 0,
        totalEffectiveLoad: 0,
        totalEarnedPoints: 0,
        assignedCount: 0,
        collabCount: 0,
      };
      const cap = Number(m.capacityPoints || 60);
      const loadPct = Math.min(100, Math.round((ms.totalEffectiveLoad / cap) * 100));
      const initial = (m.name || "?").trim().charAt(0);

      const skillsHtml = (m.skills || [])
        .map((s) => `<span class="tag tag-skill">${escapeHtml(s)}</span>`)
        .join("");
      const prefsHtml = (m.preferences || [])
        .map((p) => `<span class="tag tag-pref">♥ ${escapeHtml(p)}</span>`)
        .join("");
      const avoidHtml = (m.avoid || [])
        .map((a) => `<span class="tag tag-avoid">避：${escapeHtml(a)}</span>`)
        .join("");

      return `
        <div class="member-card" data-member-id="${escapeHtml(m.id)}">
          <div>
            <div class="member-top">
              <div class="member-identity">
                <div class="avatar-circle" style="background: ${escapeHtml(m.avatarColor || "#2563eb")}">
                  ${escapeHtml(initial)}
                </div>
                <div>
                  <div class="member-name">${escapeHtml(m.name)}</div>
                  <div class="member-role">${escapeHtml(m.role || "專題組員")}</div>
                </div>
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-outline btn-sm" type="button" onclick="openEditMemberModal('${escapeHtml(m.id)}')">編輯</button>
                <button class="btn btn-danger-soft btn-sm" type="button" onclick="deleteMember('${escapeHtml(m.id)}')">刪除</button>
              </div>
            </div>

            <div class="tag-group">
              <div class="tag-group-label">🛠️ 核心專長標籤</div>
              <div class="tags-wrap">${skillsHtml || '<span style="font-size:0.75rem;color:#94a3b8;">未設定</span>'}</div>
            </div>

            <div class="tag-group">
              <div class="tag-group-label">💡 偏好與避開項目</div>
              <div class="tags-wrap">
                ${prefsHtml}
                ${avoidHtml}
                ${!prefsHtml && !avoidHtml ? '<span style="font-size:0.75rem;color:#94a3b8;">無特別限制</span>' : ""}
              </div>
            </div>

            ${m.note ? `<div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 10px;">💬 ${escapeHtml(m.note)}</div>` : ""}
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.76rem; font-weight: 600; margin-bottom: 4px;">
              <span>目前加權負載：${ms.totalEffectiveLoad} / ${cap} 點</span>
              <span style="color: var(--primary);">已推進 ${ms.totalEarnedPoints} 點</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${loadPct}%; background: ${loadPct > 95 ? "#dc2626" : "linear-gradient(90deg, #3b82f6, #6366f1)"}"></div>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; justify-content: space-between;">
              <span>主責 ${ms.assignedCount} 件 · 協作 ${ms.collabCount} 件</span>
              <span>負載率 ${loadPct}%</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderFilterDropdowns() {
  const filterMember = document.getElementById("filterMemberSelect");
  if (!filterMember) return;
  const currentVal = filterMember.value || "all";
  filterMember.innerHTML =
    `<option value="all">👤 篩選：全部組員</option>` +
    appState.members
      .map((m) => `<option value="${escapeHtml(m.id)}">👤 ${escapeHtml(m.name)}</option>`)
      .join("") +
    `<option value="unassigned">❓ 未指派負責人</option>`;
  filterMember.value = currentVal;
}

function renderKanbanBoard() {
  const memberFilter = document.getElementById("filterMemberSelect")?.value || "all";
  const diffFilter = document.getElementById("filterDifficultySelect")?.value || "all";

  const memberMap = {};
  appState.members.forEach((m) => {
    memberMap[m.id] = m;
  });

  const buckets = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  };

  appState.tasks.forEach((t) => {
    if (memberFilter === "unassigned" && t.assigneeId) return;
    if (
      memberFilter !== "all" &&
      memberFilter !== "unassigned" &&
      t.assigneeId !== memberFilter &&
      !(t.collaboratorIds || []).includes(memberFilter)
    ) {
      return;
    }
    if (diffFilter !== "all" && t.difficulty !== diffFilter) return;

    const st = buckets[t.status] ? t.status : "todo";
    buckets[st].push(t);
  });

  Object.keys(buckets).forEach((statusKey) => {
    const listEl = document.getElementById(`col-${statusKey}-list`);
    const countEl = document.getElementById(`count-${statusKey}`);
    const list = buckets[statusKey];
    if (countEl) countEl.textContent = String(list.length);
    if (!listEl) return;

    if (!list.length) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 22px 10px; font-size: 0.78rem; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 8px;">
          此狀態目前無任務
        </div>
      `;
      return;
    }

    listEl.innerHTML = list
      .map((t) => {
        const diff = DIFF_META[t.difficulty] || DIFF_META.medium;
        const prog = Math.max(0, Math.min(100, Number(t.progress ?? 0)));
        const earnedPts = +(diff.points * (prog / 100)).toFixed(1);
        const dueInfo = getDueStatus(t.dueDate, t.status, prog);
        const assignee = memberMap[t.assigneeId];
        const collabNames = (t.collaboratorIds || [])
          .map((cid) => memberMap[cid]?.name)
          .filter(Boolean);

        const memberOptionsHtml =
          `<option value="">-- 未指派 --</option>` +
          appState.members
            .map(
              (m) =>
                `<option value="${escapeHtml(m.id)}" ${t.assigneeId === m.id ? "selected" : ""}>主責：${escapeHtml(m.name)}</option>`
            )
            .join("");

        const statusOptionsHtml = Object.entries(STATUS_META)
          .map(
            ([k, v]) =>
              `<option value="${k}" ${t.status === k ? "selected" : ""}>${v.label}</option>`
          )
          .join("");

        const reqSkillsHtml = (t.requiredSkills || [])
          .map((s) => `<span class="tag tag-skill" style="font-size:0.7rem;padding:1px 7px;">${escapeHtml(s)}</span>`)
          .join("");

        return `
          <div class="task-card" data-task-id="${escapeHtml(t.id)}">
            <div class="task-card-top">
              <span class="diff-badge ${diff.badgeClass}" title="難度權重點數：${diff.points} 點">
                ${diff.label} · ${diff.points}點
              </span>
              <span class="due-badge ${dueInfo.className}">
                ${escapeHtml(dueInfo.text)}
              </span>
            </div>

            <div class="task-title">${escapeHtml(t.title)}</div>
            ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ""}

            <div class="tags-wrap" style="margin-bottom: 8px;">
              ${reqSkillsHtml}
            </div>

            <div style="font-size: 0.76rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
              <span>
                👤 <strong>${assignee ? escapeHtml(assignee.name) : "尚未指派"}</strong>
                ${collabNames.length ? `<span style="color:var(--text-muted);"> (協作: ${escapeHtml(collabNames.join("、"))})</span>` : ""}
              </span>
              <span style="color: var(--primary); font-weight: 700;">
                已獲 ${earnedPts} / ${diff.points} 點
              </span>
            </div>

            <div class="progress-row">
              <div class="progress-header">
                <span>推進進度</span>
                <span id="prog-label-${escapeHtml(t.id)}">${prog}%</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${prog}%"></div>
              </div>
              <input
                type="range"
                class="progress-slider"
                min="0"
                max="100"
                step="5"
                value="${prog}"
                aria-label="調整任務進度 ${escapeHtml(t.title)}"
                onchange="updateTaskProgress('${escapeHtml(t.id)}', this.value)"
                oninput="document.getElementById('prog-label-${escapeHtml(t.id)}').textContent = this.value + '%'"
              />
            </div>

            <div class="task-controls-grid">
              <select
                class="compact-select"
                aria-label="變更任務狀態"
                onchange="updateTaskStatus('${escapeHtml(t.id)}', this.value)"
              >
                ${statusOptionsHtml}
              </select>
              <select
                class="compact-select"
                aria-label="變更任務負責人"
                onchange="updateTaskAssignee('${escapeHtml(t.id)}', this.value)"
              >
                ${memberOptionsHtml}
              </select>
            </div>

            ${
              t.aiReason
                ? `<div class="ai-reason-box"><strong>🤖 AI 適性配對理由：</strong>${escapeHtml(t.aiReason)}</div>`
                : ""
            }

            <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
              <button class="btn btn-outline btn-sm" type="button" onclick="openEditTaskModal('${escapeHtml(t.id)}')">編輯詳情</button>
              <button class="btn btn-danger-soft btn-sm" type="button" onclick="deleteTask('${escapeHtml(t.id)}')">刪除</button>
            </div>
          </div>
        `;
      })
      .join("");
  });
}

function renderContributionAnalytics(analytics) {
  const insightBox = document.getElementById("fairnessInsightBox");
  const grid = document.getElementById("contribAnalyticsGrid");
  if (!grid || !insightBox) return;

  // Find members with high weighted contribution but low completed count vs high completed count of low difficulty
  const sortedByWeighted = [...analytics.memberStats].sort(
    (a, b) => b.totalEarnedPoints - a.totalEarnedPoints
  );
  const sortedByCount = [...analytics.memberStats].sort(
    (a, b) => b.completedCount - a.completedCount
  );

  const highDifficultyZeroDone = analytics.memberStats.filter(
    (m) => m.completedCount === 0 && m.totalEarnedPoints >= 15
  );
  const topCountMember = sortedByCount[0];

  if (highDifficultyZeroDone.length > 0 && topCountMember) {
    const names = highDifficultyZeroDone.map((m) => `${m.member.name}（已推進 ${m.totalEarnedPoints} 加權點數）`).join("、");
    insightBox.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 4px;">
        💡 專題核心洞察：為什麼「不能只用完成件數判斷貢獻」？
      </div>
      <div>
        若只看傳統「已完成件數」，<strong>${escapeHtml(topCountMember.member.name)}</strong> 目前完成 <strong>${topCountMember.completedCount} 件</strong> 看似最高，而承擔 <strong>3x 高難度核心任務</strong> 的 <strong>${escapeHtml(names)}</strong> 因任務規模大仍在進行/審閱中，完成件數顯示為 <strong>0 件</strong>！<br/>
        透過本平台的<strong>「難度權重 (1x/2x/3x) × 即時進度百分比 + 協作支援點數 + 截止日時程健康度」</strong>綜合指標，能清楚看見高難度執行者實際已推進的高額加權貢獻，讓團隊合作真正透明、公平。
      </div>
    `;
  } else {
    insightBox.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 4px;">
        💡 多維度貢獻計算公式說明
      </div>
      <div>
        <strong>實際推進加權貢獻點數</strong> ＝ ∑ (主責任務難度點數 × 完成進度%) ＋ ∑ (協作支援任務難度點數 × 0.25 × 完成進度%)。<br/>
        結合「任務難度權重（高 30 點 / 中 20 點 / 低 10 點）」、「進度推進率」與「截止日時程狀態」，避免單純計算件數造成的同儕不公平感。
      </div>
    `;
  }

  const maxEarned = Math.max(30, ...analytics.memberStats.map((m) => m.totalEffectiveLoad));

  grid.innerHTML = sortedByWeighted
    .map((ms) => {
      const m = ms.member;
      const initial = (m.name || "?").charAt(0);
      const earnedBarWidth = Math.min(100, Math.round((ms.totalEarnedPoints / maxEarned) * 100));
      const loadBarWidth = Math.min(100, Math.round((ms.totalEffectiveLoad / maxEarned) * 100));

      const scheduleBadge =
        ms.overdueCount > 0
          ? `<span class="due-badge due-overdue">🔴 ${ms.overdueCount} 項逾期風險</span>`
          : ms.soonCount > 0
          ? `<span class="due-badge due-soon">🟠 ${ms.soonCount} 項即將到期</span>`
          : `<span class="due-badge due-done">🟢 時程推進正常</span>`;

      const tasksBreakdownHtml = ms.tasksList
        .map(
          (item) => `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;padding:4px 0;border-bottom:1px dashed #e2e8f0;">
            <span style="max-width:68%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <strong style="color:${item.role === "主責" ? "var(--primary)" : "var(--accent-purple)"};">[${item.role}]</strong>
              ${escapeHtml(item.task.title)}
            </span>
            <span style="font-weight:600;">
              ${item.task.progress}% · 獲 ${item.earned}/${item.points}點
            </span>
          </div>
        `
        )
        .join("");

      return `
        <div class="contrib-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="avatar-circle" style="background: ${escapeHtml(m.avatarColor || "#2563eb")}">
                ${escapeHtml(initial)}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 0.96rem;">${escapeHtml(m.name)}</div>
                <div style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(m.role || "")}</div>
              </div>
            </div>
            ${scheduleBadge}
          </div>

          <!-- Contrast: Traditional Completed Count vs Multi-Dimensional Weighted Contribution -->
          <div class="metric-compare-row">
            <div class="metric-box">
              <div class="metric-num" style="color: var(--text-secondary);">${ms.completedCount} <span style="font-size:0.75rem;font-weight:500;">件</span></div>
              <div class="metric-caption">傳統已完成件數<br/>(易忽略進行中高難度)</div>
            </div>
            <div class="metric-box highlight">
              <div class="metric-num">${ms.totalEarnedPoints} <span style="font-size:0.75rem;">點</span></div>
              <div class="metric-caption">⭐ 已推進加權貢獻<br/>(難度×進度+協作)</div>
            </div>
            <div class="metric-box">
              <div class="metric-num">${ms.totalEffectiveLoad} <span style="font-size:0.75rem;font-weight:500;">點</span></div>
              <div class="metric-caption">總承擔加權負荷<br/>(完成率 ${ms.weightedCompletionRate}%)</div>
            </div>
          </div>

          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px; display: flex; justify-content: space-between;">
            <span>難度結構：🔥高難度 ${ms.highDiffCount} · ⚡中難度 ${ms.medDiffCount} · 🌱低難度 ${ms.lowDiffCount}</span>
            <span>協作支援：${ms.collabCount} 件</span>
          </div>

          <div style="margin-bottom: 10px;">
            <div style="display:flex;justify-content:space-between;font-size:0.73rem;margin-bottom:3px;">
              <span>已推進加權點數 (${ms.totalEarnedPoints} 點) vs 總承擔負荷 (${ms.totalEffectiveLoad} 點)</span>
              <span style="font-weight:700;color:var(--primary);">${ms.weightedCompletionRate}%</span>
            </div>
            <div class="progress-bar-track" style="height: 9px; position: relative;">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${loadBarWidth}%;background:#cbd5e1;border-radius:999px;"></div>
              <div style="position:absolute;left:0;top:0;bottom:0;width:${earnedBarWidth}%;background:linear-gradient(90deg,#2563eb,#10b981);border-radius:999px;"></div>
            </div>
          </div>

          <div style="background: var(--bg-subtle); border-radius: 8px; padding: 8px 10px;">
            <div style="font-size: 0.74rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">
              📌 負責與協作任務明細：
            </div>
            ${tasksBreakdownHtml || '<div style="font-size:0.74rem;color:#94a3b8;">目前無指派任務</div>'}
          </div>
        </div>
      `;
    })
    .join("");
}

// Inline Task Board Updates
window.updateTaskProgress = function (taskId, newProgress) {
  const t = appState.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const prog = Math.max(0, Math.min(100, Number(newProgress)));
  t.progress = prog;
  if (prog === 100 && t.status !== "done") {
    t.status = "done";
  } else if (prog > 0 && prog < 100 && t.status === "todo") {
    t.status = "in_progress";
  } else if (prog < 100 && t.status === "done") {
    t.status = "review";
  }
  persistState(`已更新「${t.title}」進度為 ${prog}%`);
};

window.updateTaskStatus = function (taskId, newStatus) {
  const t = appState.tasks.find((x) => x.id === taskId);
  if (!t) return;
  t.status = newStatus;
  if (newStatus === "done" && t.progress < 100) {
    t.progress = 100;
  } else if (newStatus === "todo" && t.progress === 100) {
    t.progress = 0;
  }
  persistState(`已將「${t.title}」狀態變更為 ${STATUS_META[newStatus]?.label || newStatus}`);
};

window.updateTaskAssignee = function (taskId, newMemberId) {
  const t = appState.tasks.find((x) => x.id === taskId);
  if (!t) return;
  t.assigneeId = newMemberId || "";
  const m = appState.members.find((x) => x.id === newMemberId);
  persistState(`已將「${t.title}」指派給 ${m ? m.name : "未指派"}`);
};

// AI Adaptive Task Allocation Flow
async function runAISuggestions() {
  if (!appState.members.length || !appState.tasks.length) {
    showToast("請先確保至少有 1 位組員與 1 項任務再執行 AI 分工建議！");
    return;
  }
  const modeRadio = document.querySelector('input[name="aiEngineMode"]:checked');
  const engineMode = modeRadio ? modeRadio.value : "builtin";
  const apiKey = document.getElementById("geminiApiKeyInput")?.value || "";

  const btn = document.getElementById("btnRunAISuggest");
  const origText = btn.textContent;
  btn.textContent = "⏳ AI 正在分析專長契合度與加權負載...";
  btn.disabled = true;

  try {
    const res = await fetch("/api/ai-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        members: appState.members,
        tasks: appState.tasks,
        engineMode,
        apiKey,
        scope: "all",
      }),
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.suggestions)) {
      currentAISuggestions = json.suggestions.map((s) => ({
        ...s,
        selected: true,
        chosenAssigneeId: s.recommendedAssigneeId,
        chosenCollabId: (s.recommendedCollaboratorIds && s.recommendedCollaboratorIds[0]) || "",
      }));
      const container = document.getElementById("aiSuggestionsContainer");
      if (container) container.style.display = "block";
      const bannerTitle = document.getElementById("aiResultBannerTitle");
      if (bannerTitle) {
        bannerTitle.textContent = json.warning
          ? `⚠️ ${json.warning}`
          : `✨ ${json.message || "已完成 AI 專長適性與加權負載配對分析"}`;
      }
      renderAISuggestionsPanel();
      showToast("AI 專長適性分工建議已生成！您可直接微調並套用。");
    }
  } catch (err) {
    showToast("產生 AI 建議時發生錯誤：" + err.message);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function renderAISimulatedLoadBars() {
  const barBox = document.getElementById("aiSimulatedLoadBars");
  if (!barBox) return;

  const simLoad = {};
  appState.members.forEach((m) => {
    simLoad[m.id] = 0;
  });

  currentAISuggestions.forEach((s) => {
    const task = appState.tasks.find((t) => t.id === s.taskId);
    const pts = DIFF_META[s.difficulty]?.points || 20;
    const assigneeId = s.selected ? s.chosenAssigneeId : task?.assigneeId;
    if (assigneeId && simLoad[assigneeId] !== undefined) {
      simLoad[assigneeId] += pts;
    }
    const collabId = s.selected ? s.chosenCollabId : (task?.collaboratorIds || [])[0];
    if (collabId && collabId !== assigneeId && simLoad[collabId] !== undefined) {
      simLoad[collabId] += +(pts * 0.25).toFixed(1);
    }
  });

  barBox.innerHTML = appState.members
    .map((m) => {
      const pts = simLoad[m.id] || 0;
      const cap = Number(m.capacityPoints || 60);
      const pct = Math.min(100, Math.round((pts / cap) * 100));
      return `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
          <div style="display:flex;justify-content:space-between;font-size:0.76rem;font-weight:700;margin-bottom:4px;">
            <span>${escapeHtml(m.name)}</span>
            <span style="color:var(--primary);">${pts} / ${cap} 點 (${pct}%)</span>
          </div>
          <div class="progress-bar-track" style="height:6px;margin-bottom:0;">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAISuggestionsPanel() {
  renderAISimulatedLoadBars();
  const listEl = document.getElementById("aiSuggestionsList");
  if (!listEl) return;

  const memberMap = {};
  appState.members.forEach((m) => {
    memberMap[m.id] = m;
  });

  listEl.innerHTML = currentAISuggestions
    .map((s, idx) => {
      const diff = DIFF_META[s.difficulty] || DIFF_META.medium;
      const currentMember = memberMap[s.currentAssigneeId];

      const assigneeOptions = appState.members
        .map((m) => {
          const cand = (s.candidates || []).find((c) => c.memberId === m.id);
          const scoreText = cand ? ` (適性 ${cand.score}%)` : "";
          return `<option value="${escapeHtml(m.id)}" ${s.chosenAssigneeId === m.id ? "selected" : ""}>${escapeHtml(m.name)}${scoreText}</option>`;
        })
        .join("");

      const collabOptions =
        `<option value="">-- 無協作支援 --</option>` +
        appState.members
          .map(
            (m) =>
              `<option value="${escapeHtml(m.id)}" ${s.chosenCollabId === m.id ? "selected" : ""}>協作：${escapeHtml(m.name)}</option>`
          )
          .join("");

      return `
        <div class="ai-suggestion-card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.94rem;cursor:pointer;">
              <input
                type="checkbox"
                ${s.selected ? "checked" : ""}
                onchange="toggleAISuggestionSelect(${idx}, this.checked)"
              />
              <span>${escapeHtml(s.taskTitle)}</span>
              <span class="diff-badge ${diff.badgeClass}">${diff.label} · ${diff.points}點</span>
            </label>
            <span class="ai-score-pill">⚡ AI 適性契合度 ${s.matchScore}%</span>
          </div>

          <div style="font-size:0.8rem;color:#334155;background:#f8fafc;padding:8px 10px;border-radius:6px;margin-bottom:10px;border-left:3px solid #6366f1;">
            <strong>🤖 AI 推薦分析：</strong>${escapeHtml(s.reason)}
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;align-items:center;">
            <div style="font-size:0.78rem;color:var(--text-secondary);">
              原負責人：<strong>${currentMember ? escapeHtml(currentMember.name) : "未指派"}</strong>
              → AI 首選：<strong style="color:var(--primary);">${escapeHtml(s.recommendedMemberName)}</strong>
            </div>

            <div>
              <label style="font-size:0.74rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:2px;">
                ✏️ 微調主要負責人（可手動覆寫 AI 建議）：
              </label>
              <select class="compact-select" onchange="changeAIChosenAssignee(${idx}, this.value)">
                ${assigneeOptions}
              </select>
            </div>

            <div>
              <label style="font-size:0.74rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:2px;">
                🤝 微調協作支援夥伴（選填）：
              </label>
              <select class="compact-select" onchange="changeAIChosenCollab(${idx}, this.value)">
                ${collabOptions}
              </select>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

window.toggleAISuggestionSelect = function (idx, checked) {
  if (!currentAISuggestions[idx]) return;
  currentAISuggestions[idx].selected = checked;
  renderAISimulatedLoadBars();
};

window.changeAIChosenAssignee = function (idx, memberId) {
  const s = currentAISuggestions[idx];
  if (!s) return;
  s.chosenAssigneeId = memberId;
  const cand = (s.candidates || []).find((c) => c.memberId === memberId);
  if (cand) {
    s.matchScore = cand.score;
    s.reason = cand.reason + "（已由使用者手動微調確認）";
  }
  renderAISuggestionsPanel();
};

window.changeAIChosenCollab = function (idx, memberId) {
  const s = currentAISuggestions[idx];
  if (!s) return;
  s.chosenCollabId = memberId;
  renderAISimulatedLoadBars();
};

function applySelectedAISuggestions() {
  let appliedCount = 0;
  currentAISuggestions.forEach((s) => {
    if (!s.selected) return;
    const t = appState.tasks.find((x) => x.id === s.taskId);
    if (!t) return;
    t.assigneeId = s.chosenAssigneeId;
    t.collaboratorIds =
      s.chosenCollabId && s.chosenCollabId !== s.chosenAssigneeId ? [s.chosenCollabId] : [];
    t.aiReason = s.reason;
    appliedCount++;
  });

  document.getElementById("aiSuggestionsContainer").style.display = "none";
  persistState(`✅ 已成功套用 ${appliedCount} 項任務的 AI 專長適性分工結果！`);
}

// Member Modal Logic
function renderQuickSkillChips(containerId, inputId) {
  const box = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  if (!box || !input) return;

  box.innerHTML = PRESET_SKILLS.map(
    (skill) =>
      `<button type="button" class="chip-btn" onclick="appendSkillToInput('${inputId}', '${escapeHtml(skill)}')">+ ${escapeHtml(skill)}</button>`
  ).join("");
}

window.appendSkillToInput = function (inputId, skill) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const list = parseCommaList(input.value);
  if (!list.includes(skill)) {
    list.push(skill);
  }
  input.value = list.join(", ");
};

window.openAddMemberModal = function () {
  document.getElementById("memberModalTitle").textContent = "➕ 新增組員專長與偏好";
  document.getElementById("memberIdInput").value = "";
  document.getElementById("memberNameInput").value = "";
  document.getElementById("memberRoleInput").value = "";
  document.getElementById("memberSkillsInput").value = "";
  document.getElementById("memberPrefsInput").value = "";
  document.getElementById("memberAvoidInput").value = "";
  document.getElementById("memberCapacityInput").value = "60";
  document.getElementById("memberNoteInput").value = "";
  renderQuickSkillChips("quickSkillChips", "memberSkillsInput");
  document.getElementById("memberModal").classList.add("open");
};

window.openEditMemberModal = function (memberId) {
  const m = appState.members.find((x) => x.id === memberId);
  if (!m) return;
  document.getElementById("memberModalTitle").textContent = `✏️ 編輯組員：${m.name}`;
  document.getElementById("memberIdInput").value = m.id;
  document.getElementById("memberNameInput").value = m.name || "";
  document.getElementById("memberRoleInput").value = m.role || "";
  document.getElementById("memberSkillsInput").value = (m.skills || []).join(", ");
  document.getElementById("memberPrefsInput").value = (m.preferences || []).join(", ");
  document.getElementById("memberAvoidInput").value = (m.avoid || []).join(", ");
  document.getElementById("memberCapacityInput").value = String(m.capacityPoints || 60);
  document.getElementById("memberNoteInput").value = m.note || "";
  renderQuickSkillChips("quickSkillChips", "memberSkillsInput");
  document.getElementById("memberModal").classList.add("open");
};

window.deleteMember = function (memberId) {
  const m = appState.members.find((x) => x.id === memberId);
  if (!m) return;
  appState.members = appState.members.filter((x) => x.id !== memberId);
  appState.tasks.forEach((t) => {
    if (t.assigneeId === memberId) t.assigneeId = "";
    t.collaboratorIds = (t.collaboratorIds || []).filter((cid) => cid !== memberId);
  });
  persistState(`已移除組員「${m.name}」`);
};

// Task Modal Logic
function populateTaskMemberSelects(selectedAssignee = "", selectedCollab = "") {
  const aSel = document.getElementById("taskAssigneeInput");
  const cSel = document.getElementById("taskCollabInput");
  if (aSel) {
    aSel.innerHTML =
      `<option value="">-- 暫不指派（交由 AI 適性配對） --</option>` +
      appState.members
        .map(
          (m) =>
            `<option value="${escapeHtml(m.id)}" ${selectedAssignee === m.id ? "selected" : ""}>${escapeHtml(m.name)} (${escapeHtml((m.skills || []).slice(0, 2).join("、"))})</option>`
        )
        .join("");
  }
  if (cSel) {
    cSel.innerHTML =
      `<option value="">-- 無協作支援組員 --</option>` +
      appState.members
        .map(
          (m) =>
            `<option value="${escapeHtml(m.id)}" ${selectedCollab === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`
        )
        .join("");
  }
}

window.openAddTaskModal = function () {
  document.getElementById("taskModalTitle").textContent = "➕ 建立專題任務（設定難度權重與所需專長）";
  document.getElementById("taskIdInput").value = "";
  document.getElementById("taskTitleInput").value = "";
  document.getElementById("taskDescInput").value = "";
  document.getElementById("taskDifficultyInput").value = "medium";
  const defaultDue = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  document.getElementById("taskDueDateInput").value = defaultDue;
  document.getElementById("taskReqSkillsInput").value = "";
  document.getElementById("taskStatusInput").value = "todo";
  document.getElementById("taskProgressInput").value = "0";
  document.getElementById("taskModalProgressVal").textContent = "0";
  populateTaskMemberSelects("", "");
  renderQuickSkillChips("quickTaskSkillChips", "taskReqSkillsInput");
  document.getElementById("taskModal").classList.add("open");
};

window.openEditTaskModal = function (taskId) {
  const t = appState.tasks.find((x) => x.id === taskId);
  if (!t) return;
  document.getElementById("taskModalTitle").textContent = `✏️ 編輯任務：${t.title}`;
  document.getElementById("taskIdInput").value = t.id;
  document.getElementById("taskTitleInput").value = t.title || "";
  document.getElementById("taskDescInput").value = t.description || "";
  document.getElementById("taskDifficultyInput").value = t.difficulty || "medium";
  document.getElementById("taskDueDateInput").value = t.dueDate || "";
  document.getElementById("taskReqSkillsInput").value = (t.requiredSkills || []).join(", ");
  document.getElementById("taskStatusInput").value = t.status || "todo";
  document.getElementById("taskProgressInput").value = String(t.progress ?? 0);
  document.getElementById("taskModalProgressVal").textContent = String(t.progress ?? 0);
  populateTaskMemberSelects(t.assigneeId || "", (t.collaboratorIds || [])[0] || "");
  renderQuickSkillChips("quickTaskSkillChips", "taskReqSkillsInput");
  document.getElementById("taskModal").classList.add("open");
};

window.deleteTask = function (taskId) {
  const t = appState.tasks.find((x) => x.id === taskId);
  if (!t) return;
  appState.tasks = appState.tasks.filter((x) => x.id !== taskId);
  persistState(`已刪除任務「${t.title}」`);
};

function switchView(viewName) {
  activeView = viewName;
  document.querySelectorAll(".step-tab, .mobile-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
  });
  document.querySelectorAll("[data-section]").forEach((sec) => {
    const secName = sec.getAttribute("data-section");
    if (viewName === "all" || viewName === secName) {
      sec.style.display = "block";
    } else {
      sec.style.display = "none";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fetchState();

  // Navigation Tabs
  document.querySelectorAll(".step-tab, .mobile-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.getAttribute("data-view") || "all");
    });
  });

  // Unlock Screen
  document.getElementById("btnUnlock")?.addEventListener("click", () => {
    const val = document.getElementById("passcodeInput")?.value.trim();
    const expected = appState.project?.accessCode || "team2026";
    if (val === expected) {
      sessionStorage.setItem("team_tracker_unlocked", "1");
      document.getElementById("lockOverlay").style.display = "none";
      showToast("🔓 已成功解鎖進入平台");
    } else {
      document.getElementById("lockErrorMsg").style.display = "block";
    }
  });

  // AI Engine Radio Toggle
  document.querySelectorAll('input[name="aiEngineMode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const box = document.getElementById("geminiKeyBox");
      if (box) box.style.display = e.target.value === "gemini" ? "block" : "none";
    });
  });

  // Buttons
  document.getElementById("btnAddMember")?.addEventListener("click", () => window.openAddMemberModal());
  document.getElementById("btnCloseMemberModal")?.addEventListener("click", () => {
    document.getElementById("memberModal").classList.remove("open");
  });
  document.getElementById("btnCancelMember")?.addEventListener("click", () => {
    document.getElementById("memberModal").classList.remove("open");
  });

  document.getElementById("btnAddTask")?.addEventListener("click", () => window.openAddTaskModal());
  document.getElementById("btnAddTaskFromAI")?.addEventListener("click", () => window.openAddTaskModal());
  document.getElementById("btnCloseTaskModal")?.addEventListener("click", () => {
    document.getElementById("taskModal").classList.remove("open");
  });
  document.getElementById("btnCancelTask")?.addEventListener("click", () => {
    document.getElementById("taskModal").classList.remove("open");
  });

  document.getElementById("taskProgressInput")?.addEventListener("input", (e) => {
    document.getElementById("taskModalProgressVal").textContent = e.target.value;
  });

  // Member Form Submit
  document.getElementById("memberForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("memberIdInput").value;
    const name = document.getElementById("memberNameInput").value.trim();
    const role = document.getElementById("memberRoleInput").value.trim();
    const skills = parseCommaList(document.getElementById("memberSkillsInput").value);
    const preferences = parseCommaList(document.getElementById("memberPrefsInput").value);
    const avoid = parseCommaList(document.getElementById("memberAvoidInput").value);
    const capacityPoints = Number(document.getElementById("memberCapacityInput").value || 60);
    const note = document.getElementById("memberNoteInput").value.trim();

    if (!name) return;

    if (id) {
      const existing = appState.members.find((x) => x.id === id);
      if (existing) {
        existing.name = name;
        existing.role = role;
        existing.skills = skills;
        existing.preferences = preferences;
        existing.avoid = avoid;
        existing.capacityPoints = capacityPoints;
        existing.note = note;
      }
    } else {
      const newMember = {
        id: "m" + Date.now(),
        name,
        role: role || "專題組員",
        avatarColor: AVATAR_COLORS[appState.members.length % AVATAR_COLORS.length],
        skills: skills.length ? skills : ["綜合支援"],
        preferences,
        avoid,
        capacityPoints,
        note,
      };
      appState.members.push(newMember);
    }

    document.getElementById("memberModal").classList.remove("open");
    persistState(`💾 已儲存組員「${name}」的專長與偏好設定`);
  });

  // Task Form Submit
  document.getElementById("taskForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("taskIdInput").value;
    const title = document.getElementById("taskTitleInput").value.trim();
    const description = document.getElementById("taskDescInput").value.trim();
    const difficulty = document.getElementById("taskDifficultyInput").value;
    const dueDate = document.getElementById("taskDueDateInput").value;
    const requiredSkills = parseCommaList(document.getElementById("taskReqSkillsInput").value);
    let status = document.getElementById("taskStatusInput").value;
    let progress = Number(document.getElementById("taskProgressInput").value || 0);
    const assigneeId = document.getElementById("taskAssigneeInput").value;
    const collabId = document.getElementById("taskCollabInput").value;

    if (status === "done") progress = 100;
    else if (progress === 100) status = "done";

    if (id) {
      const existing = appState.tasks.find((x) => x.id === id);
      if (existing) {
        existing.title = title;
        existing.description = description;
        existing.difficulty = difficulty;
        existing.dueDate = dueDate;
        existing.requiredSkills = requiredSkills;
        existing.status = status;
        existing.progress = progress;
        existing.assigneeId = assigneeId;
        existing.collaboratorIds = collabId && collabId !== assigneeId ? [collabId] : [];
      }
    } else {
      const newTask = {
        id: "t" + Date.now(),
        title,
        description,
        difficulty,
        dueDate,
        requiredSkills,
        status,
        progress,
        assigneeId,
        collaboratorIds: collabId && collabId !== assigneeId ? [collabId] : [],
        aiReason: "",
      };
      appState.tasks.push(newTask);
    }

    document.getElementById("taskModal").classList.remove("open");
    persistState(`💾 已儲存任務「${title}」`);
  });

  // AI Actions
  document.getElementById("btnRunAISuggest")?.addEventListener("click", runAISuggestions);
  document.getElementById("btnApplySelectedAI")?.addEventListener("click", applySelectedAISuggestions);
  document.getElementById("btnCloseAIPanel")?.addEventListener("click", () => {
    document.getElementById("aiSuggestionsContainer").style.display = "none";
  });

  // Filters
  document.getElementById("filterMemberSelect")?.addEventListener("change", renderKanbanBoard);
  document.getElementById("filterDifficultySelect")?.addEventListener("change", renderKanbanBoard);

  // Reset Demo & Clear Empty
  document.getElementById("btnResetDemo")?.addEventListener("click", async () => {
    const res = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "demo" }),
    });
    const json = await res.json();
    if (json.ok) {
      appState = json.data;
      renderAll();
      showToast("🔄 已重置為專題報告預設範例資料");
    }
  });

  document.getElementById("btnClearEmpty")?.addEventListener("click", async () => {
    const res = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "empty" }),
    });
    const json = await res.json();
    if (json.ok) {
      appState = json.data;
      document.getElementById("aiSuggestionsContainer").style.display = "none";
      renderAll();
      showToast("🧹 已清空資料，您可從零輸入組員與任務");
    }
  });

  // Private Info Modal
  document.getElementById("btnOpenPrivateInfo")?.addEventListener("click", () => {
    document.getElementById("toggleRequirePasscode").checked = Boolean(
      appState.project?.requirePasscode
    );
    document.getElementById("privateInfoModal").classList.add("open");
  });
  document.getElementById("btnClosePrivateModal")?.addEventListener("click", () => {
    document.getElementById("privateInfoModal").classList.remove("open");
  });
  document.getElementById("btnSavePrivateSettings")?.addEventListener("click", () => {
    appState.project.requirePasscode = document.getElementById("toggleRequirePasscode").checked;
    document.getElementById("privateInfoModal").classList.remove("open");
    persistState("🔒 已更新私人存取保護設定");
  });
});
