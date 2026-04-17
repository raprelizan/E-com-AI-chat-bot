(() => {
  const CONFIG = window.ShopifyVoiceAssistantConfig || {};
  const API_BASE = CONFIG.apiBase || 'http://localhost:8787';
  const MEMORY_KEY = 'shopify_voice_assistant_memory_v1';
  const MAX_MEMORY = 5;

  const actionMap = {
    scroll_price: () => scrollToAndHighlight(findPriceElement()),
    scroll_images: () => scrollToAndHighlight(findImagesElement()),
    scroll_reviews: () => scrollToAndHighlight(findReviewsElement()),
    buy: () => clickAddToCart(),
    none: () => {}
  };

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

  function getPageContext() {
    const titleEl = document.querySelector('h1.product__title, .product__title, h1');
    const priceEl = findPriceElement();
    const imageEls = [...document.querySelectorAll('.product__media img, .product-gallery img, img.product__image')].slice(0, 5);
    const reviewEl = findReviewsElement();

    return {
      title: titleEl?.textContent?.trim() || document.title,
      price: priceEl?.textContent?.trim() || '',
      images: imageEls.map((img) => img.src).filter(Boolean),
      reviews: reviewEl?.textContent?.trim()?.slice(0, 400) || ''
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
    utterance.rate = 0.92;
    utterance.pitch = 1.08;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find((v) => /female|zira|samantha|google us english/i.test(v.name));
    if (preferred) utterance.voice = preferred;

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
      context: getPageContext()
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
      <div class="va-title">Nadia • Voice Seller</div>
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
        ui.status.textContent = `Nadia (${ai.intent}): ${ai.reply}`;

        const execute = actionMap[ai.action] || actionMap.none;
        execute();

        speak(ai.reply);
      } catch {
        const fallback = 'I am here to help you discover this luxury piece. Would you like price or reviews first?';
        ui.status.textContent = fallback;
        speak(fallback);
      }
    };

    recognition.onerror = () => {
      ui.status.textContent = 'Voice error. Tap mic and try again.';
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => ui.status.textContent = 'Ready when you are ✨');
    } else {
      setTimeout(() => ui.status.textContent = 'Ready when you are ✨', 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
