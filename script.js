"use strict";

(() => {
  const STORAGE_KEY = "smartPOSData_v1";

  const defaultData = {
    products: [],
    customers: [],
    sales: [],
    expenses: [],
    settings: {
      name: "My Business",
      phone: "",
      address: "",
      currency: "TZS"
    }
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const makeId = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const localDate = (date = new Date()) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  };

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return structuredClone(defaultData);

      return {
        ...structuredClone(defaultData),
        ...saved,
        products: Array.isArray(saved.products) ? saved.products : [],
        customers: Array.isArray(saved.customers) ? saved.customers : [],
        sales: Array.isArray(saved.sales) ? saved.sales : [],
        expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
        settings: { ...defaultData.settings, ...(saved.settings || {}) }
      };
    } catch {
      return structuredClone(defaultData);
    }
  }

  let data = loadData();
  let cart = [];
  let reportRows = [];

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function money(value) {
    return `${data.settings.currency || "TZS"} ${number(value).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })}`;
  }

  function notify(message) {
    const container = $("#toastContainer");
    if (!container) {
      alert(message);
      return;
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function setDate() {
    const date = $("#currentDate");
    if (date) {
      date.textContent = new Intl.DateTimeFormat("en", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date());
    }

    const year = $("#footerYear");
    if (year) year.textContent = new Date().getFullYear();
  }

  function navigate(page) {
    const section = $(`[data-section="${page}"]`);
    if (!section) return;

    $$(".page-section").forEach((item) => item.classList.remove("active"));
    section.classList.add("active");

    $$(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });

    const nav = $(`.nav-item[data-page="${page}"] span:not(.nav-icon):not(.nav-badge)`);
    const heading = section.querySelector("h1");
    const breadcrumb = $("#pageBreadcrumb");

    if (breadcrumb) breadcrumb.textContent = heading?.textContent || page;

    const sidebar = $("#sidebar");
    if (sidebar) sidebar.classList.remove("open");

    if (page === "pos") renderPOS();
    if (page === "reports") generateReport();
  }

  function bindNavigation() {
    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.page));
    });

    $$("[data-navigate]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.navigate));
    });

    $("#menuToggle")?.addEventListener("click", () => {
      $("#sidebar")?.classList.toggle("open");
    });

    $("#notificationsButton")?.addEventListener("click", () => {
      const low = data.products.filter((p) => number(p.stock) <= number(p.minStock)).length;
      notify(low ? `${low} product(s) need stock attention.` : "No new notifications.");
    });
  }

  function productStockStatus(product) {
    const stock = number(product.stock);
    const minimum = number(product.minStock);

    if (stock <= 0) return "Out of Stock";
    if (stock <= minimum) return "Low Stock";
    return "Available";
  }

  function renderProducts() {
    const tbody = $("#productsTable");
    if (!tbody) return;

    const search = ($("#productSearch")?.value || "").trim().toLowerCase();
    const category = $("#productCategoryFilter")?.value || "";

    const products = data.products.filter((product) => {
      const matchesSearch = `${product.name} ${product.sku}`.toLowerCase().includes(search);
      return matchesSearch && (!category || product.category === category);
    });

    tbody.innerHTML = products.length
      ? products.map((product) => `
        <tr>
          <td><strong>${escapeHTML(product.name)}</strong></td>
          <td>${escapeHTML(product.sku)}</td>
          <td>${escapeHTML(product.category)}</td>
          <td>${money(product.cost)}</td>
          <td>${money(product.price)}</td>
          <td>${number(product.stock)} ${escapeHTML(product.unit || "Piece")}</td>
          <td>
            <button class="secondary-button" type="button" data-edit-product="${escapeHTML(product.id)}">Edit</button>
            <button class="danger-button" type="button" data-delete-product="${escapeHTML(product.id)}">Delete</button>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="7" class="empty-table">No matching products found.</td></tr>`;

    renderCategoryFilter();
    updateDashboard();
  }

  function renderCategoryFilter() {
    const select = $("#productCategoryFilter");
    if (!select) return;

    const selected = select.value;
    const categories = [...new Set(data.products.map((p) => p.category).filter(Boolean))].sort();

    select.innerHTML = `<option value="">All Categories</option>` +
      categories.map((category) =>
        `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
      ).join("");

    if (categories.includes(selected)) select.value = selected;
  }

  function openProductDialog(product = null) {
    const dialog = $("#productDialog");
    const form = $("#productForm");
    if (!dialog || !form) return;

    form.reset();
    $("#productId").value = product?.id || "";
    $("#productDialogTitle").textContent = product ? "Edit Product" : "Add Product";

    if (product) {
      $("#productName").value = product.name || "";
      $("#productSku").value = product.sku || "";
      $("#productCategory").value = product.category || "";
      $("#productUnit").value = product.unit || "Piece";
      $("#productCost").value = product.cost ?? 0;
      $("#productPrice").value = product.price ?? 0;
      $("#productStock").value = product.stock ?? 0;
      $("#productMinStock").value = product.minStock ?? 5;
    } else {
      $("#productMinStock").value = 5;
    }

    dialog.showModal();
  }

  function bindProducts() {
    $("#addProductButton")?.addEventListener("click", () => openProductDialog());
    $("#closeProductDialog")?.addEventListener("click", () => $("#productDialog").close());
    $("#cancelProductButton")?.addEventListener("click", () => $("#productDialog").close());
    $("#productSearch")?.addEventListener("input", renderProducts);
    $("#productCategoryFilter")?.addEventListener("change", renderProducts);

    $("#productForm")?.addEventListener("submit", (event) => {
      event.preventDefault();

      const id = $("#productId").value;
      const existing = data.products.find((p) => p.id === id);
      const sku = $("#productSku").value.trim();

      if (data.products.some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== id)) {
        notify("SKU/barcode already exists.");
        return;
      }

      const product = {
        id: id || makeId("PRD"),
        name: $("#productName").value.trim(),
        sku,
        category: $("#productCategory").value.trim(),
        unit: $("#productUnit").value,
        cost: number($("#productCost").value),
        price: number($("#productPrice").value),
        stock: number($("#productStock").value),
        minStock: number($("#productMinStock").value)
      };

      if (existing) {
        product.stock = number($("#productStock").value);
        Object.assign(existing, product);
      } else {
        data.products.push(product);
      }

      saveData();
      renderAll();
      $("#productDialog").close();
      notify(existing ? "Product updated." : "Product added.");
    });

    $("#productsTable")?.addEventListener("click", (event) => {
      const editId = event.target.closest("[data-edit-product]")?.dataset.editProduct;
      const deleteId = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;

      if (editId) {
        openProductDialog(data.products.find((p) => p.id === editId));
      }

      if (deleteId) {
        const product = data.products.find((p) => p.id === deleteId);
        if (!product || !confirm(`Delete "${product.name}"?`)) return;

        data.products = data.products.filter((p) => p.id !== deleteId);
        cart = cart.filter((item) => item.productId !== deleteId);
        saveData();
        renderAll();
        notify("Product deleted.");
      }
    });
  }

  function renderInventory() {
    const tbody = $("#inventoryTable");
    if (!tbody) return;

    const search = ($("#inventorySearch")?.value || "").toLowerCase().trim();
    const filter = $("#inventoryStatusFilter")?.value || "";

    const products = data.products.filter((product) => {
      const status = productStockStatus(product);
      const matchesSearch = `${product.name} ${product.sku}`.toLowerCase().includes(search);
      const matchesFilter =
        !filter ||
        (filter === "low" && status === "Low Stock") ||
        (filter === "out" && status === "Out of Stock") ||
        (filter === "available" && status === "Available");

      return matchesSearch && matchesFilter;
    });

    tbody.innerHTML = products.length
      ? products.map((product) => {
        const status = productStockStatus(product);
        return `
          <tr>
            <td><strong>${escapeHTML(product.name)}</strong></td>
            <td>${escapeHTML(product.sku)}</td>
            <td>${number(product.stock)} ${escapeHTML(product.unit || "Piece")}</td>
            <td>${number(product.minStock)}</td>
            <td><span class="stock-badge">${status}</span></td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="5" class="empty-table">No inventory records found.</td></tr>`;

    $("#inventoryProductCount").textContent = data.products.length;
    $("#inventoryStockUnits").textContent = data.products.reduce((sum, p) => sum + number(p.stock), 0);
    $("#inventoryLowStock").textContent =
      data.products.filter((p) => number(p.stock) <= number(p.minStock)).length;
  }

  function renderCustomers() {
    const tbody = $("#customersTable");
    if (!tbody) return;

    const search = ($("#customerSearch")?.value || "").toLowerCase().trim();
    const customers = data.customers.filter((customer) =>
      `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(search)
    );

    tbody.innerHTML = customers.length
      ? customers.map((customer) => `
        <tr>
          <td><strong>${escapeHTML(customer.name)}</strong></td>
          <td>${escapeHTML(customer.phone || "—")}</td>
          <td>${escapeHTML(customer.email || "—")}</td>
          <td>${escapeHTML(customer.address || "—")}</td>
          <td>${escapeHTML(customer.registered || "—")}</td>
          <td>
            <button class="secondary-button" type="button" data-edit-customer="${escapeHTML(customer.id)}">Edit</button>
            <button class="danger-button" type="button" data-delete-customer="${escapeHTML(customer.id)}">Delete</button>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="6" class="empty-table">No matching customers found.</td></tr>`;

    const select = $("#saleCustomer");
    if (select) {
      const current = select.value;
      select.innerHTML = `<option value="">Walk-in Customer</option>` +
        data.customers.map((customer) =>
          `<option value="${escapeHTML(customer.id)}">${escapeHTML(customer.name)}</option>`
        ).join("");
      if (data.customers.some((c) => c.id === current)) select.value = current;
    }
  }

  function openCustomerDialog(customer = null) {
    const dialog = $("#customerDialog");
    const form = $("#customerForm");
    if (!dialog || !form) return;

    form.reset();
    $("#customerId").value = customer?.id || "";
    $("#customerDialogTitle").textContent = customer ? "Edit Customer" : "Add Customer";

    if (customer) {
      $("#customerName").value = customer.name || "";
      $("#customerPhone").value = customer.phone || "";
      $("#customerEmail").value = customer.email || "";
      $("#customerAddress").value = customer.address || "";
    }

    dialog.showModal();
  }

  function bindCustomers() {
    $("#addCustomerButton")?.addEventListener("click", () => openCustomerDialog());
    $("#closeCustomerDialog")?.addEventListener("click", () => $("#customerDialog").close());
    $("#cancelCustomerButton")?.addEventListener("click", () => $("#customerDialog").close());
    $("#customerSearch")?.addEventListener("input", renderCustomers);

    $("#customerForm")?.addEventListener("submit", (event) => {
      event.preventDefault();

      const id = $("#customerId").value;
      const customer = {
        id: id || makeId("CUS"),
        name: $("#customerName").value.trim(),
        phone: $("#customerPhone").value.trim(),
        email: $("#customerEmail").value.trim(),
        address: $("#customerAddress").value.trim(),
        registered: data.customers.find((c) => c.id === id)?.registered || localDate()
      };

      const existingIndex = data.customers.findIndex((c) => c.id === id);
      if (existingIndex >= 0) data.customers[existingIndex] = customer;
      else data.customers.push(customer);

      saveData();
      renderAll();
      $("#customerDialog").close();
      notify(existingIndex >= 0 ? "Customer updated." : "Customer added.");
    });

    $("#customersTable")?.addEventListener("click", (event) => {
      const editId = event.target.closest("[data-edit-customer]")?.dataset.editCustomer;
      const deleteId = event.target.closest("[data-delete-customer]")?.dataset.deleteCustomer;

      if (editId) openCustomerDialog(data.customers.find((c) => c.id === editId));

      if (deleteId) {
        const customer = data.customers.find((c) => c.id === deleteId);
        if (!customer || !confirm(`Delete "${customer.name}"?`)) return;

        data.customers = data.customers.filter((c) => c.id !== deleteId);
        saveData();
        renderAll();
        notify("Customer deleted.");
      }
    });
  }

  function renderPOS() {
    const grid = $("#posProductGrid");
    if (!grid) return;

    const search = ($("#posProductSearch")?.value || "").toLowerCase().trim();
    const products = data.products.filter((p) =>
      `${p.name} ${p.sku}`.toLowerCase().includes(search) && number(p.stock) > 0
    );

    grid.innerHTML = products.length
      ? products.map((product) => `
        <button class="action-card" type="button" data-add-cart="${escapeHTML(product.id)}">
          <span class="action-icon action-blue">□</span>
          <strong>${escapeHTML(product.name)}</strong>
          <small>${escapeHTML(product.sku)} · Stock ${number(product.stock)}</small>
          <strong>${money(product.price)}</strong>
        </button>
      `).join("")
      : `<div class="empty-state">
          <span class="empty-icon">□</span>
          <h3>No products available</h3>
          <p>Add products to your inventory first.</p>
          <button class="primary-button" type="button" data-navigate="products">Add Products</button>
        </div>`;

    renderCart();
  }

  function renderCart() {
    const container = $("#cartItems");
    if (!container) return;

    container.innerHTML = cart.length
      ? cart.map((item) => `
        <div class="cart-line" style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #eef0f4">
          <div>
            <strong>${escapeHTML(item.name)}</strong>
            <small style="display:block;color:#758198">${money(item.price)} × ${item.quantity}</small>
          </div>
          <div style="text-align:right">
            <strong>${money(item.price * item.quantity)}</strong><br>
            <button class="text-button" type="button" data-cart-minus="${escapeHTML(item.productId)}">−</button>
            <button class="text-button" type="button" data-cart-plus="${escapeHTML(item.productId)}">+</button>
            <button class="text-button" type="button" data-cart-remove="${escapeHTML(item.productId)}">Remove</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state"><span class="empty-icon">▣</span><p>Your shopping cart is empty.</p></div>`;

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountInput = $("#saleDiscount");
    const discount = Math.min(Math.max(0, number(discountInput?.value)), subtotal);
    const total = Math.max(0, subtotal - discount);
    const paid = number($("#amountPaid")?.value);

    $("#cartSubtotal").textContent = money(subtotal);
    $("#cartTotal").textContent = money(total);
    $("#saleChange").textContent = money(Math.max(0, paid - total));
  }

  function bindPOS() {
    $("#posProductSearch")?.addEventListener("input", renderPOS);
    $("#saleDiscount")?.addEventListener("input", renderCart);
    $("#amountPaid")?.addEventListener("input", renderCart);

    $("#posProductGrid")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-add-cart]");
      if (!button) return;

      const product = data.products.find((p) => p.id === button.dataset.addCart);
      if (!product) return;

      const item = cart.find((entry) => entry.productId === product.id);
      if (item) {
        if (item.quantity >= number(product.stock)) {
          notify("Not enough stock available.");
          return;
        }
        item.quantity += 1;
      } else {
        cart.push({
          productId: product.id,
          name: product.name,
          price: number(product.price),
          cost: number(product.cost),
          quantity: 1
        });
      }

      renderCart();
    });

    $("#cartItems")?.addEventListener("click", (event) => {
      const id =
        event.target.closest("[data-cart-plus]")?.dataset.cartPlus ||
        event.target.closest("[data-cart-minus]")?.dataset.cartMinus ||
        event.target.closest("[data-cart-remove]")?.dataset.cartRemove;

      if (!id) return;

      const item = cart.find((entry) => entry.productId === id);
      const product = data.products.find((p) => p.id === id);
      if (!item || !product) return;

      if (event.target.closest("[data-cart-remove]")) {
        cart = cart.filter((entry) => entry.productId !== id);
      } else if (event.target.closest("[data-cart-plus]")) {
        if (item.quantity >= number(product.stock)) {
          notify("Not enough stock available.");
          return;
        }
        item.quantity += 1;
      } else {
        item.quantity -= 1;
        if (item.quantity <= 0) cart = cart.filter((entry) => entry.productId !== id);
      }

      renderCart();
    });

    $("#clearCartButton")?.addEventListener("click", () => {
      cart = [];
      renderCart();
    });

    $("#completeSaleButton")?.addEventListener("click", completeSale);
  }

  function completeSale() {
    if (!cart.length) {
      notify("Add products to the cart first.");
      return;
    }

    for (const item of cart) {
      const product = data.products.find((p) => p.id === item.productId);
      if (!product || number(product.stock) < item.quantity) {
        notify(`Insufficient stock for ${item.name}.`);
        return;
      }
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = Math.min(Math.max(0, number($("#saleDiscount").value)), subtotal);
    const total = subtotal - discount;
    const paid = number($("#amountPaid").value);

    if (paid < total) {
      notify("Amount paid is less than the total.");
      return;
    }

    const customerId = $("#saleCustomer").value;
    const customer = data.customers.find((c) => c.id === customerId);

    const sale = {
      id: `SALE-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString(),
      customerId: customerId || "",
      customerName: customer?.name || "Walk-in Customer",
      payment: $("#paymentMethod").value,
      items: cart.map((item) => ({ ...item })),
      subtotal,
      discount,
      total,
      paid,
      change: paid - total
    };

    cart.forEach((item) => {
      const product = data.products.find((p) => p.id === item.productId);
      product.stock = number(product.stock) - item.quantity;
    });

    data.sales.unshift(sale);
    saveData();

    cart = [];
    $("#saleDiscount").value = "0";
    $("#amountPaid").value = "";

    renderAll();
    showReceipt(sale);
    notify("Sale completed successfully.");
  }

  function showReceipt(sale) {
    $("#receiptBusinessName").textContent = data.settings.name || "My Business";
    $("#receiptBusinessInfo").textContent =
      [data.settings.phone, data.settings.address].filter(Boolean).join(" · ") || "Sales Receipt";
    $("#receiptSaleId").textContent = sale.id;
    $("#receiptDate").textContent = new Date(sale.date).toLocaleString();
    $("#receiptCustomer").textContent = sale.customerName;
    $("#receiptPayment").textContent = sale.payment;

    $("#receiptItems").innerHTML = sale.items.map((item) => `
      <tr>
        <td>${escapeHTML(item.name)}</td>
        <td>${item.quantity}</td>
        <td>${money(item.price)}</td>
        <td>${money(item.price * item.quantity)}</td>
      </tr>
    `).join("");

    $("#receiptSubtotal").textContent = money(sale.subtotal);
    $("#receiptDiscount").textContent = money(sale.discount);
    $("#receiptTotal").textContent = money(sale.total);
    $("#receiptPaid").textContent = money(sale.paid);
    $("#receiptChange").textContent = money(sale.change);

    $("#receiptDialog")?.showModal();
  }

  function renderSales() {
    const tbody = $("#salesTable");
    if (!tbody) return;

    const search = ($("#salesSearch")?.value || "").toLowerCase().trim();
    const date = $("#salesDateFilter")?.value || "";
    const payment = $("#salesPaymentFilter")?.value || "";

    const sales = data.sales.filter((sale) => {
      const matchesSearch = `${sale.id} ${sale.customerName}`.toLowerCase().includes(search);
      const matchesDate = !date || localDate(new Date(sale.date)) === date;
      const matchesPayment = !payment || sale.payment === payment;
      return matchesSearch && matchesDate && matchesPayment;
    });

    tbody.innerHTML = sales.length
      ? sales.map((sale) => `
        <tr>
          <td><strong>${escapeHTML(sale.id)}</strong></td>
          <td>${new Date(sale.date).toLocaleString()}</td>
          <td>${escapeHTML(sale.customerName)}</td>
          <td>${sale.items.reduce((sum, item) => sum + number(item.quantity), 0)}</td>
          <td>${escapeHTML(sale.payment)}</td>
          <td>${money(sale.total)}</td>
          <td><button class="secondary-button" type="button" data-view-sale="${escapeHTML(sale.id)}">Receipt</button></td>
        </tr>
      `).join("")
      : `<tr><td colspan="7" class="empty-table">No sales found.</td></tr>`;

    renderRecentSales();
  }

  function renderRecentSales() {
    const tbody = $("#recentSalesTable");
    if (!tbody) return;

    const sales = data.sales.slice(0, 5);
    tbody.innerHTML = sales.length
      ? sales.map((sale) => `
        <tr>
          <td><strong>${escapeHTML(sale.id)}</strong></td>
          <td>${new Date(sale.date).toLocaleDateString()}</td>
          <td>${sale.items.reduce((sum, item) => sum + number(item.quantity), 0)}</td>
          <td>${escapeHTML(sale.payment)}</td>
          <td>${money(sale.total)}</td>
          <td><span class="status-badge">Completed</span></td>
        </tr>
      `).join("")
      : `<tr><td colspan="6" class="empty-table">No transactions recorded yet.</td></tr>`;
  }

  function bindSales() {
    ["salesSearch", "salesDateFilter", "salesPaymentFilter"].forEach((id) => {
      $(`#${id}`)?.addEventListener("input", renderSales);
      $(`#${id}`)?.addEventListener("change", renderSales);
    });

    $("#salesTable")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-view-sale]")?.dataset.viewSale;
      if (id) {
        const sale = data.sales.find((item) => item.id === id);
        if (sale) showReceipt(sale);
      }
    });

    $("#closeReceiptButton")?.addEventListener("click", () => $("#receiptDialog").close());
    $("#printReceiptButton")?.addEventListener("click", () => window.print());
    $("#exportSalesButton")?.addEventListener("click", exportSalesCSV);
  }

  function updateDashboard() {
    const today = localDate();
    const todaySales = data.sales.filter((sale) => localDate(new Date(sale.date)) === today);
    const weekAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    const weekSales = data.sales.filter((sale) => new Date(sale.date).getTime() >= weekAgo);

    $("#todaySales").textContent = money(todaySales.reduce((sum, sale) => sum + number(sale.total), 0));
    $("#totalTransactions").textContent = data.sales.length;
    $("#totalProducts").textContent = data.products.length;
    $("#lowStockItems").textContent =
      data.products.filter((p) => number(p.stock) <= number(p.minStock)).length;
    $("#weeklySales").textContent = money(weekSales.reduce((sum, sale) => sum + number(sale.total), 0));

    renderRecentSales();
  }

  function estimateProfit(sale) {
    const cost = sale.items.reduce((sum, item) => sum + number(item.cost) * number(item.quantity), 0);
    return sale.total - cost;
  }

  function generateReport() {
    const start = $("#reportStartDate")?.value || "";
    const end = $("#reportEndDate")?.value || "";

    reportRows = data.sales.filter((sale) => {
      const date = localDate(new Date(sale.date));
      return (!start || date >= start) && (!end || date <= end);
    });

    const revenue = reportRows.reduce((sum, sale) => sum + number(sale.total), 0);
    const profit = reportRows.reduce((sum, sale) => sum + estimateProfit(sale), 0);

    $("#reportRevenue").textContent = money(revenue);
    $("#reportProfit").textContent = money(profit);
    $("#reportTransactions").textContent = reportRows.length;

    const grouped = {};
    reportRows.forEach((sale) => {
      const date = localDate(new Date(sale.date));
      grouped[date] ||= { count: 0, revenue: 0, profit: 0 };
      grouped[date].count += 1;
      grouped[date].revenue += number(sale.total);
      grouped[date].profit += estimateProfit(sale);
    });

    const tbody = $("#reportsTable");
    if (tbody) {
      const rows = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
      tbody.innerHTML = rows.length
        ? rows.map(([date, values]) => `
          <tr>
            <td>${date}</td>
            <td>${values.count}</td>
            <td>${money(values.revenue)}</td>
            <td>${money(values.profit)}</td>
          </tr>
        `).join("")
        : `<tr><td colspan="4" class="empty-table">No sales in the selected date range.</td></tr>`;
    }
  }

  function exportCSV(filename, rows) {
    const csv = rows.map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportSalesCSV() {
    const rows = [["Sale ID", "Date", "Customer", "Payment", "Items", "Subtotal", "Discount", "Total"]];
    data.sales.forEach((sale) => rows.push([
      sale.id,
      new Date(sale.date).toLocaleString(),
      sale.customerName,
      sale.payment,
      sale.items.reduce((sum, item) => sum + number(item.quantity), 0),
      sale.subtotal,
      sale.discount,
      sale.total
    ]));
    exportCSV("smart-pos-sales.csv", rows);
  }

  function exportReportCSV() {
    const rows = [["Date", "Sale ID", "Customer", "Revenue", "Estimated Profit"]];
    reportRows.forEach((sale) => rows.push([
      localDate(new Date(sale.date)),
      sale.id,
      sale.customerName,
      sale.total,
      estimateProfit(sale)
    ]));
    exportCSV("smart-pos-report.csv", rows);
  }

  function renderExpenses() {
    const tbody = $("#expensesTable");
    if (!tbody) return;

    const search = ($("#expenseSearch")?.value || "").toLowerCase().trim();
    const expenses = data.expenses.filter((expense) =>
      `${expense.description} ${expense.category}`.toLowerCase().includes(search)
    );

    tbody.innerHTML = expenses.length
      ? expenses.map((expense) => `
        <tr>
          <td>${escapeHTML(expense.date)}</td>
          <td>${escapeHTML(expense.description)}</td>
          <td>${escapeHTML(expense.category)}</td>
          <td>${money(expense.amount)}</td>
          <td><button class="danger-button" type="button" data-delete-expense="${escapeHTML(expense.id)}">Delete</button></td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" class="empty-table">No expenses found.</td></tr>`;

    $("#totalExpenses").textContent = money(
      data.expenses.reduce((sum, expense) => sum + number(expense.amount), 0)
    );
  }

  function bindExpenses() {
    $("#addExpenseButton")?.addEventListener("click", () => {
      $("#expenseForm")?.reset();
      $("#expenseDate").value = localDate();
      $("#expenseDialog")?.showModal();
    });

    $("#closeExpenseDialog")?.addEventListener("click", () => $("#expenseDialog").close());
    $("#cancelExpenseButton")?.addEventListener("click", () => $("#expenseDialog").close());
    $("#expenseSearch")?.addEventListener("input", renderExpenses);

    $("#expenseForm")?.addEventListener("submit", (event) => {
      event.preventDefault();

      data.expenses.unshift({
        id: makeId("EXP"),
        description: $("#expenseDescription").value.trim(),
        category: $("#expenseCategory").value,
        amount: number($("#expenseAmount").value),
        date: $("#expenseDate").value
      });

      saveData();
      renderExpenses();
      $("#expenseDialog").close();
      notify("Expense recorded.");
    });

    $("#expensesTable")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-delete-expense]")?.dataset.deleteExpense;
      if (!id || !confirm("Delete this expense?")) return;

      data.expenses = data.expenses.filter((expense) => expense.id !== id);
      saveData();
      renderExpenses();
      notify("Expense deleted.");
    });
  }

  function bindSettings() {
    const form = $("#settingsForm");
    if (!form) return;

    $("#businessName").value = data.settings.name || "";
    $("#businessPhone").value = data.settings.phone || "";
    $("#businessAddress").value = data.settings.address || "";

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      data.settings.name = $("#businessName").value.trim();
      data.settings.phone = $("#businessPhone").value.trim();
      data.settings.address = $("#businessAddress").value.trim();

      saveData();
      $(".store-details h4").textContent = data.settings.name || "My Business";
      notify("Settings saved.");
    });

    $("#backupButton")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `smart-pos-backup-${localDate()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    $("#restoreButton")?.addEventListener("click", () => $("#restoreFileInput").click());

    $("#restoreFileInput")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const imported = JSON.parse(await file.text());
        if (
          !imported ||
          !Array.isArray(imported.products) ||
          !Array.isArray(imported.customers) ||
          !Array.isArray(imported.sales)
        ) {
          throw new Error("Invalid backup");
        }

        data = {
          ...structuredClone(defaultData),
          ...imported,
          settings: { ...defaultData.settings, ...(imported.settings || {}) }
        };

        saveData();
        renderAll();
        bindSettingsValues();
        notify("Backup restored.");
      } catch {
        notify("Could not restore this backup file.");
      }

      event.target.value = "";
    });

    $("#resetDataButton")?.addEventListener("click", () => {
      if (!confirm("This will permanently delete all products, customers, sales and expenses. Continue?")) return;

      data = structuredClone(defaultData);
      cart = [];
      saveData();
      renderAll();
      bindSettingsValues();
      notify("All local business data has been reset.");
    });

    $("#exportReportButton")?.addEventListener("click", exportReportCSV);
    $("#generateReportButton")?.addEventListener("click", generateReport);
  }

  function bindSettingsValues() {
    $("#businessName").value = data.settings.name || "";
    $("#businessPhone").value = data.settings.phone || "";
    $("#businessAddress").value = data.settings.address || "";
    $(".store-details h4").textContent = data.settings.name || "My Business";
  }

  function renderAll() {
    renderProducts();
    renderInventory();
    renderCustomers();
    renderPOS();
    renderSales();
    renderExpenses();
    updateDashboard();
    generateReport();
    bindSettingsValues();
  }

  function bindEvents() {
    bindNavigation();
    bindProducts();
    bindCustomers();
    bindPOS();
    bindSales();
    bindExpenses();
    bindSettings();

    $("#inventorySearch")?.addEventListener("input", renderInventory);
    $("#inventoryStatusFilter")?.addEventListener("change", renderInventory);
  }

  function init() {
    setDate();
    bindEvents();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();