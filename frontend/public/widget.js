(function () {
  'use strict';

  // Read org ID from script tag
  const scriptTag = document.currentScript ||
    document.querySelector('script[data-org-id]');
  const ORG_ID = scriptTag?.getAttribute('data-org-id');

  if (!ORG_ID) {
    console.warn('[Nizam Widget] Missing data-org-id attribute');
    return;
  }

  // Resolve API base from the embed script tag's data-api attribute.
  // Falls back to deriving from the script's own origin only if absent.
  var API_BASE = (function () {
    try {
      var tag = document.currentScript ||
        document.querySelector('script[data-org-id]');
      var fromAttr = tag && tag.getAttribute('data-api');
      if (fromAttr) return fromAttr.replace(/\/$/, '');
    } catch (e) {}
    return ''; // no API base available — calls will no-op safely
  })();

  if (!API_BASE) {
    console.warn('[Nizam Widget] Missing data-api attribute — API calls disabled');
  }

  // Optional embed-time flags/overrides — used by the Nizam dashboard's own
  // in-app embed (Platform Assistant, see CLAUDE.md §8 Tier 3 [8a] step 5),
  // never set by the public-site embed snippet. Read once at load, same
  // pattern as API_BASE above.
  //
  // - data-disable-capture: skip the page-capture/site-sweep KB-ingestion
  //   flow entirely — those are for crawling a TENANT's public marketing
  //   site, and would otherwise try to ingest the dashboard's own React UI
  //   as "content" into the assistant's knowledge base.
  // - data-theme-mode / data-primary-color / data-font-family /
  //   data-corner-radius: force the widget's appearance for THIS embed only,
  //   applied on top of the org's fetched /api/widget/config (which backs
  //   organisations.branding_config) without ever writing to it — a host
  //   page that already knows its own theme (like the dashboard) shouldn't
  //   have to fight this widget's best-effort host-page detection.
  var DISABLE_CAPTURE = (function () {
    try {
      var tag = document.currentScript || document.querySelector('script[data-org-id]');
      return !!(tag && tag.getAttribute('data-disable-capture') === 'true');
    } catch (e) { return false; }
  })();

  // Optional explicit branch target. Without it the backend resolves the
  // org's default branch (first by created_at) — correct for every
  // single-branch tenant, ambiguous for a multi-branch org. The dashboard's
  // Platform Assistant embed sets this to pin the Platform Support branch;
  // public-site embeds omit it and behave exactly as before. The backend
  // verifies the branch actually belongs to the org before using it.
  var BRANCH_ID = (function () {
    try {
      var tag = document.currentScript || document.querySelector('script[data-org-id]');
      return (tag && tag.getAttribute('data-branch-id')) || null;
    } catch (e) { return null; }
  })();

  var EMBED_OVERRIDES = (function () {
    try {
      var tag = document.currentScript || document.querySelector('script[data-org-id]');
      if (!tag) return {};
      var overrides = {};
      var themeMode = tag.getAttribute('data-theme-mode');
      var primaryColor = tag.getAttribute('data-primary-color');
      var fontFamily = tag.getAttribute('data-font-family');
      var cornerRadius = tag.getAttribute('data-corner-radius');
      if (themeMode) overrides.themeMode = themeMode;
      if (primaryColor) overrides.primaryColor = primaryColor;
      if (fontFamily) overrides.fontFamily = fontFamily;
      if (cornerRadius) overrides.cornerRadius = cornerRadius;
      return overrides;
    } catch (e) { return {}; }
  })();

  // Optional auth bearer token for ticket attribution (see
  // claude.service.ts's raiseSupportTicket + lib/optionalAuth.ts). Read
  // fresh on every call (not cached like API_BASE) because the embedding
  // page may rotate the token in place on the script tag as the user's
  // session refreshes — plain public-site embeds never set this attribute,
  // so this is always null there and the request is sent exactly as before.
  function getAuthToken() {
    try {
      var tag = document.querySelector('script[data-org-id]');
      return (tag && tag.getAttribute('data-token')) || null;
    } catch (e) { return null; }
  }

  // Session persistence — 30-minute idle expiry
  const SESSION_KEY = `nizam_session_${ORG_ID}`;
  const SESSION_TS_KEY = `nizam_session_ts_${ORG_ID}`;
  const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

  function loadSession() {
    try {
      const id = localStorage.getItem(SESSION_KEY);
      const ts = parseInt(localStorage.getItem(SESSION_TS_KEY) || '0', 10);
      if (id && ts && (Date.now() - ts) < SESSION_IDLE_MS) {
        return id;
      }
    } catch (e) {}
    return null; // expired or none — backend will mint a new sessionId
  }

  function touchSession(id) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    } catch (e) {}
  }

  function resetSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_TS_KEY);
    } catch (e) {}
    sessionId = null;
  }

  let sessionId = loadSession();

  // State
  let isOpen = false;
  let isLoading = false;
  let config = {
    orgName: 'Chat with us',
    agentName: 'Assistant',
    primaryColor: '#7A2535',
    secondaryColor: '#C4909A',
    themeMode: 'auto',
    fontFamily: 'inherit',
    cornerRadius: 'rounded',
  };

  // ─── CSS ────────────────────────────────────────────────────
  // Palette lives entirely in --nzw-* custom properties, scoped to
  // #nizam-widget-root (never :root) so it can never leak into the host
  // page's own styles. The block below is the built-in dark-mode default —
  // applyTheme() overrides these via root.style.setProperty() at runtime, and
  // every var() call below also carries the same value as its fallback arg,
  // so the widget renders identically to before even if theming JS never ran.
  const styles = `
    #nizam-widget-root {
      --nzw-bg: #0E0E0C;
      --nzw-surface: #141410;
      --nzw-text: #FAFAFA;
      --nzw-text-muted: #888880;
      --nzw-primary: #7A2535;
      --nzw-primary-rgb: 122, 37, 53;
      --nzw-primary-contrast: #ffffff;
      --nzw-border: #2A2A26;
      --nzw-font: Arial, sans-serif;
      --nzw-radius: 12px;
    }
    #nizam-widget-btn {
      position: fixed;
      right: 20px;
      bottom: 72px;
      /* z-index kept high (not Tailwind's z-50) — this button is embedded on
         arbitrary third-party host pages with unknown stacking contexts, so
         a low z-index risks it being hidden behind host content. */
      z-index: 999998;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(var(--nzw-primary-rgb, 122, 37, 53), 0.2);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      box-shadow:
        0 10px 15px -3px rgba(var(--nzw-primary-rgb, 122, 37, 53), 0.2),
        0 4px 6px -4px rgba(var(--nzw-primary-rgb, 122, 37, 53), 0.2);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      transition: all 0.4s ease-in-out;
    }
    @media (min-width: 768px) {
      #nizam-widget-btn {
        bottom: 136px;
        width: 48px;
        height: 48px;
      }
      #nizam-widget-panel {
        bottom: 200px;
      }
    }
    @media (min-width: 1024px) {
      #nizam-widget-btn {
        bottom: 76px;
      }
      #nizam-widget-panel {
        bottom: 140px;
      }
    }
    #nizam-widget-btn:hover {
      background: var(--nzw-primary, #7A2535);
      transform: scale(1.1);
    }
    #nizam-widget-btn:focus-visible {
      box-shadow:
        0 0 0 2px #ffffff,
        0 0 0 4px var(--nzw-primary, #7A2535);
    }
    #nizam-widget-btn svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: var(--nzw-primary-contrast, #ffffff);
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #nizam-widget-panel {
      position: fixed;
      bottom: 132px;
      right: 20px;
      width: 360px;
      max-height: 540px;
      background: var(--nzw-bg, #0E0E0C);
      border: 1px solid var(--nzw-border, #2A2A26);
      border-radius: calc(var(--nzw-radius, 12px) * 1.333);
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 999999;
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #nizam-widget-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }
    #nizam-widget-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--nzw-border, #2A2A26);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--nzw-surface, #141410);
      flex-shrink: 0;
    }
    #nizam-widget-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #nizam-widget-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--nzw-primary, #7A2535);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: var(--nzw-primary-contrast, #ffffff);
      font-weight: 600;
      font-family: var(--nzw-font, Arial, sans-serif);
    }
    #nizam-widget-header-text {
      display: flex;
      flex-direction: column;
    }
    #nizam-widget-agent-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--nzw-text, #FAFAFA);
      font-family: var(--nzw-font, Arial, sans-serif);
    }
    #nizam-widget-status {
      font-size: 11px;
      color: var(--nzw-text-muted, #888880);
      font-family: var(--nzw-font, Arial, sans-serif);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    #nizam-widget-status::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4CAF50;
      display: inline-block;
    }
    #nizam-widget-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: var(--nzw-text-muted, #888880);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background 0.15s ease;
    }
    #nizam-widget-close:hover {
      background: var(--nzw-border, #2A2A26);
      color: var(--nzw-text, #FAFAFA);
    }
    #nizam-widget-close svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
    }
    #nizam-widget-newchat {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: var(--nzw-text-muted, #888880);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background 0.15s ease;
      margin-right: 4px;
    }
    #nizam-widget-newchat:hover {
      background: var(--nzw-border, #2A2A26);
      color: var(--nzw-text, #FAFAFA);
    }
    #nizam-widget-newchat svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
    }
    #nizam-widget-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 280px;
      max-height: 360px;
      background: var(--nzw-bg, #0E0E0C);
      scrollbar-width: thin;
      scrollbar-color: var(--nzw-border, #2A2A26) transparent;
    }
    #nizam-widget-messages::-webkit-scrollbar {
      width: 4px;
    }
    #nizam-widget-messages::-webkit-scrollbar-thumb {
      background: var(--nzw-border, #2A2A26);
      border-radius: 4px;
    }
    .nizam-msg {
      display: flex;
      gap: 8px;
      max-width: 85%;
      animation: nizamFadeIn 0.2s ease;
    }
    .nizam-msg.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
    .nizam-msg.assistant {
      align-self: flex-start;
    }
    .nizam-msg-bubble {
      padding: 10px 14px;
      border-radius: var(--nzw-radius, 12px);
      font-size: 13px;
      line-height: 1.55;
      font-family: var(--nzw-font, Arial, sans-serif);
    }
    .nizam-msg.user .nizam-msg-bubble {
      background: var(--nzw-primary, #7A2535);
      color: var(--nzw-primary-contrast, #FAFAFA);
      border-bottom-right-radius: calc(var(--nzw-radius, 12px) / 3);
    }
    .nizam-msg.assistant .nizam-msg-bubble {
      background: var(--nzw-surface, #1A1A16);
      color: var(--nzw-text, #FAFAFA);
      border: 1px solid var(--nzw-border, #2A2A26);
      border-bottom-left-radius: calc(var(--nzw-radius, 12px) / 3);
    }
    .nizam-msg-escalated {
      font-size: 11px;
      color: #F0C5CC;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .nizam-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 10px 14px;
      background: var(--nzw-surface, #1A1A16);
      border: 1px solid var(--nzw-border, #2A2A26);
      border-radius: var(--nzw-radius, 12px);
      border-bottom-left-radius: calc(var(--nzw-radius, 12px) / 3);
      align-self: flex-start;
    }
    .nizam-typing span {
      width: 6px;
      height: 6px;
      background: var(--nzw-text-muted, #888880);
      border-radius: 50%;
      animation: nizamBounce 1.2s infinite;
    }
    .nizam-typing span:nth-child(2) { animation-delay: 0.2s; }
    .nizam-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes nizamBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }
    @keyframes nizamFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #nizam-widget-input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--nzw-border, #2A2A26);
      display: flex;
      gap: 8px;
      align-items: flex-end;
      background: var(--nzw-surface, #141410);
      flex-shrink: 0;
    }
    #nizam-widget-input {
      flex: 1;
      background: var(--nzw-bg, #0E0E0C);
      border: 1px solid var(--nzw-border, #2A2A26);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      color: var(--nzw-text, #FAFAFA);
      font-family: var(--nzw-font, Arial, sans-serif);
      resize: none;
      outline: none;
      min-height: 40px;
      max-height: 120px;
      line-height: 1.4;
      transition: border-color 0.15s ease;
    }
    #nizam-widget-input:focus {
      border-color: var(--nzw-primary, #7A2535);
    }
    #nizam-widget-input::placeholder {
      color: #555550;
    }
    #nizam-widget-send {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--nzw-primary, #7A2535);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    #nizam-widget-send:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    #nizam-widget-send:not(:disabled):hover {
      transform: scale(1.05);
    }
    #nizam-widget-send svg {
      width: 16px;
      height: 16px;
      stroke: var(--nzw-primary-contrast, #FAFAFA);
      stroke-width: 1.5;
      fill: none;
    }
    #nizam-widget-powered {
      text-align: center;
      padding: 6px 0 10px;
      font-size: 10px;
      color: #444440;
      font-family: var(--nzw-font, Arial, sans-serif);
      background: var(--nzw-surface, #141410);
      flex-shrink: 0;
    }
    @media (max-width: 480px) {
      #nizam-widget-panel {
        width: calc(100vw - 16px);
        right: 8px;
        bottom: 132px;
        border-radius: var(--nzw-radius, 12px);
      }
    }
  `;

  // ─── HTML ────────────────────────────────────────────────────
  function buildWidget() {
    // Defensive idempotency guard — irrelevant for a normal multi-page site
    // (the page fully reloads, so init() only ever runs once), but the
    // dashboard's Platform Assistant embed (CLAUDE.md §8 Tier 3 [8a] step 5)
    // mounts/unmounts this script inside a single-page app; if the host page
    // ever re-injects the script before cleanup finished, don't build a
    // second widget on top of the first.
    if (document.getElementById('nizam-widget-root')) return;

    if (!document.getElementById('nizam-widget-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'nizam-widget-styles';
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    }

    // Scoped root — the ONLY element theming CSS variables are set on (see
    // applyTheme below). Everything lives inside it so the variables cascade
    // to descendants without ever touching the host page's :root.
    const root = document.createElement('div');
    root.id = 'nizam-widget-root';
    document.body.appendChild(root);

    // Floating button
    const btn = document.createElement('button');
    btn.id = 'nizam-widget-btn';
    btn.setAttribute('aria-label', 'Open chat');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    root.appendChild(btn);

    // Chat panel
    const panel = document.createElement('div');
    panel.id = 'nizam-widget-panel';
    panel.innerHTML = `
      <div id="nizam-widget-header">
        <div id="nizam-widget-header-left">
          <div id="nizam-widget-avatar">${config.agentName.charAt(0).toUpperCase()}</div>
          <div id="nizam-widget-header-text">
            <div id="nizam-widget-agent-name">${config.agentName}</div>
            <div id="nizam-widget-status">Online</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button id="nizam-widget-newchat" aria-label="Start new chat" title="Start new chat">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button id="nizam-widget-close" aria-label="Close chat">
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div id="nizam-widget-messages"></div>
      <div id="nizam-widget-input-area">
        <textarea
          id="nizam-widget-input"
          placeholder="Type a message…"
          rows="1"
        ></textarea>
        <button id="nizam-widget-send" disabled aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
      <div id="nizam-widget-powered">Powered by Ellice Systems</div>
    `;
    root.appendChild(panel);

    applyContent();
    bindEvents();
  }

  function applyContent() {
    // Text/label content only — colors are handled entirely by applyTheme()
    // via CSS variables, so there's no inline-style color assignment here
    // (an inline style would win specificity over the :hover rule the
    // launcher button relies on to stay translucent until hovered).
    const avatar = document.getElementById('nizam-widget-avatar');
    if (avatar) avatar.textContent = config.agentName.charAt(0).toUpperCase();

    const agentNameEl = document.getElementById('nizam-widget-agent-name');
    if (agentNameEl) agentNameEl.textContent = config.agentName;
  }

  // ─── Theming ────────────────────────────────────────────────
  // Built-in dark palette (matches the CSS defaults declared on
  // #nizam-widget-root) and a light counterpart for host-site auto-detection.
  var DARK_PALETTE = {
    bg: '#0E0E0C',
    surface: '#141410',
    text: '#FAFAFA',
    textMuted: '#888880',
    border: '#2A2A26',
  };
  var LIGHT_PALETTE = {
    bg: '#FFFFFF',
    surface: '#F5F5F3',
    text: '#1A1A16',
    textMuted: '#6B6B63',
    border: '#E5E5E0',
  };

  function parseRgbString(str) {
    var m = str && str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
    if (!m) return null;
    return {
      r: parseInt(m[1], 10),
      g: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }

  function hexToRgbObj(hex) {
    if (!hex) return null;
    var clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(function (c) { return c + c; }).join('');
    }
    if (clean.length !== 6) return null;
    var num = parseInt(clean, 16);
    if (isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // Accepts either a hex string ("#7A2535") or an rgb()/rgba() string —
  // detected accents come back from getComputedStyle as rgb(), while config
  // colors are hex, so callers need both forms to work.
  function toRgbComponents(color) {
    if (!color) return null;
    if (color.charAt(0) === '#') return hexToRgbObj(color);
    var parsed = parseRgbString(color);
    return parsed ? { r: parsed.r, g: parsed.g, b: parsed.b } : null;
  }

  function relativeLuminance(r, g, b) {
    function chan(c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }

  function rgbTuple(color) {
    var rgb = toRgbComponents(color);
    return rgb ? [rgb.r, rgb.g, rgb.b].join(', ') : '122, 37, 53';
  }

  function contrastColor(color) {
    var rgb = toRgbComponents(color);
    if (!rgb) return '#ffffff';
    return relativeLuminance(rgb.r, rgb.g, rgb.b) > 0.5 ? '#000000' : '#ffffff';
  }

  function radiusPx(mode) {
    if (mode === 'sharp') return '4px';
    if (mode === 'pill') return '20px';
    return '12px'; // rounded (default)
  }

  // Reads the HOST page (not our widget) to infer a sensible starting point:
  // dark/light mode from the body's actual background, the body's font stack,
  // and — best-effort — a brand accent color from a link or button. Every
  // piece is independently try/caught; any doubt yields null/fallback rather
  // than a wrong guess.
  function detectHostTheme() {
    var result = { mode: null, font: null, accent: null };

    try {
      var bodyBg = getComputedStyle(document.body).backgroundColor;
      var bgRgb = parseRgbString(bodyBg);
      if (bgRgb && bgRgb.a > 0) {
        result.mode = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b) < 0.5 ? 'dark' : 'light';
      }
    } catch (e) { /* fall through to matchMedia below */ }

    if (!result.mode) {
      try {
        result.mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
          ? 'dark' : 'light';
      } catch (e) {
        result.mode = 'dark'; // matches the built-in default palette
      }
    }

    try {
      var bodyFont = getComputedStyle(document.body).fontFamily;
      if (bodyFont && bodyFont.trim()) result.font = bodyFont;
    } catch (e) { /* leave null — caller falls back */ }

    try {
      var found = null;
      var isGrayscale = function (rgb) { return rgb.r === rgb.g && rgb.g === rgb.b; };

      var anchors = document.querySelectorAll('a');
      for (var i = 0; i < anchors.length && i < 50 && !found; i++) {
        var linkRgb = parseRgbString(getComputedStyle(anchors[i]).color);
        if (linkRgb && linkRgb.a > 0 && !isGrayscale(linkRgb)) {
          found = getComputedStyle(anchors[i]).color;
        }
      }

      if (!found) {
        var buttons = document.querySelectorAll('button, [type="submit"], .btn, .button');
        for (var j = 0; j < buttons.length && j < 30 && !found; j++) {
          var btnRgb = parseRgbString(getComputedStyle(buttons[j]).backgroundColor);
          if (btnRgb && btnRgb.a > 0 && !isGrayscale(btnRgb)) {
            found = getComputedStyle(buttons[j]).backgroundColor;
          }
        }
      }

      result.accent = found;
    } catch (e) {
      result.accent = null;
    }

    return result;
  }

  function isAutoMode() {
    return !config.themeMode || config.themeMode === 'auto';
  }

  // Merge order: tenant override (config) > detected (host page) > built-in
  // dark defaults. config.primaryColor always wins over detected.accent in
  // practice — both our local defaults and the config endpoint always supply
  // a non-empty primaryColor, so detected.accent only matters as a structural
  // fallback if that ever changes.
  function applyTheme(cfg, detected) {
    var root = document.getElementById('nizam-widget-root');
    if (!root) return;

    var mode = (cfg.themeMode && cfg.themeMode !== 'auto')
      ? cfg.themeMode
      : (detected.mode || 'dark');

    var font = (cfg.fontFamily && cfg.fontFamily !== 'inherit')
      ? cfg.fontFamily
      : (detected.font || 'Arial, sans-serif');

    var primary = cfg.primaryColor || detected.accent || '#7A2535';
    var radius = radiusPx(cfg.cornerRadius);
    var palette = mode === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

    root.style.setProperty('--nzw-bg', palette.bg);
    root.style.setProperty('--nzw-surface', palette.surface);
    root.style.setProperty('--nzw-text', palette.text);
    root.style.setProperty('--nzw-text-muted', palette.textMuted);
    root.style.setProperty('--nzw-border', palette.border);
    root.style.setProperty('--nzw-primary', primary);
    root.style.setProperty('--nzw-primary-rgb', rgbTuple(primary));
    root.style.setProperty('--nzw-primary-contrast', contrastColor(primary));
    root.style.setProperty('--nzw-font', font);
    root.style.setProperty('--nzw-radius', radius);
  }

  // Live theme switching: only relevant when the tenant hasn't forced a mode
  // (themeMode 'auto') — re-run full detection (not just the media query,
  // since the host page's own body background may change too) and re-apply.
  function watchAutoTheme() {
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (!mq) return;
      var handler = function () {
        if (isAutoMode()) applyTheme(config, detectHostTheme());
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler); // Safari < 14
    } catch (e) { /* live switching is a nice-to-have, never fatal */ }
  }

  // ─── Events ──────────────────────────────────────────────────
  function bindEvents() {
    const btn = document.getElementById('nizam-widget-btn');
    const panel = document.getElementById('nizam-widget-panel');
    const closeBtn = document.getElementById('nizam-widget-close');
    const input = document.getElementById('nizam-widget-input');
    const sendBtn = document.getElementById('nizam-widget-send');

    btn?.addEventListener('click', togglePanel);
    closeBtn?.addEventListener('click', togglePanel);

    const newChatBtn = document.getElementById('nizam-widget-newchat');
    newChatBtn?.addEventListener('click', startNewChat);

    input?.addEventListener('input', function () {
      const el = this;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
      if (sendBtn) {
        sendBtn.disabled = !el.value.trim() || isLoading;
      }
    });

    input?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn?.disabled) sendMessage();
      }
    });

    sendBtn?.addEventListener('click', sendMessage);
  }

  function togglePanel() {
    isOpen = !isOpen;
    const panel = document.getElementById('nizam-widget-panel');
    const btn = document.getElementById('nizam-widget-btn');
    if (!panel || !btn) return;

    if (isOpen) {
      panel.classList.add('open');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--nzw-primary-contrast, #fff);stroke-width:2;fill:none">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      `;
      // Show welcome message on first open
      const messages = document.getElementById('nizam-widget-messages');
      if (messages && messages.children.length === 0) {
        addMessage(
          'assistant',
          `Hi there! I'm ${config.agentName} from ${config.orgName}. How can I help you today?`
        );
      }
      document.getElementById('nizam-widget-input')?.focus();
    } else {
      panel.classList.remove('open');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--nzw-primary-contrast, #fff);stroke-width:1.5;fill:none">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    }
  }

  function startNewChat() {
    resetSession();
    const messages = document.getElementById('nizam-widget-messages');
    if (messages) messages.innerHTML = '';
    // Re-show the welcome message
    addMessage(
      'assistant',
      `Hi there! I'm ${config.agentName} from ${config.orgName}. How can I help you today?`
    );
    const input = document.getElementById('nizam-widget-input');
    if (input) input.focus();
  }

  // ─── Messaging ───────────────────────────────────────────────
  function addMessage(role, content, escalated) {
    const messages = document.getElementById('nizam-widget-messages');
    if (!messages) return;

    const wrapper = document.createElement('div');
    wrapper.className = `nizam-msg ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'nizam-msg-bubble';
    bubble.textContent = content;

    if (escalated) {
      const tag = document.createElement('div');
      tag.className = 'nizam-msg-escalated';
      tag.textContent = '⚑ Flagged for team follow-up';
      bubble.appendChild(tag);
    }

    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const messages = document.getElementById('nizam-widget-messages');
    if (!messages) return;
    const typing = document.createElement('div');
    typing.className = 'nizam-typing';
    typing.id = 'nizam-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('nizam-typing')?.remove();
  }

  async function sendMessage() {
    const input = document.getElementById('nizam-widget-input');
    const sendBtn = document.getElementById('nizam-widget-send');
    if (!input || isLoading) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;

    addMessage('user', text);
    isLoading = true;
    showTyping();

    try {
      const headers = { 'Content-Type': 'application/json' };
      const authToken = getAuthToken();
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

      const payload = {
        org_id: ORG_ID,
        message: text,
        session_id: sessionId,
      };
      if (BRANCH_ID) payload.branch_id = BRANCH_ID;

      const res = await fetch(`${API_BASE}/api/widget/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message ?? 'Something went wrong');
      }

      if (data.data?.sessionId) {
        sessionId = data.data.sessionId;
      }
      touchSession(sessionId);

      hideTyping();
      addMessage('assistant', data.data.reply, data.data.newEscalation === true);

    } catch (err) {
      hideTyping();
      addMessage(
        'assistant',
        'Sorry, I\'m having trouble connecting right now. Please try again in a moment.'
      );
    } finally {
      isLoading = false;
      if (sendBtn && input.value.trim()) sendBtn.disabled = false;
    }
  }

  // ─── Page capture (knowledge base sync) ──────────────────────
  function extractPageText() {
    // Clone body so we don't mutate the live page
    const clone = document.body.cloneNode(true);
    // Remove non-content / noise elements from the clone
    clone.querySelectorAll(
      'script, style, noscript, svg, iframe, nav, footer, header, ' +
      '[role="navigation"], [role="banner"], [role="complementary"], ' +
      '#nizam-widget-btn, #nizam-widget-panel'
    ).forEach(function (el) { el.remove(); });

    const raw = (clone.innerText || clone.textContent || '');
    return raw.replace(/\s+/g, ' ').trim();
  }

  function capturePage() {
    try {
      // Only capture top-level navigations of the host site itself,
      // never inside iframes
      if (window.self !== window.top) return;

      const text = extractPageText();
      if (!text || text.length < 200) return; // too thin, skip

      // Throttle: don't re-submit the same URL more than once per 6 hours
      // from the same browser (server also dedupes by content hash)
      const url = window.location.origin + window.location.pathname;
      const throttleKey = 'nizam_captured_' + ORG_ID + '_' + url;
      try {
        const last = localStorage.getItem(throttleKey);
        if (last && (Date.now() - parseInt(last, 10)) < 6 * 60 * 60 * 1000) {
          return; // captured recently from this browser
        }
      } catch (e) { /* localStorage may be unavailable; proceed */ }

      const title = document.title || '';

      // Fire-and-forget; never block or surface errors to the visitor
      fetch(API_BASE + '/api/widget/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: ORG_ID,
          url: url,
          title: title,
          text: text.slice(0, 50000), // cap payload size
        }),
        keepalive: true,
      }).then(function () {
        try { localStorage.setItem(throttleKey, String(Date.now())); } catch (e) {}
      }).catch(function () { /* silent */ });
    } catch (e) {
      /* never let capture break the host page */
    }
  }

  // ─── Site sweep (full-site knowledge seeding) ────────────────
  var SWEEP_MAX_PAGES = 30;
  var SWEEP_IFRAME_TIMEOUT = 8000;     // max ms to wait for one page to render
  var SWEEP_DELAY_BETWEEN = 600;       // ms pause between pages (be gentle)
  var SWEEP_TODAY_KEY = 'nizam_swept_' + ORG_ID;

  function sweepAlreadyRanToday() {
    try {
      var last = localStorage.getItem(SWEEP_TODAY_KEY);
      if (!last) return false;
      return (Date.now() - parseInt(last, 10)) < 24 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }

  function markSweepRan() {
    try { localStorage.setItem(SWEEP_TODAY_KEY, String(Date.now())); } catch (e) {}
  }

  // Normalise a URL to origin+pathname, same-origin only; returns null if off-site/invalid
  function normaliseSameOrigin(href) {
    try {
      var u = new URL(href, window.location.href);
      if (u.origin !== window.location.origin) return null;
      if (!/^https?:$/.test(u.protocol)) return null;
      u.hash = '';
      u.search = '';
      var clean = u.origin + u.pathname;
      return clean.replace(/\/$/, '') || clean;
    } catch (e) { return null; }
  }

  // Try to read URLs from the site's sitemap(s). Returns array of same-origin URLs.
  async function discoverFromSitemap() {
    var urls = [];
    var candidates = ['/sitemap.xml', '/sitemap_index.xml'];
    for (var c = 0; c < candidates.length; c++) {
      try {
        var res = await fetch(window.location.origin + candidates[c], { credentials: 'omit' });
        if (!res.ok) continue;
        var xml = await res.text();
        var doc = new DOMParser().parseFromString(xml, 'application/xml');

        // sitemap index -> nested sitemaps
        var nested = doc.querySelectorAll('sitemap > loc');
        if (nested.length > 0) {
          for (var n = 0; n < nested.length && urls.length < SWEEP_MAX_PAGES * 3; n++) {
            try {
              var sm = await fetch(nested[n].textContent.trim(), { credentials: 'omit' });
              if (!sm.ok) continue;
              var smXml = await sm.text();
              var smDoc = new DOMParser().parseFromString(smXml, 'application/xml');
              var locs2 = smDoc.querySelectorAll('url > loc');
              for (var k = 0; k < locs2.length; k++) {
                var nu = normaliseSameOrigin(locs2[k].textContent.trim());
                if (nu) urls.push(nu);
              }
            } catch (e) { /* skip this nested sitemap */ }
          }
        } else {
          var locs = doc.querySelectorAll('url > loc');
          for (var i = 0; i < locs.length; i++) {
            var u = normaliseSameOrigin(locs[i].textContent.trim());
            if (u) urls.push(u);
          }
        }
        if (urls.length > 0) break; // got something, stop trying candidates
      } catch (e) { /* try next candidate */ }
    }
    return urls;
  }

  // Fallback: collect same-origin links from the current rendered page
  function discoverFromCurrentDom() {
    var urls = [];
    try {
      var anchors = document.querySelectorAll('a[href]');
      for (var i = 0; i < anchors.length; i++) {
        var u = normaliseSameOrigin(anchors[i].getAttribute('href'));
        if (u) urls.push(u);
      }
    } catch (e) {}
    return urls;
  }

  // Load one URL in a hidden iframe, let it render, extract text from its document.
  function renderAndExtract(url) {
    return new Promise(function (resolve) {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText =
        'position:absolute;width:1024px;height:768px;left:-99999px;top:-99999px;' +
        'border:0;visibility:hidden;pointer-events:none;';
      var done = false;
      var timer = null;

      function finish(text) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        try { iframe.remove(); } catch (e) {}
        resolve(text || '');
      }

      iframe.onload = function () {
        // Give SPA JS a moment to render after load fires
        setTimeout(function () {
          try {
            var idoc = iframe.contentDocument;
            if (!idoc || !idoc.body) { finish(''); return; }
            var clone = idoc.body.cloneNode(true);
            clone.querySelectorAll(
              'script, style, noscript, svg, iframe, nav, footer, header, ' +
              '[role="navigation"], [role="banner"], [role="complementary"]'
            ).forEach(function (el) { el.remove(); });
            var raw = (clone.innerText || clone.textContent || '');
            finish(raw.replace(/\s+/g, ' ').trim());
          } catch (e) {
            // Cross-origin or blocked — give up on this page
            finish('');
          }
        }, 1200);
      };

      iframe.onerror = function () { finish(''); };
      timer = setTimeout(function () { finish(''); }, SWEEP_IFRAME_TIMEOUT);

      try {
        document.body.appendChild(iframe);
        iframe.src = url;
      } catch (e) {
        finish('');
      }
    });
  }

  async function submitPage(url, text) {
    if (!text || text.length < 200) return;
    try {
      await fetch(API_BASE + '/api/widget/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: ORG_ID,
          url: url,
          title: '',
          text: text.slice(0, 50000),
        }),
      });
    } catch (e) { /* silent */ }
  }

  async function runSiteSweep() {
    try {
      if (window.self !== window.top) return;     // never inside an iframe
      if (sweepAlreadyRanToday()) return;
      markSweepRan(); // mark immediately so concurrent tabs don't double-run

      // Discover URLs: sitemap first, then DOM fallback
      var discovered = await discoverFromSitemap();
      if (!discovered || discovered.length === 0) {
        discovered = discoverFromCurrentDom();
      }
      if (!discovered || discovered.length === 0) return;

      // Dedupe + cap, and skip the current page (already captured separately)
      var currentUrl = window.location.origin + window.location.pathname;
      currentUrl = currentUrl.replace(/\/$/, '') || currentUrl;
      var seen = {};
      seen[currentUrl] = true;
      var queue = [];
      for (var i = 0; i < discovered.length; i++) {
        var u = discovered[i];
        if (!seen[u]) { seen[u] = true; queue.push(u); }
        if (queue.length >= SWEEP_MAX_PAGES) break;
      }

      // Process sequentially with a gentle delay
      for (var j = 0; j < queue.length; j++) {
        var text = await renderAndExtract(queue[j]);
        await submitPage(queue[j], text);
        await new Promise(function (r) { setTimeout(r, SWEEP_DELAY_BETWEEN); });
      }
    } catch (e) {
      /* never let the sweep break the host page */
    }
  }

  // ─── Init ────────────────────────────────────────────────────
  async function init() {
    try {
      // Bounded so a slow/unreachable backend can never block the widget
      // from appearing at all — without this, an unresolved (not merely
      // rejected) fetch would leave buildWidget() below waiting forever,
      // since it only runs after this try/catch settles.
      const controller = new AbortController();
      const timeoutId = setTimeout(function () { controller.abort(); }, 4000);
      const configUrl = API_BASE + '/api/widget/config/' + ORG_ID +
        (BRANCH_ID ? '?branch_id=' + encodeURIComponent(BRANCH_ID) : '');
      const res = await fetch(configUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          config = { ...config, ...data.data };
        }
      }
    } catch {
      // Use defaults if config fetch fails or times out
    }

    // Embed-time overrides always win over the fetched org config — see
    // EMBED_OVERRIDES above. No-op (empty object) for the public-site embed.
    config = { ...config, ...EMBED_OVERRIDES };

    buildWidget();

    try {
      applyTheme(config, detectHostTheme());
    } catch (e) {
      // Theming must never break the widget — CSS var() fallbacks already
      // reproduce the built-in dark palette if this fails entirely.
    }
    watchAutoTheme();

    // Lets the embedding host page (the Nizam dashboard's Platform Assistant
    // embed) push explicit theme-mode changes after init — e.g. when the
    // user flips the dashboard's own light/dark toggle, which is a manual
    // in-app state change, not a `prefers-color-scheme` media-query change,
    // so watchAutoTheme()'s listener above never fires for it. No-op for the
    // public-site embed, which never calls this.
    window.NizamAssistantWidget = window.NizamAssistantWidget || {};
    window.NizamAssistantWidget.setThemeMode = function (mode) {
      try {
        config = { ...config, themeMode: mode };
        applyTheme(config, detectHostTheme());
      } catch (e) { /* never let a host-driven theme push break the widget */ }
    };

    if (DISABLE_CAPTURE) return;

    // Defer page capture so it never competes with page load or widget render
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { capturePage(); }, { timeout: 4000 });
    } else {
      setTimeout(capturePage, 2500);
    }

    // After current-page capture, run the full-site sweep once per day, well deferred
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { runSiteSweep(); }, { timeout: 8000 });
    } else {
      setTimeout(runSiteSweep, 6000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
