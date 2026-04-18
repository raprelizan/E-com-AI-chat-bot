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
    recognition: null
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

  function pickArabicFemaleVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find((v) => /ar|arabic/i.test(v.lang) && /female|amira|zira|sara|google/i.test(v.name))
      || voices.find((v) => /ar|arabic/i.test(v.lang))
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
      utterance.rate = 0.93;
      utterance.pitch = 1.05;
      const voice = pickArabicFemaleVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    });
  }

  async function speak(text, ui) {
    state.speaking = true;
    ui.status.textContent = 'نادية تتكلم الآن...';

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
    root.className = 'va-widget';
    root.innerHTML = `
      <div class="va-avatar">نادية</div>
      <div class="va-status" id="va-status">اضغط 🎤 لبدء المحادثة الصوتية</div>
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

  function safeStartListening(ui) {
    if (!state.active || state.listening || state.speaking || !state.recognition) return;
    try {
      state.recognition.start();
      state.listening = true;
      ui.status.textContent = 'أنا نسمع لك...';
    } catch {
      setTimeout(() => safeStartListening(ui), 400);
    }
  }

  function stopAll(ui) {
    state.active = false;
    state.listening = false;
    state.speaking = false;
    if (state.recognition) {
      try { state.recognition.stop(); } catch {}
    }
    speechSynthesis.cancel();
    ui.status.textContent = 'تم الإيقاف.';
  }

  function init() {
    if (!isProductPage()) return;

    const ui = createWidget();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      ui.status.textContent = 'المتصفح لا يدعم التعرف الصوتي.';
      return;
    }

    const recognition = new Recognition();
    state.recognition = recognition;
    recognition.lang = ASSISTANT_LANG;
    recognition.continuous = false;
    recognition.interimResults = false;

    ui.mic.addEventListener('click', async () => {
      if (!state.active) {
        state.active = true;
        ui.status.textContent = 'بدأنا. تكلم براحتك.';
        await speak('سلام، أنا نادية. قولي وش تحبي نعاونك؟', ui);
      }
      safeStartListening(ui);
    });

    ui.stop.addEventListener('click', () => stopAll(ui));

    recognition.onresult = async (event) => {
      state.listening = false;
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        if (state.active) safeStartListening(ui);
        return;
      }

      addMemoryEntry('user', transcript);

      try {
        const ai = await sendChat(transcript);
        addMemoryEntry('assistant', ai.reply);

        const execute = actionMap[ai.action] || actionMap.none;
        execute();

        await speak(ai.reply, ui);
      } catch {
        await speak('سمحيلي، ما فهمتش مليح. عاودي السؤال بطريقة بسيطة.', ui);
      }

      if (state.active) {
        setTimeout(() => safeStartListening(ui), 450);
      }
    };

    recognition.onerror = async () => {
      state.listening = false;
      if (state.active) {
        await speak('ما قدرتش نسمع مليح. عاودي من فضلك.', ui);
        safeStartListening(ui);
      }
    };

    recognition.onend = () => {
      state.listening = false;
      if (state.active && !state.speaking) {
        setTimeout(() => safeStartListening(ui), 350);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
