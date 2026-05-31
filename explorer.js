// Requires a local server (e.g. VS Code Live Server) — fetch() won't work over file://

document.addEventListener('DOMContentLoaded', async () => {
  let filesystem, skillsData;

  try {
    const [fsRes, skRes] = await Promise.all([
      fetch('./Data/filesystem.json'),
      fetch('./Data/skills.json'),
    ]);
    if (!fsRes.ok) throw new Error(`filesystem: ${fsRes.statusText}`);
    if (!skRes.ok) throw new Error(`skills: ${skRes.statusText}`);
    [filesystem, skillsData] = await Promise.all([fsRes.json(), skRes.json()]);
    _filesystem = filesystem;
  } catch (err) {
    console.warn('[apps] Could not load data:', err.message);
    return;
  }

  const explorer  = new FileExplorer(filesystem);
  const browser   = new BrowserApp();
  const skills    = new SkillsApp(skillsData.skills);
  const startMenu = new StartMenu([
    { name: 'Files',  icon: 'fa-solid fa-folder-closed', app: explorer },
    { name: 'Chrome', icon: 'fa-brands fa-chrome',       app: browser  },
    { name: 'Skills', icon: 'fa-solid fa-hexagon-nodes', app: skills   },
  ]);

  document.querySelector('[title="Files"]')  ?.addEventListener('click', () => explorer.toggle());
  document.querySelector('[title="Chrome"]') ?.addEventListener('click', () => browser.toggle());
  document.querySelector('[title="Skills"]') ?.addEventListener('click', () => skills.toggle());
  document.querySelector('[title="Windows"]')?.addEventListener('click', () => startMenu.toggle());
  document.querySelector('[title="Search"]') ?.addEventListener('click', () => startMenu.toggle());
});


class FileExplorer {
  constructor (root) {
    this.root    = root;
    this.stack   = [];
    this.node    = root;
    this._el     = null;
    this._body   = null;
    this._back   = null;
    this._crumb  = null;
    this._overlay = null;
    this._viewer = null;
    this._build();
  }

  // ── Public ──────────────────────────────────────

  open () {
    const w = this._el;
    w.style.removeProperty('left');
    w.style.removeProperty('top');
    w.style.removeProperty('width');
    w.style.removeProperty('height');
    w.style.removeProperty('transform');
    w.style.removeProperty('animation');
    w.classList.remove('is-open', 'is-closing');
    void w.offsetWidth;

    this.stack = [];
    this.node  = this.root;
    this._updateBreadcrumb();
    this._render();

    this._overlay.classList.add('is-open');
    if (!_openWindows.includes(this)) _openWindows.push(this);
    _bringToFront(w);
    requestAnimationFrame(() => w.classList.add('is-open'));
  }

  close () {
    const w = this._el;
    if (!w.classList.contains('is-open') || w.classList.contains('is-closing')) return;
    this._overlay.classList.remove('is-open');
    w.style.removeProperty('animation');
    void w.offsetWidth;
    w.classList.add('is-closing');
    const onEnd = e => {
      if (e.animationName !== 'genie-out') return;
      w.removeEventListener('animationend', onEnd);
      w.classList.remove('is-open', 'is-closing');
      const idx = _openWindows.indexOf(this);
      if (idx !== -1) _openWindows.splice(idx, 1);
    };
    w.addEventListener('animationend', onEnd);
  }

  toggle () {
    const w = this._el;
    if (w.classList.contains('is-closing')) { this.open(); return; }
    w.classList.contains('is-open') ? this.close() : this.open();
  }

  // ── Build DOM ───────────────────────────────────

  _build () {
    const overlay = document.createElement('div');
    overlay.className = 'explorer-overlay';
    overlay.addEventListener('click', () => this.close());
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const win = document.createElement('div');
    win.className = 'explorer-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', 'File Explorer');

    win.innerHTML = `
      <div class="explorer-titlebar">
        <div class="explorer-controls">
          <button class="explorer-control close"    title="Close"    aria-label="Close"></button>
          <button class="explorer-control minimise" title="Minimise" aria-label="Minimise"></button>
          <button class="explorer-control maximise" title="Maximise" aria-label="Maximise"></button>
        </div>
        <span class="explorer-title-text">Files</span>
        <div class="explorer-titlebar-spacer"></div>
      </div>

      <div class="explorer-nav">
        <button class="explorer-back-btn" disabled aria-label="Back">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="explorer-breadcrumb"></span>
      </div>

      <div class="explorer-body">
        <div class="explorer-content"></div>
      </div>
    `;

    document.body.appendChild(win);

    this._el    = win;
    this._body  = win.querySelector('.explorer-content');
    this._back  = win.querySelector('.explorer-back-btn');
    this._crumb = win.querySelector('.explorer-breadcrumb');

    win.querySelector('.explorer-control.close').addEventListener('click', () => this.close());
    this._back.addEventListener('click', () => this._goBack());

    _makeDraggable(win, win.querySelector('.explorer-titlebar'));
    _makeResizable(win);

    this._updateBreadcrumb();
    this._render();
  }

  // ── Navigation ──────────────────────────────────

  _navigate (child) {
    if (child.type === 'file') {
      if (!this._viewer) this._viewer = new FileViewer();
      this._viewer.open(child);
      return;
    }
    this.stack.push(this.node);
    this.node = child;
    this._updateBreadcrumb();
    this._render();
  }

  _goBack () {
    if (!this.stack.length) return;
    this.node = this.stack.pop();
    this._updateBreadcrumb();
    this._render();
  }

  _updateBreadcrumb () {
    const parts = this.stack.map(n => n.name).concat([this.node.name]);
    this._crumb.innerHTML = parts.map((name, i) =>
      i === parts.length - 1
        ? `<span class="crumb-current">${_esc(name)}</span>`
        : `${_esc(name)}<span class="crumb-sep">/</span>`
    ).join('');
    this._back.disabled = this.stack.length === 0;
  }

  // ── Render ──────────────────────────────────────

  _render () {
    this._body.innerHTML = '';

    const children = this.node.children || [];

    const hdr = document.createElement('div');
    hdr.className = 'explorer-col-header';
    hdr.innerHTML = `<span></span><span>Name</span><span>Type</span>`;
    this._body.appendChild(hdr);

    if (!children.length) {
      const empty = document.createElement('div');
      empty.className = 'explorer-empty';
      empty.textContent = 'Empty folder';
      this._body.appendChild(empty);
      return;
    }

    const sorted = [...children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach(child => {
      const row = document.createElement('div');
      row.className = 'explorer-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      const isDir = child.type === 'dir';
      const icon  = _iconClass(child);
      const kind  = isDir ? 'Folder' : _kind(child.name);

      row.innerHTML = `
        <span class="explorer-row-icon ${isDir ? '' : 'is-file'}">
          <i class="${icon}"></i>
        </span>
        <span class="explorer-row-name">${_esc(child.name)}</span>
        <span class="explorer-row-kind">${kind}</span>
      `;

      row.addEventListener('click',   () => this._navigate(child));
      row.addEventListener('keydown', e => { if (e.key === 'Enter') this._navigate(child); });

      this._body.appendChild(row);
    });
  }

}

// ── File Viewer ──────────────────────────────────────

class FileViewer {
  constructor () {
    this._el    = null;
    this._title = null;
    this._body  = null;
    this._build();
  }

  open (node) {
    const w = this._el;
    w.style.removeProperty('left');
    w.style.removeProperty('top');
    w.style.removeProperty('width');
    w.style.removeProperty('height');
    w.style.removeProperty('transform');
    w.style.removeProperty('animation');
    w.classList.remove('is-open', 'is-closing');
    void w.offsetWidth;

    this._title.textContent = node.name;
    this._body.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'explorer-file-content';
    content.innerHTML = _renderMarkdown(node.content || '(empty)');
    this._body.appendChild(content);

    if (!_openWindows.includes(this)) _openWindows.push(this);
    _bringToFront(w);
    requestAnimationFrame(() => w.classList.add('is-open'));
  }

  close () {
    const w = this._el;
    if (!w.classList.contains('is-open') || w.classList.contains('is-closing')) return;
    w.style.removeProperty('animation');
    void w.offsetWidth;
    w.classList.add('is-closing');
    const onEnd = e => {
      if (e.animationName !== 'genie-out') return;
      w.removeEventListener('animationend', onEnd);
      w.classList.remove('is-open', 'is-closing');
      const idx = _openWindows.indexOf(this);
      if (idx !== -1) _openWindows.splice(idx, 1);
    };
    w.addEventListener('animationend', onEnd);
  }

  _build () {
    const win = document.createElement('div');
    win.className = 'explorer-window viewer-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', 'File Viewer');

    win.innerHTML = `
      <div class="explorer-titlebar">
        <div class="explorer-controls">
          <button class="explorer-control close"    title="Close"    aria-label="Close"></button>
          <button class="explorer-control minimise" title="Minimise" aria-label="Minimise"></button>
          <button class="explorer-control maximise" title="Maximise" aria-label="Maximise"></button>
        </div>
        <span class="explorer-title-text">
          <i class="fa-solid fa-file viewer-title-icon"></i>
          <span class="viewer-title-name"></span>
        </span>
        <div class="explorer-titlebar-spacer"></div>
      </div>
      <div class="explorer-body">
        <div class="explorer-file-view" style="height:100%;"></div>
      </div>
    `;

    document.body.appendChild(win);
    this._el    = win;
    this._title = win.querySelector('.viewer-title-name');
    this._body  = win.querySelector('.explorer-file-view');

    win.querySelector('.explorer-control.close').addEventListener('click', () => this.close());

    _makeDraggable(win, win.querySelector('.explorer-titlebar'));
    _makeResizable(win);
  }
}

// ── Skills App ───────────────────────────────────────

class SkillsApp {
  constructor (skills) {
    this._skills = skills;
    this._el     = null;
    this._build();
  }

  open () {
    const w = this._el;
    w.style.removeProperty('left');
    w.style.removeProperty('top');
    w.style.removeProperty('width');
    w.style.removeProperty('height');
    w.style.removeProperty('transform');
    w.style.removeProperty('animation');
    w.classList.remove('is-open', 'is-closing');
    void w.offsetWidth;
    if (!_openWindows.includes(this)) _openWindows.push(this);
    _bringToFront(w);
    requestAnimationFrame(() => w.classList.add('is-open'));
  }

  close () {
    const w = this._el;
    if (!w.classList.contains('is-open') || w.classList.contains('is-closing')) return;
    w.style.removeProperty('animation');
    void w.offsetWidth;
    w.classList.add('is-closing');
    const onEnd = e => {
      if (e.animationName !== 'genie-out') return;
      w.removeEventListener('animationend', onEnd);
      w.classList.remove('is-open', 'is-closing');
      const idx = _openWindows.indexOf(this);
      if (idx !== -1) _openWindows.splice(idx, 1);
    };
    w.addEventListener('animationend', onEnd);
  }

  toggle () {
    const w = this._el;
    if (w.classList.contains('is-closing')) { this.open(); return; }
    w.classList.contains('is-open') ? this.close() : this.open();
  }

  _build () {
    const win = document.createElement('div');
    win.className = 'explorer-window skills-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', 'Skills');

    win.innerHTML = `
      <div class="explorer-titlebar">
        <div class="explorer-controls">
          <button class="explorer-control close"    title="Close"    aria-label="Close"></button>
          <button class="explorer-control minimise" title="Minimise" aria-label="Minimise"></button>
          <button class="explorer-control maximise" title="Maximise" aria-label="Maximise"></button>
        </div>
        <span class="explorer-title-text">
          <i class="fa-solid fa-hexagon-nodes skills-title-icon"></i> Skills
        </span>
        <div class="explorer-titlebar-spacer"></div>
      </div>
      <div class="explorer-body">
        <div class="skills-content"></div>
      </div>
    `;

    document.body.appendChild(win);
    this._el = win;

    const body = win.querySelector('.skills-content');

    const hdr = document.createElement('div');
    hdr.className = 'skills-col-header';
    hdr.innerHTML = `<span>Skill</span><span>Status</span><span>Projects</span>`;
    body.appendChild(hdr);

    this._skills.forEach(s => {
      const row = document.createElement('div');
      const statusKey = s.status.toLowerCase().replace(/\s+/g, '-');
      const multi = s.projects && s.projects.length > 1;

      let projectsHtml;
      if (!s.projects || s.projects.length === 0) {
        projectsHtml = '<span class="skills-projects-empty">—</span>';
      } else if (s.projects.length === 1) {
        projectsHtml = `<span class="skills-projects-item">${_esc(s.projects[0])}</span>`;
      } else {
        projectsHtml = `<span class="skills-projects-multiple">multiple <span class="skills-projects-count">${s.projects.length}</span></span>`;
      }

      row.className = 'skills-row' + (multi ? ' is-clickable' : '');
      row.innerHTML = `
        <span class="skills-name">${_esc(s.name)}</span>
        <span class="skills-status skills-status--${statusKey}">
          <span class="skills-dot"></span>${_esc(s.status)}
        </span>
        <span class="skills-projects">${projectsHtml}</span>
      `;

      if (multi) {
        row.addEventListener('click', () => {
          if (!this._detail) this._detail = new SkillDetailWindow();
          this._detail.open(s);
        });
      }

      body.appendChild(row);
    });

    win.querySelector('.explorer-control.close').addEventListener('click', () => this.close());
    _makeDraggable(win, win.querySelector('.explorer-titlebar'));
    _makeResizable(win);
  }
}

// ── Skill Detail Window ──────────────────────────────

class SkillDetailWindow {
  constructor () {
    this._el     = null;
    this._title  = null;
    this._body   = null;
    this._viewer = null;
    this._build();
  }

  open (skill) {
    const w = this._el;
    w.style.removeProperty('left');
    w.style.removeProperty('top');
    w.style.removeProperty('width');
    w.style.removeProperty('height');
    w.style.removeProperty('transform');
    w.style.removeProperty('animation');
    w.classList.remove('is-open', 'is-closing');
    void w.offsetWidth;

    this._title.textContent = skill.name;
    const statusKey = skill.status.toLowerCase().replace(/\s+/g, '-');
    this._body.innerHTML = `
      <div class="skill-detail-header">
        <span class="skill-detail-skill-name">${_esc(skill.name)}</span>
        <span class="skills-status skills-status--${statusKey}">
          <span class="skills-dot"></span>${_esc(skill.status)}
        </span>
      </div>
      <div class="skill-detail-section-label">Projects</div>
    `;
    skill.projects.forEach(p => {
      const readme = _findReadme(p);
      const item = document.createElement('div');
      item.className = 'skill-detail-item' + (readme ? ' is-clickable' : '');
      item.textContent = p;
      if (readme) {
        item.addEventListener('click', () => {
          if (!this._viewer) this._viewer = new FileViewer();
          this._viewer.open(readme);
        });
      }
      this._body.appendChild(item);
    });

    if (!_openWindows.includes(this)) _openWindows.push(this);
    _bringToFront(w);
    requestAnimationFrame(() => w.classList.add('is-open'));
  }

  close () {
    const w = this._el;
    if (!w.classList.contains('is-open') || w.classList.contains('is-closing')) return;
    w.style.removeProperty('animation');
    void w.offsetWidth;
    w.classList.add('is-closing');
    const onEnd = e => {
      if (e.animationName !== 'genie-out') return;
      w.removeEventListener('animationend', onEnd);
      w.classList.remove('is-open', 'is-closing');
      const idx = _openWindows.indexOf(this);
      if (idx !== -1) _openWindows.splice(idx, 1);
    };
    w.addEventListener('animationend', onEnd);
  }

  _build () {
    const win = document.createElement('div');
    win.className = 'explorer-window skill-detail-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', 'Skill Detail');

    win.innerHTML = `
      <div class="explorer-titlebar">
        <div class="explorer-controls">
          <button class="explorer-control close"    title="Close"    aria-label="Close"></button>
          <button class="explorer-control minimise" title="Minimise" aria-label="Minimise"></button>
          <button class="explorer-control maximise" title="Maximise" aria-label="Maximise"></button>
        </div>
        <span class="explorer-title-text">
          <i class="fa-solid fa-hexagon-nodes skills-title-icon"></i>
          <span class="skill-detail-title-name"></span>
        </span>
        <div class="explorer-titlebar-spacer"></div>
      </div>
      <div class="explorer-body">
        <div class="skill-detail-body"></div>
      </div>
    `;

    document.body.appendChild(win);
    this._el    = win;
    this._title = win.querySelector('.skill-detail-title-name');
    this._body  = win.querySelector('.skill-detail-body');

    win.querySelector('.explorer-control.close').addEventListener('click', () => this.close());
    _makeDraggable(win, win.querySelector('.explorer-titlebar'));
    _makeResizable(win);
  }
}

// ── Browser App ──────────────────────────────────────

class BrowserApp {
  constructor () {
    this._el      = null;
    this._input   = null;
    this._content = null;
    this._build();
  }

  open () {
    const w = this._el;
    w.style.removeProperty('left');
    w.style.removeProperty('top');
    w.style.removeProperty('width');
    w.style.removeProperty('height');
    w.style.removeProperty('transform');
    w.style.removeProperty('animation');
    w.classList.remove('is-open', 'is-closing');
    void w.offsetWidth;
    if (!_openWindows.includes(this)) _openWindows.push(this);
    _bringToFront(w);
    requestAnimationFrame(() => { w.classList.add('is-open'); this._input.focus(); });
  }

  close () {
    const w = this._el;
    if (!w.classList.contains('is-open') || w.classList.contains('is-closing')) return;
    w.style.removeProperty('animation');
    void w.offsetWidth;
    w.classList.add('is-closing');
    const onEnd = e => {
      if (e.animationName !== 'genie-out') return;
      w.removeEventListener('animationend', onEnd);
      w.classList.remove('is-open', 'is-closing');
      const idx = _openWindows.indexOf(this);
      if (idx !== -1) _openWindows.splice(idx, 1);
    };
    w.addEventListener('animationend', onEnd);
  }

  toggle () {
    const w = this._el;
    if (w.classList.contains('is-closing')) { this.open(); return; }
    w.classList.contains('is-open') ? this.close() : this.open();
  }

  _search (query) {
    this._content.innerHTML = '';
    if (!query.trim()) return;
    const div = document.createElement('div');
    div.className = 'browser-result';
    div.innerHTML = `
      <span class="browser-result-label">you searched for</span>
      <span class="browser-result-text">${_esc(query)}</span>
    `;
    this._content.appendChild(div);
  }

  _build () {
    const win = document.createElement('div');
    win.className = 'explorer-window browser-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', 'Chrome');

    win.innerHTML = `
      <div class="explorer-titlebar">
        <div class="explorer-controls">
          <button class="explorer-control close"    title="Close"    aria-label="Close"></button>
          <button class="explorer-control minimise" title="Minimise" aria-label="Minimise"></button>
          <button class="explorer-control maximise" title="Maximise" aria-label="Maximise"></button>
        </div>
        <span class="explorer-title-text">Chrome</span>
        <div class="explorer-titlebar-spacer"></div>
      </div>
      <div class="browser-nav">
        <button class="browser-nav-btn" aria-label="Back"><i class="fa-solid fa-chevron-left"></i></button>
        <button class="browser-nav-btn" aria-label="Forward"><i class="fa-solid fa-chevron-right"></i></button>
        <button class="browser-nav-btn" aria-label="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
        <div class="browser-addressbar">
          <input class="browser-input" type="text" placeholder="Search or enter address" spellcheck="false" autocomplete="off">
        </div>
      </div>
      <div class="explorer-body">
        <div class="browser-content"></div>
      </div>
    `;

    document.body.appendChild(win);
    this._el      = win;
    this._input   = win.querySelector('.browser-input');
    this._content = win.querySelector('.browser-content');

    win.querySelector('.explorer-control.close').addEventListener('click', () => this.close());
    this._input.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._search(this._input.value);
    });

    _makeDraggable(win, win.querySelector('.explorer-titlebar'));
    _makeResizable(win);
  }
}

// ── Start Menu ───────────────────────────────────────

class StartMenu {
  constructor (apps) {
    this._apps    = apps;
    this._el      = null;
    this._overlay = null;
    this._input   = null;
    this._list    = null;
    this._build();
  }

  open () {
    this._input.value = '';
    this._renderApps('');
    this._overlay.classList.add('is-open');
    this._el.classList.add('is-open');
    if (!_openWindows.includes(this)) _openWindows.push(this);
    requestAnimationFrame(() => this._input.focus());
  }

  close () {
    if (!this._el.classList.contains('is-open')) return;
    this._el.classList.remove('is-open');
    this._overlay.classList.remove('is-open');
    const idx = _openWindows.indexOf(this);
    if (idx !== -1) _openWindows.splice(idx, 1);
  }

  toggle () {
    this._el.classList.contains('is-open') ? this.close() : this.open();
  }

  _renderApps (query) {
    this._list.innerHTML = '';
    const q = query.toLowerCase().trim();
    this._apps
      .filter(a => !q || a.name.toLowerCase().includes(q))
      .forEach(a => {
        const item = document.createElement('div');
        item.className = 'startmenu-app';
        item.innerHTML = `
          <span class="startmenu-app-icon"><i class="${a.icon}"></i></span>
          <span class="startmenu-app-name">${_esc(a.name)}</span>
        `;
        item.addEventListener('click', () => { this.close(); a.app.open(); });
        this._list.appendChild(item);
      });

    if (!this._list.children.length) {
      const empty = document.createElement('div');
      empty.className = 'startmenu-empty';
      empty.textContent = 'no apps found';
      this._list.appendChild(empty);
    }
  }

  _build () {
    const overlay = document.createElement('div');
    overlay.className = 'explorer-overlay';
    overlay.style.zIndex = '599';
    overlay.addEventListener('click', () => this.close());
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const el = document.createElement('div');
    el.className = 'startmenu';
    el.innerHTML = `
      <div class="startmenu-search-wrap">
        <i class="fa-solid fa-magnifying-glass startmenu-search-icon"></i>
        <input class="startmenu-input" type="text" placeholder="Search apps" spellcheck="false" autocomplete="off">
      </div>
      <div class="startmenu-apps"></div>
    `;
    el.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(el);
    this._el    = el;
    this._input = el.querySelector('.startmenu-input');
    this._list  = el.querySelector('.startmenu-apps');

    this._input.addEventListener('input', () => this._renderApps(this._input.value));
  }
}

// ── Module-level state ───────────────────────────────

const _openWindows = [];
let   _zTop = 500;
let   _filesystem = null;

function _bringToFront (win) {
  win.style.zIndex = ++_zTop;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _openWindows.length)
    _openWindows[_openWindows.length - 1].close();
});

// ── Helpers ──────────────────────────────────────────

function _makeDraggable (win, handle) {
  let active = false;
  let startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', e => {
    if (e.target.closest('.explorer-controls')) return;
    if (e.target.closest('.resize-handle')) return;
    active = true;
    handle.classList.add('is-dragging');

    const rect = win.getBoundingClientRect();
    win.style.animation = 'none';
    win.style.transform = 'none';
    win.style.left = `${rect.left}px`;
    win.style.top  = `${rect.top}px`;

    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = rect.left;
    startTop  = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!active) return;
    win.style.left = `${startLeft + e.clientX - startX}px`;
    win.style.top  = `${startTop  + e.clientY - startY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!active) return;
    active = false;
    handle.classList.remove('is-dragging');
  });
}

function _makeResizable (win) {
  win.addEventListener('mousedown', () => _bringToFront(win));

  ['n','s','e','w','ne','nw','se','sw'].forEach(dir => {
    const h = document.createElement('div');
    h.className = `resize-handle ${dir}`;
    h.dataset.dir = dir;
    win.appendChild(h);
  });

  const MIN_W = 360, MIN_H = 260;
  let active = false, dir;
  let startX, startY, startW, startH, startLeft, startTop;

  win.addEventListener('mousedown', e => {
    const handle = e.target.closest('.resize-handle');
    if (!handle) return;

    dir    = handle.dataset.dir;
    active = true;

    const rect = win.getBoundingClientRect();
    win.style.animation = 'none';
    win.style.transform = 'none';
    win.style.left   = `${rect.left}px`;
    win.style.top    = `${rect.top}px`;
    win.style.width  = `${rect.width}px`;
    win.style.height = `${rect.height}px`;

    startX    = e.clientX;
    startY    = e.clientY;
    startW    = rect.width;
    startH    = rect.height;
    startLeft = rect.left;
    startTop  = rect.top;

    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', e => {
    if (!active) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let w = startW, h = startH, l = startLeft, t = startTop;

    if (dir.includes('e')) w = Math.max(MIN_W, startW + dx);
    if (dir.includes('s')) h = Math.max(MIN_H, startH + dy);
    if (dir.includes('w')) { w = Math.max(MIN_W, startW - dx); l = startLeft + startW - w; }
    if (dir.includes('n')) { h = Math.max(MIN_H, startH - dy); t = startTop  + startH - h; }

    win.style.width  = `${w}px`;
    win.style.height = `${h}px`;
    win.style.left   = `${l}px`;
    win.style.top    = `${t}px`;
  });

  document.addEventListener('mouseup', () => { if (active) active = false; });
}

function _esc (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _iconClass (node) {
  if (node.type === 'dir') return 'fa-solid fa-folder';
  const ext = node.name.split('.').pop().toLowerCase();
  return {
    md:   'fa-solid fa-file-lines',
    txt:  'fa-solid fa-file-lines',
    py:   'fa-solid fa-file-code',
    js:   'fa-solid fa-file-code',
    ts:   'fa-solid fa-file-code',
    html: 'fa-solid fa-file-code',
    css:  'fa-solid fa-file-code',
    json: 'fa-solid fa-file-code',
    cs:   'fa-solid fa-file-code',
  }[ext] ?? 'fa-solid fa-file';
}

function _kind (name) {
  const ext = name.split('.').pop().toLowerCase();
  return {
    md:   'Markdown',
    txt:  'Text',
    py:   'Python',
    js:   'JavaScript',
    ts:   'TypeScript',
    html: 'HTML',
    css:  'CSS',
    json: 'JSON',
    cs:   'C#',
  }[ext] ?? ext.toUpperCase();
}

function _renderMarkdown (text) {
  return text.split('\n').map(line => {
    if (line.startsWith('### ')) return `<span class="md-h3">${_esc(line.slice(4))}</span>`;
    if (line.startsWith('## '))  return `<span class="md-h2">${_esc(line.slice(3))}</span>`;
    if (line.startsWith('# '))   return `<span class="md-h1">${_esc(line.slice(2))}</span>`;
    if (line.startsWith('- '))   return `<span class="md-li">› ${_inline(_esc(line.slice(2)))}</span>`;
    if (line.trim() === '')      return `<span class="md-br"></span>`;
    return `<span class="md-p">${_inline(_esc(line))}</span>`;
  }).join('\n');
}

function _inline (html) {
  return html
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g,       '<code>$1</code>');
}

function _findReadme (name) {
  if (!_filesystem) return null;
  const norm  = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 1);
  const nName = norm(name);
  const wName = words(name);

  function matches (folderName) {
    const nFolder = norm(folderName);
    if (nFolder === nName) return true;
    if (nName.includes(nFolder) || nFolder.includes(nName)) return true;
    const wFolder = words(folderName);
    return wFolder.length > 0 && wFolder.every(fw =>
      wName.some(sw => sw.includes(fw) || fw.includes(sw))
    );
  }

  function search (node) {
    if (node.type === 'dir' && matches(node.name)) {
      const readme = (node.children || []).find(c => c.type === 'file' && c.name.toLowerCase() === 'readme.md');
      if (readme) return readme;
    }
    for (const child of (node.children || [])) {
      if (child.type === 'dir') {
        const result = search(child);
        if (result) return result;
      }
    }
    return null;
  }

  return search(_filesystem);
}
