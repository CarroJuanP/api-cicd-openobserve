(() => {
  const $ = (id) => document.getElementById(id);
  let token = sessionStorage.getItem('token');
  let me = JSON.parse(sessionStorage.getItem('user') || 'null');

  // Estado de tablas: datos completos, filtro de búsqueda y orden
  const state = {
    users: { data: [], q: '', sort: null, dir: 'asc' },
    products: { data: [], q: '', sort: null, dir: 'asc' },
  };

  // ---- helpers ----
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) { logout(); }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }
  const msg = (text, ok = true) => { const m = $('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function show() {
    $('login-view').hidden = !!token;
    $('app-view').hidden = !token;
    if (token) { $('whoami').textContent = me ? `${me.nombre} (${me.rol})` : ''; loadUsers(); loadProducts(); }
  }
  function logout() { token = null; me = null; sessionStorage.clear(); show(); }

  // ---- filtro, orden y conteo (común a ambas tablas) ----
  const cmp = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const x = String(a ?? '').toLowerCase(), y = String(b ?? '').toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  };
  function view(name, fields) {
    const s = state[name];
    const q = s.q.trim().toLowerCase();
    let rows = s.data.filter((r) => !q || fields.map((f) => r[f] ?? '').join(' ').toLowerCase().includes(q));
    if (s.sort) {
      rows = [...rows].sort((a, b) => (s.dir === 'asc' ? 1 : -1) * cmp(a[s.sort], b[s.sort]));
    }
    return rows;
  }
  const countText = (n, total, word) => `${n} de ${total} ${word}`;

  function bindSort(tableTestId, name, render) {
    document.querySelectorAll(`[data-testid="${tableTestId}"] th.sortable`).forEach((th) => {
      th.addEventListener('click', () => {
        const s = state[name];
        const key = th.dataset.sort;
        s.dir = s.sort === key && s.dir === 'asc' ? 'desc' : 'asc';
        s.sort = key;
        document.querySelectorAll(`[data-testid="${tableTestId}"] th.sortable`).forEach((o) => {
          o.setAttribute('aria-sort', o === th ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        });
        render();
      });
    });
  }

  // ---- login ----
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').textContent = '';
    try {
      const data = await api('POST', '/api/auth/login', { username: $('login-username').value, password: $('login-password').value });
      token = data.token; me = data.user;
      sessionStorage.setItem('token', token); sessionStorage.setItem('user', JSON.stringify(me));
      $('login-password').value = '';
      show();
    } catch (err) { $('login-error').textContent = err.message; }
  });
  $('logout').addEventListener('click', logout);

  // ---- tabs ----
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    $('tab-users').hidden = b.dataset.tab !== 'users';
    $('tab-products').hidden = b.dataset.tab !== 'products';
    updateBackToTop();
  }));

  // ---- ayuda (alert), modal con iframe, enlace a nueva pestaña ----
  $('help-btn').addEventListener('click', () => alert('Panel de gestión: administra usuarios y productos. Usa la búsqueda y haz clic en los encabezados para ordenar.'));
  $('about-btn').addEventListener('click', () => {
    $('about-frame').src = '/api/status';
    $('about-modal').showModal();
    $('about-close').focus();
  });
  $('about-close').addEventListener('click', () => $('about-modal').close());
  $('about-modal').addEventListener('cancel', (event) => {
    event.preventDefault();
    $('about-modal').close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('about-modal').open) {
      event.preventDefault();
      $('about-modal').close();
    }
  });

  // ---- botón volver arriba (scroll) ----
  function updateBackToTop() { $('back-to-top').hidden = window.scrollY <= 200; }
  window.addEventListener('scroll', updateBackToTop, { passive: true });
  $('back-to-top').addEventListener('click', () => window.scrollTo({ top: 0 }));

  // ---- usuarios ----
  function renderUsers() {
    const rows = view('users', ['id', 'username', 'nombre', 'email', 'rol']);
    $('users-body').innerHTML = rows.length
      ? rows.map((u) => `
        <tr data-testid="user-row" data-username="${esc(u.username)}">
          <td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td>${esc(u.rol)}</td>
          <td><button data-edit-user="${u.id}" title="Editar registro">Editar</button><button class="danger" data-del-user="${u.id}" title="Eliminar registro">Eliminar</button></td>
        </tr>`).join('')
      : '<tr class="no-results" data-testid="no-results"><td colspan="6">Sin resultados</td></tr>';
    $('users-body').dataset.rows = JSON.stringify(state.users.data);
    $('users-count').textContent = countText(rows.length, state.users.data.length, 'usuarios');
  }
  async function loadUsers() {
    try { state.users.data = await api('GET', '/api/users'); renderUsers(); } catch (err) { msg(err.message, false); }
  }
  bindSort('users-table', 'users', renderUsers);
  $('user-search').addEventListener('input', (e) => { state.users.q = e.target.value; renderUsers(); });
  function resetUserForm() { $('user-form').reset(); $('user-id').value = ''; $('user-username').disabled = false; }
  $('user-cancel').addEventListener('click', resetUserForm);
  $('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('user-id').value;
    try {
      if (id) {
        const body = { nombre: $('user-nombre').value, email: $('user-email').value, rol: $('user-rol').value };
        if ($('user-password').value) body.password = $('user-password').value;
        await api('PUT', `/api/users/${id}`, body);
        msg('Usuario actualizado');
      } else {
        await api('POST', '/api/users', { username: $('user-username').value, password: $('user-password').value, nombre: $('user-nombre').value, email: $('user-email').value, rol: $('user-rol').value });
        msg('Usuario creado');
      }
      resetUserForm(); loadUsers();
    } catch (err) { msg(err.message, false); }
  });
  $('users-body').addEventListener('click', async (e) => {
    const edit = e.target.dataset.editUser, del = e.target.dataset.delUser;
    if (edit) {
      const u = state.users.data.find((r) => String(r.id) === edit);
      $('user-id').value = u.id; $('user-username').value = u.username; $('user-username').disabled = true;
      $('user-nombre').value = u.nombre; $('user-email').value = u.email || ''; $('user-rol').value = u.rol;
    }
    if (del) {
      try { await api('DELETE', `/api/users/${del}`); msg('Usuario eliminado'); loadUsers(); } catch (err) { msg(err.message, false); }
    }
  });

  // ---- productos ----
  function renderProducts() {
    const rows = view('products', ['id', 'nombre', 'precio', 'categoria']);
    $('products-body').innerHTML = rows.length
      ? rows.map((p) => `
        <tr data-testid="product-row" data-nombre="${esc(p.nombre)}" data-id="${p.id}" draggable="true">
          <td>${p.id}</td><td>${esc(p.nombre)}</td><td>${Number(p.precio).toFixed(2)}</td><td>${esc(p.categoria)}</td>
          <td><button data-edit-prod="${p.id}" title="Editar registro">Editar</button><button class="danger" data-del-prod="${p.id}" title="Eliminar registro">Eliminar</button></td>
        </tr>`).join('')
      : '<tr class="no-results" data-testid="no-results"><td colspan="5">Sin resultados</td></tr>';
    $('products-body').dataset.rows = JSON.stringify(state.products.data);
    $('products-count').textContent = countText(rows.length, state.products.data.length, 'productos');
  }
  async function loadProducts() {
    try {
      const categorias = await api('GET', '/api/categorias');
      $('product-categoria').innerHTML = categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
      state.products.data = await api('GET', '/api/productos');
      renderProducts();
    } catch (err) { msg(err.message, false); }
  }
  bindSort('products-table', 'products', renderProducts);
  $('product-search').addEventListener('input', (e) => { state.products.q = e.target.value; renderProducts(); });
  function resetProductForm() { $('product-form').reset(); $('product-id').value = ''; }
  $('product-cancel').addEventListener('click', resetProductForm);
  $('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('product-id').value;
    const body = { nombre: $('product-nombre').value, precio: parseFloat($('product-precio').value), categoria_id: Number($('product-categoria').value) };
    try {
      if (id) { await api('PUT', `/api/productos/${id}`, body); msg('Producto actualizado'); }
      else { await api('POST', '/api/productos', body); msg('Producto creado'); }
      resetProductForm(); loadProducts();
    } catch (err) { msg(err.message, false); }
  });
  $('products-body').addEventListener('click', async (e) => {
    const edit = e.target.dataset.editProd, del = e.target.dataset.delProd;
    if (edit) {
      const p = state.products.data.find((r) => String(r.id) === edit);
      $('product-id').value = p.id; $('product-nombre').value = p.nombre; $('product-precio').value = p.precio; $('product-categoria').value = p.categoria_id;
    }
    if (del) {
      try { await api('DELETE', `/api/productos/${del}`); msg('Producto eliminado'); loadProducts(); } catch (err) { msg(err.message, false); }
    }
  });

  // ---- arrastrar y soltar filas de productos (reordenar en pantalla) ----
  let dragId = null;
  const tbody = $('products-body');
  tbody.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    dragId = tr.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  tbody.addEventListener('dragover', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    e.preventDefault();
    tbody.querySelectorAll('.drag-over').forEach((r) => r.classList.remove('drag-over'));
    tr.classList.add('drag-over');
  });
  tbody.addEventListener('drop', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || dragId === null) return;
    e.preventDefault();
    const arr = state.products.data;
    const from = arr.findIndex((p) => String(p.id) === dragId);
    const to = arr.findIndex((p) => String(p.id) === tr.dataset.id);
    if (from >= 0 && to >= 0 && from !== to) {
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      state.products.sort = null; // orden manual
      document.querySelectorAll('[data-testid="products-table"] th.sortable').forEach((o) => o.setAttribute('aria-sort', 'none'));
    }
    dragId = null;
    renderProducts();
  });
  tbody.addEventListener('dragend', () => { dragId = null; tbody.querySelectorAll('.drag-over').forEach((r) => r.classList.remove('drag-over')); });

  show();
})();
