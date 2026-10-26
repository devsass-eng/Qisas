/**
 * Qisas - Offline Digital Reading Application
 * Native Digital Typography & Text Reader Controller
 */

(function () {
  'use strict';

  // Application State
  const state = {
    currentScreen: 'screen-main-menu',
    navigationHistory: ['screen-main-menu'],
    activeBook: null, // 'prophets' or 'companions'
    
    // Active selections
    activeProphet: null,
    activeCompanion: null,
    activeSectionIndex: 0,
    
    selectedProphet: null,
    selectedCompanion: null,

    // Reading progress & bookmarks (persisted in localStorage)
    progress: {
      prophets: null,
      companions: null,
      lastActiveCollection: null
    },
    bookmarks: [],
    settings: {
      theme: 'theme-light',
      fontSize: 18,
      fontFamily: 'font-serif',
      ttsPersona: 'balanced',
      ttsVoiceURI: '',
      ttsDefaultSpeed: 1.0,
      ttsAutoNext: true,
      ttsHighlightStyle: 'tint_bar',
      wakeLockListening: true,
      autoScrollListening: true,
      highlightSentence: true
    }
  };

  // DOM Elements Cache
  const screens = {
    mainMenu: document.getElementById('screen-main-menu'),
    prophets: document.getElementById('screen-prophets'),
    prophetHeadings: document.getElementById('screen-prophet-headings'),
    companions: document.getElementById('screen-companions'),
    lastRead: document.getElementById('screen-last-read'),
    reader: document.getElementById('screen-reader')
  };

  const modals = {
    search: document.getElementById('modal-search'),
    bookmarks: document.getElementById('modal-bookmarks'),
    settings: document.getElementById('modal-settings'),
    confirm: document.getElementById('modal-confirm')
  };

  const BOOK_TITLES = {
    prophets: 'Stories of the Prophets',
    companions: 'Stories of the Companions'
  };

  // =========================================================================
  // 1. STORAGE & STATE PERSISTENCE
  // =========================================================================

  function loadPersistedData() {
    try {
      const savedProgress = localStorage.getItem('qisas_progress');
      if (savedProgress) {
        state.progress = JSON.parse(savedProgress);
      }

      const savedBookmarks = localStorage.getItem('qisas_bookmarks');
      if (savedBookmarks) {
        state.bookmarks = JSON.parse(savedBookmarks);
      }

      const savedSettings = localStorage.getItem('qisas_settings');
      if (savedSettings) {
        state.settings = Object.assign(state.settings, JSON.parse(savedSettings));
      }
    } catch (e) {
      console.warn('LocalStorage load warning:', e);
    }

    applyTheme(state.settings.theme || 'theme-light');
    applyFontSize(state.settings.fontSize || 18);
    applyFontFamily(state.settings.fontFamily || 'font-serif');

    const fontSlider = document.getElementById('slider-text-size');
    const fontBadge = document.getElementById('font-size-val');
    if (fontSlider) {
      fontSlider.value = String(state.settings.fontSize || 18);
    }
    if (fontBadge) {
      fontBadge.textContent = (state.settings.fontSize || 18) + 'px';
    }

    const familySelect = document.getElementById('select-font-family');
    if (familySelect) {
      familySelect.value = state.settings.fontFamily || 'font-serif';
    }

    const personaSelect = document.getElementById('select-tts-persona');
    if (personaSelect) {
      personaSelect.value = state.settings.ttsPersona || 'balanced';
    }

    const speedSelect = document.getElementById('select-tts-default-speed');
    if (speedSelect) {
      speedSelect.value = String(state.settings.ttsDefaultSpeed !== undefined ? state.settings.ttsDefaultSpeed : 1.0);
    }

    const autoNextToggle = document.getElementById('toggle-tts-autonext');
    if (autoNextToggle) {
      autoNextToggle.checked = state.settings.ttsAutoNext !== undefined ? state.settings.ttsAutoNext : true;
    }

    const highlightStyleSelect = document.getElementById('select-tts-highlight-style');
    if (highlightStyleSelect) {
      highlightStyleSelect.value = state.settings.ttsHighlightStyle || 'tint_bar';
    }

    const wakeLockToggle = document.getElementById('toggle-wake-lock');
    if (wakeLockToggle) {
      wakeLockToggle.checked = state.settings.wakeLockListening !== undefined ? state.settings.wakeLockListening : true;
    }

    const autoScrollToggle = document.getElementById('toggle-auto-scroll');
    if (autoScrollToggle) {
      autoScrollToggle.checked = state.settings.autoScrollListening !== undefined ? state.settings.autoScrollListening : true;
    }

    const highlightSentenceToggle = document.getElementById('toggle-highlight-sentence');
    if (highlightSentenceToggle) {
      highlightSentenceToggle.checked = state.settings.highlightSentence !== undefined ? state.settings.highlightSentence : true;
    }

    populateTTSVoicesDropdown();

    updateMainMenuPreview();
  }

  function saveProgress() {
    try {
      localStorage.setItem('qisas_progress', JSON.stringify(state.progress));
      updateMainMenuPreview();
    } catch (e) {
      console.warn('LocalStorage save warning:', e);
    }
  }

  function saveBookmarks() {
    try {
      localStorage.setItem('qisas_bookmarks', JSON.stringify(state.bookmarks));
      updateReaderBookmarkIcon();
    } catch (e) {
      console.warn('LocalStorage bookmark save warning:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('qisas_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.warn('LocalStorage settings save warning:', e);
    }
  }

  function applyTheme(themeClass) {
    document.body.classList.remove('theme-light', 'theme-warm', 'theme-dark');
    document.body.classList.add(themeClass);
    state.settings.theme = themeClass;
    saveSettings();

    document.querySelectorAll('.theme-choice-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === themeClass);
    });
  }

  function applyFontFamily(fontClass) {
    document.body.classList.remove('font-serif', 'font-sans');
    document.body.classList.add(fontClass);
    state.settings.fontFamily = fontClass;
    saveSettings();
  }

  function applyFontSize(size) {
    const s = parseInt(size, 10) || 18;
    state.settings.fontSize = s;
    const article = document.getElementById('reader-story-article');
    if (article) {
      article.style.setProperty('--reading-font-size', s + 'px');
      article.style.fontSize = s + 'px';
    }

    const preview = document.getElementById('font-preview-sample');
    if (preview) {
      preview.style.fontSize = s + 'px';
    }

    const fontBadge = document.getElementById('font-size-val');
    if (fontBadge) {
      fontBadge.textContent = s + 'px';
    }
  }

  // =========================================================================
  // 2. SCREEN NAVIGATION SYSTEM
  // =========================================================================

  function navigateTo(screenId, pushHistory = true) {
    if (state.currentScreen === screenId) return;

    Object.values(screens).forEach(screen => {
      if (screen) screen.classList.remove('active');
    });

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      state.currentScreen = screenId;

      if (pushHistory) {
        state.navigationHistory.push(screenId);
        window.history.pushState({ screenId: screenId }, '');
      }
    }

    if (screenId === 'screen-last-read') {
      renderLastReadScreen();
    } else if (screenId === 'screen-main-menu') {
      updateMainMenuPreview();
    }
  }

  function navigateBack() {
    if (state.navigationHistory.length > 1) {
      state.navigationHistory.pop();
      const prevScreenId = state.navigationHistory[state.navigationHistory.length - 1];
      navigateTo(prevScreenId, false);
    } else {
      navigateTo('screen-main-menu', false);
    }
  }

  window.addEventListener('popstate', function (e) {
    let modalOpen = false;
    Object.values(modals).forEach(m => {
      if (m && m.classList.contains('active')) {
        m.classList.remove('active');
        modalOpen = true;
      }
    });
    if (modalOpen) return;

    if (e.state && e.state.screenId) {
      navigateTo(e.state.screenId, false);
    } else {
      navigateBack();
    }
  });

  // =========================================================================
  // 3. PROPHETS FLOW
  // =========================================================================

  function getProphetsData() {
    return window.PROPHETS_TEXT_DATA || window.PROPHETS_DATA || [];
  }

  function getCompanionsData() {
    return window.COMPANIONS_TEXT_DATA || window.COMPANIONS_DATA || [];
  }

  function initProphetsList() {
    const container = document.getElementById('prophets-list');
    const filterInput = document.getElementById('input-filter-prophets');
    if (!container) return;

    const prophets = getProphetsData();

    function renderList(filterText = '') {
      container.innerHTML = '';
      const filter = filterText.toLowerCase().trim();

      prophets.forEach(p => {
        const matchesName = p.name && p.name.toLowerCase().includes(filter);
        const matchesArabic = p.arabic_name && p.arabic_name.includes(filter);
        if (filter && !matchesName && !matchesArabic) {
          return;
        }

        const card = document.createElement('div');
        card.className = 'list-item-card';
        const secCount = p.sections ? p.sections.length : (p.headings ? p.headings.length : 0);
        const totalP = p.story_total_pages || (p.original_end_page ? (p.original_end_page - p.original_start_page + 1) : 1);

        card.innerHTML = `
          <div class="item-left">
            <div class="item-number">${p.num}</div>
            <div class="item-info">
              <div class="item-title">${escapeHtml(p.name)}</div>
              <div class="item-subtext">${totalP} Pages (1–${totalP}) • ${secCount} Subtitles</div>
            </div>
          </div>
          <div class="item-right-badge">View Subtitles</div>
        `;

        card.addEventListener('click', () => {
          openProphetHeadings(p);
        });

        container.appendChild(card);
      });
    }

    renderList();

    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        renderList(e.target.value);
      });
    }
  }

  function openProphetHeadings(prophet) {
    state.selectedProphet = prophet;
    const titleElem = document.getElementById('prophet-headings-title');
    const metaElem = document.getElementById('prophet-headings-meta');
    const container = document.getElementById('headings-list');

    titleElem.textContent = prophet.name;
    const secCount = prophet.sections ? prophet.sections.length : (prophet.headings ? prophet.headings.length : 0);
    const totalP = prophet.story_total_pages || (prophet.original_end_page ? (prophet.original_end_page - prophet.original_start_page + 1) : 1);
    metaElem.textContent = `${secCount} Subtitles • Pages 1 – ${totalP}`;

    container.innerHTML = '';

    const list = prophet.sections || prophet.headings || [];

    if (list.length > 0) {
      list.forEach((h, idx) => {
        const pageLabel = h.story_page_label || (h.story_start_page ? `Page ${h.story_start_page}` : `Section ${idx + 1}`);
        const card = document.createElement('div');
        card.className = 'list-item-card';
        card.innerHTML = `
          <div class="item-left">
            <div class="item-number">${idx + 1}</div>
            <div class="item-info">
              <div class="item-title">${escapeHtml(h.title)}</div>
              <div class="item-subtext">${pageLabel} of ${totalP}</div>
            </div>
          </div>
          <div class="item-right-badge">Read Subtitle</div>
        `;

        card.addEventListener('click', () => {
          openStoryReader('prophets', prophet.id || prophet.num, idx);
        });

        container.appendChild(card);
      });
    } else {
      container.innerHTML = `
        <div class="list-item-card" id="btn-read-single-story">
          <div class="item-left">
            <div class="item-number">1</div>
            <div class="item-info">
              <div class="item-title">${escapeHtml(prophet.name)}</div>
              <div class="item-subtext">Complete Story</div>
            </div>
          </div>
          <div class="item-right-badge">Read Story</div>
        </div>
      `;
      const singleBtn = document.getElementById('btn-read-single-story');
      if (singleBtn) {
        singleBtn.addEventListener('click', () => {
          openStoryReader('prophets', prophet.id || prophet.num, 0);
        });
      }
    }

    navigateTo('screen-prophet-headings');
  }

  // =========================================================================
  // 4. COMPANIONS FLOW
  // =========================================================================

  function initCompanionsList() {
    const container = document.getElementById('companions-list');
    const filterInput = document.getElementById('input-filter-companions');
    if (!container) return;

    const companions = getCompanionsData();

    function renderList(filterText = '') {
      container.innerHTML = '';
      const filter = filterText.toLowerCase().trim();

      companions.forEach(c => {
        if (filter && !c.name.toLowerCase().includes(filter)) {
          return;
        }

        const card = document.createElement('div');
        card.className = 'list-item-card';
        const totalP = c.story_total_pages || (c.original_end_page ? (c.original_end_page - c.original_start_page + 1) : 1);
        card.innerHTML = `
          <div class="item-left">
            <div class="item-number">${c.num}</div>
            <div class="item-info">
              <div class="item-title">${escapeHtml(c.name)}</div>
              <div class="item-subtext">Original Biography • ${totalP} Pages (1–${totalP})</div>
            </div>
          </div>
          <div class="item-right-badge">Read Biography</div>
        `;

        card.addEventListener('click', () => {
          state.selectedCompanion = c;
          openStoryReader('companions', c.id || c.num);
        });

        container.appendChild(card);
      });
    }

    renderList();

    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        renderList(e.target.value);
      });
    }
  }

  // =========================================================================
  // 5. NATIVE DIGITAL TEXT READER CONTROLLER
  // =========================================================================

  function openStoryReader(collection, itemId, sectionIndex = 0) {
    state.activeBook = collection;

    if (collection === 'prophets') {
      const pList = getProphetsData();
      const prophet = pList.find(p => p.id === itemId || p.num === itemId || p.name === itemId) || pList[0];
      if (!prophet) return;

      state.activeProphet = prophet;
      state.selectedProphet = prophet;

      const totalSec = prophet.sections ? prophet.sections.length : 1;
      state.activeSectionIndex = Math.max(0, Math.min(sectionIndex || 0, totalSec - 1));

      const sec = prophet.sections && prophet.sections[state.activeSectionIndex];
      const secTitle = sec ? sec.title : prophet.name;

      // Update Reader Toolbar Title & Subtitle
      document.getElementById('reader-book-title').textContent = prophet.name;
      document.getElementById('reader-item-subtitle').textContent = secTitle;

      // Update Header Section Badge (Shows story-relative page number and section)
      const badgeEl = document.getElementById('reader-current-page-num');
      const totalP = prophet.story_total_pages || (prophet.original_end_page ? (prophet.original_end_page - prophet.original_start_page + 1) : 1);
      const pageInfo = sec && sec.story_page_label ? sec.story_page_label : `Page ${sec ? sec.story_start_page || 1 : 1}`;
      if (badgeEl) badgeEl.textContent = `${pageInfo} of ${totalP}`;

      // Populate Subtitle Navigation Bar
      const sectionsBar = document.getElementById('reader-sections-bar');
      const selectSection = document.getElementById('select-active-section');
      const btnPrev = document.getElementById('btn-prev-section');
      const btnNext = document.getElementById('btn-next-section');

      if (sectionsBar) sectionsBar.style.display = 'flex';
      if (btnPrev) btnPrev.disabled = state.activeSectionIndex === 0;
      if (btnNext) btnNext.disabled = state.activeSectionIndex >= totalSec - 1;

      if (selectSection && prophet.sections) {
        selectSection.innerHTML = '';
        prophet.sections.forEach((s, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          const sPage = s.story_page_label ? ` (${s.story_page_label})` : '';
          opt.textContent = `${idx + 1}. ${s.title}${sPage}`;
          if (idx === state.activeSectionIndex) opt.selected = true;
          selectSection.appendChild(opt);
        });
      }

      // Render Section Story Content
      const content = sec ? sec.content : prophet.full_text;
      renderStoryArticle(prophet.name, prophet.arabic_name, secTitle, content, state.activeSectionIndex, totalSec);

      saveCurrentReadingProgress();

    } else {
      // Companions
      const cList = getCompanionsData();
      const companion = cList.find(c => c.id === itemId || c.num === itemId || c.name === itemId) || cList[0];
      if (!companion) return;

      state.activeCompanion = companion;
      state.selectedCompanion = companion;

      document.getElementById('reader-book-title').textContent = companion.name;
      document.getElementById('reader-item-subtitle').textContent = 'Biography';

      const totalCpPages = companion.story_total_pages || (companion.original_end_page ? (companion.original_end_page - companion.original_start_page + 1) : 1);
      const badgeEl = document.getElementById('reader-current-page-num');
      if (badgeEl) badgeEl.textContent = `Pages 1–${totalCpPages}`;

      const sectionsBar = document.getElementById('reader-sections-bar');
      if (sectionsBar) sectionsBar.style.display = 'none';

      renderStoryArticle(companion.name, '', 'Biography of the Companion', companion.content, 0, 1);

      saveCurrentReadingProgress();
    }

    navigateTo('screen-reader');

    // Scroll to top of reading area
    const mainEl = document.getElementById('story-reader-main');
    if (mainEl) mainEl.scrollTop = 0;
  }

  function advanceToNextStoryOrSection() {
    if (state.activeBook === 'prophets' && state.activeProphet) {
      const prophet = state.activeProphet;
      const totalSec = prophet.sections ? prophet.sections.length : 1;
      // 1. Next section in current prophet
      if (state.activeSectionIndex < totalSec - 1) {
        openStoryReader('prophets', prophet.id, state.activeSectionIndex + 1);
        return true;
      }
      // 2. Next prophet in collection
      const pList = getProphetsData();
      const currentPIdx = pList.findIndex(p => p.id === prophet.id || p.num === prophet.num);
      if (currentPIdx !== -1 && currentPIdx < pList.length - 1) {
        const nextProphet = pList[currentPIdx + 1];
        openStoryReader('prophets', nextProphet.id, 0);
        return true;
      }
    } else if (state.activeBook === 'companions' && state.activeCompanion) {
      const cList = getCompanionsData();
      const currentCIdx = cList.findIndex(c => c.id === state.activeCompanion.id || c.num === state.activeCompanion.num);
      if (currentCIdx !== -1 && currentCIdx < cList.length - 1) {
        const nextCompanion = cList[currentCIdx + 1];
        openStoryReader('companions', nextCompanion.id, 0);
        return true;
      }
    }
    return false;
  }

  function renderStoryArticle(title, arabicName, sectionTitle, content, currentIdx, totalCount) {
    const article = document.getElementById('reader-story-article');
    if (!article) return;

    applyFontSize(state.settings.fontSize || 18);

    let html = `
      <div class="story-header-badge">
        ${arabicName ? `<span class="story-arabic-title">${escapeHtml(arabicName)}</span>` : ''}
        <h2 class="story-chapter-title">${escapeHtml(title)}</h2>
        <div class="story-section-title">${escapeHtml(sectionTitle)}</div>
      </div>
    `;

    if (content) {
      // Calculate estimated read time (~200 words per minute)
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const readMinutes = Math.max(1, Math.ceil(wordCount / 200));
      const readTimeEl = document.getElementById('reader-read-time');
      if (readTimeEl) {
        readTimeEl.textContent = `~${readMinutes} min read (${wordCount} words)`;
      }

      const paragraphs = content.split('\n\n').map(p => p.trim()).filter(Boolean);
      paragraphs.forEach((p, pIndex) => {
        // Detect Quranic quotes, revelations, and hadith citations
        const isQuote = p.startsWith('"') || p.startsWith('“') || 
                        p.includes('Allah the Almighty revealed:') || 
                        p.includes('Allah said:') ||
                        p.includes('Allah revealed:');

        const safeP = escapeHtml(p);
        const copyBtn = `<button class="btn-copy-quote" data-para-index="${pIndex}" title="Copy passage">Copy</button>`;

        if (isQuote) {
          html += `
            <div class="story-paragraph-wrapper" data-para-index="${pIndex}">
              <blockquote class="story-quote-block">${safeP}</blockquote>
              ${copyBtn}
            </div>
          `;
        } else {
          html += `
            <div class="story-paragraph-wrapper" data-para-index="${pIndex}">
              <p class="story-paragraph">${safeP}</p>
              ${copyBtn}
            </div>
          `;
        }
      });
    } else {
      html += `<p class="story-paragraph" style="color: var(--text-muted); text-align: center;">No text content available.</p>`;
    }

    // Bottom Navigation Bar
    if (state.activeBook === 'prophets' && state.activeProphet && totalCount > 1) {
      const prevDisabled = currentIdx === 0 ? 'disabled' : '';
      const nextDisabled = currentIdx >= totalCount - 1 ? 'disabled' : '';
      const nextTitle = !nextDisabled && state.activeProphet.sections && state.activeProphet.sections[currentIdx + 1] 
                        ? state.activeProphet.sections[currentIdx + 1].title 
                        : '';

      html += `
        <div class="story-bottom-nav">
          <button class="btn-story-bottom" id="btn-bottom-prev" ${prevDisabled}>
            &larr; Previous Subtitle
          </button>
          ${!nextDisabled ? `
            <button class="btn-story-bottom btn-next-primary" id="btn-bottom-next">
              Next: ${escapeHtml(nextTitle)} &rarr;
            </button>
          ` : `
            <button class="btn-story-bottom" id="btn-bottom-next" disabled>
              End of Chapter
            </button>
          `}
        </div>
      `;
    }

    article.innerHTML = html;

    // Fire event so TTS can attach long-press listeners to new content
    document.dispatchEvent(new CustomEvent('story-rendered'));
    document.dispatchEvent(new CustomEvent('story-section-changed'));

    // Attach bottom buttons
    const bottomPrev = document.getElementById('btn-bottom-prev');
    if (bottomPrev && currentIdx > 0) {
      bottomPrev.addEventListener('click', () => {
        openStoryReader('prophets', state.activeProphet.id, currentIdx - 1);
      });
    }

    const bottomNext = document.getElementById('btn-bottom-next');
    if (bottomNext && currentIdx < totalCount - 1) {
      bottomNext.addEventListener('click', () => {
        openStoryReader('prophets', state.activeProphet.id, currentIdx + 1);
      });
    }

    // Attach copy passage buttons
    article.querySelectorAll('.btn-copy-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrapper = btn.closest('.story-paragraph-wrapper');
        const textNode = wrapper ? (wrapper.querySelector('blockquote') || wrapper.querySelector('p')) : null;
        if (textNode) {
          const passage = textNode.textContent.trim();
          const attribution = `\n\n— ${title} (${sectionTitle}), Qisas`;
          copyTextToClipboard(passage + attribution);
          showToast('Passage copied to clipboard');
        }
      });
    });
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    } else {
      fallbackCopyText(text);
    }
  }

  function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.warn('Copy command error:', e);
    }
    document.body.removeChild(ta);
  }

  function showToast(msg) {
    const toast = document.getElementById('qisas-toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2200);
    }
  }

  function saveCurrentReadingProgress() {
    if (!state.activeBook) return;

    if (state.activeBook === 'prophets' && state.activeProphet) {
      const sec = state.activeProphet.sections && state.activeProphet.sections[state.activeSectionIndex];
      const secTitle = sec ? sec.title : '';
      state.progress.prophets = {
        collection: 'prophets',
        id: state.activeProphet.id,
        num: state.activeProphet.num,
        itemTitle: state.activeProphet.name,
        headingTitle: secTitle,
        sectionIndex: state.activeSectionIndex,
        timestamp: Date.now()
      };
      state.progress.lastActiveCollection = 'prophets';
    } else if (state.activeBook === 'companions' && state.activeCompanion) {
      state.progress.companions = {
        collection: 'companions',
        id: state.activeCompanion.id,
        num: state.activeCompanion.num,
        itemTitle: state.activeCompanion.name,
        headingTitle: 'Biography',
        timestamp: Date.now()
      };
      state.progress.lastActiveCollection = 'companions';
    }

    saveProgress();
  }

  // =========================================================================
  // 6. LAST READ FEATURE
  // =========================================================================

  function renderLastReadScreen() {
    const pCard = document.getElementById('card-lastread-prophets');
    const pTitle = document.getElementById('lr-prophet-title');
    const pSubtitle = document.getElementById('lr-prophet-subtitle');
    const pMeta = document.getElementById('lr-prophet-meta');
    const pBtn = document.getElementById('btn-continue-prophets');

    const cCard = document.getElementById('card-lastread-companions');
    const cTitle = document.getElementById('lr-companion-title');
    const cSubtitle = document.getElementById('lr-companion-subtitle');
    const cMeta = document.getElementById('lr-companion-meta');
    const cBtn = document.getElementById('btn-continue-companions');

    if (state.progress.prophets) {
      const p = state.progress.prophets;
      pTitle.textContent = p.itemTitle || 'Stories of the Prophets';
      pSubtitle.textContent = p.headingTitle || 'Reading Session';
      document.getElementById('lr-prophet-page').textContent = p.headingTitle ? `Section: ${p.headingTitle}` : 'In Progress';
      document.getElementById('lr-prophet-date').textContent = new Date(p.timestamp).toLocaleDateString();
      pBtn.disabled = false;
      pBtn.onclick = () => {
        openStoryReader('prophets', p.id || p.num, p.sectionIndex || 0);
      };
    } else {
      pTitle.textContent = 'No reading history';
      pSubtitle.textContent = 'Open Stories of the Prophets to begin reading.';
      document.getElementById('lr-prophet-page').textContent = 'Section --';
      document.getElementById('lr-prophet-date').textContent = '';
      pBtn.disabled = true;
    }

    if (state.progress.companions) {
      const c = state.progress.companions;
      cTitle.textContent = c.itemTitle || 'Stories of the Companions';
      cSubtitle.textContent = 'Biography of the Sahaabah';
      document.getElementById('lr-companion-page').textContent = 'Biography';
      document.getElementById('lr-companion-date').textContent = new Date(c.timestamp).toLocaleDateString();
      cBtn.disabled = false;
      cBtn.onclick = () => {
        openStoryReader('companions', c.id || c.num);
      };
    } else {
      cTitle.textContent = 'No reading history';
      cSubtitle.textContent = 'Open Stories of the Companions to begin reading.';
      document.getElementById('lr-companion-page').textContent = '--';
      document.getElementById('lr-companion-date').textContent = '';
      cBtn.disabled = true;
    }
  }

  function updateMainMenuPreview() {
    const pSub = document.getElementById('menu-prophets-subtitle');
    const cSub = document.getElementById('menu-companions-subtitle');
    const lrBadge = document.getElementById('home-lastread-badge');
    const lrSub = document.getElementById('menu-lastread-subtitle');

    if (pSub) {
      pSub.textContent = '29 Prophets in original sequence • Complete original headings and scripture.';
    }

    if (cSub) {
      cSub.textContent = '60 Noble Companions • Complete original authentic biographies.';
    }

    if (state.progress.lastActiveCollection && state.progress[state.progress.lastActiveCollection]) {
      const coll = state.progress.lastActiveCollection;
      const last = state.progress[coll];
      if (lrBadge) {
        lrBadge.textContent = coll === 'prophets' ? 'LAST READ: STORIES OF THE PROPHETS' : 'LAST READ: STORIES OF THE COMPANIONS';
      }
      if (lrSub) {
        const pagePart = last.headingTitle ? last.headingTitle : 'Reading Session';
        lrSub.textContent = `${last.itemTitle} • ${pagePart}`;
      }
    } else {
      if (lrBadge) {
        lrBadge.textContent = 'READING PROGRESS';
      }
      if (lrSub) {
        lrSub.textContent = 'No recent reading history. Tap to view saved sessions.';
      }
    }
  }

  // =========================================================================
  // 7. BOOKMARKS FEATURE
  // =========================================================================

  function isCurrentPageBookmarked() {
    if (state.activeBook === 'prophets' && state.activeProphet) {
      return state.bookmarks.some(b => 
        b.collection === 'prophets' && b.id === state.activeProphet.id && b.sectionIndex === state.activeSectionIndex
      );
    } else if (state.activeBook === 'companions' && state.activeCompanion) {
      return state.bookmarks.some(b => 
        b.collection === 'companions' && b.id === state.activeCompanion.id
      );
    }
    return false;
  }

  function toggleCurrentBookmark() {
    if (!state.activeBook) return;

    if (state.activeBook === 'prophets' && state.activeProphet) {
      const existingIdx = state.bookmarks.findIndex(b => 
        b.collection === 'prophets' && b.id === state.activeProphet.id && b.sectionIndex === state.activeSectionIndex
      );

      if (existingIdx !== -1) {
        state.bookmarks.splice(existingIdx, 1);
      } else {
        const sec = state.activeProphet.sections && state.activeProphet.sections[state.activeSectionIndex];
        state.bookmarks.unshift({
          bmId: Date.now().toString(),
          collection: 'prophets',
          bookTitle: 'Stories of the Prophets',
          id: state.activeProphet.id,
          num: state.activeProphet.num,
          title: state.activeProphet.name,
          subtitle: sec ? sec.title : '',
          sectionIndex: state.activeSectionIndex,
          timestamp: Date.now()
        });
      }
    } else if (state.activeBook === 'companions' && state.activeCompanion) {
      const existingIdx = state.bookmarks.findIndex(b => 
        b.collection === 'companions' && b.id === state.activeCompanion.id
      );

      if (existingIdx !== -1) {
        state.bookmarks.splice(existingIdx, 1);
      } else {
        state.bookmarks.unshift({
          bmId: Date.now().toString(),
          collection: 'companions',
          bookTitle: 'Stories of the Companions',
          id: state.activeCompanion.id,
          num: state.activeCompanion.num,
          title: state.activeCompanion.name,
          subtitle: 'Biography',
          sectionIndex: 0,
          timestamp: Date.now()
        });
      }
    }

    saveBookmarks();
    updateReaderBookmarkIcon();
  }

  function updateReaderBookmarkIcon() {
    const icon = document.getElementById('svg-bookmark-icon');
    if (!icon) return;

    if (isCurrentPageBookmarked()) {
      icon.setAttribute('fill', '#d4af37');
      icon.style.color = '#d4af37';
    } else {
      icon.setAttribute('fill', 'none');
      icon.style.color = 'currentColor';
    }
  }

  function renderBookmarksModal() {
    const container = document.getElementById('bookmarks-list');
    if (!container) return;
    container.innerHTML = '';

    if (state.bookmarks.length === 0) {
      container.innerHTML = `
        <div class="empty-bookmarks">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          <p>No saved bookmarks yet.</p>
          <span>Use settings or bookmarks while reading to save your favorite sections.</span>
        </div>
      `;
      return;
    }

    state.bookmarks.forEach(bm => {
      const card = document.createElement('div');
      card.className = 'bookmark-card';
      card.innerHTML = `
        <div class="bookmark-left">
          <div class="bm-collection-tag">${escapeHtml(bm.bookTitle || '')}</div>
          <div class="bm-title">${escapeHtml(bm.title || '')}</div>
          <div class="bm-page">${escapeHtml(bm.subtitle || '')} • ${new Date(bm.timestamp).toLocaleDateString()}</div>
        </div>
        <button class="bm-delete-btn" title="Delete Bookmark" aria-label="Delete Bookmark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      card.querySelector('.bookmark-left').addEventListener('click', () => {
        closeModal(modals.bookmarks);
        openStoryReader(bm.collection, bm.id || bm.num, bm.sectionIndex || 0);
      });

      card.querySelector('.bm-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.bookmarks = state.bookmarks.filter(b => b.bmId !== bm.bmId);
        saveBookmarks();
        renderBookmarksModal();
      });

      container.appendChild(card);
    });
  }

  // =========================================================================
  // 8. OFFLINE FULL-TEXT SEARCH
  // =========================================================================

  let currentSearchScope = 'all';

  function executeOfflineSearch(query) {
    const info = document.getElementById('search-results-info');
    const container = document.getElementById('search-results-list');
    if (!container || !info) return;
    container.innerHTML = '';

    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) {
      info.textContent = 'Please enter at least 2 characters to search.';
      return;
    }

    info.textContent = 'Searching original preserved texts...';

    const results = [];
    const maxResults = 80;

    const prophets = getProphetsData();
    const companions = getCompanionsData();

    // 1. Search Stories of the Prophets (Names, Subtitles, and Section Content)
    if (currentSearchScope === 'all' || currentSearchScope === 'prophets') {
      for (const pr of prophets) {
        if (results.length >= maxResults) break;

        const pMatches = pr.name.toLowerCase().includes(q) || (pr.arabic_name && pr.arabic_name.includes(q));

        if (pr.sections && Array.isArray(pr.sections)) {
          pr.sections.forEach((sec, sIdx) => {
            if (results.length >= maxResults) return;

            const titleMatch = sec.title && sec.title.toLowerCase().includes(q);
            const contentIdx = sec.content ? sec.content.toLowerCase().indexOf(q) : -1;

            if (titleMatch || contentIdx !== -1 || pMatches) {
              let snippet = '';
              if (contentIdx !== -1) {
                snippet = createSnippet(sec.content, contentIdx, q.length);
              } else if (titleMatch) {
                snippet = `<strong>Subtitle Heading:</strong> ${escapeHtml(sec.title)} (in story of ${escapeHtml(pr.name)}).`;
              } else {
                snippet = `<strong>Prophet Story:</strong> Complete chapter of ${escapeHtml(pr.name)} as recorded by Ibn Kathir.`;
              }

              results.push({
                collection: 'prophets',
                bookTitle: 'Stories of the Prophets',
                itemTitle: pr.name,
                headingTitle: sec.title,
                id: pr.id,
                sectionIndex: sIdx,
                snippet: snippet
              });
            }
          });
        }
      }
    }

    // 2. Search Stories of the Companions (Names and Biography Content)
    if (currentSearchScope === 'all' || currentSearchScope === 'companions') {
      for (const cp of companions) {
        if (results.length >= maxResults) break;

        const nameMatch = cp.name.toLowerCase().includes(q);
        const contentIdx = cp.content ? cp.content.toLowerCase().indexOf(q) : -1;

        if (nameMatch || contentIdx !== -1) {
          let snippet = '';
          if (contentIdx !== -1) {
            snippet = createSnippet(cp.content, contentIdx, q.length);
          } else {
            snippet = `<strong>Companion Biography:</strong> Complete original biography of ${escapeHtml(cp.name)}.`;
          }

          results.push({
            collection: 'companions',
            bookTitle: 'Stories of the Companions',
            itemTitle: cp.name,
            headingTitle: 'Original Biography',
            id: cp.id,
            sectionIndex: 0,
            snippet: snippet
          });
        }
      }
    }

    renderSearchResults(results, q);
  }

  function createSnippet(text, matchIndex, matchLen) {
    const start = Math.max(0, matchIndex - 60);
    const end = Math.min(text.length, matchIndex + matchLen + 80);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    const safeSnippet = escapeHtml(snippet);
    const escapedTerm = escapeHtml(text.substr(matchIndex, matchLen));
    const reg = new RegExp('(' + escapeRegExp(escapedTerm) + ')', 'gi');
    return safeSnippet.replace(reg, '<mark>$1</mark>');
  }

  function renderSearchResults(results, query) {
    const info = document.getElementById('search-results-info');
    const container = document.getElementById('search-results-list');
    container.innerHTML = '';

    if (results.length === 0) {
      info.textContent = `No matches found for "${query}". Try another prophet, companion, or keyword.`;
      return;
    }

    info.textContent = `Found ${results.length} match${results.length === 1 ? '' : 'es'} for "${query}":`;

    results.forEach(res => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      card.innerHTML = `
        <div class="result-book-badge">${escapeHtml(res.bookTitle)}</div>
        <h4 class="result-title">${escapeHtml(res.itemTitle)}</h4>
        <div class="result-location">${escapeHtml(res.headingTitle)}</div>
        <p class="result-snippet">${res.snippet}</p>
      `;

      card.addEventListener('click', () => {
        closeModal(modals.search);
        openStoryReader(res.collection, res.id, res.sectionIndex || 0);
      });

      container.appendChild(card);
    });
  }

  function updateScopeTabs() {
    document.querySelectorAll('.search-scope-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scope === currentSearchScope);
    });
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // =========================================================================
  // 9. EVENT LISTENERS SETUP
  // =========================================================================

  function initEventListeners() {
    // Main Menu Cards
    document.getElementById('card-nav-prophets').addEventListener('click', () => {
      navigateTo('screen-prophets');
    });

    document.getElementById('card-nav-companions').addEventListener('click', () => {
      navigateTo('screen-companions');
    });

    document.getElementById('card-nav-lastread').addEventListener('click', () => {
      navigateTo('screen-last-read');
    });

    // Back Buttons
    document.getElementById('btn-back-prophets').addEventListener('click', navigateBack);
    document.getElementById('btn-back-headings').addEventListener('click', navigateBack);
    document.getElementById('btn-back-companions').addEventListener('click', navigateBack);
    document.getElementById('btn-back-lastread').addEventListener('click', navigateBack);
    document.getElementById('btn-reader-back').addEventListener('click', navigateBack);

    // Prophet Beginning button
    document.getElementById('btn-start-prophet-beginning').addEventListener('click', () => {
      if (state.selectedProphet) {
        openStoryReader('prophets', state.selectedProphet.id || state.selectedProphet.num, 0);
      }
    });

    // Reader Settings Button
    const btnReaderSettings = document.getElementById('btn-reader-settings');
    if (btnReaderSettings) {
      btnReaderSettings.addEventListener('click', () => {
        openModal(modals.settings);
      });
    }

    // Subtitle Stepper & Dropdown
    const btnPrevSec = document.getElementById('btn-prev-section');
    if (btnPrevSec) {
      btnPrevSec.addEventListener('click', () => {
        if (state.activeBook === 'prophets' && state.activeProphet && state.activeSectionIndex > 0) {
          openStoryReader('prophets', state.activeProphet.id, state.activeSectionIndex - 1);
        }
      });
    }

    const btnNextSec = document.getElementById('btn-next-section');
    if (btnNextSec) {
      btnNextSec.addEventListener('click', () => {
        if (state.activeBook === 'prophets' && state.activeProphet && state.activeProphet.sections && state.activeSectionIndex < state.activeProphet.sections.length - 1) {
          openStoryReader('prophets', state.activeProphet.id, state.activeSectionIndex + 1);
        }
      });
    }

    const selectSection = document.getElementById('select-active-section');
    if (selectSection) {
      selectSection.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        if (!isNaN(idx) && state.activeProphet) {
          openStoryReader('prophets', state.activeProphet.id, idx);
        }
      });
    }

    // Header Settings Icon
    document.getElementById('btn-settings-header').addEventListener('click', () => {
      openModal(modals.settings);
    });

    // Top Middle Search Logo on Main Menu
    const btnSearch = document.getElementById('btn-open-search');
    if (btnSearch) {
      btnSearch.addEventListener('click', () => {
        openModal(modals.search);
        currentSearchScope = 'all';
        updateScopeTabs();
        setTimeout(() => {
          const inp = document.getElementById('input-global-search');
          if (inp) inp.focus();
        }, 120);
      });
    }

    const btnBookmarks = document.getElementById('btn-open-bookmarks');
    if (btnBookmarks) {
      btnBookmarks.addEventListener('click', () => {
        renderBookmarksModal();
        openModal(modals.bookmarks);
      });
    }

    // Modal Close Buttons
    document.getElementById('btn-close-search').addEventListener('click', () => closeModal(modals.search));
    document.getElementById('btn-close-bookmarks').addEventListener('click', () => closeModal(modals.bookmarks));
    document.getElementById('btn-close-settings').addEventListener('click', () => closeModal(modals.settings));

    // Close modals by clicking backdrop
    Object.values(modals).forEach(m => {
      if (m) {
        m.addEventListener('click', (e) => {
          if (e.target === m) closeModal(m);
        });
      }
    });

    // Search Scope Tabs
    document.querySelectorAll('.search-scope-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSearchScope = btn.dataset.scope;
        updateScopeTabs();
        const val = document.getElementById('input-global-search').value;
        if (val.trim()) {
          executeOfflineSearch(val);
        }
      });
    });

    // Search Execution
    document.getElementById('btn-execute-search').addEventListener('click', () => {
      const val = document.getElementById('input-global-search').value;
      executeOfflineSearch(val);
    });

    document.getElementById('input-global-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeOfflineSearch(e.target.value);
      }
    });

    // Settings Theme Choice Buttons
    document.querySelectorAll('.theme-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
      });
    });

    // Reading Text Size Interactive Adjustable Slider
    const fontSlider = document.getElementById('slider-text-size');
    if (fontSlider) {
      fontSlider.value = String(state.settings.fontSize || 18);
      fontSlider.addEventListener('input', (e) => {
        const newSize = parseInt(e.target.value, 10);
        if (isNaN(newSize)) return;
        applyFontSize(newSize);
        saveSettings();
      });
    }

    // Reset Font Size to Default
    const btnResetFont = document.getElementById('btn-reset-font-size');
    if (btnResetFont) {
      btnResetFont.addEventListener('click', () => {
        const defaultSize = 18;
        applyFontSize(defaultSize);
        const sl = document.getElementById('slider-text-size');
        if (sl) sl.value = String(defaultSize);
        saveSettings();
      });
    }

    // Typography Font Family Setting
    const familySelect = document.getElementById('select-font-family');
    if (familySelect) {
      familySelect.addEventListener('change', (e) => {
        applyFontFamily(e.target.value);
      });
    }

    // Narrator Persona & Voice Settings
    const personaSelect = document.getElementById('select-tts-persona');
    if (personaSelect) {
      personaSelect.value = state.settings.ttsPersona || 'balanced';
      personaSelect.addEventListener('change', (e) => {
        state.settings.ttsPersona = e.target.value;
        saveSettings();
      });
    }

    const voiceSelect = document.getElementById('select-tts-voice');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
        state.settings.ttsVoiceURI = e.target.value;
        saveSettings();
      });
    }

    // Default Reading Speed
    const speedSelect = document.getElementById('select-tts-default-speed');
    if (speedSelect) {
      speedSelect.value = String(state.settings.ttsDefaultSpeed !== undefined ? state.settings.ttsDefaultSpeed : 1.0);
      speedSelect.addEventListener('change', (e) => {
        state.settings.ttsDefaultSpeed = parseFloat(e.target.value) || 1.0;
        saveSettings();
        // If TTS is currently defined and rate label exists, synchronize
        document.dispatchEvent(new CustomEvent('tts-default-speed-changed', { detail: { speed: state.settings.ttsDefaultSpeed } }));
      });
    }

    // Continuous Listening Toggle (Auto-Play Next Section)
    const autoNextToggle = document.getElementById('toggle-tts-autonext');
    if (autoNextToggle) {
      autoNextToggle.checked = state.settings.ttsAutoNext !== undefined ? state.settings.ttsAutoNext : true;
      autoNextToggle.addEventListener('change', (e) => {
        state.settings.ttsAutoNext = e.target.checked;
        saveSettings();
      });
    }

    // Spoken Highlight Style
    const highlightStyleSelect = document.getElementById('select-tts-highlight-style');
    if (highlightStyleSelect) {
      highlightStyleSelect.value = state.settings.ttsHighlightStyle || 'tint_bar';
      highlightStyleSelect.addEventListener('change', (e) => {
        state.settings.ttsHighlightStyle = e.target.value;
        saveSettings();
      });
    }

    // App Preferences: Keep screen awake while listening
    const wakeLockToggle = document.getElementById('toggle-wake-lock');
    if (wakeLockToggle) {
      wakeLockToggle.checked = state.settings.wakeLockListening !== undefined ? state.settings.wakeLockListening : true;
      wakeLockToggle.addEventListener('change', (e) => {
        state.settings.wakeLockListening = e.target.checked;
        saveSettings();
      });
    }

    // App Preferences: Auto-scroll while listening
    const autoScrollToggle = document.getElementById('toggle-auto-scroll');
    if (autoScrollToggle) {
      autoScrollToggle.checked = state.settings.autoScrollListening !== undefined ? state.settings.autoScrollListening : true;
      autoScrollToggle.addEventListener('change', (e) => {
        state.settings.autoScrollListening = e.target.checked;
        saveSettings();
      });
    }

    // App Preferences: Highlight current sentence
    const highlightSentenceToggle = document.getElementById('toggle-highlight-sentence');
    if (highlightSentenceToggle) {
      highlightSentenceToggle.checked = state.settings.highlightSentence !== undefined ? state.settings.highlightSentence : true;
      highlightSentenceToggle.addEventListener('change', (e) => {
        state.settings.highlightSentence = e.target.checked;
        saveSettings();
      });
    }

    const btnPreviewVoice = document.getElementById('btn-preview-tts');
    const previewLabel = document.getElementById('preview-tts-label');
    if (btnPreviewVoice && ('speechSynthesis' in window)) {
      btnPreviewVoice.addEventListener('click', () => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          btnPreviewVoice.classList.remove('is-speaking');
          if (previewLabel) previewLabel.textContent = 'Preview Reader Voice';
          return;
        }

        const sampleText = "In the name of Allah, Most Gracious, Most Merciful. Welcome to Qisas.";
        const testUtt = new SpeechSynthesisUtterance(sampleText);
        configureUtterance(testUtt, 1.0);

        btnPreviewVoice.classList.add('is-speaking');
        if (previewLabel) previewLabel.textContent = 'Speaking sample... (Tap to stop)';

        testUtt.onend = () => {
          btnPreviewVoice.classList.remove('is-speaking');
          if (previewLabel) previewLabel.textContent = 'Preview Reader Voice';
        };
        testUtt.onerror = () => {
          btnPreviewVoice.classList.remove('is-speaking');
          if (previewLabel) previewLabel.textContent = 'Preview Reader Voice';
        };

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(testUtt);
      });
    }

    // Zen Mode Toggles
    const btnToggleZen = document.getElementById('btn-toggle-zen');
    if (btnToggleZen) {
      btnToggleZen.addEventListener('click', () => {
        document.body.classList.toggle('zen-mode');
      });
    }

    const btnExitZen = document.getElementById('btn-exit-zen');
    if (btnExitZen) {
      btnExitZen.addEventListener('click', () => {
        document.body.classList.remove('zen-mode');
      });
    }

    // Scroll Progress Tracker
    const readerMain = document.getElementById('story-reader-main');
    const progressBar = document.getElementById('reader-reading-progress');
    if (readerMain && progressBar) {
      readerMain.addEventListener('scroll', () => {
        const totalHeight = readerMain.scrollHeight - readerMain.clientHeight;
        if (totalHeight > 0) {
          const pct = Math.min(100, Math.max(0, (readerMain.scrollTop / totalHeight) * 100));
          progressBar.style.width = pct + '%';
        } else {
          progressBar.style.width = '0%';
        }
      });
    }

    // Reset Progress Confirmation
    document.getElementById('btn-reset-progress').addEventListener('click', () => {
      openModal(modals.confirm);
    });

    document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
      closeModal(modals.confirm);
    });

    document.getElementById('btn-confirm-proceed').addEventListener('click', () => {
      state.progress = { prophets: null, companions: null, lastActiveCollection: null };
      state.bookmarks = [];
      saveProgress();
      saveBookmarks();
      closeModal(modals.confirm);
      closeModal(modals.settings);
      renderLastReadScreen();
      updateMainMenuPreview();
    });
  }

  function openModal(modal) {
    if (modal) modal.classList.add('active');
  }

  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }

  // =========================================================================
  // 10. INITIALIZATION & SPLASH INTRO
  // =========================================================================

  function initSplashScreen() {
    const splash = document.getElementById('splash-screen');
    const container = document.getElementById('splash-loader-container');
    const skipBtn = document.getElementById('btn-skip-splash');
    if (!splash) return;

    let dismissed = false;
    function dismissSplash() {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add('fade-out');
      setTimeout(() => {
        if (splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }
      }, 700);
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', dismissSplash);
    }

    // Start 4-second progress animation slightly after DOM paints
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (container) container.classList.add('start-loading');
      }, 60);
    });

    // Automatically transition to main menu after 4 seconds (4000ms)
    setTimeout(dismissSplash, 4100);
  }

  // ===========================================================================
  // TEXT-TO-SPEECH (TTS) CONFIGURATION & ENGINE
  // Uses Web Speech API (SpeechSynthesis) — 100% offline via device TTS engine
  // ===========================================================================

  const TTS_PERSONAS = {
    balanced: {
      pitch: 1.0,
      rateMod: 1.0,
      gender: null
    },
    male_mature: {
      pitch: 0.82,
      rateMod: 0.95,
      gender: 'male'
    },
    elder: {
      pitch: 0.68,
      rateMod: 0.88,
      gender: 'male'
    },
    female_gentle: {
      pitch: 1.18,
      rateMod: 1.0,
      gender: 'female'
    },
    young_clear: {
      pitch: 1.38,
      rateMod: 1.05,
      gender: null
    }
  };

  function configureUtterance(utt, baseRate) {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices() || [];
    const personaKey = state.settings.ttsPersona || 'balanced';
    const persona = TTS_PERSONAS[personaKey] || TTS_PERSONAS.balanced;

    let chosenVoice = null;

    // 1. Explicit user choice from settings dropdown
    if (state.settings.ttsVoiceURI) {
      chosenVoice = voices.find(v => (v.voiceURI === state.settings.ttsVoiceURI) || (v.name === state.settings.ttsVoiceURI));
    }

    // 2. Persona preference based on gender if available
    if (!chosenVoice && persona.gender) {
      const enVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
      const pool = enVoices.length ? enVoices : voices;

      chosenVoice = pool.find(v => {
        const info = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
        if (persona.gender === 'female') {
          return info.includes('female') || info.includes('zira') || info.includes('samantha') || 
                 info.includes('victoria') || info.includes('karen') || info.includes('hazel') || 
                 info.includes('susan') || info.includes('catherine');
        } else if (persona.gender === 'male') {
          return info.includes('male') || info.includes('david') || info.includes('mark') || 
                 info.includes('george') || info.includes('richard');
        }
        return false;
      });
    }

    // 3. Fallback to primary English voice or first device voice
    if (!chosenVoice && voices.length) {
      chosenVoice = voices.find(v => (v.lang || '').toLowerCase().startsWith('en')) || voices[0];
    }

    if (chosenVoice) {
      utt.voice = chosenVoice;
      utt.lang = chosenVoice.lang || 'en-US';
    } else {
      utt.lang = 'en-US';
    }

    utt.pitch = persona.pitch;
    utt.rate = (baseRate || 1.0) * persona.rateMod;
  }

  function populateTTSVoicesDropdown() {
    const voiceSelect = document.getElementById('select-tts-voice');
    if (!voiceSelect || !('speechSynthesis' in window)) return;

    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return;

    const savedVoiceURI = state.settings.ttsVoiceURI || '';
    voiceSelect.innerHTML = '<option value="">Auto (Matches Reader Persona)</option>';

    // Sort English voices first, then alphabetically
    const sorted = voices.slice().sort((a, b) => {
      const aEn = (a.lang || '').toLowerCase().startsWith('en') ? 0 : 1;
      const bEn = (b.lang || '').toLowerCase().startsWith('en') ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return (a.name || '').localeCompare(b.name || '');
    });

    sorted.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.name;

      let genderHint = '';
      const info = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
      if (info.includes('female') || info.includes('zira') || info.includes('samantha') || 
          info.includes('victoria') || info.includes('karen') || info.includes('hazel') || 
          info.includes('susan') || info.includes('catherine')) {
        genderHint = ' [Female]';
      } else if (info.includes('male') || info.includes('david') || info.includes('mark') || 
                 info.includes('george') || info.includes('richard')) {
        genderHint = ' [Male]';
      }

      opt.textContent = `${v.name}${genderHint} (${v.lang})`;
      if (savedVoiceURI && (v.voiceURI === savedVoiceURI || v.name === savedVoiceURI)) {
        opt.selected = true;
      }
      voiceSelect.appendChild(opt);
    });
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      populateTTSVoicesDropdown();
    };
  }

  function initTTS() {
    if (!('speechSynthesis' in window)) return; // device has no TTS

    const tts = {
      synth: window.speechSynthesis,
      chunks: [],        // array of paragraph text strings
      chunkIndex: 0,
      paused: false,
      active: false,
      rate: state.settings.ttsDefaultSpeed !== undefined ? state.settings.ttsDefaultSpeed : 1.0,
      highlightEl: null, // span currently highlighted
      isAutoAdvancing: false
    };

    const RATES = [0.5, 0.7, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0];

    // DOM refs
    const bar          = document.getElementById('tts-bar');
    const idleRow      = document.getElementById('tts-idle-row');
    const playerRow    = document.getElementById('tts-player-row');
    const btnStart     = document.getElementById('btn-tts-start');
    const btnPlayPause = document.getElementById('btn-tts-playpause');
    const btnRestart   = document.getElementById('btn-tts-restart');
    const btnSkip      = document.getElementById('btn-tts-skip');
    const btnStop      = document.getElementById('btn-tts-stop');
    const btnSpeedUp   = document.getElementById('btn-tts-speed-up');
    const btnSpeedDn   = document.getElementById('btn-tts-speed-down');
    const speedLabel   = document.getElementById('tts-speed-label');
    const progressFill = document.getElementById('tts-progress-fill');
    const chunkLabel   = document.getElementById('tts-chunk-label');
    const iconPause    = document.getElementById('tts-icon-pause');
    const iconPlay     = document.getElementById('tts-icon-play');

    if (!bar || !btnStart) return;

    if (speedLabel) speedLabel.textContent = (tts.rate).toFixed(1) + '×';

    // Sync speed when updated in settings
    document.addEventListener('tts-default-speed-changed', (e) => {
      const sp = e.detail && e.detail.speed ? e.detail.speed : 1.0;
      tts.rate = sp;
      if (speedLabel) speedLabel.textContent = (tts.rate).toFixed(1) + '×';
      if (tts.active && !tts.paused) {
        tts.synth.cancel();
        speakChunk(tts.chunkIndex);
      }
    });

    populateTTSVoicesDropdown();

    // Show/hide bar when reader opens or closes
    function showBar()  { document.body.classList.add('reader-active'); }
    function hideBar()  { document.body.classList.remove('reader-active'); stopTTS(); }

    // Intercept existing screen navigation to toggle bar
    const origNavigateTo = window.navigateTo;
    document.addEventListener('reader-opened', showBar);
    document.addEventListener('reader-closed', hideBar);

    // Also watch navigateTo — hook into showScreen
    const _origShowScreen = window._showScreen;

    // We patch the internal showScreen used by the app
    // by observing classList changes on screen-reader
    const readerScreen = document.getElementById('screen-reader');
    if (readerScreen) {
      const obs = new MutationObserver(() => {
        if (readerScreen.classList.contains('active')) { showBar(); }
        else { hideBar(); }
      });
      obs.observe(readerScreen, { attributes: true, attributeFilter: ['class'] });
    }

    // ---- Extract paragraphs from current article ----
    function extractChunks() {
      const article = document.getElementById('reader-story-article');
      if (!article) return [];
      const paras = article.querySelectorAll('p, .story-paragraph-wrapper p, h2, h3, blockquote');
      const result = [];
      paras.forEach(p => {
        const txt = p.innerText.trim();
        if (txt.length > 2) result.push({ el: p, text: txt });
      });
      return result;
    }

    // ---- Long-press to pick start point ----
    // A floating pill appears near the paragraph: "▶ Play from here"
    let longPressTimer = null;
    let ttsPopup = null;

    function removeTTSPopup() {
      if (ttsPopup) { ttsPopup.remove(); ttsPopup = null; }
    }

    function showPlayFromHerePopup(paraEl, chunkIdx) {
      removeTTSPopup();
      const popup = document.createElement('div');
      popup.className = 'tts-from-here-popup';
      popup.textContent = '▶ Play from here';
      popup.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTTSPopup();
        // prepare chunks if not already active
        if (!tts.active) {
          tts.chunks = extractChunks();
        }
        tts.active = true;
        tts.paused = false;
        requestTTSWakeLock();
        idleRow.style.display = 'none';
        playerRow.style.display = 'flex';
        setPlayingIcon(true);
        speakChunk(chunkIdx);
      });

      // Position popup near the paragraph
      const rect = paraEl.getBoundingClientRect();
      popup.style.top  = (rect.top + window.scrollY - 44) + 'px';
      popup.style.left = Math.max(8, rect.left + (rect.width / 2) - 70) + 'px';
      document.body.appendChild(popup);
      ttsPopup = popup;

      // Auto-dismiss after 4s
      setTimeout(removeTTSPopup, 4000);
    }

    function attachLongPressToArticle() {
      const article = document.getElementById('reader-story-article');
      if (!article) return;

      article.addEventListener('pointerdown', (e) => {
        const wrapper = e.target.closest('.story-paragraph-wrapper');
        if (!wrapper) return;
        longPressTimer = setTimeout(() => {
          // find which chunk this paragraph maps to
          const chunks = extractChunks();
          const paraEl = wrapper.querySelector('p, blockquote');
          if (!paraEl) return;
          const idx = chunks.findIndex(c => c.el === paraEl);
          if (idx === -1) return;
          tts.chunks = chunks; // cache for later use
          showPlayFromHerePopup(paraEl, idx);
        }, 500); // 500ms long press
      });

      article.addEventListener('pointerup',    () => clearTimeout(longPressTimer));
      article.addEventListener('pointermove',  () => clearTimeout(longPressTimer));
      article.addEventListener('pointercancel',() => clearTimeout(longPressTimer));
    }

    // Attach on every story load (article content is re-rendered each time)
    document.addEventListener('story-rendered', attachLongPressToArticle);
    // Also dismiss popup on any tap elsewhere
    document.addEventListener('pointerdown', (e) => {
      if (ttsPopup && !ttsPopup.contains(e.target)) removeTTSPopup();
    });

    // Screen Wake Lock while listening
    let ttsWakeLock = null;

    async function requestTTSWakeLock() {
      if ('wakeLock' in navigator && state.settings.wakeLockListening) {
        try {
          if (!ttsWakeLock) {
            ttsWakeLock = await navigator.wakeLock.request('screen');
            ttsWakeLock.addEventListener('release', () => {
              ttsWakeLock = null;
            });
          }
        } catch (err) {
          console.warn('Screen WakeLock error:', err);
        }
      }
    }

    function releaseTTSWakeLock() {
      if (ttsWakeLock) {
        ttsWakeLock.release().catch(() => {});
        ttsWakeLock = null;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && tts.active && !tts.paused) {
        requestTTSWakeLock();
      }
    });

    // Real-time sentence boundary highlight
    let currentChunkSentences = [];
    let sentenceTimer = null;

    function clearSentenceTimer() {
      if (sentenceTimer) {
        clearTimeout(sentenceTimer);
        sentenceTimer = null;
      }
    }

    function prepareParagraphSentences(el) {
      if (!el) return [];
      if (el.dataset.sentencesPrepared === 'true') {
        return Array.from(el.querySelectorAll('.tts-sentence'));
      }
      el.dataset.sentencesPrepared = 'true';
      const rawText = el.textContent || '';
      if (!rawText.trim()) return [];

      // Match sentences including trailing punctuation, quotes, and brackets
      const sentenceRegex = /[^.!?]+(?:[.!?]+["'”’)]*)(?:\s+|$)|[^.!?]+$/g;
      let match;
      let html = '';
      let count = 0;
      while ((match = sentenceRegex.exec(rawText)) !== null) {
        const sText = match[0];
        const start = match.index;
        const end = match.index + sText.length;
        html += `<span class="tts-sentence" data-start="${start}" data-end="${end}">${escapeHtml(sText)}</span>`;
        count++;
      }
      if (!count) {
        html = `<span class="tts-sentence" data-start="0" data-end="${rawText.length}">${escapeHtml(rawText)}</span>`;
      }
      el.innerHTML = html;
      return Array.from(el.querySelectorAll('.tts-sentence'));
    }

    // ---- Update progress UI ----
    function updateProgress() {
      const total = tts.chunks.length;
      const pct = total > 0 ? Math.round((tts.chunkIndex / total) * 100) : 0;
      progressFill.style.width = pct + '%';
      chunkLabel.textContent = (tts.chunkIndex) + ' / ' + total;
    }

    // ---- Clear word highlight ----
    function clearHighlight() {
      clearSentenceTimer();
      if (tts.highlightEl) {
        tts.highlightEl.classList.remove('tts-para-active', 'style-tint_bar', 'style-bar_only', 'style-underline', 'tts-word-highlight');
        tts.highlightEl = null;
      }
      // also clear any paragraph-level highlight
      document.querySelectorAll('.tts-para-active').forEach(el => {
        el.classList.remove('tts-para-active', 'style-tint_bar', 'style-bar_only', 'style-underline');
      });
      document.querySelectorAll('.tts-sentence-active').forEach(el => {
        el.classList.remove('tts-sentence-active');
      });
      currentChunkSentences = [];
    }

    // ---- Highlight paragraph being read & scroll to it ----
    function highlightChunk(idx) {
      clearHighlight();
      if (!tts.chunks[idx]) return;
      const el = tts.chunks[idx].el;
      const style = state.settings.ttsHighlightStyle || 'tint_bar';
      el.classList.add('tts-para-active', `style-${style}`);
      tts.highlightEl = el;

      // Auto-scroll while listening (if enabled in preferences)
      if (state.settings.autoScrollListening !== false) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Prepare sentences if sentence highlight is enabled and highlight first sentence immediately
      if (state.settings.highlightSentence !== false) {
        currentChunkSentences = prepareParagraphSentences(el);
        if (currentChunkSentences.length) {
          currentChunkSentences.forEach((s, sIdx) => {
            s.classList.toggle('tts-sentence-active', sIdx === 0);
          });
        }
      } else {
        currentChunkSentences = [];
      }
    }

    // ---- Speak a single chunk ----
    function speakChunk(idx) {
      if (idx >= tts.chunks.length) {
        clearSentenceTimer();
        // finished all chunks in current section
        if (state.settings.ttsAutoNext) {
          tts.isAutoAdvancing = true;
          const advanced = advanceToNextStoryOrSection();
          if (advanced) {
            setTimeout(() => {
              tts.isAutoAdvancing = false;
              if (tts.active) {
                tts.chunks = extractChunks();
                if (tts.chunks.length) {
                  tts.chunkIndex = 0;
                  speakChunk(0);
                  return;
                }
              }
              stopTTS();
            }, 400);
            return;
          }
          tts.isAutoAdvancing = false;
        }
        stopTTS();
        return;
      }
      tts.chunkIndex = idx;
      updateProgress();
      highlightChunk(idx);

      const utt = new SpeechSynthesisUtterance(tts.chunks[idx].text);
      configureUtterance(utt, tts.rate);

      clearSentenceTimer();
      let boundaryFired = false;

      // Sentence boundary event for real-time sentence highlighting
      utt.onboundary = (e) => {
        boundaryFired = true;
        if (state.settings.highlightSentence === false) return;
        const charIdx = e.charIndex;
        if (charIdx === undefined || !currentChunkSentences.length) return;
        for (let i = 0; i < currentChunkSentences.length; i++) {
          const span = currentChunkSentences[i];
          const start = parseInt(span.dataset.start, 10);
          const end = parseInt(span.dataset.end, 10);
          if (charIdx >= start && charIdx < end) {
            if (!span.classList.contains('tts-sentence-active')) {
              currentChunkSentences.forEach(s => s.classList.remove('tts-sentence-active'));
              span.classList.add('tts-sentence-active');
            }
            break;
          }
        }
      };

      // Fallback timer: if the device TTS doesn't fire onboundary events, advance sentences smoothly
      if (currentChunkSentences.length > 1) {
        let curSIdx = 0;
        function scheduleSentenceFallback() {
          clearSentenceTimer();
          if (boundaryFired || !tts.active || tts.paused) return;
          if (curSIdx >= currentChunkSentences.length - 1) return;

          const sText = currentChunkSentences[curSIdx].textContent || '';
          const wordCount = sText.trim().split(/\s+/).length || 5;
          const wordsPerSec = (140 / 60) * (tts.rate || 1.0);
          const durationMs = Math.max(1200, (wordCount / wordsPerSec) * 1000);

          sentenceTimer = setTimeout(() => {
            if (boundaryFired || !tts.active || tts.paused) return;
            curSIdx++;
            if (currentChunkSentences[curSIdx]) {
              currentChunkSentences.forEach(s => s.classList.remove('tts-sentence-active'));
              currentChunkSentences[curSIdx].classList.add('tts-sentence-active');
              scheduleSentenceFallback();
            }
          }, durationMs);
        }
        scheduleSentenceFallback();
      }

      utt.onend = () => {
        clearSentenceTimer();
        if (!tts.paused && tts.active) {
          speakChunk(idx + 1);
        }
      };
      utt.onerror = (e) => {
        clearSentenceTimer();
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        // skip broken chunk
        if (tts.active) speakChunk(idx + 1);
      };

      tts.synth.cancel(); // clear queue
      tts.synth.speak(utt);
    }

    // ---- Find first paragraph visible in the viewport ----
    function findVisibleChunkIndex(chunks) {
      const container = document.getElementById('story-reader-container');
      const containerTop = container ? container.scrollTop : 0;
      const viewportMid = containerTop + (window.innerHeight * 0.35);

      let closest = 0;
      let closestDist = Infinity;

      chunks.forEach((chunk, i) => {
        const rect = chunk.el.getBoundingClientRect();
        // getBoundingClientRect is relative to viewport
        if (rect.top >= 0 && rect.top < window.innerHeight) {
          const dist = Math.abs(rect.top - window.innerHeight * 0.25);
          if (dist < closestDist) {
            closestDist = dist;
            closest = i;
          }
        }
      });
      return closest;
    }

    // ---- Start TTS ----
    function startTTS() {
      tts.chunks = extractChunks();
      if (!tts.chunks.length) return;
      tts.active = true;
      tts.paused = false;

      requestTTSWakeLock();

      // Start from the paragraph currently visible on screen,
      // not from the very beginning — so it continues where you left off reading
      tts.chunkIndex = findVisibleChunkIndex(tts.chunks);

      // switch UI
      idleRow.style.display = 'none';
      playerRow.style.display = 'flex';
      setPlayingIcon(true);
      speakChunk(tts.chunkIndex);
    }

    // ---- Stop TTS ----
    function stopTTS() {
      tts.active = false;
      tts.paused = false;
      tts.synth.cancel();
      releaseTTSWakeLock();
      clearHighlight();
      // reset UI to idle
      idleRow.style.display = '';
      playerRow.style.display = 'none';
      progressFill.style.width = '0%';
      chunkLabel.textContent = '0 / 0';
    }

    // ---- Toggle pause/resume ----
    function togglePause() {
      if (!tts.active) return;
      if (tts.paused) {
        tts.paused = false;
        requestTTSWakeLock();
        setPlayingIcon(true);
        speakChunk(tts.chunkIndex); // resume from current chunk
      } else {
        tts.paused = true;
        tts.synth.cancel();
        releaseTTSWakeLock();
        setPlayingIcon(false);
      }
    }

    // ---- Skip to next paragraph ----
    function skipChunk() {
      if (!tts.active) return;
      tts.synth.cancel();
      speakChunk(tts.chunkIndex + 1);
    }

    // ---- Restart ----
    function restartTTS() {
      tts.synth.cancel();
      tts.paused = false;
      setPlayingIcon(true);
      speakChunk(0);
    }

    // ---- Speed control ----
    function changeSpeed(dir) {
      const rateIdx = RATES.indexOf(tts.rate);
      const newIdx = Math.min(Math.max(rateIdx + dir, 0), RATES.length - 1);
      tts.rate = RATES[newIdx];
      speedLabel.textContent = tts.rate.toFixed(1) + '×';
      // if playing, restart current chunk at new rate
      if (tts.active && !tts.paused) {
        tts.synth.cancel();
        speakChunk(tts.chunkIndex);
      }
    }

    // ---- Icon helper ----
    function setPlayingIcon(playing) {
      iconPause.style.display = playing ? '' : 'none';
      iconPlay.style.display  = playing ? 'none' : '';
    }

    // ---- Also stop TTS when navigating away from reader ----
    function onScreenChange() {
      if (!readerScreen.classList.contains('active')) {
        stopTTS();
      }
    }

    // ---- Wire up buttons ----
    btnStart.addEventListener('click', startTTS);
    btnPlayPause.addEventListener('click', togglePause);
    btnRestart.addEventListener('click', restartTTS);
    btnSkip.addEventListener('click', skipChunk);
    btnStop.addEventListener('click', stopTTS);
    btnSpeedUp.addEventListener('click', () => changeSpeed(1));
    btnSpeedDn.addEventListener('click', () => changeSpeed(-1));

    // Stop when story changes (new section loaded by user)
    document.addEventListener('story-section-changed', () => {
      if (tts.active && !tts.isAutoAdvancing) stopTTS();
    });
  }

  function initApp() {
    loadPersistedData();
    initProphetsList();
    initCompanionsList();
    initEventListeners();
    updateMainMenuPreview();
    initSplashScreen();
    initTTS();
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
