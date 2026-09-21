/* Shared Jev demo client (v15).
 *
 * Pages call:
 *   cmpLayout({single, compare, build, noOfficial}) — instance config card(s) + demo(s);
 *     the compare switch lives beside the page title (the top bar is nav only),
 *     column B's card carries a ✕ close button
 *   cmpColCall("a"|"b", req)                       — one call through a column's config
 *   renderBars(el, probabilities)                  — distribution bars
 *
 * Every source goes through the bridge POST /v1/systemone: chat providers are read
 * via boundary reads, "jev"-kind providers (official TypeSafe API / OpenRouter alpha)
 * are passed through by the bridge with its server-side keys — no keys in the browser.
 */

const JEV = {
  get endpoint() { return localStorage.getItem("openjev.endpoint") || document.querySelector('meta[name="jev-endpoint"]')?.content || "http://127.0.0.1:8012"; },
  set endpoint(v) { localStorage.setItem("openjev.endpoint", v); },
};

/* ---- per-instance config (column A = the single instance, column B = second) ---- */

const CMP_KEY = "openjev.cmp3";
function colDef() { return { endpoint: "", provider: "", model: "", pm: "" }; }
function cmpState() {
  const def = { enabled: false, a: colDef(), b: colDef() };
  try { return { ...def, ...JSON.parse(localStorage.getItem(CMP_KEY) || "{}") }; } catch (_) { return def; }
}
function cmpSave(s) { localStorage.setItem(CMP_KEY, JSON.stringify(s)); }

/* One-time migration from the v8 shape (kind: bridge|jev + browser-side OR key). */
(function migrate() {
  if (localStorage.getItem(CMP_KEY)) return;
  try {
    const old = JSON.parse(localStorage.getItem("openjev.cmp2") || "null");
    if (!old) return;
    const conv = (c = {}) => ({
      endpoint: c.endpoint || "",
      provider: c.kind === "jev" ? "jev-or" : "",
      model: c.model || "",
      pm: c.kind === "jev" ? "" : c.pm || "",
    });
    localStorage.setItem(CMP_KEY, JSON.stringify({ enabled: false, a: conv(old.a), b: conv(old.b) }));
  } catch (_) {}
})();

/* ---- provider catalog: GET /v1/providers per bridge endpoint ---- */

const provCache = new Map(); // provider-list URL → {active, providers: [{name, kind, model}]}
const provUrl = (endpoint) => String(endpoint || "").replace(/\/+$/, "") + "/v1/providers";
const bars = new Set();      // mounted config cards; re-rendered when a catalog lands
const providerErrors = new Set();

async function refreshProviders(endpoint) {
  const url = provUrl(endpoint);
  if (!provCache.has(url)) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Bridge unavailable");
      provCache.set(url, await r.json());
      providerErrors.delete(url);
    } catch (_) { providerErrors.add(url); }
  }
  bars.forEach((b) => b.renderProviders());
}

function catalog(endpoint) { return provCache.get(provUrl(endpoint)); }
function providerKind(name) {
  if (!name) return "chat"; // "" = the bridge's default (active) provider
  for (const payload of provCache.values()) {
    const hit = (payload.providers || []).find((p) => p.name === name);
    if (hit) return hit.kind;
  }
  return "chat"; // unknown yet (catalog not fetched) — harmless: server decides
}

/** The config card that travels with each demo instance. */
function cmpColBar(mount, key, { noOfficial = false, controls = null } = {}) {
  const col = { ...colDef(), ...cmpState()[key] };
  if (noOfficial && providerKind(col.provider) === "jev") col.provider = "";
  if (!col.endpoint) col.endpoint = JEV.endpoint;
  mount.innerHTML = `
    <div class="cfgcard">
      <div class="cfg-head"><span class="cfg-id">${key.toUpperCase()}</span><span class="cfg-title">MODEL ${key.toUpperCase()}</span><span class="cfg-status" role="status">Connecting</span></div>
      <div class="cfggrid">
        <label class="cfgfld cc-src"><span>Provider</span>
          <select class="cc-provider"></select>
        </label>
        <label class="cfgfld"><span>Model</span>
          <input class="cc-model" type="text" spellcheck="false" placeholder="default">
        </label>
        <div class="cfgctl"></div>
      </div>
      <details class="cfg-advanced"><summary title="Connection & advanced settings" aria-label="Connection & advanced settings">${uiIcon("settings")}</summary>
      <div class="cfg-popover">
      <div class="cfg-advanced-grid">
        <label class="cfgfld"><span>Bridge endpoint</span>
          <input class="cc-endpoint" type="url" spellcheck="false" placeholder="http://127.0.0.1:8012">
        </label>
        <label class="cfgfld cc-pmfld"><span>Prompt mode</span>
          <select class="cc-pm">
            <option value="">Full (default)</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
      </div>
      <p class="cfg-hint">Leave the model blank to use this provider's default.</p>
      <button type="button" class="cc-retry ghost">Reconnect</button>
      </div>
      </details>
    </div>`;
  const q = (sel) => mount.querySelector(sel);
  const elProvider = q(".cc-provider");
  const elEndpoint = q(".cc-endpoint");
  const elModel = q(".cc-model");
  const elPm = q(".cc-pm");
  const elPmFld = q(".cc-pmfld");
  const ctl = q(".cfgctl");

  function persist() { // merge this column back into fresh state (never clobber the other)
    const cur = cmpState();
    cur[key] = col;
    cmpSave(cur);
  }
  function defaultModel() {
    const payload = catalog(col.endpoint);
    if (!payload) return "default";
    const want = col.provider || payload.active;
    const hit = (payload.providers || []).find((p) => p.name === want);
    return (hit && hit.model) || "default";
  }
  function renderProviders() {
    const payload = catalog(col.endpoint);
    const failed = providerErrors.has(provUrl(col.endpoint));
    const status = q(".cfg-status");
    status.className = "cfg-status " + (payload ? "online" : failed ? "offline" : "");
    status.textContent = payload ? "Connected" : failed ? "Offline" : "Connecting";
    status.title = "Bridge: " + status.textContent;
    const chats = [], jevs = [];
    (payload && payload.providers || []).forEach((p) => (p.kind === "jev" ? jevs : chats).push(p));
    const prev = col.provider;
    elProvider.innerHTML = "";
    const og1 = document.createElement("optgroup");
    og1.label = "LogJev · bridge";
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = payload ? `${payload.active} (default)` : "default";
    og1.appendChild(defOpt);
    chats.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.name; o.textContent = p.name; o.title = p.model;
      og1.appendChild(o);
    });
    elProvider.appendChild(og1);
    if (!noOfficial && jevs.length) {
      const og2 = document.createElement("optgroup");
      og2.label = "official jev · passthrough";
      jevs.forEach((p) => {
        const o = document.createElement("option");
        o.value = p.name; o.textContent = `${p.name} · ${p.model}`; o.title = p.model;
        og2.appendChild(o);
      });
      elProvider.appendChild(og2);
    }
    const values = Array.from(elProvider.options).map((o) => o.value);
    if (!payload && prev && !(noOfficial && providerKind(prev) === "jev")) {
      const pending = document.createElement("option");
      pending.value = prev; pending.textContent = prev;
      elProvider.appendChild(pending); values.push(prev);
    }
    col.provider = values.includes(prev) ? prev : "";
    elProvider.value = col.provider;
    persist();
    updateModelPlaceholder();
    updatePmVisibility();
  }
  function updateModelPlaceholder() { elModel.placeholder = defaultModel(); }
  function updatePmVisibility() { elPmFld.hidden = providerKind(col.provider) === "jev"; }
  function sync() {
    col.provider = elProvider.value;
    col.endpoint = elEndpoint.value.trim();
    col.model = elModel.value.trim();
    col.pm = elPm.value;
    if (key === "a" && col.endpoint) JEV.endpoint = col.endpoint;
    persist();
    updateModelPlaceholder();
    updatePmVisibility();
  }

  elEndpoint.value = col.endpoint;
  elModel.value = col.model;
  elPm.value = col.pm;
  [elProvider, elEndpoint, elModel, elPm].forEach((el) => (el.oninput = sync));
  elEndpoint.addEventListener("change", () => refreshProviders(col.endpoint));
  elProvider.addEventListener("change", sync);
  q(".cc-retry").onclick = () => {
    provCache.delete(provUrl(col.endpoint));
    providerErrors.delete(provUrl(col.endpoint));
    renderProviders();
    refreshProviders(col.endpoint);
  };
  const advanced = q(".cfg-advanced");
  document.addEventListener("pointerdown", (e) => {
    if (advanced.open && !advanced.contains(e.target)) advanced.open = false;
  });
  advanced.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { advanced.open = false; advanced.querySelector("summary").focus(); }
  });

  if (controls === "close") {
    ctl.innerHTML = `
      <button class="cc-close ghost" type="button" title="Back to a single instance">× Close</button>`;
    ctl.querySelector(".cc-close").onclick = () => {
      const cur = cmpState();
      cur.enabled = false;
      cmpSave(cur);
      fireCompare(false);
    };
  }

  bars.add({ renderProviders });
  renderProviders();
  refreshProviders(col.endpoint);
}

function fireCompare(enabled) {
  document.dispatchEvent(new CustomEvent("openjev:compare", { detail: enabled }));
}

/** One call through a column's live config — always via the bridge. */
async function cmpColCall(key, req) {
  const col = cmpState()[key];
  if (!col.endpoint) throw new Error("no bridge endpoint set in this column's config card");
  const body = { questions: req.questions };
  if (req.messages !== undefined) body.messages = req.messages;
  else body.state = req.state;
  if (col.provider) body.provider = col.provider;
  if (col.model) body.model = col.model;
  if (col.pm && providerKind(col.provider) !== "jev") body.prompt_mode = col.pm;
  const t0 = performance.now();
  const resp = await fetch(col.endpoint.replace(/\/+$/, "") + "/v1/systemone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latency = Math.round(performance.now() - t0);
  let data = {};
  try { data = await resp.json(); } catch (_) {}
  if (!resp.ok) {
    const msg = data && data.error ? data.error.message : data && data.detail ? data.detail : resp.status + " " + resp.statusText;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return { data, latency, request: body };
}

/* ---- page chrome ---- */

const DEMO_PAGES = [
  { slug: "2048/", label: "2048", icon: "grid" },
  { slug: "2048-vision/", label: "2048 vision", icon: "eye" },
  { slug: "bookmarks/", label: "Bookmarks", icon: "bookmark" },
];

function uiIcon(name) {
  const shapes = {
    settings: '<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
    pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.pulse}</svg>`;
}

function injectDemoNav() {
  if (document.getElementById("demo-nav")) return;
  const inSub = /\/(2048-vision|2048|bookmarks)\/([^/]*$|index\.html$)/.test(location.pathname);
  const prefix = inSub ? "../" : "";
  const current = inSub ? location.pathname.match(/\/(2048-vision|2048|bookmarks)\//)[1] : "";
  const nav = document.createElement("nav");
  nav.id = "demo-nav";
  nav.setAttribute("aria-label", "Demo navigation");
  nav.innerHTML = `
    <a class="brand" href="${prefix}index.html"><span class="logo">${uiIcon("pulse")}</span><span>jev<b>/demos</b></span><span class="nav-caption">Decision lab</span></a>
    <div class="links">${DEMO_PAGES.map((p) =>
      `<a href="${prefix}${p.slug}"${p.slug === current + "/" ? ' class="active" aria-current="page"' : ""}>${uiIcon(p.icon)}${p.label}</a>`).join("")}
    </div>`;
  document.body.prepend(nav);
}

/** Layout: single slot gets column A's config + demo; compare adds column B.
 * The column-A config NODE moves between the single slot and compare slot A,
 * so there is exactly one writer for its state. Compare is a page-level
 * control beside the title; closing column B also synchronizes that switch. */
function cmpLayout({ single, compare, build, noOfficial = false }) {
  injectDemoNav();
  const title = document.querySelector("header.page h1");
  const titleRow = document.createElement("div");
  titleRow.className = "page-title";
  if (title) { title.before(titleRow); titleRow.appendChild(title); }
  else single.parentElement.before(titleRow);
  const toggle = document.createElement("label");
  toggle.className = "cmpswitch page-compare";
  toggle.title = "Compare two independently configured models";
  toggle.innerHTML = `<input type="checkbox" class="cc-cmp" aria-label="Compare two models" aria-controls="${compare.id}"><span>Compare</span><span class="knob" aria-hidden="true"></span>`;
  titleRow.appendChild(toggle);
  const compareBox = toggle.querySelector(".cc-cmp");
  compareBox.onchange = () => {
    const state = cmpState();
    state.enabled = compareBox.checked;
    cmpSave(state);
    fireCompare(state.enabled);
  };
  let builtB = false;
  const cfgNode = document.createElement("div");
  const singleSlot = single.querySelector(".colcfg-slot");
  const slotA = compare.querySelector('[data-col="a"] .colcfg-slot');
  const demo = single.querySelector(".col-demo");
  const slotADemo = compare.querySelector('[data-col="a"] .col-demo');
  singleSlot.appendChild(cfgNode);
  cmpColBar(cfgNode, "a", { noOfficial });
  build(demo, (req) => cmpColCall("a", req));

  function layout() {
    const s = cmpState();
    compareBox.checked = s.enabled;
    document.body.classList.toggle("is-comparing", s.enabled);
    if (!s.enabled && builtB) compare.querySelector('[data-col="b"] .col-demo').dispatchEvent(new Event("demo:pause"));
    single.hidden = s.enabled;
    compare.hidden = !s.enabled;
    if (s.enabled) {
      // column A = the very instance you were just using: move it (config + demo) over
      if (cfgNode.parentElement !== slotA) slotA.appendChild(cfgNode);
      if (demo.parentElement !== slotADemo) slotADemo.appendChild(demo);
      if (!builtB) {
        builtB = true;
        cmpColBar(compare.querySelector('[data-col="b"] .colcfg-slot'), "b", { noOfficial, controls: "close" });
        build(compare.querySelector('[data-col="b"] .col-demo'), (req) => cmpColCall("b", req));
      }
    } else {
      if (cfgNode.parentElement !== singleSlot) singleSlot.appendChild(cfgNode);
      if (demo.parentElement !== single) single.appendChild(demo);
    }
  }
  document.addEventListener("openjev:compare", layout);
  layout();
  return layout;
}

/** Render a probability distribution as bars. probabilities: {label: p}
 * Colors come from the theme (.top row = accent, others muted) — no inline colors. */
function renderBars(el, probabilities) {
  const entries = Object.entries(probabilities || {}).sort((a, b) => b[1] - a[1]);
  el.innerHTML = "";
  el.className = "bars";
  entries.forEach(([label, p], i) => {
    const row = document.createElement("div");
    row.className = "bar-row" + (i === 0 ? " top" : "");
    row.innerHTML = `
      <div class="lbl" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
      <div class="track"><div class="fill"></div></div>
      <div class="pct"></div>`;
    el.appendChild(row);
    requestAnimationFrame(() => { row.querySelector(".fill").style.width = (p * 100).toFixed(1) + "%"; });
    row.querySelector(".pct").textContent = p >= 0.995 ? "100%" : (p * 100).toFixed(1) + "%";
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function usageLine(usage, latencyMs) {
  const u = usage || {};
  return `${latencyMs} ms · ${u.input_tokens ?? "?"} in / ${u.output_tokens ?? "?"} out tok` +
    (u.reads && u.reads > 1 ? ` · ${u.reads} reads` : "");
}
