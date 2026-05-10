(function() {
  let active = false;
  let hoveredElement = null;
  let overlay = null;

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = '__cryzo-inspector-overlay';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.1s ease;display:none;';
    document.body.appendChild(overlay);
  }

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    let path = [];
    while (el && el.nodeType === 1) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (classes) selector += '.' + classes;
      }
      path.unshift(selector);
      if (path.length >= 3) break;
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function getElementInfo(el) {
    const rect = el.getBoundingClientRect();
    return {
      tagName: el.tagName.toLowerCase(),
      className: el.className || '',
      id: el.id || '',
      textContent: (el.textContent || '').trim().slice(0, 100),
      selector: getSelector(el),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  }

  function onMouseMove(e) {
    if (!active) return;
    const el = e.target;
    if (el === overlay || el === document.body || el === document.documentElement) return;
    hoveredElement = el;
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  function onClick(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (el === overlay) return;
    const info = getElementInfo(el);
    window.parent.postMessage({ type: 'INSPECTOR_CLICK', elementInfo: info }, '*');
  }

  function onMouseLeave() {
    if (overlay) overlay.style.display = 'none';
    hoveredElement = null;
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'INSPECTOR_ACTIVATE') {
      active = e.data.active;
      if (!overlay) createOverlay();
      if (active) {
        document.body.style.cursor = 'crosshair';
        overlay.style.display = 'none';
      } else {
        document.body.style.cursor = '';
        overlay.style.display = 'none';
        hoveredElement = null;
      }
    }
  });

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseleave', onMouseLeave, true);

  window.parent.postMessage({ type: 'INSPECTOR_READY' }, '*');
})();
