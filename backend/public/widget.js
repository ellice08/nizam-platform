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

  const API_BASE = '__API_BASE__';

  // Session persistence
  const SESSION_KEY = `nizam_session_${ORG_ID}`;
  let sessionId = sessionStorage.getItem(SESSION_KEY) || null;

  // State
  let isOpen = false;
  let isLoading = false;
  let config = {
    orgName: 'Chat with us',
    agentName: 'Assistant',
    primaryColor: '#7A2535',
    secondaryColor: '#C4909A',
  };

  // ─── CSS ────────────────────────────────────────────────────
  const styles = `
    #nizam-widget-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--nizam-primary, #7A2535);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999998;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    #nizam-widget-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    }
    #nizam-widget-btn svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #nizam-widget-panel {
      position: fixed;
      bottom: 92px;
      right: 24px;
      width: 360px;
      max-height: 540px;
      background: #0E0E0C;
      border: 1px solid #2A2A26;
      border-radius: 16px;
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
      border-bottom: 1px solid #2A2A26;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #141410;
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
      background: var(--nizam-primary, #7A2535);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: white;
      font-weight: 600;
      font-family: Arial, sans-serif;
    }
    #nizam-widget-header-text {
      display: flex;
      flex-direction: column;
    }
    #nizam-widget-agent-name {
      font-size: 13px;
      font-weight: 600;
      color: #FAFAFA;
      font-family: Arial, sans-serif;
    }
    #nizam-widget-status {
      font-size: 11px;
      color: #888880;
      font-family: Arial, sans-serif;
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
      color: #888880;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background 0.15s ease;
    }
    #nizam-widget-close:hover {
      background: #2A2A26;
      color: #FAFAFA;
    }
    #nizam-widget-close svg {
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
      background: #0E0E0C;
      scrollbar-width: thin;
      scrollbar-color: #2A2A26 transparent;
    }
    #nizam-widget-messages::-webkit-scrollbar {
      width: 4px;
    }
    #nizam-widget-messages::-webkit-scrollbar-thumb {
      background: #2A2A26;
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
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.55;
      font-family: Arial, sans-serif;
    }
    .nizam-msg.user .nizam-msg-bubble {
      background: var(--nizam-primary, #7A2535);
      color: #FAFAFA;
      border-bottom-right-radius: 4px;
    }
    .nizam-msg.assistant .nizam-msg-bubble {
      background: #1A1A16;
      color: #FAFAFA;
      border: 1px solid #2A2A26;
      border-bottom-left-radius: 4px;
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
      background: #1A1A16;
      border: 1px solid #2A2A26;
      border-radius: 12px;
      border-bottom-left-radius: 4px;
      align-self: flex-start;
    }
    .nizam-typing span {
      width: 6px;
      height: 6px;
      background: #888880;
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
      border-top: 1px solid #2A2A26;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      background: #141410;
      flex-shrink: 0;
    }
    #nizam-widget-input {
      flex: 1;
      background: #0E0E0C;
      border: 1px solid #2A2A26;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      color: #FAFAFA;
      font-family: Arial, sans-serif;
      resize: none;
      outline: none;
      min-height: 40px;
      max-height: 120px;
      line-height: 1.4;
      transition: border-color 0.15s ease;
    }
    #nizam-widget-input:focus {
      border-color: var(--nizam-primary, #7A2535);
    }
    #nizam-widget-input::placeholder {
      color: #555550;
    }
    #nizam-widget-send {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--nizam-primary, #7A2535);
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
      stroke: #FAFAFA;
      stroke-width: 1.5;
      fill: none;
    }
    #nizam-widget-powered {
      text-align: center;
      padding: 6px 0 10px;
      font-size: 10px;
      color: #444440;
      font-family: Arial, sans-serif;
      background: #141410;
      flex-shrink: 0;
    }
    @media (max-width: 480px) {
      #nizam-widget-panel {
        width: calc(100vw - 16px);
        right: 8px;
        bottom: 80px;
        border-radius: 12px;
      }
      #nizam-widget-btn {
        right: 16px;
        bottom: 16px;
      }
    }
  `;

  // ─── HTML ────────────────────────────────────────────────────
  function buildWidget() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Floating button
    const btn = document.createElement('button');
    btn.id = 'nizam-widget-btn';
    btn.setAttribute('aria-label', 'Open chat');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    document.body.appendChild(btn);

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
        <button id="nizam-widget-close" aria-label="Close chat">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
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
    document.body.appendChild(panel);

    applyBranding();
    bindEvents();
  }

  function applyBranding() {
    document.documentElement.style.setProperty(
      '--nizam-primary', config.primaryColor
    );
    const avatar = document.getElementById('nizam-widget-avatar');
    if (avatar) {
      avatar.textContent = config.agentName.charAt(0).toUpperCase();
      avatar.style.background = config.primaryColor;
    }
    const agentNameEl = document.getElementById('nizam-widget-agent-name');
    if (agentNameEl) agentNameEl.textContent = config.agentName;

    const btn = document.getElementById('nizam-widget-btn');
    if (btn) btn.style.background = config.primaryColor;

    const sendBtn = document.getElementById('nizam-widget-send');
    if (sendBtn) sendBtn.style.background = config.primaryColor;
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
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;stroke-width:2;fill:none">
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
        <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#fff;stroke-width:1.5;fill:none">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    }
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
      const res = await fetch(`${API_BASE}/api/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: ORG_ID,
          message: text,
          session_id: sessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message ?? 'Something went wrong');
      }

      // Persist session ID
      if (data.data?.sessionId) {
        sessionId = data.data.sessionId;
        sessionStorage.setItem(SESSION_KEY, sessionId);
      }

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

  // ─── Init ────────────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch(`${API_BASE}/api/widget/config/${ORG_ID}`);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          config = { ...config, ...data.data };
        }
      }
    } catch {
      // Use defaults if config fetch fails
    }

    buildWidget();

    // Defer page capture so it never competes with page load or widget render
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { capturePage(); }, { timeout: 4000 });
    } else {
      setTimeout(capturePage, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
