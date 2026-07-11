// navbar.js — highlights active nav link on route change
const Navbar = {
  update(path) {
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      const isActive = (href === '/' && path === '/') ||
                       (href !== '/' && path.startsWith(href));
      a.style.color = isActive ? '#fff' : 'var(--text-muted)';
      a.style.background = isActive ? 'rgba(99,102,241,.15)' : '';
    });
  }
};
