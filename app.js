const SUPABASE_URL  = 'https://ltscuepqjfocxkjgtacb.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0c2N1ZXBxamZvY3hramd0YWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTA3NjksImV4cCI6MjEwMjQ2Njc2OX0.FVt0qXi9cmwDip7snIz-za97IM_cveSwfokMSfPZHpA';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allProducts    = [];
let allCategories  = [];
let currentSection = 'dashboard';

window.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupMobileMenu();
  setupGlobalSearch();
  setupModalOverlayClose();
  setupKeyboardShortcuts();

  await testConnection();
  await Promise.all([loadCategories(), loadProducts()]);
  await loadDashboard();
});

async function testConnection() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const { error } = await db.from('categories').select('id', { count: 'exact', head: true });
    if (error) throw error;
    dot.classList.add('connected');
    text.textContent = 'Supabase Connected';
  } catch {
    dot.classList.add('error');
    text.textContent = 'Connection Error';
    showToast('⚠️ Could not connect to Supabase. Make sure you ran schema.sql first.', 'error');
  }
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigate(item.dataset.section);
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function setupMobileMenu() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function setupGlobalSearch() {
  document.getElementById('globalSearch').addEventListener('input', e => {
    if (currentSection === 'products') {
      document.getElementById('productSearch').value = e.target.value;
      filterProducts();
    }
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });
}

function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(section)?.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

  const titles = {
    dashboard:    'Dashboard',
    products:     'Products',
    categories:   'Categories',
    transactions: 'Transactions',
    reports:      'Reports',
  };
  document.getElementById('topbarTitle').textContent = titles[section] || section;
  currentSection = section;

  if (section === 'transactions') loadTransactions();
  if (section === 'reports')      loadReports();
  if (section === 'categories')   renderCategories(allCategories);
  if (section === 'products')     renderProducts(allProducts);
}

async function loadDashboard() {
  document.getElementById('totalItems').textContent      = allProducts.length;
  document.getElementById('totalCategories').textContent = allCategories.length;

  const totalVal = allProducts.reduce((s, p) => s + p.quantity * (p.unit_price || 0), 0);
  document.getElementById('totalValue').textContent = '₹' + fmtNum(totalVal);

  const lowStock = allProducts.filter(p => p.quantity <= p.reorder_level);
  document.getElementById('lowStockCount').textContent = lowStock.length;

  renderLowStockList(lowStock);
  await loadRecentTransactions();
}

function renderLowStockList(items) {
  const el = document.getElementById('lowStockList');
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>All products are well stocked!</p></div>`;
    return;
  }
  el.innerHTML = items.map(p => `
    <div class="low-stock-item">
      <div>
        <div class="low-stock-name">${esc(p.name)}</div>
        <div class="low-stock-sub">Supplier: ${esc(p.supplier || 'N/A')}</div>
      </div>
      <div style="text-align:right">
        <span class="badge ${p.quantity === 0 ? 'badge-danger' : 'badge-warning'}">
          ${p.quantity} ${esc(p.unit || 'pcs')}
        </span>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">Reorder: ${p.reorder_level}</div>
      </div>
    </div>
  `).join('');
}

async function loadRecentTransactions() {
  const { data, error } = await db
    .from('transactions')
    .select('*, products(name, unit)')
    .order('created_at', { ascending: false })
    .limit(6);

  const el = document.getElementById('recentTransactions');
  if (error || !data?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔄</div><p>No transactions yet</p></div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Product</th><th>Type</th><th>Qty</th><th>Date</th></tr>
      </thead>
      <tbody>
        ${data.map(t => `
          <tr>
            <td style="font-weight:500">${esc(t.products?.name || 'Unknown')}</td>
            <td><span class="badge ${t.type === 'RECEIVE' ? 'badge-success' : 'badge-danger'}">${t.type}</span></td>
            <td>${t.quantity} ${esc(t.products?.unit || 'pcs')}</td>
            <td style="color:var(--text-secondary);font-size:12.5px">${fmtDate(t.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

async function loadProducts() {
  const { data, error } = await db
    .from('products')
    .select('*, categories(id, name)')
    .order('name', { ascending: true });

  if (error) { showToast('Failed to load products: ' + error.message, 'error'); return; }
  allProducts = data || [];
  renderProducts(allProducts);
  populateCategoryFilter();
}

function renderProducts(products) {
  const tbody = document.getElementById('productsTableBody');
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">
      <div class="empty-state"><div class="empty-icon">📦</div><p>No products found. Click "+ Add Product" to get started!</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = products.map((p, i) => {
    const status = stockStatus(p);
    const totVal = (p.quantity * (p.unit_price || 0));
    return `
      <tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td>
          <div style="font-weight:500">${esc(p.name)}</div>
          ${p.supplier ? `<div style="font-size:12px;color:var(--text-muted)">${esc(p.supplier)}</div>` : ''}
        </td>
        <td>${p.categories
          ? `<span class="badge badge-primary">${esc(p.categories.name)}</span>`
          : `<span class="badge badge-muted">—</span>`}</td>
        <td style="font-weight:600;${status.color}">${p.quantity}</td>
        <td style="color:var(--text-secondary)">${esc(p.unit || 'pcs')}</td>
        <td>₹${fmtNum(p.unit_price || 0)}</td>
        <td style="font-weight:500">₹${fmtNum(totVal)}</td>
        <td><span class="badge ${status.badge}">${status.label}</span></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-icon edit"   onclick="editProduct('${p.id}')"                    title="Edit">✏️</button>
            <button class="btn btn-icon delete" onclick="deleteProduct('${p.id}','${esc(p.name)}')" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function filterProducts() {
  const q   = document.getElementById('productSearch').value.toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  const filtered = allProducts.filter(p =>
    (p.name.toLowerCase().includes(q) || (p.supplier || '').toLowerCase().includes(q)) &&
    (!cat || p.category_id === cat)
  );
  renderProducts(filtered);
}

function populateCategoryFilter() {
  const sel  = document.getElementById('categoryFilter');
  const curr = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>' +
    allCategories.map(c => `<option value="${c.id}" ${c.id === curr ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function openProductModal(product = null) {
  document.getElementById('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
  document.getElementById('productId').value       = product?.id       || '';
  document.getElementById('productName').value     = product?.name     || '';
  document.getElementById('productQty').value      = product != null ? product.quantity : '';
  document.getElementById('productUnit').value     = product?.unit     || 'pcs';
  document.getElementById('productPrice').value    = product?.unit_price    != null ? product.unit_price    : '';
  document.getElementById('productReorder').value  = product?.reorder_level != null ? product.reorder_level : 10;
  document.getElementById('productSupplier').value = product?.supplier  || '';

  const catSel = document.getElementById('productCategory');
  catSel.innerHTML = '<option value="">Select Category</option>' +
    allCategories.map(c =>
      `<option value="${c.id}" ${c.id === product?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');

  openModal('productModal');
  document.getElementById('productName').focus();
}

async function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (p) openProductModal(p);
}

async function saveProduct(e) {
  e.preventDefault();
  setLoading('productSaveBtn', true);

  const id = document.getElementById('productId').value;
  const payload = {
    name:          document.getElementById('productName').value.trim(),
    category_id:   document.getElementById('productCategory').value || null,
    quantity:      parseInt(document.getElementById('productQty').value)    || 0,
    unit:          document.getElementById('productUnit').value.trim()       || 'pcs',
    unit_price:    parseFloat(document.getElementById('productPrice').value) || 0,
    reorder_level: parseInt(document.getElementById('productReorder').value) || 10,
    supplier:      document.getElementById('productSupplier').value.trim()  || null,
  };

  const { error } = id
    ? await db.from('products').update(payload).eq('id', id)
    : await db.from('products').insert([payload]);

  setLoading('productSaveBtn', false);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(id ? '✅ Product updated!' : '✅ Product added!', 'success');
  closeModal('productModal');
  await loadProducts();
  loadDashboard();
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"?\nThis will also delete all related transactions.`)) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('🗑️ Product deleted', 'success');
  await loadProducts();
  loadDashboard();
}

async function loadCategories() {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) { showToast('Failed to load categories: ' + error.message, 'error'); return; }
  allCategories = data || [];
  renderCategories(allCategories);
}

function renderCategories(categories) {
  const grid = document.getElementById('categoriesGrid');
  if (!categories.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏷️</div><p>No categories yet. Add your first one!</p>
    </div>`;
    return;
  }

  grid.innerHTML = categories.map((c, i) => {
    const count = allProducts.filter(p => p.category_id === c.id).length;
    return `
      <div class="category-card" style="animation-delay:${i * 0.04}s">
        <div class="category-card-header">
          <span class="category-name">${esc(c.name)}</span>
          <div class="category-actions">
            <button class="btn btn-icon edit"   onclick="editCategory('${c.id}')"                    title="Edit">✏️</button>
            <button class="btn btn-icon delete" onclick="deleteCategory('${c.id}','${esc(c.name)}')" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="category-desc">${esc(c.description || 'No description provided')}</div>
        <div class="category-count">📦 ${count} product${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

function openCategoryModal(category = null) {
  document.getElementById('categoryModalTitle').textContent = category ? 'Edit Category' : 'Add Category';
  document.getElementById('categoryId').value   = category?.id          || '';
  document.getElementById('categoryName').value = category?.name        || '';
  document.getElementById('categoryDesc').value = category?.description || '';
  openModal('categoryModal');
  document.getElementById('categoryName').focus();
}

async function editCategory(id) {
  const c = allCategories.find(x => x.id === id);
  if (c) openCategoryModal(c);
}

async function saveCategory(e) {
  e.preventDefault();
  setLoading('categorySaveBtn', true);

  const id = document.getElementById('categoryId').value;
  const payload = {
    name:        document.getElementById('categoryName').value.trim(),
    description: document.getElementById('categoryDesc').value.trim() || null,
  };

  const { error } = id
    ? await db.from('categories').update(payload).eq('id', id)
    : await db.from('categories').insert([payload]);

  setLoading('categorySaveBtn', false);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(id ? '✅ Category updated!' : '✅ Category added!', 'success');
  closeModal('categoryModal');
  await loadCategories();
  await loadProducts();
  loadDashboard();
}

async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"?\nProducts in this category will become uncategorised.`)) return;
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('🗑️ Category deleted', 'success');
  await loadCategories();
  await loadProducts();
  loadDashboard();
}

async function loadTransactions() {
  const type = document.getElementById('txTypeFilter')?.value;

  let query = db
    .from('transactions')
    .select('*, products(name, unit)')
    .order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  const tbody = document.getElementById('transactionsTableBody');

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">
      <div class="empty-state"><div class="empty-icon">🔄</div><p>No transactions found</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((t, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${fmtDate(t.created_at)}</td>
      <td style="font-weight:500">${esc(t.products?.name || 'Unknown Product')}</td>
      <td><span class="badge ${t.type === 'RECEIVE' ? 'badge-success' : 'badge-danger'}">
        ${t.type === 'RECEIVE' ? '📥 RECEIVE' : '📤 ISSUE'}
      </span></td>
      <td style="font-weight:600">${t.quantity} ${esc(t.products?.unit || 'pcs')}</td>
      <td style="color:var(--text-secondary)">${esc(t.remarks || '—')}</td>
    </tr>`).join('');
}

function openTransactionModal(type) {
  document.getElementById('transactionType').value = type;
  document.getElementById('transactionModalTitle').textContent =
    type === 'RECEIVE' ? '📥 Receive Stock' : '📤 Issue Stock';

  const btn = document.getElementById('txSubmitBtn');
  btn.textContent = type === 'RECEIVE' ? 'Confirm Receive' : 'Confirm Issue';
  btn.className   = `btn ${type === 'RECEIVE' ? 'btn-success' : 'btn-danger'}`;

  const sel = document.getElementById('transactionProduct');
  sel.innerHTML = '<option value="">Select Product</option>' +
    allProducts.map(p =>
      `<option value="${p.id}">${esc(p.name)} — Stock: ${p.quantity} ${p.unit || 'pcs'}</option>`
    ).join('');

  document.getElementById('currentStock').value      = '';
  document.getElementById('transactionQty').value    = '';
  document.getElementById('transactionRemarks').value = '';

  openModal('transactionModal');
}

function onTransactionProductChange() {
  const id   = document.getElementById('transactionProduct').value;
  const prod = allProducts.find(p => p.id === id);
  document.getElementById('currentStock').value = prod
    ? `${prod.quantity} ${prod.unit || 'pcs'}`
    : '';
}

async function saveTransaction(e) {
  e.preventDefault();
  setLoading('txSubmitBtn', true);

  const type      = document.getElementById('transactionType').value;
  const productId = document.getElementById('transactionProduct').value;
  const qty       = parseInt(document.getElementById('transactionQty').value);
  const remarks   = document.getElementById('transactionRemarks').value.trim();

  const product = allProducts.find(p => p.id === productId);
  if (!product) { setLoading('txSubmitBtn', false); return; }

  if (type === 'ISSUE' && qty > product.quantity) {
    showToast(`❌ Cannot issue ${qty}. Only ${product.quantity} ${product.unit || 'pcs'} in stock.`, 'error');
    setLoading('txSubmitBtn', false);
    return;
  }

  const newQty = type === 'RECEIVE' ? product.quantity + qty : product.quantity - qty;

  const { error: stockErr } = await db
    .from('products')
    .update({ quantity: newQty })
    .eq('id', productId);

  if (stockErr) {
    showToast('Error updating stock: ' + stockErr.message, 'error');
    setLoading('txSubmitBtn', false);
    return;
  }

  const { error: txErr } = await db.from('transactions').insert([{
    product_id: productId,
    type,
    quantity: qty,
    remarks:  remarks || null,
  }]);

  setLoading('txSubmitBtn', false);

  if (txErr) {
    showToast('Error recording transaction: ' + txErr.message, 'error');
    return;
  }

  showToast(
    type === 'RECEIVE'
      ? `✅ ${qty} ${product.unit || 'pcs'} received for "${product.name}"`
      : `✅ ${qty} ${product.unit || 'pcs'} issued from "${product.name}"`,
    'success'
  );

  closeModal('transactionModal');
  await loadProducts();
  loadDashboard();
  if (currentSection === 'transactions') loadTransactions();
}

async function loadReports() {
  const lowStock = allProducts
    .filter(p => p.quantity <= p.reorder_level)
    .sort((a, b) => a.quantity - b.quantity);

  const lowEl = document.getElementById('reportLowStock');
  if (!lowStock.length) {
    lowEl.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No low stock items!</p></div>`;
  } else {
    lowEl.innerHTML = lowStock.map(p => `
      <div class="report-item">
        <div>
          <div style="font-weight:500;font-size:13.5px">${esc(p.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${esc(p.categories?.name || 'No Category')}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${p.quantity === 0 ? 'badge-danger' : 'badge-warning'}">${p.quantity} ${p.unit || 'pcs'}</span>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px">Reorder ≤ ${p.reorder_level}</div>
        </div>
      </div>`).join('');
  }

  const catVals = allCategories.map(c => {
    const prods = allProducts.filter(p => p.category_id === c.id);
    const val   = prods.reduce((s, p) => s + p.quantity * (p.unit_price || 0), 0);
    return { name: c.name, val, count: prods.length };
  }).filter(c => c.count > 0).sort((a, b) => b.val - a.val);

  const maxVal = catVals.length ? catVals[0].val : 1;
  const catEl  = document.getElementById('reportCategoryValue');

  if (!catVals.length) {
    catEl.innerHTML = `<div class="empty-state"><div class="empty-icon">💰</div><p>No data available</p></div>`;
  } else {
    catEl.innerHTML = catVals.map(c => `
      <div class="report-category-bar">
        <div class="bar-label">
          <span>${esc(c.name)}</span>
          <span>₹${fmtNum(c.val)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.max(4, c.val / maxVal * 100).toFixed(1)}%"></div>
        </div>
      </div>`).join('');
  }

  const fullBody = document.getElementById('fullReportBody');
  if (!allProducts.length) {
    fullBody.innerHTML = `<tr><td colspan="7" class="loading-cell">No products in inventory</td></tr>`;
  } else {
    fullBody.innerHTML = allProducts.map(p => {
      const st = stockStatus(p);
      return `
        <tr>
          <td style="font-weight:500">${esc(p.name)}</td>
          <td>${p.categories ? `<span class="badge badge-primary">${esc(p.categories.name)}</span>` : '—'}</td>
          <td>${p.quantity}</td>
          <td style="color:var(--text-secondary)">${esc(p.unit || 'pcs')}</td>
          <td>₹${fmtNum(p.unit_price || 0)}</td>
          <td style="font-weight:500">₹${fmtNum(p.quantity * (p.unit_price || 0))}</td>
          <td><span class="badge ${st.badge}">${st.label}</span></td>
        </tr>`;
    }).join('');
  }
}

function exportReport() {
  const headers = ['Product', 'Category', 'Quantity', 'Unit', 'Unit Price (INR)', 'Total Value (INR)', 'Status'];
  const rows    = allProducts.map(p => {
    const st = stockStatus(p);
    return [
      p.name,
      p.categories?.name || 'N/A',
      p.quantity,
      p.unit || 'pcs',
      (p.unit_price || 0).toFixed(2),
      (p.quantity * (p.unit_price || 0)).toFixed(2),
      st.label,
    ];
  });

  const csv  = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `inventory_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📊 Report exported as CSV!', 'success');
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function setupModalOverlayClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

function stockStatus(product) {
  if (product.quantity === 0)                    return { badge: 'badge-danger',  label: 'Out of Stock', color: 'color:var(--danger)'  };
  if (product.quantity <= product.reorder_level) return { badge: 'badge-warning', label: 'Low Stock',    color: 'color:var(--warning)' };
  return                                                { badge: 'badge-success', label: 'In Stock',     color: 'color:var(--success)' };
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3800);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled      = loading;
  btn.style.opacity = loading ? '0.7' : '1';
}

function fmtNum(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '0.00';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(2)     + 'K';
  return v.toFixed(2);
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
