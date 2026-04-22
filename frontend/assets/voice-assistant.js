(() => {
  const CONFIG = window.ShopifyVoiceAssistantConfig || {};

  const SETTINGS = {
    apiBase: CONFIG.apiBase || 'https://unretired-update-cadet.ngrok-free.dev',
    lang: CONFIG.lang || 'ar-DZ',
    ttsLang: CONFIG.ttsLang || 'ar',
    memoryLimit: 5,
    memoryKey: 'shopify_voice_assistant_memory_v2',
    sessionKey: 'shopify_voice_assistant_session_v1'
  };

  class VoiceSalesAssistant {
    constructor() {
      this.state = {
        active: false,
        listening: false,
        speaking: false,
        dragging: false,
        recognition: null,
        ui: null,
        dragStart: null,
        provider: 'unknown'
      };

      this.actions = {
        scroll_price: () => this.scrollToAndHighlight(this.findPriceElement()),
        scroll_images: () => this.scrollToAndHighlight(this.findImagesElement()),
        scroll_reviews: () => this.scrollToAndHighlight(this.findReviewsElement()),
        buy: () => this.clickAddToCart(),
        none: () => {}
      };
    }

    isProductPage() {
      return /\/products\//.test(location.pathname) || !!document.querySelector('form[action*="/cart/add"]');
    }

    loadMemory() {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS.memoryKey) || '[]');
      } catch {
        return [];
      }
    }

    saveMemory(memory) {
      localStorage.setItem(SETTINGS.memoryKey, JSON.stringify(memory.slice(-SETTINGS.memoryLimit)));
    }

    pushMemory(role, text) {
      const memory = this.loadMemory();
      memory.push({ role, text, ts: Date.now() });
      this.saveMemory(memory);
    }


    getSessionId() {
      let id = localStorage.getItem(SETTINGS.sessionKey);
      if (!id) {
        id = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
        localStorage.setItem(SETTINGS.sessionKey, id);
      }
      return id;
    }

    setSessionId(id) {
      if (id) localStorage.setItem(SETTINGS.sessionKey, id);
    }


    parsePrice(text = '') {
      const clean = String(text).replace(/[^\d.,]/g, '').replace(/,/g, '');
      const n = Number(clean);
      return Number.isFinite(n) ? n : null;
    }

    extractVariants() {
      const set = new Set();
      document.querySelectorAll('select[name*="option"] option, .product-form__input input[type="radio"] + label, .product-form__input label').forEach((el) => {
        const t = el.textContent?.trim();
        if (t && t.length < 40) set.add(t);
      });
      return [...set].slice(0, 10);
    }

    extractSocialProofText() {
      const txt = document.body?.innerText || '';
      const match = txt.match(/\+?\s?\d{3,5}\s*(?:clientes|عميلات|زبونة|customer)/i);
      return match ? match[0] : '';
    }

    getPageContext() {
      const titleEl = document.querySelector('h1.product__title, .product__title h1, .product__title, h1');
      const priceEl = this.findPriceElement();
      const imageEls = [...document.querySelectorAll('.product__media img, .product-gallery img, img.product__image, .thumbnail img')].slice(0, 10);
      const reviewsEl = this.findReviewsElement();
      const addBtn = document.querySelector('form[action*="/cart/add"] [type="submit"], button[name="add"], .product-form__submit');
      const variants = this.extractVariants();

      const priceText = priceEl?.textContent?.trim() || document.querySelector('[itemprop="price"]')?.getAttribute('content') || '';

      return {
        product_url: location.href,
        title: titleEl?.textContent?.trim() || document.title,
        price_text: priceText,
        price_value: this.parsePrice(priceText),
        currency: document.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content') || 'DZD',
        available: !(addBtn?.disabled) && !/sold out|نفد|غير متوفر/i.test(addBtn?.textContent || ''),
        variants,
        social_proof: this.extractSocialProofText(),
        images: imageEls.map((img) => img.src).filter(Boolean),
        reviews: reviewsEl?.textContent?.trim()?.slice(0, 1200) || ''
      };
    }

    findPriceElement() {
      return document.querySelector('.price-item--regular, .price__regular .price-item, .price, [data-product-price]');
    }

    findImagesElement() {
      return document.querySelector('.product__media-wrapper, .product-gallery, .product__media-list, [data-product-media]');
    }

    findReviewsElement() {
      return document.querySelector('#reviews, .shopify-product-reviews, [data-reviews], .jdgm-widget, .spr-container');
    }

    scrollToAndHighlight(el) {
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('va-highlight');
      setTimeout(() => el.classList.remove('va-highlight'), 2200);
    }

    clickAddToCart() {
      const btn = document.querySelector('form[action*="/cart/add"] [type="submit"], button[name="add"], .product-form__submit');
      if (!btn) return;
      this.scrollToAndHighlight(btn);
      setTimeout(() => btn.click(), 280);
    }

    setStatus(text) {
      if (this.state.ui?.status) this.state.ui.status.textContent = text;
    }

    setMeta(text) {
      if (this.state.ui?.meta) this.state.ui.meta.textContent = text;
    }

    setActiveVisual(active) {
      this.state.ui?.button?.classList.toggle('va-fab-active', active);
    }


    buildHeaders(extra = {}) {
      return {
        'ngrok-skip-browser-warning': 'true',
        ...extra
      };
    }

    pickVoice() {
      const voices = speechSynthesis.getVoices();
      return voices.find((v) => /ar/i.test(v.lang) && /female|amira|zira|sara|google/i.test(v.name))
        || voices.find((v) => /ar/i.test(v.lang))
        || voices[0];
    }

    speakBrowser(text) {
      return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) return resolve();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = SETTINGS.lang;
        utter.rate = 0.9;
        utter.pitch = 1.02;
        const voice = this.pickVoice();
        if (voice) utter.voice = voice;
        utter.onend = resolve;
        utter.onerror = resolve;
        speechSynthesis.cancel();
        speechSynthesis.speak(utter);
      });
    }

    async speak(text) {
      this.state.speaking = true;
      this.setStatus('نادية تتكلم...');

      try {
        const r = await fetch(`${SETTINGS.apiBase}/tts?lang=${encodeURIComponent(SETTINGS.ttsLang)}&text=${encodeURIComponent(text)}`, { headers: this.buildHeaders() });
        if (!r.ok) throw new Error('tts');
        const data = await r.json();
        this.state.provider = data.provider || 'unknown';
        if (data.provider) this.setMeta(`المزود الصوتي: ${data.provider}`);
        if (!data.url) throw new Error('tts-url');

        await new Promise((resolve) => {
          const audio = new Audio(data.url);
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });
      } catch {
        await this.speakBrowser(text);
      }

      this.state.speaking = false;
    }

    async sendChat(message) {
      const payload = {
        message,
        locale: SETTINGS.lang,
        memory: this.loadMemory(),
        context: this.getPageContext(),
        session_id: this.getSessionId()
      };

      const r = await fetch(`${SETTINGS.apiBase}/chat`, {
        method: 'POST',
        headers: this.buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (!r.ok) throw new Error('chat failed');
      return r.json();
    }

    createUI() {
      const root = document.createElement('div');
      root.className = 'va-root';
      root.innerHTML = `
        <button id="va-fab" class="va-fab" aria-label="assistant">
          <span class="va-dot"></span>
          <span class="va-mic">🎙</span>
        </button>
        <div id="va-status" class="va-status">اضغطي مرة وابدئي الحديث</div>
        <div id="va-meta" class="va-meta">جاري التحقق من المحرك...</div>
      `;
      document.body.appendChild(root);

      return {
        root,
        button: root.querySelector('#va-fab'),
        status: root.querySelector('#va-status'),
        meta: root.querySelector('#va-meta')
      };
    }

    bindDrag() {
      const root = this.state.ui?.root;
      if (!root) return;

      const move = (clientX, clientY) => {
        if (!this.state.dragging || !this.state.dragStart) return;
        const { x, y, left, top } = this.state.dragStart;
        const nextLeft = Math.max(8, left + (clientX - x));
        const nextTop = Math.max(8, top + (clientY - y));
        root.style.left = `${nextLeft}px`;
        root.style.top = `${nextTop}px`;
        root.style.transform = 'none';
      };

      const start = (clientX, clientY) => {
        const rect = root.getBoundingClientRect();
        this.state.dragging = true;
        this.state.dragStart = { x: clientX, y: clientY, left: rect.left, top: rect.top };
        root.classList.add('va-dragging');
      };

      const end = () => {
        this.state.dragging = false;
        this.state.dragStart = null;
        root.classList.remove('va-dragging');
      };

      root.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
      window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
      window.addEventListener('mouseup', end);

      root.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
      }, { passive: true });
      window.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }, { passive: true });
      window.addEventListener('touchend', end);
    }

    safeStartListening() {
      if (!this.state.active || this.state.listening || this.state.speaking || !this.state.recognition) return;
      try {
        this.state.recognition.start();
        this.state.listening = true;
        this.setStatus('نسمع لك...');
      } catch {
        setTimeout(() => this.safeStartListening(), 320);
      }
    }

    stopConversation() {
      this.state.active = false;
      this.state.listening = false;
      this.state.speaking = false;
      this.setActiveVisual(false);
      this.state.recognition?.stop();
      speechSynthesis.cancel();
      this.setStatus('تم الإيقاف');
    }

    async startConversation() {
      this.state.active = true;
      this.setActiveVisual(true);
      await this.speak('سلام، أنا نادية. قوليلي وش حابة تعرفي على المنتج؟');
      this.safeStartListening();
    }

    bindRecognition() {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        this.setStatus('المتصفح لا يدعم التعرف الصوتي');
        return;
      }

      const recognition = new Recognition();
      this.state.recognition = recognition;
      recognition.lang = SETTINGS.lang;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = async (event) => {
        this.state.listening = false;
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (!transcript) return this.safeStartListening();

        this.pushMemory('user', transcript);

        try {
          const ai = await this.sendChat(transcript);
          this.setSessionId(ai.session_id);
          this.pushMemory('assistant', ai.reply || '');
          if (ai.analytics?.user_intent && ai.analytics?.conversion_stage) {
            console.debug('sales_analytics', ai.analytics);
          }
          (this.actions[ai.action] || this.actions.none)();
          await this.speak(ai.reply || 'سمحيلي، عاودي السؤال.');
        } catch {
          await this.speak('سمحيلي، كاين مشكل تقني صغير. عاودي من فضلك.');
        }

        if (this.state.active) setTimeout(() => this.safeStartListening(), 420);
      };

      recognition.onerror = async () => {
        this.state.listening = false;
        if (!this.state.active) return;
        await this.speak('ما سمعتش مليح. عاودي من فضلك.');
        this.safeStartListening();
      };

      recognition.onend = () => {
        this.state.listening = false;
        if (this.state.active && !this.state.speaking) setTimeout(() => this.safeStartListening(), 300);
      };
    }


    async verifyBackend() {
      try {
        const r = await fetch(`${SETTINGS.apiBase}/health`, { headers: this.buildHeaders() });
        if (!r.ok) throw new Error('health');
        const health = await r.json();
        const engine = health.engine || 'unknown';
        const eleven = health.elevenlabsConfigured ? 'ElevenLabs ✅' : 'ElevenLabs ❌';
        this.setMeta(`المحرك: ${engine} | ${eleven}`);
      } catch {
        this.setMeta('تعذر الاتصال بالباكند');
      }
    }

    init() {
      if (!this.isProductPage()) return;

      this.state.ui = this.createUI();
      this.bindRecognition();
      this.bindDrag();
      this.verifyBackend();

      this.state.ui.button.addEventListener('click', async (e) => {
        if (this.state.dragging) {
          e.preventDefault();
          return;
        }

        if (this.state.active) return this.stopConversation();
        return this.startConversation();
      });
    }
  }

  const boot = () => new VoiceSalesAssistant().init();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
