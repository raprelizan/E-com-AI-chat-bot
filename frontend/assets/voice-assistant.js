(() => {
  const CONFIG = window.ShopifyVoiceAssistantConfig || {};
  const API_BASE = CONFIG.apiBase || 'http://localhost:8787';
  const ASSISTANT_LANG = CONFIG.lang || 'ar-DZ';
  const TTS_LANG = (CONFIG.ttsLang || 'ar').toLowerCase();
  const MEMORY_KEY = 'shopify_voice_assistant_memory_v1';
  const MAX_MEMORY = 5;

  const state = {
    active: false,
    listening: false,
    speaking: false,
    recognition: null,
    ui: null
  };

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
      reviews: reviewEl?.textContent?.trim()?.slice(0, 500) || ''
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
    setTimeout(() => addButton.click(), 250);
  }

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find((v) => /ar/i.test(v.lang) && /female|amira|zira|sara|google/i.test(v.name))
      || voices.find((v) => /ar/i.test(v.lang))
      || voices.find((v) => /female|zira|samantha/i.test(v.name));
  }

  function browserSpeak(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = ASSISTANT_LANG;
      utterance.rate = 0.9;
      utterance.pitch = 1.02;
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    });
  }

  function setStatus(text) {
    if (state.ui?.status) state.ui.status.textContent = text;
  }

  function setActiveVisual(active) {
    if (!state.ui?.button) return;
    state.ui.button.classList.toggle('va-fab-active', active);
  }

  async function speak(text) {
    state.speaking = true;
    setStatus('نادية تتكلم...');

    try {
      const ttsResponse = await fetch(`${API_BASE}/tts?lang=${encodeURIComponent(TTS_LANG)}&text=${encodeURIComponent(text)}`);
      if (!ttsResponse.ok) throw new Error('tts-failed');
      const data = await ttsResponse.json();
      if (!data.url) throw new Error('no-url');

      await new Promise((resolve) => {
        const audio = new Audio(data.url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
    } catch {
      await browserSpeak(text);
    }

    state.speaking = false;
  }

  async function sendChat(message) {
    const payload = {
      message,
      memory: loadMemory(),
      locale: ASSISTANT_LANG,
      responseLanguage: 'algerian_arabic',
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
    root.className = 'va-root';
    root.innerHTML = `
      <button id="va-fab" class="va-fab" aria-label="assistant">🎤</button>
      <div id="va-status" class="va-status">اضغطي مرة لبدء الحديث</div>
    `;
    document.body.appendChild(root);

    return {
      root,
      button: root.querySelector('#va-fab'),
      status: root.querySelector('#va-status')
    };
  }

  function isProductPage() {
    return /\/products\//.test(location.pathname) || !!document.querySelector('form[action*="/cart/add"]');
  }

  function safeStartListening() {
    if (!state.active || state.listening || state.speaking || !state.recognition) return;
    try {
      state.recognition.start();
      state.listening = true;
      setStatus('نسمع لك...');
    } catch {
      setTimeout(safeStartListening, 300);
    }
  }

  function stopConversation() {
    state.active = false;
    state.listening = false;
    state.speaking = false;
    setActiveVisual(false);
    if (state.recognition) {
      try { state.recognition.stop(); } catch {}
    }
    speechSynthesis.cancel();
    setStatus('تم الإيقاف');
  }

  async function startConversation() {
    state.active = true;
    setActiveVisual(true);
    await speak('سلام، أنا نادية. قوليلي وش حابة تعرفي على هذي الساعة؟');
    safeStartListening();
  }

  function bindRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('المتصفح لا يدعم التعرف الصوتي');
      return;
    }

    const recognition = new Recognition();
    state.recognition = recognition;
    recognition.lang = ASSISTANT_LANG;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      state.listening = false;
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        if (state.active) safeStartListening();
        return;
      }

      addMemoryEntry('user', transcript);

      try {
        const ai = await sendChat(transcript);
        addMemoryEntry('assistant', ai.reply);
        (actionMap[ai.action] || actionMap.none)();
        await speak(ai.reply);
      } catch {
        await speak('سمحيلي، عاودي السؤال بطريقة أبسط.');
      }

      if (state.active) setTimeout(safeStartListening, 450);
    };

    recognition.onerror = async () => {
      state.listening = false;
      if (!state.active) return;
      await speak('ما سمعتش مليح. عاودي من فضلك.');
      safeStartListening();
    };

    recognition.onend = () => {
      state.listening = false;
      if (state.active && !state.speaking) {
        setTimeout(safeStartListening, 320);
      }
    };
  }

  function init() {
    if (!isProductPage()) return;

    state.ui = createWidget();
    bindRecognition();

    state.ui.button.addEventListener('click', async () => {
      if (state.active) {
        stopConversation();
        return;
      }
      await startConversation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
