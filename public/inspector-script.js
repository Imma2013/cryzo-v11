(function () {
  if (window.__CRYZO_INSPECTOR_INSTALLED__) {
    window.parent.postMessage({ type: 'INSPECTOR_READY' }, '*');
    return;
  }
  window.__CRYZO_INSPECTOR_INSTALLED__ = true;

  let active = false;
  let hoveredElement = null;
  let overlay = null;
  let crashed = false;

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

  function meaningfulBodyContent() {
    if (!document.body) return false;
    var nodes = Array.from(document.body.children).filter(function (node) {
      return node.id !== '__cryzo-inspector-overlay' && node.tagName !== 'SCRIPT';
    });
    if (nodes.length === 0) return false;

    return nodes.some(function (node) {
      var text = (node.textContent || '').trim();
      var rect = typeof node.getBoundingClientRect === 'function'
        ? node.getBoundingClientRect()
        : { width: 0, height: 0 };
      return text.length > 0 || rect.width > 1 || rect.height > 1 || node.children.length > 0;
    });
  }

  function reportHealth() {
    if (crashed) return;
    var root = document.getElementById('root') || document.getElementById('app');
    var healthy = meaningfulBodyContent();
    var rootChildren = root ? root.childElementCount : 0;
    var bodyTextLength = document.body ? (document.body.innerText || '').trim().length : 0;
    post('CRYZO_PREVIEW_HEALTH', {
      healthy: healthy,
      bodyTextLength: bodyTextLength,
      rootChildren: rootChildren,
      reason: healthy ? '' : 'The preview loaded but rendered no visible application content.',
    });
  }

  function reportCrash(message) {
    crashed = true;
    post('CRYZO_PREVIEW_CRASH', {
      message: String(message || 'The application crashed while rendering.'),
    });
  }

  window.addEventListener('error', function (event) {
    reportCrash(event && event.message ? event.message : 'Uncaught preview error');
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    reportCrash(reason && reason.message ? reason.message : reason || 'Unhandled promise rejection');
  });

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

  function ready() {
    createOverlay();
    post('INSPECTOR_READY', {});
    window.setTimeout(reportHealth, 150);
    window.setTimeout(reportHealth, 700);
    window.setTimeout(reportHealth, 1600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();