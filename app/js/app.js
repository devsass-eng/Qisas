/**
 * Qisas - Offline Digital Reading Application
 * Core Application Logic & PDF Rendering Controller
 */

(function () {
  'use strict';

  // Configure PDF.js Worker
  if (window.pdfjsLib) {
    // If running on file:/// protocol, use main-thread execution to avoid browser worker CORS blocking
    if (window.location && window.location.protocol === 'file:') {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    } else {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.js';
    }
  }

  // Application State
  const state = {
    currentScreen: 'screen-main-menu',
    navigationHistory: ['screen-main-menu'],
    activeBook: null, // 'prophets' or 'companions'
    currentPdfDoc: null,
    currentPageNum: 1,
    totalPages: 1,
    currentScale: 1.0,
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
      defaultZoom: 1.0
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
    state.currentScale = state.settings.defaultZoom || 1.0;
    const zoomSelect = document.getElementById('select-default-zoom');
    if (zoomSelect) {
      zoomSelect.value = String(state.currentScale);
    }
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

  function getPdfData(collection) {
    const b64 = (collection === 'prophets') ? window.PROPHETS_PDF_BASE64 : window.COMPANIONS_PDF_BASE64;
    if (!b64) return null;

    try {
      // Decode fresh Uint8Array every time so worker postMessage transfers never detach a shared ArrayBuffer
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (e) {
      console.error('Error decoding embedded PDF data:', e);
      return null;
    }
  }

  function openReader(collection, targetPage, itemTitle, headingTitle) {
    state.activeBook = collection;
    state.currentPageNum = targetPage || 1;

    // Update Header Text: prioritize specific story/prophet/companion name
    document.getElementById('reader-book-title').textContent = itemTitle || BOOK_TITLES[collection];
    document.getElementById('reader-item-subtitle').textContent = headingTitle ? `${BOOK_TITLES[collection]} • ${headingTitle}` : BOOK_TITLES[collection];

    navigateTo('screen-reader');

    // If this book is already fully built and loaded in the viewer, smoothly jump without reloading!
    if (state.loadedCollection === collection && state.currentPdfDoc && document.getElementById('pdf-page-' + state.currentPageNum)) {
      scrollToPage(state.currentPageNum, false);
      return;
    }

    const pdfPath = PDF_FILES[collection];
    loadPdfDocument(collection, pdfPath, state.currentPageNum);
  }

  // Continuous Vertical Scroll State
  let renderedPages = new Set();
  let renderingPages = new Set();
  let pageObserver = null;
  let scrollListenerAttached = false;
  let resizeListenerAttached = false;

  function getPageLayoutDimensions(page) {
    const container = document.getElementById('pdf-viewer-container');
    const isMobile = window.innerWidth <= 640;
    // On mobile, use 12px total padding (6px on each side) to maximize reading width
    const padding = isMobile ? 12 : 36;
    const clientW = container.clientWidth || window.innerWidth;
    const availableWidth = Math.max(clientW - padding, 240);
    // On wide desktop monitors, cap base width at 860px for reading comfort, then scale with zoom
    const baseWidth = isMobile ? availableWidth : Math.min(availableWidth, 860);

    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const fitScale = (baseWidth / unscaledViewport.width) * state.currentScale;
    const viewport = page.getViewport({ scale: fitScale });

    return {
      width: Math.floor(viewport.width),
      height: Math.floor(viewport.height),
      scale: fitScale,
      viewport: viewport
    };
  }

  function loadPdfDocument(collection, url, initialPage) {
    const viewer = document.getElementById('pdf-viewer');
    viewer.innerHTML = '<div style="padding: 40px; color: var(--text-secondary); text-align: center;">Loading original book content...</div>';

    // Disconnect old observer and reset rendered page cache
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    renderedPages.clear();
    renderingPages.clear();

    // Check if embedded binary data is available (eliminates all file:/// CORS restrictions)
    const embeddedBytes = getPdfData(collection);
    const docSource = embeddedBytes ? { data: embeddedBytes } : { url: url };

    docSource.cMapUrl = 'pdfjs/cmaps/';
    docSource.cMapPacked = true;

    window.pdfjsLib.getDocument(docSource).promise.then(function (pdfDoc) {
      state.currentPdfDoc = pdfDoc;
      state.loadedCollection = collection;
      state.totalPages = pdfDoc.numPages;

      const pageBadgeNum = document.getElementById('reader-current-page-num');
      if (pageBadgeNum) pageBadgeNum.textContent = initialPage;
      const labelTotal = document.getElementById('label-total-pages');
      if (labelTotal) labelTotal.textContent = `/ ${state.totalPages}`;
      const inputCur = document.getElementById('input-current-page');
      if (inputCur) {
        inputCur.max = state.totalPages;
        inputCur.value = initialPage;
      }

      // Sample first page to determine dimensions, then build all continuous pages
      pdfDoc.getPage(1).then(function (samplePage) {
        initContinuousScrollViewer(samplePage, initialPage);
      }).catch(function (err) {
        console.error('Error fetching sample page:', err);
      });

      updateReaderBookmarkIcon();
    }).catch(function (error) {
      console.error('Error loading PDF document:', error);
      viewer.innerHTML = `<div style="padding: 40px; color: #ef4444; text-align: center;">Unable to open original PDF: ${error.message}</div>`;
    });
  }

  function initContinuousScrollViewer(samplePage, targetPage) {
    const viewer = document.getElementById('pdf-viewer');
    const container = document.getElementById('pdf-viewer-container');
    viewer.innerHTML = '';

    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }

    const layout = getPageLayoutDimensions(samplePage);

    // Build wrappers for ALL pages so the document is continuously scrollable
    for (let i = 1; i <= state.totalPages; i++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = 'pdf-page-' + i;
      pageWrapper.dataset.pageNum = i;
      pageWrapper.style.width = layout.width + 'px';
      pageWrapper.style.minHeight = layout.height + 'px';
      pageWrapper.innerHTML = `<div class="page-loading-skeleton" style="min-height:${layout.height}px;">Page ${i}</div>`;
      viewer.appendChild(pageWrapper);
    }

    // IntersectionObserver renders pages seamlessly as they approach or enter the viewport
    pageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pNum = parseInt(entry.target.dataset.pageNum, 10);
          renderPageCanvas(pNum, entry.target);
        }
      });
    }, {
      root: container,
      rootMargin: '800px 0px 800px 0px' // Pre-render 800px ahead of viewport for smooth scrolling
    });

    document.querySelectorAll('.pdf-page-wrapper').forEach(w => pageObserver.observe(w));

    // Scroll listener updates active page counter and progress automatically
    if (!scrollListenerAttached) {
      scrollListenerAttached = true;
      let scrollTimer = null;
      container.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          updateActivePageFromScroll();
        }, 50);
      }, { passive: true });
    }

    // Window resize / orientation change listener to guarantee true responsiveness
    if (!resizeListenerAttached) {
      resizeListenerAttached = true;
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (state.currentScreen === 'screen-reader' && state.currentPdfDoc) {
            renderedPages.clear();
            renderingPages.clear();
            state.currentPdfDoc.getPage(1).then(function (p) {
              initContinuousScrollViewer(p, state.currentPageNum);
            });
          }
        }, 180);
      });
    }

    // Jump to the requested page
    setTimeout(() => {
      scrollToPage(targetPage, false);
    }, 60);
  }

  function renderPageCanvas(pageNum, wrapper) {
    if (!state.currentPdfDoc || renderedPages.has(pageNum) || renderingPages.has(pageNum)) return;
    renderingPages.add(pageNum);

    state.currentPdfDoc.getPage(pageNum).then(function (page) {
      const layout = getPageLayoutDimensions(page);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(layout.width * outputScale);
      canvas.height = Math.floor(layout.height * outputScale);
      canvas.style.width = layout.width + 'px';
      canvas.style.height = layout.height + 'px';

      wrapper.style.width = layout.width + 'px';
      wrapper.style.minHeight = layout.height + 'px';
      wrapper.innerHTML = '';
      wrapper.appendChild(canvas);

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: layout.viewport
      };

      page.render(renderContext).promise.then(function () {
        renderingPages.delete(pageNum);
        renderedPages.add(pageNum);
      }).catch(function (err) {
        renderingPages.delete(pageNum);
      });
    }).catch(function (err) {
      renderingPages.delete(pageNum);
    });
  }

  function updateActivePageFromScroll() {
    const container = document.getElementById('pdf-viewer-container');
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    if (!wrappers.length) return;

    const containerTop = container.scrollTop;
    const triggerLine = containerTop + (container.clientHeight * 0.35);

    let activePage = 1;
    for (let i = 0; i < wrappers.length; i++) {
      const w = wrappers[i];
      if (w.offsetTop + w.offsetHeight > triggerLine) {
        activePage = parseInt(w.dataset.pageNum, 10);
        break;
      }
    }

    if (activePage !== state.currentPageNum) {
      state.currentPageNum = activePage;
      const pageBadgeNum = document.getElementById('reader-current-page-num');
      if (pageBadgeNum) pageBadgeNum.textContent = activePage;
      const inputCur = document.getElementById('input-current-page');
      if (inputCur) inputCur.value = activePage;
      showPageFloatingPill(activePage);
      saveCurrentReadingProgress();
      updateReaderBookmarkIcon();
    }
  }

  function scrollToPage(pageNum, smooth = true) {
    let p = parseInt(pageNum, 10);
    if (isNaN(p)) return;
    if (p < 1) p = 1;
    if (p > state.totalPages) p = state.totalPages;

    state.currentPageNum = p;
    const pageBadgeNum = document.getElementById('reader-current-page-num');
    if (pageBadgeNum) pageBadgeNum.textContent = p;
    const inputCur = document.getElementById('input-current-page');
    if (inputCur) inputCur.value = p;

    const targetWrapper = document.getElementById('pdf-page-' + p);
    if (targetWrapper) {
      targetWrapper.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      renderPageCanvas(p, targetWrapper);
      showPageFloatingPill(p);
      saveCurrentReadingProgress();
      updateReaderBookmarkIcon();
    }
  }

  function goToPage(pageNum) {
    scrollToPage(pageNum, true);
  }

  function handleZoomChange(delta) {
    const newScale = Math.min(Math.max(state.currentScale + delta, 0.75), 2.5);
    if (newScale === state.currentScale) return;
    state.currentScale = newScale;
    const labelZoom = document.getElementById('label-zoom-level');
    if (labelZoom) labelZoom.textContent = Math.round(state.currentScale * 100) + '%';

    renderedPages.clear();
    renderingPages.clear();

    if (state.currentPdfDoc) {
      state.currentPdfDoc.getPage(1).then(function (samplePage) {
        initContinuousScrollViewer(samplePage, state.currentPageNum);
      });
    }
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
    const matchedPages = new Set();

    // 1. Search story names and chapter headings directly across both categories
    if (currentSearchScope === 'all' || currentSearchScope === 'prophets') {
      (state.prophets || []).forEach(pr => {
        if (pr.name && pr.name.toLowerCase().includes(q)) {
          results.push({
            collection: 'prophets',
            bookTitle: 'Stories of the Prophets',
            itemTitle: pr.name,
            headingTitle: 'Prophet Story (Page ' + pr.start_page + ')',
            page: pr.start_page,
            snippet: `<strong>Prophet Story:</strong> Complete story of ${escapeHtml(pr.name)} as recorded by Ibn Kathir.`
          });
          matchedPages.add('prophets_' + pr.start_page);
        }
        if (pr.headings && Array.isArray(pr.headings)) {
          pr.headings.forEach(h => {
            if (h.title && h.title.toLowerCase().includes(q)) {
              results.push({
                collection: 'prophets',
                bookTitle: 'Stories of the Prophets',
                itemTitle: pr.name,
                headingTitle: h.title,
                page: h.page,
                snippet: `<strong>Section Heading:</strong> ${escapeHtml(h.title)} (in story of ${escapeHtml(pr.name)}).`
              });
              matchedPages.add('prophets_' + h.page);
            }
          });
        }
      });
    }

    if (currentSearchScope === 'all' || currentSearchScope === 'companions') {
      (state.companions || []).forEach(cp => {
        if (cp.name && cp.name.toLowerCase().includes(q)) {
          results.push({
            collection: 'companions',
            bookTitle: 'Stories of the Companions',
            itemTitle: cp.name,
            headingTitle: 'Biography (Page ' + cp.start_page + ')',
            page: cp.start_page,
            snippet: `<strong>Companion Biography:</strong> Complete original biography of ${escapeHtml(cp.name)}.`
          });
          matchedPages.add('companions_' + cp.start_page);
        }
      });
    }

    // 2. Search Prophets full-text index
    if (results.length < maxResults && (currentSearchScope === 'all' || currentSearchScope === 'prophets')) {
      const pIndex = window.PROPHETS_SEARCH_INDEX || [];
      for (const p of pIndex) {
        if (matchedPages.has('prophets_' + p.page)) continue;
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
          matchedPages.add('prophets_' + p.page);
          if (results.length >= maxResults) break;
        }
      }
    }

    // 3. Search Companions full-text index
    if (results.length < maxResults && (currentSearchScope === 'all' || currentSearchScope === 'companions')) {
      const cIndex = window.COMPANIONS_SEARCH_INDEX || [];
      for (const c of cIndex) {
        if (matchedPages.has('companions_' + c.page)) continue;
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
          matchedPages.add('companions_' + c.page);
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

    // Reader Settings Button
    const btnReaderSettings = document.getElementById('btn-reader-settings');
    if (btnReaderSettings) {
      btnReaderSettings.addEventListener('click', () => {
        openModal(modals.settings);
      });
    }

    // Optional / Legacy Reader Controls (guarded)
    const btnPrevPage = document.getElementById('btn-prev-page');
    if (btnPrevPage) {
      btnPrevPage.addEventListener('click', () => {
        if (state.currentPageNum > 1) goToPage(state.currentPageNum - 1);
      });
    }

    const btnNextPage = document.getElementById('btn-next-page');
    if (btnNextPage) {
      btnNextPage.addEventListener('click', () => {
        if (state.currentPageNum < state.totalPages) goToPage(state.currentPageNum + 1);
      });
    }

    const inputCurrentPage = document.getElementById('input-current-page');
    if (inputCurrentPage) {
      inputCurrentPage.addEventListener('change', (e) => {
        goToPage(e.target.value);
      });
    }

    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        handleZoomChange(0.25);
      });
    }

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        handleZoomChange(-0.25);
      });
    }

    const btnReaderTheme = document.getElementById('btn-reader-theme');
    if (btnReaderTheme) {
      btnReaderTheme.addEventListener('click', () => {
        const themes = ['theme-light', 'theme-warm', 'theme-dark'];
        let nextIdx = (themes.indexOf(state.settings.theme) + 1) % themes.length;
        applyTheme(themes[nextIdx]);
      });
    }

    const btnReaderBookmark = document.getElementById('btn-reader-bookmark');
    if (btnReaderBookmark) {
      btnReaderBookmark.addEventListener('click', toggleCurrentBookmark);
    }

    const btnReaderSearch = document.getElementById('btn-reader-search');
    if (btnReaderSearch) {
      btnReaderSearch.addEventListener('click', () => {
        openModal(modals.search);
        currentSearchScope = state.activeBook || 'all';
        updateScopeTabs();
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
    if (zoomSelect) {
      zoomSelect.value = String(state.settings.defaultZoom || 1.0);
      zoomSelect.addEventListener('change', (e) => {
        const newZoom = parseFloat(e.target.value);
        if (isNaN(newZoom)) return;
        state.settings.defaultZoom = newZoom;
        state.currentScale = newZoom;
        saveSettings();

        const labelZoom = document.getElementById('label-zoom-level');
        if (labelZoom) {
          labelZoom.textContent = Math.round(state.currentScale * 100) + '%';
        }

        if (state.currentPdfDoc) {
          renderedPages.clear();
          renderingPages.clear();
          state.currentPdfDoc.getPage(1).then(function (samplePage) {
            initContinuousScrollViewer(samplePage, state.currentPageNum);
          }).catch(function (err) {
            console.error('Error re-rendering viewer for zoom:', err);
          });
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
