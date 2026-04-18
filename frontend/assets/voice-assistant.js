(() => {
  const CONFIG = window.ShopifyVoiceAssistantConfig || {};
  const API_BASE = CONFIG.apiBase || 'http://localhost:8787';
  const MEMORY_KEY = 'shopify_voice_assistant_memory_v2';
  const USER_ID_KEY = 'shopify_voice_assistant_user_id';
  const MAX_MEMORY = 10;

  const actionMap = {
    scroll_price: () => scrollToAndHighlight(findPriceElement()),
    scroll_images: () => scrollToAndHighlight(findImagesElement()),
    scroll_reviews: () => scrollToAndHighlight(findReviewsElement()),
    buy: () => clickAddToCart(),
    none: () => {}
  };

  function getOrCreateUserId() {
    const cached = localStorage.getItem(USER_ID_KEY);
    if (cached) return cached;
    const userId = `guest-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(USER_ID_KEY, userId);
    return userId;
  }

  function loadMemory() {
    try {
      return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveMemory(memory) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory.slice(-MAX_MEMORY)));
  }

  function addMemoryEntry(role, text) {
    const memory = loadMemory();
    memory.push({ role, text, ts: Date.now() });
    saveMemory(memory);
  }

  function inferTrafficSource() {
    const source = document.referrer || '';
    if (/tiktok/i.test(source)) return 'tiktok';
    if (/linkedin/i.test(source)) return 'linkedin';
    if (/google|bing/i.test(source)) return 'search';
    return 'direct';
  }

  function getVisibleText() {
    const selectors = ['main', '.product', '.product__info-wrapper', '.product-single'];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node?.innerText) return node.innerText.slice(0, 1200);
    }
    return document.body?.innerText?.slice(0, 1200) || '';
  }

  function getPageContext() {
    const titleEl = document.querySelector('h1.product__title, .product__title, h1');
    const priceEl = findPriceElement();
    const imageEls = [...document.querySelectorAll('.product__media img, .product-gallery img, img.product__image')].slice(0, 5);
    const reviewEl = findReviewsElement();
    const productId = document.querySelector('[name="id"]')?.value || document.querySelector('[data-product-id]')?.getAttribute('data-product-id') || '';

    return {
      title: titleEl?.textContent?.trim() || document.title,
      price: priceEl?.textContent?.trim() || '',
      images: imageEls.map((img) => img.src).filter(Boolean),
      reviews: reviewEl?.textContent?.trim()?.slice(0, 400) || '',
      visibleText: getVisibleText(),
      productId,
      viewedProducts: productId ? [productId] : []
    };
  }

  function getUserContext() {
    const locale = (navigator.language || 'en-US').toLowerCase();
    const country = locale.split('-')[1] || '';

    return {
      id: getOrCreateUserId(),
      country,
      trafficSource: inferTrafficSource(),
      device: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      behavior: loadMemory().length > 4 ? 'engaged' : 'new'
    };
  }

  function findPriceElement() {
    return document.querySelector('.price-item--regular, .price__regular .price-item, .price, [data-product-price]');
  }

  function findImagesElement() {
    return document.querySelector('.product__media-wrapper, .product-gallery, .product__media-list, [data-product-media]');
  }

  function findReviewsElement() {
    return document.querySelector('#reviews, .shopify-product-reviews, [data-reviews], .jdgm-widget, .spr-container');
  }

  function scrollToAndHighlight(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('va-highlight');
    setTimeout(() => el.classList.remove('va-highlight'), 2200);
  }

  function clickAddToCart() {
    const addButton = document.querySelector('form[action*="/cart/add"] [type="submit"], button[name="add"], .product-form__submit');
    if (!addButton) return;
    scrollToAndHighlight(addButton);
    setTimeout(() => addButton.click(), 300);
  }

  function browserSpeak(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 1.04;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  async function speak(text) {
    try {
      const ttsResponse = await fetch(`${API_BASE}/tts?text=${encodeURIComponent(text)}`);
      if (!ttsResponse.ok) throw new Error('tts-failed');
      const data = await ttsResponse.json();
      if (data.url) {
        const audio = new Audio(data.url);
        await audio.play();
        return;
      }
      throw new Error('no-url');
    } catch {
      browserSpeak(text);
    }
  }

  async function sendChat(message) {
    const payload = {
      message,
      memory: loadMemory(),
      context: getPageContext(),
      user: getUserContext()
    };

    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('chat-failed');
    return res.json();
  }

  function createWidget() {
    const root = document.createElement('div');
    root.className = 'va-widget';
    root.innerHTML = `
      <div class="va-title">AI Sales Assistant</div>
      <div class="va-status" id="va-status">Tap mic to talk</div>
      <div class="va-actions">
        <button id="va-mic" class="va-btn" aria-label="start voice">🎤</button>
        <button id="va-stop" class="va-btn va-btn-stop" aria-label="stop">⏹</button>
      </div>
    `;
    document.body.appendChild(root);

    return {
      status: root.querySelector('#va-status'),
      mic: root.querySelector('#va-mic'),
      stop: root.querySelector('#va-stop')
    };
  }

  function isProductPage() {
    return /\/products\//.test(location.pathname) || !!document.querySelector('form[action*="/cart/add"]');
  }

  function init() {
    if (!isProductPage()) return;

    const ui = createWidget();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      ui.status.textContent = 'Speech recognition unsupported in this browser.';
      return;
    }

    const recognition = new Recognition();
    recognition.lang = CONFIG.lang || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    ui.mic.addEventListener('click', () => {
      ui.status.textContent = 'Listening...';
      recognition.start();
    });

    ui.stop.addEventListener('click', () => {
      recognition.stop();
      speechSynthesis.cancel();
      ui.status.textContent = 'Stopped.';
    });

    recognition.onresult = async (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        ui.status.textContent = 'I did not catch that.';
        return;
      }

      addMemoryEntry('user', transcript);
      ui.status.textContent = `You: ${transcript}`;

      try {
        const ai = await sendChat(transcript);
        addMemoryEntry('assistant', ai.reply);
        ui.status.textContent = `Assistant (${ai.stage}): ${ai.reply}`;

        const execute = actionMap[ai.action] || actionMap.none;
        execute();

        speak(ai.reply);
      } catch {
        const fallback = 'I can help you pick the best fit quickly. What is your budget range?';
        ui.status.textContent = fallback;
        speak(fallback);
      }
    };

    recognition.onerror = () => {
      ui.status.textContent = 'Voice error. Tap mic and try again.';
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        ui.status.textContent = 'Ready to help you choose the best product ✨';
      });
    } else {
      setTimeout(() => {
        ui.status.textContent = 'Ready to help you choose the best product ✨';
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
