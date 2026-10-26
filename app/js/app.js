/**
 * Qisas - Offline Digital Reading Application
 * Core Application Logic & PDF Rendering Controller
 */

(function () {
  'use strict';

  // Configure PDF.js Worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.js';
  }

  // Application State
  const state = {
    currentScreen: 'screen-main-menu',
    navigationHistory: ['screen-main-menu'],
    activeBook: null, // 'prophets' or 'companions'
    currentPdfDoc: null,
    currentPageNum: 1,
    totalPages: 1,
    currentScale: 1.25,
    pageRendering: false,
    pageNumPending: null,
    
    // Catalogs loaded from data files
    prophets: window.PROPHETS_DATA || [],
    companions: window.COMPANIONS_DATA || [],
    
    // Active selections
    selectedProphet: null,
    selectedCompanion: null,
    selectedHeading: null,

    // Reading progress & bookmarks (persisted in localStorage)
    progress: {
      prophets: null,
      companions: null,
      lastActiveCollection: null
    },
    bookmarks: [],
    settings: {
      theme: 'theme-light',
      defaultZoom: 1.25
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

    applyTheme(state.settings.theme);
    state.currentScale = state.settings.defaultZoom || 1.25;
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

    // Update settings modal buttons
    document.querySelectorAll('.theme-choice-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === themeClass);
    });
  }

  // =========================================================================
  // 2. SCREEN NAVIGATION SYSTEM
  // =========================================================================

  function navigateTo(screenId, pushHistory = true) {
    if (state.currentScreen === screenId) return;

    // Hide all screens
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

    // Refresh specific screens when opened
    if (screenId === 'screen-last-read') {
      renderLastReadScreen();
    } else if (screenId === 'screen-main-menu') {
      updateMainMenuPreview();
    }
  }

  function navigateBack() {
    if (state.navigationHistory.length > 1) {
      state.navigationHistory.pop(); // Remove current
      const prevScreenId = state.navigationHistory[state.navigationHistory.length - 1];
      navigateTo(prevScreenId, false);
    } else {
      navigateTo('screen-main-menu', false);
    }
  }

  // Handle hardware / browser back button (Android back button)
  window.addEventListener('popstate', function (e) {
    // If a modal is open, close it first
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

  // Modal helpers
  function openModal(modal) {
    if (modal) modal.classList.add('active');
  }

  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }

  // =========================================================================
  // 3. PROPHETS FLOW (Main Menu -> Prophets List -> Headings -> Reader)
  // =========================================================================

  function initProphetsList() {
    const container = document.getElementById('prophets-list');
    const filterInput = document.getElementById('input-filter-prophets');

    function renderList(filterText = '') {
      container.innerHTML = '';
      const filter = filterText.toLowerCase().trim();

      state.prophets.forEach(p => {
        if (filter && !p.name.toLowerCase().includes(filter)) {
          return;
        }

        const card = document.createElement('div');
        card.className = 'list-item-card';
        card.innerHTML = `
          <div class="item-left">
            <div class="item-number">${p.num}</div>
            <div class="item-info">
              <div class="item-title">${p.name}</div>
              <div class="item-subtext">Pages ${p.start_page} – ${p.end_page} • ${p.headings ? p.headings.length : 0} sections</div>
            </div>
          </div>
          <div class="item-right-badge">View Sections</div>
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
    metaElem.textContent = `Pages ${prophet.start_page} – ${prophet.end_page} • ${prophet.headings ? prophet.headings.length : 0} Original Headings`;

    container.innerHTML = '';

    if (prophet.headings && prophet.headings.length > 0) {
      prophet.headings.forEach((h, idx) => {
        const card = document.createElement('div');
        card.className = 'list-item-card';
        card.innerHTML = `
          <div class="item-left">
            <div class="item-number">${idx + 1}</div>
            <div class="item-info">
              <div class="item-title">${h.title}</div>
              <div class="item-subtext">Page ${h.page}</div>
            </div>
          </div>
          <div class="item-right-badge">Read</div>
        `;

        card.addEventListener('click', () => {
          state.selectedHeading = h;
          openReader('prophets', h.page, prophet.name, h.title);
        });

        container.appendChild(card);
      });
    } else {
      container.innerHTML = `
        <div class="list-item-card" id="btn-read-single-story">
          <div class="item-left">
            <div class="item-number">1</div>
            <div class="item-info">
              <div class="item-title">${prophet.name}</div>
              <div class="item-subtext">Page ${prophet.start_page}</div>
            </div>
          </div>
          <div class="item-right-badge">Read Story</div>
        </div>
      `;
      const singleBtn = document.getElementById('btn-read-single-story');
      if (singleBtn) {
        singleBtn.addEventListener('click', () => {
          openReader('prophets', prophet.start_page, prophet.name, 'Full Story');
        });
      }
    }

    navigateTo('screen-prophet-headings');
  }

  // =========================================================================
  // 4. COMPANIONS FLOW (Main Menu -> Companions List -> Original Biography)
  // =========================================================================

  function initCompanionsList() {
    const container = document.getElementById('companions-list');
    const filterInput = document.getElementById('input-filter-companions');

    function renderList(filterText = '') {
      container.innerHTML = '';
      const filter = filterText.toLowerCase().trim();

      state.companions.forEach(c => {
        if (filter && !c.name.toLowerCase().includes(filter)) {
          return;
        }

        const card = document.createElement('div');
        card.className = 'list-item-card';
        card.innerHTML = `
          <div class="item-left">
            <div class="item-number">${c.num}</div>
            <div class="item-info">
              <div class="item-title">${c.name}</div>
              <div class="item-subtext">Pages ${c.start_page} – ${c.end_page}</div>
            </div>
          </div>
          <div class="item-right-badge">Read Biography</div>
        `;

        card.addEventListener('click', () => {
          state.selectedCompanion = c;
          openReader('companions', c.start_page, c.name, 'Original Biography');
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
  // 5. LAST READ MANAGEMENT
  // =========================================================================

  function updateMainMenuPreview() {
    const badge = document.getElementById('home-lastread-badge');
    const preview = document.getElementById('home-lastread-preview');

    const lastCol = state.progress.lastActiveCollection;
    const session = lastCol ? state.progress[lastCol] : (state.progress.prophets || state.progress.companions);

    if (session) {
      badge.textContent = `Last Read: ${session.bookTitle}`;
      preview.textContent = `${session.itemTitle} • Page ${session.page}`;
    } else {
      badge.textContent = 'Reading Progress';
      preview.textContent = 'No recent reading history. Tap to view saved sessions.';
    }
  }

  function renderLastReadScreen() {
    const pSession = state.progress.prophets;
    const cSession = state.progress.companions;

    // Prophets Card
    const pTitle = document.getElementById('lr-prophet-title');
    const pSubtitle = document.getElementById('lr-prophet-subtitle');
    const pPage = document.getElementById('lr-prophet-page');
    const pDate = document.getElementById('lr-prophet-date');
    const pBtn = document.getElementById('btn-continue-prophets');

    if (pSession) {
      pTitle.textContent = pSession.itemTitle;
      pSubtitle.textContent = pSession.headingTitle ? pSession.headingTitle : 'Stories of the Prophets by Ibn Kathir';
      pPage.textContent = `Saved at Page ${pSession.page} of ${pSession.totalPages}`;
      pDate.textContent = pSession.timestamp ? new Date(pSession.timestamp).toLocaleDateString() : '';
      pBtn.disabled = false;
      pBtn.onclick = () => {
        openReader('prophets', pSession.page, pSession.itemTitle, pSession.headingTitle);
      };
    } else {
      pTitle.textContent = 'No reading history';
      pSubtitle.textContent = 'Open Stories of the Prophets to begin reading.';
      pPage.textContent = 'Page --';
      pDate.textContent = '';
      pBtn.disabled = true;
    }

    // Companions Card
    const cTitle = document.getElementById('lr-companion-title');
    const cSubtitle = document.getElementById('lr-companion-subtitle');
    const cPage = document.getElementById('lr-companion-page');
    const cDate = document.getElementById('lr-companion-date');
    const cBtn = document.getElementById('btn-continue-companions');

    if (cSession) {
      cTitle.textContent = cSession.itemTitle;
      cSubtitle.textContent = 'Biographies of the Sahaabah';
      cPage.textContent = `Saved at Page ${cSession.page} of ${cSession.totalPages}`;
      cDate.textContent = cSession.timestamp ? new Date(cSession.timestamp).toLocaleDateString() : '';
      cBtn.disabled = false;
      cBtn.onclick = () => {
        openReader('companions', cSession.page, cSession.itemTitle, cSession.headingTitle);
      };
    } else {
      cTitle.textContent = 'No reading history';
      cSubtitle.textContent = 'Open Stories of the Companions to begin reading.';
      cPage.textContent = 'Page --';
      cDate.textContent = '';
      cBtn.disabled = true;
    }
  }

  // =========================================================================
  // 6. PDF READER CONTROLLER (Offline PDF.js Integration)
  // =========================================================================

  const PDF_FILES = {
    prophets: 'assets/Stories_Of_The_Prophets.pdf',
    companions: 'assets/Companions_of_the_Prophet.pdf'
  };

  const BOOK_TITLES = {
    prophets: 'Stories of the Prophets (Ibn Kathir)',
    companions: 'Stories of the Companions'
  };

  function openReader(collection, targetPage, itemTitle, headingTitle) {
    state.activeBook = collection;
    state.currentPageNum = targetPage || 1;

    // Update Header Text
    document.getElementById('reader-book-title').textContent = BOOK_TITLES[collection];
    document.getElementById('reader-item-subtitle').textContent = headingTitle ? `${itemTitle} • ${headingTitle}` : itemTitle;

    navigateTo('screen-reader');

    const pdfPath = PDF_FILES[collection];
    loadPdfDocument(pdfPath, state.currentPageNum);
  }

  function loadPdfDocument(url, initialPage) {
    const viewer = document.getElementById('pdf-viewer');
    viewer.innerHTML = '<div style="padding: 40px; color: var(--text-secondary); text-align: center;">Loading original book content...</div>';

    window.pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'pdfjs/cmaps/',
      cMapPacked: true
    }).promise.then(function (pdfDoc) {
      state.currentPdfDoc = pdfDoc;
      state.totalPages = pdfDoc.numPages;

      document.getElementById('label-total-pages').textContent = `/ ${state.totalPages}`;
      document.getElementById('input-current-page').max = state.totalPages;
      document.getElementById('input-current-page').value = initialPage;

      renderCurrentPage(initialPage);
      updateReaderBookmarkIcon();
    }).catch(function (error) {
      console.error('Error loading PDF document:', error);
      viewer.innerHTML = `<div style="padding: 40px; color: #ef4444; text-align: center;">Unable to open original PDF: ${error.message}</div>`;
    });
  }

  function renderCurrentPage(pageNum) {
    if (!state.currentPdfDoc) return;
    state.pageRendering = true;
    state.currentPageNum = pageNum;

    document.getElementById('input-current-page').value = pageNum;
    showPageFloatingPill(pageNum);

    state.currentPdfDoc.getPage(pageNum).then(function (page) {
      const viewer = document.getElementById('pdf-viewer');
      viewer.innerHTML = ''; // Single page / continuous smooth mode

      // Determine appropriate scale based on container width and state.currentScale
      const containerWidth = document.getElementById('pdf-viewer-container').clientWidth - 32;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      let fitScale = (containerWidth / unscaledViewport.width);
      if (fitScale > 1.5) fitScale = 1.5; // Cap auto-fit on large desktop screens
      const finalScale = fitScale * state.currentScale;

      const viewport = page.getViewport({ scale: finalScale });

      // Create page wrapper
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.style.width = Math.floor(viewport.width) + 'px';
      pageWrapper.style.height = Math.floor(viewport.height) + 'px';

      // Create Canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      
      // High-DPI support
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      pageWrapper.appendChild(canvas);
      viewer.appendChild(pageWrapper);

      const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);

      renderTask.promise.then(function () {
        state.pageRendering = false;
        if (state.pageNumPending !== null) {
          renderCurrentPage(state.pageNumPending);
          state.pageNumPending = null;
        }

        // Auto-save progress
        saveCurrentReadingProgress();
        updateReaderBookmarkIcon();
      });
    });
  }

  function queueRenderPage(num) {
    if (state.pageRendering) {
      state.pageNumPending = num;
    } else {
      renderCurrentPage(num);
    }
  }

  function goToPage(pageNum) {
    let p = parseInt(pageNum, 10);
    if (isNaN(p)) return;
    if (p < 1) p = 1;
    if (p > state.totalPages) p = state.totalPages;
    queueRenderPage(p);
  }

  function showPageFloatingPill(pageNum) {
    const pill = document.getElementById('reader-floating-pill');
    const text = document.getElementById('pill-text');
    if (!pill || !text) return;

    text.textContent = `Page ${pageNum} of ${state.totalPages}`;
    pill.classList.add('visible');
    clearTimeout(pill._timeout);
    pill._timeout = setTimeout(() => {
      pill.classList.remove('visible');
    }, 2000);
  }

  function saveCurrentReadingProgress() {
    if (!state.activeBook) return;

    const currentTitle = document.getElementById('reader-item-subtitle').textContent;
    const parts = currentTitle.split('•').map(s => s.trim());
    const itemTitle = parts[0] || '';
    const headingTitle = parts[1] || '';

    state.progress[state.activeBook] = {
      collection: state.activeBook,
      bookTitle: BOOK_TITLES[state.activeBook],
      itemTitle: itemTitle,
      headingTitle: headingTitle,
      page: state.currentPageNum,
      totalPages: state.totalPages,
      timestamp: Date.now()
    };
    state.progress.lastActiveCollection = state.activeBook;

    saveProgress();
  }

  // =========================================================================
  // 7. BOOKMARKS FEATURE
  // =========================================================================

  function isCurrentPageBookmarked() {
    return state.bookmarks.some(b => 
      b.collection === state.activeBook && b.page === state.currentPageNum
    );
  }

  function toggleCurrentBookmark() {
    if (!state.activeBook) return;

    const existingIdx = state.bookmarks.findIndex(b => 
      b.collection === state.activeBook && b.page === state.currentPageNum
    );

    if (existingIdx !== -1) {
      state.bookmarks.splice(existingIdx, 1);
    } else {
      const currentTitle = document.getElementById('reader-item-subtitle').textContent;
      const parts = currentTitle.split('•').map(s => s.trim());
      state.bookmarks.unshift({
        id: Date.now().toString(),
        collection: state.activeBook,
        bookTitle: BOOK_TITLES[state.activeBook],
        title: parts[0] || 'Reading Position',
        subtitle: parts[1] || '',
        page: state.currentPageNum,
        timestamp: Date.now()
      });
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
    container.innerHTML = '';

    if (state.bookmarks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          No saved bookmarks yet. Tap the bookmark icon in the reading toolbar to save a page.
        </div>
      `;
      return;
    }

    state.bookmarks.forEach(bm => {
      const card = document.createElement('div');
      card.className = 'bookmark-card';
      card.innerHTML = `
        <div class="bookmark-left">
          <div class="bm-tag">${bm.bookTitle} • Page ${bm.page}</div>
          <div class="bm-title">${bm.title} ${bm.subtitle ? '— ' + bm.subtitle : ''}</div>
          <div class="bm-meta">Saved ${new Date(bm.timestamp).toLocaleDateString()}</div>
        </div>
        <button class="bm-delete-btn" title="Remove bookmark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      card.querySelector('.bookmark-left').addEventListener('click', () => {
        closeModal(modals.bookmarks);
        openReader(bm.collection, bm.page, bm.title, bm.subtitle);
      });

      card.querySelector('.bm-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.bookmarks = state.bookmarks.filter(b => b.id !== bm.id);
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
    container.innerHTML = '';

    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) {
      info.textContent = 'Please enter at least 2 characters to search.';
      return;
    }

    info.textContent = 'Searching original texts offline...';

    const results = [];
    const maxResults = 80;

    // Search Prophets if scope matches
    if (currentSearchScope === 'all' || currentSearchScope === 'prophets') {
      const pIndex = window.PROPHETS_SEARCH_INDEX || [];
      for (const p of pIndex) {
        const text = p.text.toLowerCase();
        const idx = text.indexOf(q);
        if (idx !== -1) {
          // Identify which prophet and heading owns this page
          const prophet = state.prophets.find(pr => p.page >= pr.start_page && p.page <= pr.end_page);
          const prophetName = prophet ? prophet.name : 'Stories of the Prophets';
          let headingName = '';
          if (prophet && prophet.headings) {
            const h = prophet.headings.slice().reverse().find(hd => hd.page <= p.page);
            if (h) headingName = h.title;
          }

          results.push({
            collection: 'prophets',
            bookTitle: 'Stories of the Prophets',
            itemTitle: prophetName,
            headingTitle: headingName,
            page: p.page,
            snippet: createSnippet(p.text, idx, q.length)
          });

          if (results.length >= maxResults) break;
        }
      }
    }

    // Search Companions if scope matches
    if (results.length < maxResults && (currentSearchScope === 'all' || currentSearchScope === 'companions')) {
      const cIndex = window.COMPANIONS_SEARCH_INDEX || [];
      for (const c of cIndex) {
        const text = c.text.toLowerCase();
        const idx = text.indexOf(q);
        if (idx !== -1) {
          const companion = state.companions.find(cp => c.page >= cp.start_page && c.page <= cp.end_page);
          const companionName = companion ? companion.name : 'Stories of the Companions';

          results.push({
            collection: 'companions',
            bookTitle: 'Stories of the Companions',
            itemTitle: companionName,
            headingTitle: 'Original Biography',
            page: c.page,
            snippet: createSnippet(c.text, idx, q.length)
          });

          if (results.length >= maxResults) break;
        }
      }
    }

    info.textContent = `Found ${results.length} offline matches for "${query}":`;

    if (results.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          No occurrences found in the source texts. Try another keyword or phrase.
        </div>
      `;
      return;
    }

    results.forEach(res => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      card.innerHTML = `
        <div class="result-location">
          <span>${res.bookTitle} • ${res.itemTitle} ${res.headingTitle ? '— ' + res.headingTitle : ''}</span>
          <span>Page ${res.page}</span>
        </div>
        <div class="result-snippet">${res.snippet}</div>
      `;

      card.addEventListener('click', () => {
        closeModal(modals.search);
        openReader(res.collection, res.page, res.itemTitle, res.headingTitle);
      });

      container.appendChild(card);
    });
  }

  function createSnippet(fullText, matchIndex, matchLength) {
    const start = Math.max(0, matchIndex - 50);
    const end = Math.min(fullText.length, matchIndex + matchLength + 70);
    const before = fullText.substring(start, matchIndex);
    const match = fullText.substring(matchIndex, matchIndex + matchLength);
    const after = fullText.substring(matchIndex + matchLength, end);
    return `...${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}...`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        openReader('prophets', state.selectedProphet.start_page, state.selectedProphet.name, 'Introduction');
      }
    });

    // Reader Controls
    document.getElementById('btn-prev-page').addEventListener('click', () => {
      if (state.currentPageNum > 1) goToPage(state.currentPageNum - 1);
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
      if (state.currentPageNum < state.totalPages) goToPage(state.currentPageNum + 1);
    });

    document.getElementById('input-current-page').addEventListener('change', (e) => {
      goToPage(e.target.value);
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      if (state.currentScale < 2.5) {
        state.currentScale += 0.25;
        document.getElementById('label-zoom-level').textContent = Math.round(state.currentScale * 100) + '%';
        queueRenderPage(state.currentPageNum);
      }
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      if (state.currentScale > 0.75) {
        state.currentScale -= 0.25;
        document.getElementById('label-zoom-level').textContent = Math.round(state.currentScale * 100) + '%';
        queueRenderPage(state.currentPageNum);
      }
    });

    document.getElementById('btn-reader-theme').addEventListener('click', () => {
      const themes = ['theme-light', 'theme-warm', 'theme-dark'];
      let nextIdx = (themes.indexOf(state.settings.theme) + 1) % themes.length;
      applyTheme(themes[nextIdx]);
    });

    document.getElementById('btn-reader-bookmark').addEventListener('click', toggleCurrentBookmark);

    document.getElementById('btn-reader-search').addEventListener('click', () => {
      openModal(modals.search);
      // Pre-set search scope to current book
      currentSearchScope = state.activeBook || 'all';
      updateScopeTabs();
    });

    // Header Settings Icon
    document.getElementById('btn-settings-header').addEventListener('click', () => {
      openModal(modals.settings);
    });

    // Quick Tools on Main Menu
    document.getElementById('btn-open-search').addEventListener('click', () => {
      openModal(modals.search);
    });

    document.getElementById('btn-open-bookmarks').addEventListener('click', () => {
      renderBookmarksModal();
      openModal(modals.bookmarks);
    });

    // Modal Close Buttons
    document.getElementById('btn-close-search').addEventListener('click', () => closeModal(modals.search));
    document.getElementById('btn-close-bookmarks').addEventListener('click', () => closeModal(modals.bookmarks));
    document.getElementById('btn-close-settings').addEventListener('click', () => closeModal(modals.settings));

    // Close on backdrop click
    Object.values(modals).forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m);
      });
    });

    // Search Scope Tabs
    document.querySelectorAll('.search-scope-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.search-scope-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSearchScope = btn.dataset.scope;
        const val = document.getElementById('input-global-search').value;
        if (val) executeOfflineSearch(val);
      });
    });

    function updateScopeTabs() {
      document.querySelectorAll('.search-scope-tabs .tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.scope === currentSearchScope);
      });
    }

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

    // Default Zoom Setting
    const zoomSelect = document.getElementById('select-default-zoom');
    zoomSelect.addEventListener('change', (e) => {
      state.settings.defaultZoom = parseFloat(e.target.value);
      state.currentScale = state.settings.defaultZoom;
      document.getElementById('label-zoom-level').textContent = Math.round(state.currentScale * 100) + '%';
      saveSettings();
      if (state.currentScreen === 'screen-reader') {
        queueRenderPage(state.currentPageNum);
      }
    });

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
      updateReaderBookmarkIcon();
      alert('All reading progress and bookmarks have been reset.');
    });
  }

  // =========================================================================
  // 10. APP INITIALIZATION
  // =========================================================================

  function initApp() {
    loadPersistedData();
    initProphetsList();
    initCompanionsList();
    initEventListeners();
    console.log('Qisas offline reading application initialized successfully.');
  }

  // Android hardware back button handler
  window.handleAndroidBack = function() {
    // Close any open modal first
    let modalClosed = false;
    Object.values(modals).forEach(function(m) {
      if (m && m.classList.contains('active')) {
        m.classList.remove('active');
        modalClosed = true;
      }
    });
    if (modalClosed) return true;

    // Navigate back if not on main menu
    if (state.currentScreen !== 'screen-main-menu') {
      navigateBack();
      return true;
    }
    return false; // Let the system handle it (close app)
  };

  // Start app on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
