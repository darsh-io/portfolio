// Requires a local server (e.g. VS Code Live Server) — fetch() won't work over file://

document.addEventListener('DOMContentLoaded', async () => {
  let fsData = null, skillsData = null;

  try {
    const [fsRes, skRes] = await Promise.all([
      fetch('./Data/filesystem.json'),
      fetch('./Data/skills.json'),
    ]);
    if (fsRes.ok) fsData     = await fsRes.json();
    if (skRes.ok) skillsData = await skRes.json();
  } catch (err) {
    // Over file:// or with a blocked/404 request the apps fall back to
    // cached/empty data — the desktop must stay usable regardless.
    console.warn('[apps] Could not load data:', err.message);
  }

  // localStorage cache wins (persisted edits); else fetched data; else empty root.
  const filesystem = _loadFilesystem(fsData || { name: '~', type: 'dir', children: [] });
  const skills     = (skillsData && skillsData.skills) || [];
  _filesystem = filesystem;

  const explorerApp = new FileExplorer(filesystem);
  const browserApp  = new BrowserApp();
  const skillsApp   = new SkillsApp(skills);
  const terminalApp = new TerminalApp(filesystem, () => explorerApp.refresh());
  const startMenu   = new StartMenu([
    { name: 'Files',    icon: 'fa-solid fa-folder-closed', app: explorerApp },
    { name: 'Chrome',   icon: 'fa-brands fa-chrome',       app: browserApp  },
    { name: 'Skills',   icon: 'fa-solid fa-hexagon-nodes', app: skillsApp   },
    { name: 'Terminal', icon: 'fa-solid fa-terminal',      app: terminalApp },
  ]);

  document.querySelector('[title="Files"]')    ?.addEventListener('click', () => explorerApp.toggle());
  document.querySelector('[title="Chrome"]')   ?.addEventListener('click', () => browserApp.toggle());
  document.querySelector('[title="Skills"]')   ?.addEventListener('click', () => skillsApp.toggle());
  document.querySelector('[title="Terminal"]') ?.addEventListener('click', () => terminalApp.toggle());
  document.querySelector('[title="Windows"]')  ?.addEventListener('click', () => startMenu.toggle());
  document.querySelector('[title="Search"]')   ?.addEventListener('click', () => startMenu.toggle());
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

  refresh () {
    if (!this._el.classList.contains('is-open')) return;
    // stack[0] is the root itself; the path below root excludes it.
    const path = this.stack.slice(1).map(n => n.name)
      .concat(this.node === this.root ? [] : [this.node.name]);
    const node = _resolveNode(this.root, path);
    if (node && node.type === 'dir') {
      this.node = node;                       // re-point to the live tree node
    } else {
      this.stack = [];
      this.node  = this.root;                 // current dir was removed — go home
    }
    this._updateBreadcrumb();
    this._render();
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

// ── Filesystem persistence ────────────────────────────

const _FS_KEY = 'portfolio_filesystem';

function _loadFilesystem (defaultFs) {
  try {
    const saved = localStorage.getItem(_FS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultFs;
}

function _saveFilesystem (fs) {
  try { localStorage.setItem(_FS_KEY, JSON.stringify(fs)); } catch {}
}

function _resolveNode (root, path) {
  let node = root;
  for (const part of path) {
    if (!node || node.type !== 'dir') return null;
    node = (node.children || []).find(c => c.name === part) ?? null;
  }
  return node;
}

// ── Terminal App ─────────────────────────────────────

class TerminalApp {
  constructor (fs, onFsChange) {
    this._fs          = fs;
    this._onFsChange  = onFsChange || (() => {});
    this._cwd         = [];
    this._hist        = [];
    this._histIdx     = -1;
    this._nanoSess    = null;
    this._el          = null;
    this._output      = null;
    this._input       = null;
    this._promptEl    = null;
    this._nano        = null;
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

  _build () {
    const win = document.createElement('div');
    win.className = 'explorer-window terminal-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', 'Terminal');

    win.innerHTML = `
      <div class="explorer-titlebar">
        <div class="explorer-controls">
          <button class="explorer-control close"    title="Close"    aria-label="Close"></button>
          <button class="explorer-control minimise" title="Minimise" aria-label="Minimise"></button>
          <button class="explorer-control maximise" title="Maximise" aria-label="Maximise"></button>
        </div>
        <span class="explorer-title-text">bash — darsh@portfolio</span>
        <div class="explorer-titlebar-spacer"></div>
      </div>
      <div class="terminal-body">
        <div class="term-output"></div>
        <div class="term-input-row">
          <span class="term-prompt"></span>
          <input class="term-input" type="text" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" aria-label="Terminal input">
        </div>
        <div class="nano-overlay">
          <div class="nano-bar nano-top">
            <span>GNU nano</span>
            <span class="nano-fname"></span>
            <span class="nano-mod"></span>
          </div>
          <textarea class="nano-editor" spellcheck="false"></textarea>
          <div class="nano-bar nano-bot">
            <span>^S Save</span><span>^X Exit</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(win);
    this._el       = win;
    this._output   = win.querySelector('.term-output');
    this._input    = win.querySelector('.term-input');
    this._promptEl = win.querySelector('.term-prompt');
    this._nano     = {
      overlay: win.querySelector('.nano-overlay'),
      fname:   win.querySelector('.nano-fname'),
      mod:     win.querySelector('.nano-mod'),
      editor:  win.querySelector('.nano-editor'),
    };

    win.querySelector('.explorer-control.close').addEventListener('click', () => this.close());

    win.querySelector('.terminal-body').addEventListener('mousedown', e => {
      if (!e.target.closest('.nano-overlay')) this._input.focus();
    });

    this._input.addEventListener('keydown', e => this._onKey(e));
    this._nano.editor.addEventListener('input', () => { this._nano.mod.textContent = 'Modified'; });
    this._nano.editor.addEventListener('keydown', e => this._onNanoKey(e));

    _makeDraggable(win, win.querySelector('.explorer-titlebar'));
    _makeResizable(win);

    this._refreshPrompt();
    this._println('darsh@portfolio — bash', 'term-welcome');
    this._println('type "help" for available commands.', 'term-muted');
    this._println('', '');
  }

  // ── Output ────────────────────────────────────

  _println (text, cls) {
    const el = document.createElement('div');
    el.className = 'term-line' + (cls ? ` ${cls}` : '');
    el.textContent = text;
    this._output.appendChild(el);
    this._output.scrollTop = this._output.scrollHeight;
  }

  _printRaw (html, cls) {
    const el = document.createElement('div');
    el.className = 'term-line' + (cls ? ` ${cls}` : '');
    el.innerHTML = html;
    this._output.appendChild(el);
    this._output.scrollTop = this._output.scrollHeight;
  }

  _refreshPrompt () {
    const path = this._cwd.length ? '~/' + this._cwd.join('/') : '~';
    this._promptEl.textContent = `darsh@portfolio:${path}$ `;
  }

  // ── Keyboard ──────────────────────────────────

  _onKey (e) {
    if (e.key === 'Enter') {
      const raw = this._input.value;
      this._input.value = '';
      const trimmed = raw.trim();
      if (trimmed) { this._hist.unshift(trimmed); this._histIdx = -1; }
      this._printRaw(
        `<span class="term-ps">${_esc(this._promptEl.textContent)}</span><span class="term-cmd">${_esc(raw)}</span>`
      );
      if (trimmed) this._exec(trimmed);
      this._refreshPrompt();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this._histIdx < this._hist.length - 1) { this._histIdx++; this._input.value = this._hist[this._histIdx]; }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this._histIdx > 0) { this._histIdx--; this._input.value = this._hist[this._histIdx]; }
      else { this._histIdx = -1; this._input.value = ''; }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this._tab();
      return;
    }
    if (e.ctrlKey && e.key === 'c') {
      this._println(this._promptEl.textContent + this._input.value + '^C', 'term-muted');
      this._input.value = '';
      return;
    }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); this._clear(); }
  }

  _onNanoKey (e) {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); this._nanoSave(); }
    if (e.ctrlKey && e.key === 'x') { e.preventDefault(); this._nanoExit(); }
  }

  // ── Tab completion ────────────────────────────

  _tab () {
    const val   = this._input.value;
    const parts = val.trimStart().split(/\s+/);
    if (parts.length < 2 && !val.endsWith(' ')) return;
    const partial  = val.endsWith(' ') ? '' : parts[parts.length - 1];
    const cwdNode  = _resolveNode(this._fs, this._cwd);
    if (!cwdNode) return;
    const matches = (cwdNode.children || [])
      .filter(c => c.name.startsWith(partial))
      .map(c => c.type === 'dir' ? c.name + '/' : c.name);
    if (matches.length === 1) {
      const prefix = val.endsWith(' ') ? val : val.slice(0, val.length - partial.length);
      this._input.value = prefix + matches[0];
    } else if (matches.length > 1) {
      this._println(matches.join('  '), 'term-muted');
    }
  }

  // ── FS helpers ────────────────────────────────

  _resolvePath (arg) {
    if (!arg || arg === '~' || arg === '/') return { node: this._fs, path: [] };
    let parts;
    if (arg.startsWith('/') || arg.startsWith('~/')) {
      const stripped = arg.startsWith('~/') ? arg.slice(2) : arg.slice(1);
      parts = stripped.split('/').filter(Boolean);
    } else {
      parts = [...this._cwd, ...arg.split('/').filter(Boolean)];
    }
    const resolved = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') { if (resolved.length) resolved.pop(); continue; }
      resolved.push(p);
    }
    return { node: _resolveNode(this._fs, resolved), path: resolved };
  }

  _parentAndName (arg) {
    const segs   = arg.split('/').filter(Boolean);
    const name   = segs.pop();
    const parent = segs.length
      ? this._resolvePath(segs.join('/')).node
      : _resolveNode(this._fs, this._cwd);
    return { parent, name };
  }

  _mutated () {
    _saveFilesystem(this._fs);
    this._onFsChange();
  }

  // ── Command dispatch ──────────────────────────

  _exec (raw) {
    let redirect = null, append = false, cmdStr = raw;
    const rdm = raw.match(/^(.+?)\s*(>>|>)\s*([^\s]+)\s*$/);
    if (rdm) { cmdStr = rdm[1]; append = rdm[2] === '>>'; redirect = rdm[3]; }

    const args = this._parseArgs(cmdStr);
    const name = args[0];
    const rest = args.slice(1);

    const MAP = {
      ls:       () => this._ls(rest),
      ll:       () => this._ls(['-l', ...rest]),
      la:       () => this._ls(['-a', ...rest]),
      cat:      () => this._cat(rest),
      touch:    () => this._touch(rest),
      mkdir:    () => this._mkdir(rest),
      rm:       () => this._rm(rest),
      rmdir:    () => this._rmdir(rest),
      cp:       () => this._cp(rest),
      mv:       () => this._mv(rest),
      cd:       () => this._cd(rest),
      pwd:      () => this._pwd(),
      echo:     () => this._echo(rest, redirect, append),
      nano:     () => this._nanoOpen(rest),
      grep:     () => this._grep(rest),
      head:     () => this._headTail(rest, 'head'),
      tail:     () => this._headTail(rest, 'tail'),
      wc:       () => this._wc(rest),
      find:     () => this._find(rest),
      whoami:   () => this._println('darsh'),
      hostname: () => this._println('portfolio'),
      uname:    () => this._println('Linux portfolio 6.1.0-generic #1 SMP x86_64 GNU/Linux'),
      uptime:   () => this._println(`up ${Math.floor(Math.random()*24)}h ${Math.floor(Math.random()*60)}m,  1 user`),
      date:     () => this._println(new Date().toString()),
      history:  () => [...this._hist].reverse().forEach((h, i) => this._println(`  ${i + 1}  ${h}`)),
      man:      () => this._println(`no manual entry for '${rest[0] || ''}'. Try: help`, 'term-muted'),
      which:    () => { const k = rest[0]; MAP[k] ? this._println(`/usr/bin/${k}`) : this._println(`${k}: not found`, 'term-err'); },
      clear:    () => this._clear(),
      neofetch: () => this._neofetch(),
      reset:    () => { localStorage.removeItem(_FS_KEY); this._println('Filesystem reset to default. Reload to apply.'); },
      exit:     () => this.close(),
      help:     () => this._help(),
    };

    if (MAP[name]) MAP[name]();
    else if (name) this._println(`bash: ${name}: command not found`, 'term-err');
  }

  _parseArgs (cmd) {
    const out = []; let cur = '', q = null;
    for (const ch of cmd) {
      if ((ch === '"' || ch === "'") && !q) q = ch;
      else if (ch === q) q = null;
      else if (ch === ' ' && !q) { if (cur) { out.push(cur); cur = ''; } }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  // ── Commands ──────────────────────────────────

  _ls (args) {
    const pathArg = args.find(a => !a.startsWith('-'));
    const { node } = pathArg ? this._resolvePath(pathArg) : { node: _resolveNode(this._fs, this._cwd) };
    if (!node) { this._println(`ls: cannot access '${pathArg}': No such file or directory`, 'term-err'); return; }
    if (node.type === 'file') { this._println(node.name); return; }
    const kids = [...(node.children || [])].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!kids.length) return;
    const items = kids.map(c =>
      `<span class="${c.type === 'dir' ? 'ls-dir' : 'ls-file'}">${_esc(c.type === 'dir' ? c.name + '/' : c.name)}</span>`
    );
    this._printRaw(items.join('  '), 'term-ls');
  }

  _cat (args) {
    if (!args.length) { this._println('cat: missing file operand', 'term-err'); return; }
    for (const a of args) {
      const { node } = this._resolvePath(a);
      if (!node) { this._println(`cat: ${a}: No such file or directory`, 'term-err'); continue; }
      if (node.type === 'dir') { this._println(`cat: ${a}: Is a directory`, 'term-err'); continue; }
      (node.content || '').split('\n').forEach(l => this._println(l));
    }
  }

  _touch (args) {
    if (!args.length) { this._println('touch: missing file operand', 'term-err'); return; }
    for (const a of args) {
      const { parent, name } = this._parentAndName(a);
      if (!parent || parent.type !== 'dir') { this._println(`touch: cannot touch '${a}': No such file or directory`, 'term-err'); continue; }
      parent.children = parent.children || [];
      if (!parent.children.find(c => c.name === name)) {
        parent.children.push({ name, type: 'file', content: '' });
        this._mutated();
      }
    }
  }

  _mkdir (args) {
    const dirs = args.filter(a => a !== '-p');
    if (!dirs.length) { this._println('mkdir: missing operand', 'term-err'); return; }
    for (const a of dirs) {
      const { parent, name } = this._parentAndName(a);
      if (!parent || parent.type !== 'dir') { this._println(`mkdir: cannot create directory '${a}': No such file or directory`, 'term-err'); continue; }
      parent.children = parent.children || [];
      if (parent.children.find(c => c.name === name)) { this._println(`mkdir: cannot create directory '${a}': File exists`, 'term-err'); continue; }
      parent.children.push({ name, type: 'dir', children: [] });
      this._mutated();
    }
  }

  _rm (args) {
    const flags   = args.filter(a => a.startsWith('-')).join('');
    const recursive = flags.includes('r') || flags.includes('R');
    const targets = args.filter(a => !a.startsWith('-'));
    if (!targets.length) { this._println('rm: missing operand', 'term-err'); return; }
    for (const a of targets) {
      const { parent, name } = this._parentAndName(a);
      if (!parent) { this._println(`rm: cannot remove '${a}': No such file or directory`, 'term-err'); continue; }
      const idx = (parent.children || []).findIndex(c => c.name === name);
      if (idx === -1) { this._println(`rm: cannot remove '${a}': No such file or directory`, 'term-err'); continue; }
      if (parent.children[idx].type === 'dir' && !recursive) { this._println(`rm: cannot remove '${a}': Is a directory`, 'term-err'); continue; }
      parent.children.splice(idx, 1);
      this._mutated();
    }
  }

  _rmdir (args) {
    if (!args.length) { this._println('rmdir: missing operand', 'term-err'); return; }
    for (const a of args) {
      const { parent, name } = this._parentAndName(a);
      if (!parent) { this._println(`rmdir: failed to remove '${a}': No such file or directory`, 'term-err'); continue; }
      const idx = (parent.children || []).findIndex(c => c.name === name);
      if (idx === -1) { this._println(`rmdir: failed to remove '${a}': No such file or directory`, 'term-err'); continue; }
      const node = parent.children[idx];
      if (node.type !== 'dir') { this._println(`rmdir: failed to remove '${a}': Not a directory`, 'term-err'); continue; }
      if (node.children && node.children.length) { this._println(`rmdir: failed to remove '${a}': Directory not empty`, 'term-err'); continue; }
      parent.children.splice(idx, 1);
      this._mutated();
    }
  }

  _cp (args) {
    if (args.length < 2) { this._println('cp: missing destination', 'term-err'); return; }
    const [src, dst] = [args[0], args[args.length - 1]];
    const { node: srcNode } = this._resolvePath(src);
    if (!srcNode) { this._println(`cp: '${src}': No such file or directory`, 'term-err'); return; }
    const clone = JSON.parse(JSON.stringify(srcNode));
    const { node: dstNode } = this._resolvePath(dst);
    if (dstNode && dstNode.type === 'dir') {
      dstNode.children = dstNode.children || [];
      dstNode.children.push(clone);
    } else {
      const { parent, name } = this._parentAndName(dst);
      if (!parent) { this._println(`cp: cannot create '${dst}'`, 'term-err'); return; }
      clone.name = name;
      parent.children = parent.children || [];
      parent.children.push(clone);
    }
    this._mutated();
  }

  _mv (args) {
    if (args.length < 2) { this._println('mv: missing destination', 'term-err'); return; }
    const [src, dst] = [args[0], args[args.length - 1]];
    const { parent: sp, name: sn } = this._parentAndName(src);
    if (!sp) { this._println(`mv: '${src}': No such file or directory`, 'term-err'); return; }
    const si = (sp.children || []).findIndex(c => c.name === sn);
    if (si === -1) { this._println(`mv: '${src}': No such file or directory`, 'term-err'); return; }
    const node = sp.children.splice(si, 1)[0];
    const { node: dstNode } = this._resolvePath(dst);
    if (dstNode && dstNode.type === 'dir') {
      dstNode.children = dstNode.children || [];
      dstNode.children.push(node);
    } else {
      const { parent: dp, name: dn } = this._parentAndName(dst);
      if (!dp) { sp.children.splice(si, 0, node); this._println(`mv: cannot move '${src}' to '${dst}'`, 'term-err'); return; }
      node.name = dn;
      dp.children = dp.children || [];
      dp.children.push(node);
    }
    this._mutated();
  }

  _cd (args) {
    const arg = args[0];
    if (!arg || arg === '~' || arg === '/') { this._cwd = []; return; }
    const { node, path } = this._resolvePath(arg);
    if (!node) { this._println(`cd: ${arg}: No such file or directory`, 'term-err'); return; }
    if (node.type !== 'dir') { this._println(`cd: ${arg}: Not a directory`, 'term-err'); return; }
    this._cwd = path;
  }

  _pwd () {
    this._println('/' + (this._cwd.length ? '~/' + this._cwd.join('/') : '~'));
  }

  _echo (args, redirectFile, append) {
    const text = args.join(' ');
    if (!redirectFile) { this._println(text); return; }
    const { node } = this._resolvePath(redirectFile);
    if (node && node.type === 'file') {
      node.content = append ? ((node.content ? node.content + '\n' : '') + text) : text;
    } else {
      const { parent, name } = this._parentAndName(redirectFile);
      if (!parent) { this._println(`bash: ${redirectFile}: No such file or directory`, 'term-err'); return; }
      parent.children = parent.children || [];
      const ex = parent.children.find(c => c.name === name);
      if (ex) ex.content = append ? ((ex.content ? ex.content + '\n' : '') + text) : text;
      else parent.children.push({ name, type: 'file', content: text });
    }
    this._mutated();
  }

  _grep (args) {
    const flags   = args.filter(a => a.startsWith('-')).join('');
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length < 2) { this._println('usage: grep <pattern> <file>', 'term-err'); return; }
    const [pattern, ...files] = targets;
    let re;
    try { re = new RegExp(pattern, flags.includes('i') ? 'i' : ''); }
    catch { this._println(`grep: invalid pattern: ${pattern}`, 'term-err'); return; }
    for (const f of files) {
      const { node } = this._resolvePath(f);
      if (!node) { this._println(`grep: ${f}: No such file or directory`, 'term-err'); continue; }
      if (node.type === 'dir') { this._println(`grep: ${f}: Is a directory`, 'term-err'); continue; }
      (node.content || '').split('\n').forEach((line, i) => {
        if (re.test(line)) this._println(flags.includes('n') ? `${i + 1}:${line}` : line);
      });
    }
  }

  _headTail (args, mode) {
    let n = 10;
    const files = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-n') { n = parseInt(args[++i], 10) || 10; }
      else if (!args[i].startsWith('-')) files.push(args[i]);
    }
    if (!files.length) { this._println(`${mode}: missing operand`, 'term-err'); return; }
    for (const f of files) {
      const { node } = this._resolvePath(f);
      if (!node || node.type === 'dir') { this._println(`${mode}: ${f}: No such file or directory`, 'term-err'); continue; }
      const lines = (node.content || '').split('\n');
      (mode === 'head' ? lines.slice(0, n) : lines.slice(-n)).forEach(l => this._println(l));
    }
  }

  _wc (args) {
    if (!args.length) { this._println('wc: missing operand', 'term-err'); return; }
    for (const f of args.filter(a => !a.startsWith('-'))) {
      const { node } = this._resolvePath(f);
      if (!node || node.type === 'dir') { this._println(`wc: ${f}: No such file or directory`, 'term-err'); continue; }
      const c = node.content || '';
      const lines = c.split('\n').length;
      const words = c.trim() ? c.trim().split(/\s+/).length : 0;
      this._println(`  ${lines}  ${words}  ${c.length} ${f}`);
    }
  }

  _find (args) {
    const nameIdx    = args.indexOf('-name');
    const namePattern = nameIdx !== -1 ? args[nameIdx + 1] : null;
    const pathArgs   = args.filter((a, i) => !a.startsWith('-') && i !== nameIdx + 1);
    const pathArg    = pathArgs[0] || '.';
    const startNode  = pathArg === '.' ? _resolveNode(this._fs, this._cwd) : this._resolvePath(pathArg).node;
    if (!startNode) { this._println(`find: '${pathArg}': No such file or directory`, 'term-err'); return; }
    const re = namePattern
      ? new RegExp('^' + namePattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
      : null;
    const walk = (node, path) => {
      if (!re || re.test(node.name)) this._println(path);
      if (node.type === 'dir') (node.children || []).forEach(c => walk(c, path + '/' + c.name));
    };
    walk(startNode, pathArg);
  }

  _clear () { this._output.innerHTML = ''; }

  _neofetch () {
    const lines = [
      ['   .\'=-.          ', ''],
      ['  / .-. \\         ', 'darsh@portfolio'],
      [' | |   | |        ', '───────────────'],
      [' | |   | |        ', 'OS:     Portfolio Linux'],
      ['  \\ \`-\' /         ', 'Host:   darsh.io'],
      ['   \'---\'          ', 'Kernel: 6.1.0-generic'],
      ['                  ', 'Shell:  bash 5.2.0'],
      ['                  ', 'Term:   terminal v1.0'],
      ['                  ', 'CPU:    imagination'],
      ['                  ', 'Memory: unlimited'],
    ];
    this._println('');
    lines.forEach(([art, info]) => this._println((art + info).trimEnd()));
    this._println('');
  }

  _help () {
    const cmds = [
      ['ls [path]',              'list directory contents'],
      ['cat <file>',             'print file contents'],
      ['touch <file>',           'create empty file'],
      ['mkdir <dir>',            'create directory'],
      ['rm [-r] <path>',         'remove file or directory'],
      ['rmdir <dir>',            'remove empty directory'],
      ['cp <src> <dst>',         'copy file or directory'],
      ['mv <src> <dst>',         'move or rename'],
      ['cd <path>',              'change directory'],
      ['pwd',                    'print working directory'],
      ['echo <text> [> file]',   'print or redirect to file'],
      ['nano <file>',            'text editor  (^S save  ^X exit)'],
      ['grep <pat> <file>',      'search in file'],
      ['head [-n N] <file>',     'first N lines'],
      ['tail [-n N] <file>',     'last N lines'],
      ['wc <file>',              'line / word / char count'],
      ['find [path] [-name pat]','find files'],
      ['neofetch',               'system info'],
      ['whoami / hostname',      'print user / host'],
      ['date / uname / uptime',  'system details'],
      ['history',                'command history'],
      ['man <cmd>',              'manual (sparse)'],
      ['which <cmd>',            'locate command'],
      ['clear',                  'clear terminal'],
      ['reset',                  'reset filesystem to default'],
      ['exit',                   'close terminal'],
    ];
    this._println('');
    cmds.forEach(([cmd, desc]) => {
      this._printRaw(
        `<span class="help-cmd">${_esc(cmd.padEnd(30))}</span><span class="help-desc">${_esc(desc)}</span>`,
        'term-help'
      );
    });
    this._println('');
  }

  // ── Nano ─────────────────────────────────────

  _nanoOpen (args) {
    if (!args.length) { this._println('nano: missing filename', 'term-err'); return; }
    const arg = args[0];
    const { node } = this._resolvePath(arg);
    if (node && node.type === 'dir') { this._println(`nano: ${arg}: Is a directory`, 'term-err'); return; }
    this._nanoSess = { arg, node: node || null };
    this._nano.fname.textContent = arg;
    this._nano.mod.textContent   = '';
    this._nano.editor.value      = node ? (node.content || '') : '';
    this._nano.overlay.classList.add('is-open');
    this._nano.editor.focus();
  }

  _nanoSave () {
    if (!this._nanoSess) return;
    const content  = this._nano.editor.value;
    const { arg, node } = this._nanoSess;
    if (node) {
      node.content = content;
    } else {
      const { parent, name } = this._parentAndName(arg);
      if (!parent) { this._println(`nano: cannot write '${arg}'`, 'term-err'); return; }
      parent.children = parent.children || [];
      const ex = parent.children.find(c => c.name === name);
      if (ex) { ex.content = content; this._nanoSess.node = ex; }
      else { const n = { name, type: 'file', content }; parent.children.push(n); this._nanoSess.node = n; }
    }
    this._mutated();
    this._nano.mod.textContent = '';
    const lines = content.split('\n').length;
    this._println(`[ Wrote ${lines} line${lines !== 1 ? 's' : ''} ]`);
  }

  _nanoExit () {
    if (!this._nanoSess) return;
    if (this._nano.mod.textContent) this._nanoSave();
    this._nano.overlay.classList.remove('is-open');
    this._nanoSess = null;
    this._input.focus();
  }
}
