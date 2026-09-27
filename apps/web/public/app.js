import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const CONFIG = window.APP_CONFIG;
const firebaseApp = initializeApp(CONFIG.firebase);
const auth = getAuth(firebaseApp);

const ASSET_KEYS = ["cash", "domesticStock", "foreignStock", "bonds", "other"];
const ASSET_LABELS = { cash: "現金・預金", domesticStock: "国内株式", foreignStock: "海外株式", bonds: "債券", other: "その他" };
const ASSET_COLORS = { cash: "var(--cat-1)", domesticStock: "var(--cat-2)", foreignStock: "var(--cat-3)", bonds: "var(--cat-4)", other: "var(--cat-5)" };

// ---------- API layer ----------
async function apiFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");
  const token = await user.getIdToken();
  const res = await fetch(CONFIG.apiBaseUrl + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("API " + res.status + ": " + body);
  }
  return res.status === 204 ? null : res.json();
}

const api = {
  listGoals: () => apiFetch("/goals"),
  createGoal: data => apiFetch("/goals", { method: "POST", body: JSON.stringify(data) }),
  deleteGoal: id => apiFetch(`/goals/${id}`, { method: "DELETE" }),
  listSnapshots: () => apiFetch("/snapshots"),
  upsertSnapshot: (period, data) => apiFetch(`/snapshots/${period}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSnapshot: period => apiFetch(`/snapshots/${period}`, { method: "DELETE" }),
  listAlerts: () => apiFetch("/alerts"),
  getAdvice: question => apiFetch("/agent/advice", { method: "POST", body: JSON.stringify({ question }) }),
};

// ---------- app state ----------
let goals = [], snapshots = [], alerts = [];

const fmtMan = n => (Math.round(n || 0)).toLocaleString("ja-JP") + " 万円";
const fmtPct = n => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const monthsBetween = (a, b) => { const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number); return (by - ay) * 12 + (bm - am); };
const periodLabel = p => { const [y, m] = p.split("-"); return y + "年" + parseInt(m, 10) + "月"; };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function latestSnapshot() { return snapshots.length ? snapshots[snapshots.length - 1] : null; }
function totalOf(snap) { return ASSET_KEYS.reduce((s, k) => s + (snap.allocation && snap.allocation[k] || 0), 0); }

function evaluateGoal(goal) { return goal.category === "portfolio" ? evaluatePortfolio(goal) : evaluateSavings(goal); }

function evaluateSavings(goal) {
  const asOf = latestSnapshot();
  if (!asOf) return { status: "nodata" };
  const totalMonths = Math.max(1, monthsBetween(goal.startPeriod, goal.targetPeriod));
  const elapsed = clamp(monthsBetween(goal.startPeriod, asOf.period), 0, totalMonths);
  const requiredMonthly = (goal.targetAmount - goal.startAmount) / totalMonths;
  const expected = goal.startAmount + requiredMonthly * elapsed;
  const actual = totalOf(asOf);
  const deviationPct = expected !== 0 ? ((actual - expected) / Math.abs(expected)) * 100 : 0;
  let status = "good";
  if (deviationPct < -goal.thresholdPct) status = "critical"; else if (deviationPct < 0) status = "warn";
  const progressPct = clamp((actual / goal.targetAmount) * 100, 0, 999);
  return { status, deviationPct, expected, actual, progressPct, totalMonths, elapsed, asOfPeriod: asOf.period };
}

function evaluatePortfolio(goal) {
  const asOf = latestSnapshot();
  if (!asOf) return { status: "nodata" };
  const sum = totalOf(asOf);
  if (sum <= 0) return { status: "nodata" };
  const actualPct = {}, deviations = {};
  let maxAbs = 0, maxKey = null;
  ASSET_KEYS.forEach(k => {
    actualPct[k] = ((asOf.allocation && asOf.allocation[k] || 0) / sum) * 100;
    const dv = actualPct[k] - (goal.targetAllocation[k] || 0);
    deviations[k] = dv;
    if (Math.abs(dv) > maxAbs) { maxAbs = Math.abs(dv); maxKey = k; }
  });
  let status = "good";
  if (maxAbs > goal.thresholdPt) status = "critical"; else if (maxAbs > goal.thresholdPt / 2) status = "warn";
  return { status, actualPct, deviations, maxAbs, maxKey, asOfPeriod: asOf.period };
}

const STATUS_LABEL = { good: "順調", warn: "要注意", critical: "要見直し", nodata: "データ待ち" };
const pill = status => '<span class="pill ' + status + '"><span class="dot"></span>' + STATUS_LABEL[status] + "</span>";

// ---------- rendering (mirrors the original prototype's dashboard) ----------
function renderDashboard() {
  const wrap = document.getElementById("dashboard-goals");
  const asOfLabel = document.getElementById("asof-label");
  const latest = latestSnapshot();
  asOfLabel.textContent = latest ? "時点: " + periodLabel(latest.period) : "データ未入力";
  if (goals.length === 0) { wrap.innerHTML = '<div class="empty">まだ目標が登録されていません。「目標」タブから追加してください。</div>'; return; }
  wrap.innerHTML = goals.map(g => {
    const r = evaluateGoal(g);
    return g.category === "portfolio" ? renderPortfolioCard(g, r) : renderSavingsCard(g, r);
  }).join("");
}

function renderSavingsCard(g, r) {
  if (r.status === "nodata") {
    return '<div class="card"><div class="card-top"><div><div class="kind-tag">資産形成</div><h3>' + esc(g.title) + '</h3></div>' + pill("nodata") + '</div><div class="empty" style="padding:4px 0;">月次データを入力すると進捗が表示されます。</div></div>';
  }
  const progress = clamp(r.progressPct, 0, 100);
  const devClass = r.deviationPct >= 0 ? "up" : "down";
  return '<div class="card">' +
    '<div class="card-top"><div><div class="kind-tag">資産形成 ・ 目標 ' + periodLabel(g.targetPeriod) + '</div><h3>' + esc(g.title) + '</h3></div>' + pill(r.status) + '</div>' +
    '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
    '<div class="metrics">' +
    '<div class="metric"><div class="label">現在の資産額</div><div class="value num">' + fmtMan(r.actual) + '</div></div>' +
    '<div class="metric"><div class="label">計画上の想定額</div><div class="value num">' + fmtMan(r.expected) + '</div></div>' +
    '<div class="metric"><div class="label">計画との乖離</div><div class="value num ' + devClass + '">' + fmtPct(r.deviationPct) + '</div></div>' +
    '</div>' + renderTrajectoryChart(g) +
    '<div class="cardfoot"><button class="btn small danger" data-del-goal="' + g.id + '">削除</button></div></div>';
}

function renderPortfolioCard(g, r) {
  if (r.status === "nodata") {
    return '<div class="card"><div class="card-top"><div><div class="kind-tag">ポートフォリオ</div><h3>' + esc(g.title) + '</h3></div>' + pill("nodata") + '</div><div class="empty" style="padding:4px 0;">月次データを入力すると配分の乖離が表示されます。</div></div>';
  }
  const rows = ASSET_KEYS.map(k => {
    const actual = r.actualPct[k], target = g.targetAllocation[k] || 0, dv = r.deviations[k];
    return '<div class="allocrow"><div><span class="legend-swatch" style="background:' + ASSET_COLORS[k] + '"></span>' + ASSET_LABELS[k] + '</div>' +
      '<div class="track"><div class="fill" style="width:' + clamp(actual, 0, 100) + '%;background:' + ASSET_COLORS[k] + '"></div><div class="target-mark" style="left:' + clamp(target, 0, 100) + '%"></div></div>' +
      '<div class="delta num">' + fmtPct(dv) + '</div></div>';
  }).join("");
  return '<div class="card"><div class="card-top"><div><div class="kind-tag">ポートフォリオ配分 ・ 許容 ±' + g.thresholdPt + 'pt</div><h3>' + esc(g.title) + '</h3></div>' + pill(r.status) + '</div>' + rows +
    '<div class="cardfoot"><button class="btn small danger" data-del-goal="' + g.id + '">削除</button></div></div>';
}

function renderTrajectoryChart(g) {
  const relevant = snapshots.filter(s => monthsBetween(g.startPeriod, s.period) >= 0);
  const totalMonths = Math.max(1, monthsBetween(g.startPeriod, g.targetPeriod));
  const lastX = relevant.length ? monthsBetween(g.startPeriod, relevant[relevant.length - 1].period) : 0;
  const xMax = Math.max(totalMonths, lastX);
  const yMax = Math.max(g.targetAmount, g.startAmount, ...relevant.map(totalOf)) * 1.12 || 1;
  const W = 560, H = 170, padL = 46, padR = 14, padT = 12, padB = 22;
  const x = m => padL + (m / (xMax || 1)) * (W - padL - padR);
  const y = v => (H - padB) - (v / yMax) * (H - padT - padB);
  const planPts = [[0, g.startAmount], [totalMonths, g.targetAmount]];
  const planPath = "M" + planPts.map(p => x(p[0]) + "," + y(p[1])).join(" L");
  const actualPts = [[0, g.startAmount]].concat(relevant.map(s => [monthsBetween(g.startPeriod, s.period), totalOf(s)]));
  const actualPath = "M" + actualPts.map(p => x(p[0]) + "," + y(p[1])).join(" L");
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const yy = y(yMax * f);
    return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="1"/>' +
      '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" font-size="9" text-anchor="end" fill="var(--ink-muted)" font-family="var(--font-mono)">' + Math.round(yMax * f).toLocaleString("ja-JP") + '</text>';
  }).join("");
  const lastActual = actualPts[actualPts.length - 1];
  return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="資産推移グラフ">' + gridLines +
    '<path d="' + planPath + '" fill="none" stroke="var(--gold)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>' +
    '<path d="' + actualPath + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + x(totalMonths) + '" cy="' + y(g.targetAmount) + '" r="4" fill="var(--gold)"/>' +
    '<circle cx="' + x(lastActual[0]) + '" cy="' + y(lastActual[1]) + '" r="4" fill="var(--accent)"/></svg>' +
    '<div class="chart-legend"><span class="li"><span class="swatch solid"></span>実績</span>' +
    '<span class="li"><span class="swatch dash"></span>計画（' + periodLabel(g.targetPeriod) + ' 目標 ' + fmtMan(g.targetAmount) + '）</span></div></div>';
}

function renderGoalsList() {
  const el = document.getElementById("goals-list");
  if (goals.length === 0) { el.innerHTML = '<div class="empty">登録された目標はありません。</div>'; return; }
  el.innerHTML = goals.map(g => {
    if (g.category === "portfolio") {
      const detail = ASSET_KEYS.map(k => ASSET_LABELS[k] + " " + (g.targetAllocation[k] || 0) + "%").join(" / ");
      return '<div class="card"><div class="card-top"><div><div class="kind-tag">ポートフォリオ</div><h3>' + esc(g.title) + '</h3></div></div><div style="font-size:.8rem;color:var(--ink-2);">' + detail + '</div><div class="cardfoot"><button class="btn small danger" data-del-goal="' + g.id + '">削除</button></div></div>';
    }
    return '<div class="card"><div class="card-top"><div><div class="kind-tag">資産形成</div><h3>' + esc(g.title) + '</h3></div></div><div style="font-size:.8rem;color:var(--ink-2);">' + periodLabel(g.startPeriod) + '（' + fmtMan(g.startAmount) + '） → ' + periodLabel(g.targetPeriod) + '（' + fmtMan(g.targetAmount) + '）・許容乖離 ' + g.thresholdPct + '%</div><div class="cardfoot"><button class="btn small danger" data-del-goal="' + g.id + '">削除</button></div></div>';
  }).join("");
}

function renderSnapshotTable() {
  const el = document.getElementById("snapshot-table");
  if (snapshots.length === 0) { el.innerHTML = '<div class="empty">まだデータがありません。</div>'; return; }
  const rows = snapshots.slice().reverse().map(s => {
    const total = totalOf(s);
    const cashflow = (s.income != null && s.expenses != null) ? (s.income - s.expenses) : null;
    return "<tr><td>" + periodLabel(s.period) + "</td><td class='num'>" + fmtMan(total) + "</td><td class='num'>" + (cashflow == null ? "—" : fmtMan(cashflow)) + "</td><td><button class='btn small ghost' data-del-snap='" + s.period + "'>削除</button></td></tr>";
  }).join("");
  el.innerHTML = "<table><thead><tr><th>年月</th><th>総資産額</th><th>月次収支</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";
}

function renderAlerts() {
  const el = document.getElementById("alerts-list");
  if (alerts.length === 0) { el.innerHTML = '<div class="empty">現在アラートはありません。すべての目標が計画どおり、または許容範囲内です。</div>'; return; }
  el.innerHTML = alerts.map(a => '<div class="card alertcard ' + (a.status === "warn" ? "warn" : "") + '"><div class="card-top"><div><div class="kind-tag">' + (a.category === "portfolio" ? "ポートフォリオ" : "資産形成") + '</div><h3>' + esc(a.goalTitle) + '</h3></div>' + pill(a.status) + '</div><div style="font-size:.85rem;">' + esc(a.message) + '</div><div style="font-size:.7rem;color:var(--ink-muted);">最終評価: ' + new Date(a.updatedAt).toLocaleString("ja-JP") + '</div></div>').join("");
}

async function renderAll() {
  renderDashboard(); renderGoalsList(); renderSnapshotTable(); renderAlerts();
}

// ---------- dynamic allocation fields ----------
function buildAllocFields(containerId, namePrefix, withPercentSuffix) {
  const el = document.getElementById(containerId);
  el.innerHTML = ASSET_KEYS.map(k => '<label class="field">' + ASSET_LABELS[k] + (withPercentSuffix ? "（%）" : "（万円）") + '<input type="number" min="0" step="1" name="' + namePrefix + k + '" value="0" required></label>').join("");
}
function readAlloc(form, prefix) {
  const out = {}; ASSET_KEYS.forEach(k => { out[k] = parseFloat(form.querySelector('[name="' + prefix + k + '"]').value) || 0; }); return out;
}

function wireAllocSumDisplays() {
  const targetForm = document.getElementById("form-goal-portfolio");
  const targetSumEl = document.getElementById("alloc-target-sum");
  function updateTargetSum() {
    const alloc = readAlloc(targetForm, "t_");
    const sum = ASSET_KEYS.reduce((s, k) => s + alloc[k], 0);
    targetSumEl.textContent = "合計 " + sum + "%（100%になるよう入力してください）";
    targetSumEl.className = "allocsum" + (Math.round(sum) !== 100 ? " bad" : "");
  }
  targetForm.addEventListener("input", updateTargetSum); updateTargetSum();

  const snapForm = document.getElementById("form-snapshot");
  const snapSumEl = document.getElementById("alloc-snapshot-sum");
  function updateSnapSum() {
    const alloc = readAlloc(snapForm, "s_");
    snapSumEl.textContent = "合計資産額：" + fmtMan(ASSET_KEYS.reduce((s, k) => s + alloc[k], 0));
  }
  snapForm.addEventListener("input", updateSnapSum); updateSnapSum();
}

// ---------- tabs ----------
document.getElementById("tabs").addEventListener("click", e => {
  const btn = e.target.closest("button[data-view]"); if (!btn) return;
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b === btn));
  ["dashboard", "goals", "data", "alerts", "advisor"].forEach(v => { document.getElementById("view-" + v).hidden = (v !== btn.dataset.view); });
});

document.getElementById("goal-type-seg").addEventListener("click", e => {
  const btn = e.target.closest("button[data-type]"); if (!btn) return;
  document.querySelectorAll("#goal-type-seg button").forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("form-goal-savings").hidden = btn.dataset.type !== "savings";
  document.getElementById("form-goal-portfolio").hidden = btn.dataset.type !== "portfolio";
});

// ---------- forms ----------
document.getElementById("form-goal-savings").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  await api.createGoal({
    category: "savings", title: fd.get("title"), startPeriod: fd.get("startPeriod"),
    startAmount: parseFloat(fd.get("startAmount")) || 0, targetPeriod: fd.get("targetPeriod"),
    targetAmount: parseFloat(fd.get("targetAmount")) || 0, thresholdPct: parseFloat(fd.get("thresholdPct")) || 10,
  });
  f.reset(); f.querySelector('[name=thresholdPct]').value = 10;
  await refresh();
});

document.getElementById("form-goal-portfolio").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  const alloc = readAlloc(f, "t_");
  const sum = ASSET_KEYS.reduce((s, k) => s + alloc[k], 0);
  if (Math.round(sum) !== 100) { window.alert("目標配分の合計が100%になっていません（現在 " + sum + "%）。"); return; }
  await api.createGoal({ category: "portfolio", title: fd.get("title"), targetAllocation: alloc, thresholdPt: parseFloat(fd.get("thresholdPt")) || 10 });
  f.reset(); ASSET_KEYS.forEach(k => f.querySelector('[name="t_' + k + '"]').value = 0);
  f.querySelector('[name=thresholdPt]').value = 10;
  document.getElementById("alloc-target-sum").textContent = "合計 0%（100%になるよう入力してください）";
  await refresh();
});

document.getElementById("form-snapshot").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  const period = fd.get("period"); if (!period) return;
  const alloc = readAlloc(f, "s_");
  await api.upsertSnapshot(period, {
    period, allocation: alloc,
    income: fd.get("income") ? parseFloat(fd.get("income")) : null,
    expenses: fd.get("expenses") ? parseFloat(fd.get("expenses")) : null,
    note: fd.get("note") || "",
  });
  f.reset(); ASSET_KEYS.forEach(k => f.querySelector('[name="s_' + k + '"]').value = 0);
  document.getElementById("alloc-snapshot-sum").textContent = "合計資産額：0 万円";
  await refresh();
});

document.getElementById("form-advice").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  const out = document.getElementById("advice-output");
  out.hidden = false; out.textContent = "考えています…";
  try {
    const { advice } = await api.getAdvice(fd.get("question") || "");
    out.textContent = advice;
  } catch (err) {
    out.textContent = "アドバイスの取得に失敗しました: " + err.message;
  }
});

document.addEventListener("click", async e => {
  const delGoal = e.target.closest("[data-del-goal]");
  if (delGoal) { await api.deleteGoal(delGoal.dataset.delGoal); await refresh(); return; }
  const delSnap = e.target.closest("[data-del-snap]");
  if (delSnap) { await api.deleteSnapshot(delSnap.dataset.delSnap); await refresh(); return; }
});

// ---------- refresh ----------
async function refresh() {
  goals = await api.listGoals();
  snapshots = await api.listSnapshots();
  snapshots.sort((a, b) => a.period.localeCompare(b.period));
  alerts = await api.listAlerts();
  await renderAll();
}

// ---------- auth ----------
document.getElementById("btn-google-signin").addEventListener("click", async () => {
  const errEl = document.getElementById("login-error");
  errEl.hidden = true;
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (err) { errEl.hidden = false; errEl.textContent = "サインインに失敗しました: " + err.message; }
});
document.getElementById("btn-signout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  const loginScreen = document.getElementById("login-screen");
  const appRoot = document.getElementById("app-root");
  if (user) {
    loginScreen.hidden = true; appRoot.hidden = false;
    document.getElementById("user-email").textContent = user.email || user.uid;
    document.querySelector('#form-snapshot [name=period]').value = new Date().toISOString().slice(0, 7);
    buildAllocFields("alloc-target-fields", "t_", true);
    buildAllocFields("alloc-snapshot-fields", "s_", false);
    wireAllocSumDisplays();
    await refresh();
  } else {
    loginScreen.hidden = false; appRoot.hidden = true;
  }
});
