(function () {
  if (window.__CRYZO_INSPECTOR_INSTALLED__) {
    window.parent.postMessage({ type: 'INSPECTOR_READY' }, '*');
    return;
  }
  window.__CRYZO_INSPECTOR_INSTALLED__ = true;

  let active = false;
  let hoveredElement = null;
  let overlay = null;

  function post(type, payload) {
    window.parent.postMessage({ type: type, ...payload }, '*');
  }

  function createOverlay() {
    if (overlay || !document.body) return;
    overlay = document.createElement('div');
    overlay.id = '__cryzo-inspector-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:2147483647',
      'border:2px solid #3b82f6',
      'background:rgba(59,130,246,0.10)',
      'box-sizing:border-box',
      'display:none',
    ].join(';');
    document.body.appendChild(overlay);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function getSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + cssEscape(el.id);

    const path = [];
    let current = el;
    while (current && current.nodeType === 1 && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (typeof current.className === 'string' && current.className.trim()) {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(cssEscape);
        if (classes.length) selector += '.' + classes.join('.');
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (node) => node.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }

      path.unshift(selector);
      if (path.length >= 4) break;
      current = parent;
    }
    return path.join(' > ');
  }

  function getElementInfo(el) {
    const rect = el.getBoundingClientRect();
    return {
      tagName: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
      id: el.id || '',
      textContent: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      selector: getSelector(el),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  function renderOverlay(el) {
    createOverlay();
    if (!overlay || !el) return;
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  function clearHover() {
    if (overlay) overlay.style.display = 'none';
    if (hoveredElement) post('INSPECTOR_LEAVE', {});
    hoveredElement = null;
  }

  function onMouseMove(event) {
    if (!active) return;
    const el = event.target;
    if (!(el instanceof Element) || el === overlay || el === document.body || el === document.documentElement) {
      return;
    }

    renderOverlay(el);
    if (hoveredElement !== el) {
      hoveredElement = el;
      post('INSPECTOR_HOVER', { elementInfo: getElementInfo(el) });
    }
  }

  function onClick(event) {
    if (!active) return;
    const el = event.target;
    if (!(el instanceof Element) || el === overlay) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    post('INSPECTOR_CLICK', { elementInfo: getElementInfo(el) });
  }

  function setActive(next) {
    active = Boolean(next);
    createOverlay();
    if (document.body) document.body.style.cursor = active ? 'crosshair' : '';
    if (!active) clearHover();
  }

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'INSPECTOR_ACTIVATE') {
      setActive(event.data.active);
    }
  });

  window.addEventListener('scroll', function () {
    if (active && hoveredElement) renderOverlay(hoveredElement);
  }, true);
  window.addEventListener('resize', function () {
    if (active && hoveredElement) renderOverlay(hoveredElement);
  });

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseleave', clearHover, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      createOverlay();
      post('INSPECTOR_READY', {});
    }, { once: true });
  } else {
    createOverlay();
    post('INSPECTOR_READY', {});
  }
})();
