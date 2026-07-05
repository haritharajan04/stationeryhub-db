const API_URL = window.location.origin + "/api";

async function customFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers["ngrok-skip-browser-warning"] = "true";
    if (authToken && !options.headers["Authorization"]) {
        options.headers["Authorization"] = `Bearer ${authToken}`;
    }
    return fetch(url, options);
}

// App State
let products = [];
let cart = [];
let appliedCoupon = null;
let activeTab = "catalog";
let isRecordingSearch = false;
let speechRecognizer = null;
let currentUser = null;
let authToken = localStorage.getItem("authToken");

// DOM Elements
const productsContainer = document.getElementById("products-container");
const cartModal = document.getElementById("cart-modal");
const cartNav = document.getElementById("cart-nav");
const closeCartBtn = document.getElementById("close-cart-btn");
const cartCount = document.getElementById("cart-count");
const cartItems = document.getElementById("cart-items");
const cartSubtotal = document.getElementById("cart-subtotal");
const cartTotal = document.getElementById("cart-total");
const couponInput = document.getElementById("coupon-input");
const applyCouponBtn = document.getElementById("apply-coupon-btn");
const discountRow = document.getElementById("discount-row");
const cartDiscount = document.getElementById("cart-discount");
const emiOption = document.getElementById("emi-selection-option");
const checkoutBtn = document.getElementById("checkout-btn");

// Section views
const catalogSection = document.getElementById("catalog-section");
const accountSection = document.getElementById("account-section");

const navCatalog = document.getElementById("nav-catalog");
const navAccount = document.getElementById("nav-account");

// Voice Search elements
const activateVoiceSearch = document.getElementById("activate-voice-search");
const voiceSearchIndicator = document.getElementById("voice-search-indicator");
const voiceSearchStatus = document.getElementById("voice-search-status");
const stopVoiceSearch = document.getElementById("stop-voice-search");

// Authentication elements
const authBox = document.getElementById("auth-box");
const profileContainer = document.getElementById("profile-container");
const tabLoginBtn = document.getElementById("tab-login-btn");
const tabRegisterBtn = document.getElementById("tab-register-btn");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");
const profileRole = document.getElementById("profile-role");
const logoutBtn = document.getElementById("logout-btn");
const orderList = document.getElementById("order-list");

// Payment elements
const paymentGatewayModal = document.getElementById("payment-gateway-modal");
const gatewayTotalAmount = document.getElementById("gateway-total-amount");
const gatewayEmiSchedule = document.getElementById("gateway-emi-schedule");
const cardFields = document.getElementById("card-fields");
const codFields = document.getElementById("cod-fields");
const cancelPaymentBtn = document.getElementById("cancel-payment-btn");
const confirmPaymentBtn = document.getElementById("confirm-payment-btn");

// Initialize Store
async function initStore() {
    await fetchCatalog();
    setupTabListeners();
    setupCartListeners();
    setupVoiceSearch();
    setupAuthListeners();
    setupPaymentGatewayListeners();
    
    // Auto-login if token exists
    if (authToken) {
        await fetchProfile();
    }
}

// Fetch Catalog Products from API
async function fetchCatalog() {
    try {
        const response = await customFetch(`${API_URL}/products`);
        if (!response.ok) throw new Error("API server offline");
        products = await response.json();
    } catch (e) {
        console.warn("Fallback to local mockup catalog", e);
        // Fallback mockup local array
        products = [
            {
                id: "e0000000-0000-0000-0000-000000000001",
                name: "Pilot V7 Gel Pen",
                description: "Liquid ink gel pen 0.7mm for extra smooth writing flows.",
                variants: [
                    {
                        id: "20000000-0000-0000-0000-000000000001",
                        name: "Blue Color",
                        uoms: [
                            { id: "f0000000-0000-0000-0000-000000000001", name: "Piece", sku: "PLT-V7-BLUE-PC", price: 80.00 },
                            { id: "f0000000-0000-0000-0000-000000000002", name: "Box (12 count)", sku: "PLT-V7-BLUE-BOX", price: 900.00 }
                        ]
                    }
                ]
            }
        ];
    }
    renderCatalog(products);
}

function renderCatalog(productList) {
    productsContainer.innerHTML = "";
    if (productList.length === 0) {
        productsContainer.innerHTML = '<p class="empty-message">No matching products found.</p>';
        return;
    }

    productList.forEach((product) => {
        const pIndex = products.findIndex(p => p.id === product.id);
        const activeVariant = product.variants[0];
        const activeUOM = activeVariant.uoms[0];

        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-info">
                <h4>${product.name}</h4>
                <p class="product-desc">${product.description}</p>
                
                <div class="selection-group">
                    <label>Select Variant</label>
                    <select class="form-select variant-select" data-product-index="${pIndex}">
                        ${product.variants.map((v, vIndex) => `<option value="${vIndex}">${v.name}</option>`).join("")}
                    </select>
                </div>
                
                <div class="selection-group">
                    <label>Select Packing Unit</label>
                    <select class="form-select uom-select" data-product-index="${pIndex}" id="uom-select-${pIndex}">
                        ${activeVariant.uoms.map((u, uIndex) => `<option value="${uIndex}">${u.name} (SKU: ${u.sku})</option>`).join("")}
                    </select>
                </div>

                <div class="selection-group">
                    <label>📍 Select Seller</label>
                    <select class="form-select seller-select" data-product-index="${pIndex}" id="seller-select-${pIndex}">
                        ${(activeUOM.sellers || []).length > 0 ? activeUOM.sellers.map(s => `<option value="${s.seller_id}" data-price="${s.price}">${s.first_name} ${s.last_name} (Stock: ${s.stock})</option>`).join("") : `<option value="">Out of Stock</option>`}
                    </select>
                </div>
            </div>
            <div class="product-footer">
                <span class="price" id="price-display-${pIndex}">₹${activeUOM.price.toFixed(2)}</span>
                <button class="btn btn-primary add-to-cart-btn" data-product-index="${pIndex}">Add to Cart</button>
            </div>
        `;
        productsContainer.appendChild(card);
    });

    setupCardListeners();
}

function updateCardSellers(productIndex, uom) {
    const sellerSelect = document.getElementById(`seller-select-${productIndex}`);
    const sellers = uom.sellers || [];
    if (sellers.length > 0) {
        sellerSelect.innerHTML = sellers.map(s => 
            `<option value="${s.seller_id}" data-price="${s.price}">${s.first_name} ${s.last_name} (Stock: ${s.stock})</option>`
        ).join("");
        updateCardPrice(productIndex, sellers[0].price);
    } else {
        sellerSelect.innerHTML = `<option value="">Out of Stock</option>`;
        updateCardPrice(productIndex, 0);
    }
}

function setupCardListeners() {
    document.querySelectorAll(".variant-select").forEach(select => {
        select.addEventListener("change", (e) => {
            const pIndex = e.target.dataset.productIndex;
            const vIndex = e.target.value;
            const product = products[pIndex];
            const variant = product.variants[vIndex];
            
            const uomSelect = document.getElementById(`uom-select-${pIndex}`);
            uomSelect.innerHTML = variant.uoms.map((u, uIndex) => `<option value="${uIndex}">${u.name} (SKU: ${u.sku})</option>`).join("");
            
            updateCardSellers(pIndex, variant.uoms[0]);
        });
    });

    document.querySelectorAll(".uom-select").forEach(select => {
        select.addEventListener("change", (e) => {
            const pIndex = e.target.dataset.productIndex;
            const uIndex = e.target.value;
            const product = products[pIndex];
            
            const variantIndex = document.querySelector(`.variant-select[data-product-index="${pIndex}"]`).value;
            const uom = product.variants[variantIndex].uoms[uIndex];
            
            updateCardSellers(pIndex, uom);
        });
    });

    document.querySelectorAll(".seller-select").forEach(select => {
        select.addEventListener("change", (e) => {
            const pIndex = e.target.dataset.productIndex;
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.dataset.price) {
                updateCardPrice(pIndex, parseFloat(selectedOption.dataset.price));
            }
        });
    });

    document.querySelectorAll(".add-to-cart-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const pIndex = e.target.dataset.productIndex;
            const product = products[pIndex];
            
            const vIndex = document.querySelector(`.variant-select[data-product-index="${pIndex}"]`).value;
            const uIndex = document.querySelector(`.uom-select[data-product-index="${pIndex}"]`).value;
            
            const variant = product.variants[vIndex];
            const uom = variant.uoms[uIndex];

            const sellerSelect = document.getElementById(`seller-select-${pIndex}`);
            const selectedOption = sellerSelect.options[sellerSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) {
                alert("This item is currently out of stock from all sellers.");
                return;
            }
            const sellerId = selectedOption.value;
            const sellerName = selectedOption.text.split(" (")[0];
            const sellerPrice = parseFloat(selectedOption.dataset.price);

            const finalUom = { ...uom, price: sellerPrice };
            addToCart(product.name, variant.name, finalUom, sellerId, sellerName);
        });
    });
}

function updateCardPrice(productIndex, price) {
    document.getElementById(`price-display-${productIndex}`).innerText = `₹${price.toFixed(2)}`;
}

function setupTabListeners() {
    if (navCatalog) {
        navCatalog.addEventListener("click", (e) => {
            e.preventDefault();
            switchTab("catalog");
        });
    }

    if (navAccount) {
        navAccount.addEventListener("click", (e) => {
            e.preventDefault();
            switchTab("account");
        });
    }

    const searchInput = document.getElementById("catalog-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            filterCatalog(query);
        });
    }

    const promoSignupLink = document.getElementById("promo-signup-link");
    if (promoSignupLink) {
        promoSignupLink.addEventListener("click", (e) => {
            e.preventDefault();
            switchTab("account");
            if (tabRegisterBtn) tabRegisterBtn.click();
        });
    }
}

function switchTab(tabName) {
    activeTab = tabName;
    if (catalogSection) catalogSection.style.display = tabName === "catalog" ? "block" : "none";
    if (accountSection) accountSection.style.display = tabName === "account" ? "block" : "none";

    if (navCatalog) navCatalog.classList.toggle("active", tabName === "catalog");
    if (navAccount) navAccount.classList.toggle("active", tabName === "account");
}

// Cart Setup
function setupCartListeners() {
    if (cartNav) {
        cartNav.addEventListener("click", (e) => {
            e.preventDefault();
            cartModal.classList.add("open");
        });
    }

    if (closeCartBtn) {
        closeCartBtn.addEventListener("click", () => {
            cartModal.classList.remove("open");
        });
    }

    if (applyCouponBtn) {
        applyCouponBtn.addEventListener("click", applyCoupon);
    }
    if (checkoutBtn) {
        checkoutBtn.addEventListener("click", triggerCheckoutModal);
    }
}

function addToCart(productName, variantName, uom, sellerId, sellerName) {
    const existing = cart.find(item => item.sku === uom.sku && item.sellerId === sellerId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            name: `${productName} (${variantName})`,
            pack: uom.name,
            sku: uom.sku,
            price: uom.price,
            quantity: 1,
            sellerId: sellerId,
            sellerName: sellerName
        });
    }
    updateCartUI();
    cartModal.classList.add("open");
}

function updateCartUI() {
    cartCount.innerText = cart.reduce((sum, item) => sum + item.quantity, 0);

    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-message">Your cart is empty.</p>';
        cartSubtotal.innerText = "₹0.00";
        cartTotal.innerText = "₹0.00";
        emiOption.style.display = "none";
        return;
    }

    cartItems.innerHTML = cart.map((item, index) => `
        <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border-light); padding-bottom: 10px;">
            <div>
                <p style="font-weight: 600; font-size: 14px;">${item.name}</p>
                <p style="font-size: 12px; color: var(--text-secondary);">${item.pack} - ₹${item.price.toFixed(2)}<br><span style="color:#64748b; font-size:11px;">Seller: ${item.sellerName || 'Default'}</span></p>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <button onclick="changeQty(${index}, -1)" style="padding: 2px 8px; background: #f1f5f9; border: 1px solid var(--border-light); color:#000; border-radius:4px; cursor:pointer;">-</button>
                <span>${item.quantity}</span>
                <button onclick="changeQty(${index}, 1)" style="padding: 2px 8px; background: #f1f5f9; border: 1px solid var(--border-light); color:#000; border-radius:4px; cursor:pointer;">+</button>
            </div>
        </div>
    `).join("");

    calculateTotals();
}

window.changeQty = function(index, delta) {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }
    updateCartUI();
};

function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discount = 0;

    const discountTitle = document.getElementById("discount-title");

    if (appliedCoupon === "WELCOME10") {
        discount = subtotal * 0.10;
        if (discountRow) discountRow.style.display = "flex";
        if (discountTitle) discountTitle.innerText = "Discount (WELCOME10 - 10%)";
        if (cartDiscount) cartDiscount.innerText = `-₹${discount.toFixed(2)}`;
    } else if (appliedCoupon === "FIRSTUSER") {
        discount = subtotal * 0.20;
        if (discountRow) discountRow.style.display = "flex";
        if (discountTitle) discountTitle.innerText = "Discount (FIRSTUSER - 20%)";
        if (cartDiscount) cartDiscount.innerText = `-₹${discount.toFixed(2)}`;
    } else if (appliedCoupon === "STUDENT15") {
        discount = subtotal * 0.15;
        if (discountRow) discountRow.style.display = "flex";
        if (discountTitle) discountTitle.innerText = "Discount (STUDENT15 - 15%)";
        if (cartDiscount) cartDiscount.innerText = `-₹${discount.toFixed(2)}`;
    } else {
        if (discountRow) discountRow.style.display = "none";
    }

    const total = subtotal - discount;
    if (cartSubtotal) cartSubtotal.innerText = `₹${subtotal.toFixed(2)}`;
    if (cartTotal) cartTotal.innerText = `₹${total.toFixed(2)}`;

    // Show EMI Plan if cart total >= 2000
    if (emiOption) {
        if (total >= 2000.00) {
            emiOption.style.display = "flex";
        } else {
            emiOption.style.display = "none";
            const selectedOption = document.querySelector('input[name="payment-method"]:checked');
            if (selectedOption && selectedOption.value === "EMI") {
                const codOpt = document.querySelector('input[name="payment-method"][value="COD"]');
                if (codOpt) codOpt.checked = true;
            }
        }
    }
}

function applyCoupon() {
    const code = couponInput.value.trim().toUpperCase();
    if (code === "WELCOME10") {
        appliedCoupon = "WELCOME10";
        alert("WELCOME10 coupon applied: 10% discount!");
    } else if (code === "FIRSTUSER") {
        if (!authToken) {
            alert("Please log in or register to use the FIRSTUSER coupon.");
            appliedCoupon = null;
            return;
        }
        
        // Determine first-time status based on past orders table rows
        const orderListDiv = document.getElementById("order-list");
        const hasPastOrders = orderListDiv && orderListDiv.querySelectorAll(".order-card").length > 0;

        if (hasPastOrders) {
            alert("FIRSTUSER coupon is only valid for first-time customers with no previous orders.");
            appliedCoupon = null;
        } else {
            appliedCoupon = "FIRSTUSER";
            alert("FIRSTUSER coupon applied: 20% discount on your first order!");
        }
    } else if (code === "STUDENT15") {
        appliedCoupon = "STUDENT15";
        alert("STUDENT15 coupon applied: 15% student discount!");
    } else {
        appliedCoupon = null;
        alert("Invalid coupon code.");
    }
    calculateTotals();
}

// ==========================================
// 🔐 ACCOUNT SYSTEM & USER MANAGEMENT
// ==========================================
function setupAuthListeners() {
    // Auth Tabs switcher
    if (tabLoginBtn) {
        tabLoginBtn.addEventListener("click", () => {
            tabLoginBtn.classList.add("active");
            if (tabRegisterBtn) tabRegisterBtn.classList.remove("active");
            if (loginForm) loginForm.classList.add("active");
            if (registerForm) registerForm.classList.remove("active");
        });
    }

    if (tabRegisterBtn) {
        tabRegisterBtn.addEventListener("click", () => {
            tabRegisterBtn.classList.add("active");
            if (tabLoginBtn) tabLoginBtn.classList.remove("active");
            if (registerForm) registerForm.classList.add("active");
            if (loginForm) loginForm.classList.remove("active");
        });
    }

    // Login Form Submit
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("login-email").value;
            const password = document.getElementById("login-password").value;

            try {
                const res = await customFetch(`${API_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Login failed. Please verify your email and password.");

                authToken = data.token;
                localStorage.setItem("authToken", data.token);
                alert("Login successful!");
                await fetchProfile();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // Register Form Submit
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const first_name = document.getElementById("reg-first-name").value;
            const last_name = document.getElementById("reg-last-name").value;
            const email = document.getElementById("reg-email").value;
            const phone_number = document.getElementById("reg-phone").value;
            const address = document.getElementById("reg-address").value.trim();
            const password = document.getElementById("reg-password").value;

            try {
                const res = await customFetch(`${API_URL}/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ first_name, last_name, email, phone_number, address, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Registration failed. Please try again.");

                alert("Registration successful! You can now log in.");
                if (tabLoginBtn) tabLoginBtn.click();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            authToken = null;
            currentUser = null;
            localStorage.removeItem("authToken");
            authBox.style.display = "block";
            profileContainer.style.display = "none";
            alert("Logged out successfully.");
        });
    }
}

async function fetchProfile() {
    try {
        const res = await customFetch(`${API_URL}/profile`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        currentUser = data.user;
        profileName.innerText = `${currentUser.first_name} ${currentUser.last_name}`;
        profileEmail.innerText = currentUser.email;
        profileRole.innerText = currentUser.role.toUpperCase();

        authBox.style.display = "none";
        profileContainer.style.display = "block";

        // Hide all sub-sections first
        document.getElementById("customer-dashboard-view").style.display = "none";
        document.getElementById("admin-dashboard-view").style.display = "none";
        document.getElementById("seller-dashboard-view").style.display = "none";

        const profileAddressCard = document.getElementById("profile-address-card");
        const profileAddressInput = document.getElementById("profile-address-input");
        const shippingAddressInput = document.getElementById("shipping-address-input");

        if (currentUser.role === 'admin') {
            if (profileAddressCard) profileAddressCard.style.display = "none";
            document.getElementById("admin-dashboard-view").style.display = "block";
            loadAdminComplaints();
            await loadAdminOrders();
            await loadAdminSellers();
            await loadAdminInventory();
        } else if (currentUser.role === 'employee') {
            if (profileAddressCard) profileAddressCard.style.display = "none";
            document.getElementById("seller-dashboard-view").style.display = "block";
            await loadSellerInventory();
        } else {
            // Customer
            if (profileAddressCard) profileAddressCard.style.display = "block";
            if (profileAddressInput) profileAddressInput.value = currentUser.address || "";
            if (shippingAddressInput) shippingAddressInput.value = currentUser.address || "";
            
            document.getElementById("customer-dashboard-view").style.display = "block";
            renderOrders(data.orders);
        }
    } catch (err) {
        console.error("Token verification failed, clearing auth.", err);
        if (logoutBtn) logoutBtn.click();
    }
}

async function updateProfileAddress() {
    const addressInput = document.getElementById("profile-address-input");
    if (!addressInput) return;
    const address = addressInput.value.trim();

    try {
        const res = await customFetch(`${API_URL}/profile/address`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update address.");

        if (currentUser) {
            currentUser.address = address;
        }
        const shippingAddressInput = document.getElementById("shipping-address-input");
        if (shippingAddressInput) {
            shippingAddressInput.value = address;
        }
        alert("Shipping address updated successfully!");
    } catch (err) {
        alert(err.message);
    }
}

async function loadSellerInventory() {
    try {
        const res = await customFetch(`${API_URL}/inventory`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        const items = await res.json();
        if (!res.ok) throw new Error(items.error);
        
        const tbody = document.getElementById("seller-inventory-table");
        tbody.innerHTML = items.map(item => `
            <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 10px;"><strong>${item.product_name}</strong><br><span style="color:var(--text-secondary); font-size:12px;">${item.variant_name}</span></td>
                <td style="padding: 10px; font-family: monospace;">${item.sku_uom}</td>
                <td style="padding: 10px; font-weight:700;">${item.quantity} units</td>
                <td style="padding: 10px;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="number" id="stock-input-${item.item_uom_id}" value="${item.quantity}" min="0" style="width:70px; padding:4px 8px; border:1px solid var(--border-light); border-radius:4px; font-size:12px;">
                        <button onclick="updateSellerStock('${item.item_uom_id}')" style="background:#000; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">Update</button>
                    </div>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        console.error("Error loading inventory:", err);
    }
}

window.updateSellerStock = async function(id) {
    const qty = parseInt(document.getElementById(`stock-input-${id}`).value);
    if (isNaN(qty) || qty < 0) {
        alert("Please enter a valid stock quantity >= 0");
        return;
    }
    try {
        const res = await customFetch(`${API_URL}/inventory/${id}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({ quantity: qty })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        alert("Stock updated successfully!");
        await loadSellerInventory();
    } catch (err) {
        alert(err.message);
    }
};

async function loadAdminComplaints() {
    try {
        const res = await customFetch(`${API_URL}/admin/complaints`);
        const tickets = await res.json();
        if (!res.ok) throw new Error(tickets.error);

        const container = document.getElementById("admin-complaints-list");
        if (container) {
            if (tickets.length === 0) {
                container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No active support tickets.</p>`;
                return;
            }
            container.innerHTML = tickets.map(ticket => `
                <div class="feed-item" style="border-left: 3px solid ${ticket.status === 'Resolved' ? 'var(--primary-color)' : 'var(--accent-red)'}; margin-bottom: 12px; background: #fafafa; padding: 12px; border-radius: 6px; position:relative;">
                    <span class="tag tag-damaged" style="background:${ticket.status === 'Resolved' ? '#e2e8f0' : '#fee2e2'}; color:${ticket.status === 'Resolved' ? '#475569' : '#b91c1c'};">${ticket.subject}</span>
                    <p style="margin: 6px 0;">"${ticket.message}"</p>
                    <span class="time" style="font-size:11px; color:var(--text-secondary);">Filed by ${ticket.email} • <strong>${ticket.status}</strong></span>
                    ${ticket.status === 'Pending Review' ? `
                        <button onclick="resolveTicket('${ticket.id}')" style="position:absolute; top:12px; right:12px; padding:4px 8px; font-size:10px; background:var(--primary-color); color:#fff; border:none; border-radius:4px; cursor:pointer;">Resolve</button>
                    ` : ''}
                </div>
            `).join("");
        }
    } catch (err) {
        console.error("Failed to load complaints:", err);
    }
}

async function resolveTicket(ticketId) {
    try {
        const res = await customFetch(`${API_URL}/admin/complaints/${ticketId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Resolved" })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert("Support ticket marked as resolved!");
        await loadAdminComplaints();
    } catch (err) {
        alert(err.message);
    }
}
window.resolveTicket = resolveTicket;

async function loadAdminOrders() {
    try {
        const res = await customFetch(`${API_URL}/admin/orders`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        const orders = data.orders;
        
        // Update revenue indicators in UI
        document.getElementById("admin-total-revenue").innerText = `₹${data.totalRevenue.toFixed(2)}`;
        document.getElementById("admin-pending-revenue").innerText = `₹${data.pendingRevenue.toFixed(2)}`;
        
        const tbody = document.getElementById("admin-orders-table");
        if (!orders || orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align: center; color: var(--text-muted);">No orders found in database.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = orders.map(order => {
            const dateStr = new Date(order.created_at).toLocaleDateString();
            const itemsStr = order.items.map(it => `${it.item_name} (${it.pack_name}) x ${it.quantity}`).join("<br>");
            return `
                <tr style="border-bottom: 1px solid var(--border-light);">
                    <td style="padding: 10px;"><strong>Order ID: ${order.order_id.substring(0,8)}...</strong><br><span style="color:var(--text-muted); font-size:11px;">${dateStr}</span></td>
                    <td style="padding: 10px;">${order.first_name} ${order.last_name}<br><span style="color:var(--text-secondary); font-size:11px;">${order.email}</span><br><span style="color:#64748b; font-size:10px; font-style:italic;">📍 ${order.shipping_address || 'No Address'}</span></td>
                    <td style="padding: 10px; font-size:11px;">${itemsStr}</td>
                    <td style="padding: 10px; font-weight:700; color:var(--secondary-color);">₹${parseFloat(order.final_amount).toFixed(2)}<br><span style="font-size:10px; font-weight:normal; color:var(--text-secondary);">${order.payment_method} (${order.payment_status})</span></td>
                    <td style="padding: 10px;">
                        <div style="display:flex; gap:6px; align-items:center;">
                            <select id="admin-status-select-${order.order_id}" style="padding:4px; font-size:12px; border:1px solid var(--border-light); border-radius:4px;">
                                <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                                <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                            </select>
                            <button onclick="updateAdminOrderStatus('${order.order_id}')" style="background:#000; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">Update</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        console.error("Error loading admin orders:", err);
    }
}

window.updateAdminOrderStatus = async function(orderId) {
    const status = document.getElementById(`admin-status-select-${orderId}`).value;
    try {
        const res = await customFetch(`${API_URL}/admin/orders/${orderId}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        alert("Order status updated successfully!");
        await loadAdminOrders();
    } catch (err) {
        alert(err.message);
    }
};

function renderOrders(orders) {
    if (!orders || orders.length === 0) {
        orderList.innerHTML = '<p class="empty-message">No orders placed yet.</p>';
        return;
    }

    orderList.innerHTML = orders.map(order => {
        // Calculate estimated delivery: 3 days after order creation
        const orderTime = new Date(order.created_at).getTime();
        const estTime = orderTime + (3 * 24 * 60 * 60 * 1000);
        const estDelivery = new Date(estTime).toLocaleDateString(undefined, { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
        });

        // Determine current location and progress step based on order status
        let latestLoc = "StationeryHub Warehouse";
        let step = 1;
        let progressPercent = 0;

        if (order.tracking && order.tracking.length > 0) {
            latestLoc = order.tracking[0].location || "In Transit";
        }

        if (order.status === 'confirmed') {
            step = 1;
            progressPercent = 10;
        } else if (order.status === 'shipped') {
            step = 3;
            progressPercent = 66;
            latestLoc = latestLoc === "StationeryHub Warehouse" ? "Outbound Hub" : latestLoc;
        } else if (order.status === 'delivered') {
            step = 4;
            progressPercent = 100;
            latestLoc = "Customer Address";
        }

        return `
            <div class="order-card">
                <div class="order-card-header">
                    <div>
                        <h4>Order ID: ${order.order_id.substring(0, 8)}...</h4>
                        <span class="date">${new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                        <span class="order-status-badge status-${order.status}">${order.status}</span>
                    </div>
                </div>
                
                <!-- Shipment Progress Tracker Component -->
                <div class="tracking-progress-container" style="margin: 15px 0; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid var(--border-light);">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px; flex-wrap: wrap; gap: 5px;">
                        <span>📍 Location: <strong style="color:#000;">${latestLoc}</strong></span>
                        <span>Estimated Arrival: <strong style="color:var(--secondary-color);">${estDelivery}</strong></span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); border-top: 1px dashed var(--border-light); padding-top: 8px; margin-top: 5px;">
                        <strong>Shipping To:</strong> ${order.shipping_address || 'Customer Address'}
                    </div>
                    
                    <!-- Progress Bar Line -->
                    <div style="position: relative; display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding: 0 10px; height: 30px;">
                        <div style="position: absolute; left: 10px; right: 10px; height: 4px; background: #e2e8f0; top: 50%; transform: translateY(-50%); z-index: 1;"></div>
                        <div style="position: absolute; left: 10px; width: calc(${progressPercent}% - 20px); height: 4px; background: #10b981; top: 50%; transform: translateY(-50%); z-index: 2; transition: width 0.4s ease;"></div>
                        
                        <!-- Step Dots -->
                        <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 14px; height: 14px; border-radius: 50%; background: #10b981; border: 2px solid #fff; box-shadow: 0 0 0 2px #10b981;"></div>
                            <span style="font-size: 10px; font-weight: 700; margin-top: 6px;">Ordered</span>
                        </div>
                        <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 14px; height: 14px; border-radius: 50%; background: ${step >= 2 ? '#10b981' : '#cbd5e1'}; border: 2px solid #fff; box-shadow: 0 0 0 2px ${step >= 2 ? '#10b981' : '#cbd5e1'};"></div>
                            <span style="font-size: 10px; font-weight: 700; margin-top: 6px;">Dispatched</span>
                        </div>
                        <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 14px; height: 14px; border-radius: 50%; background: ${step >= 3 ? '#10b981' : '#cbd5e1'}; border: 2px solid #fff; box-shadow: 0 0 0 2px ${step >= 3 ? '#10b981' : '#cbd5e1'};"></div>
                            <span style="font-size: 10px; font-weight: 700; margin-top: 6px;">Transit</span>
                        </div>
                        <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 14px; height: 14px; border-radius: 50%; background: ${step >= 4 ? '#10b981' : '#cbd5e1'}; border: 2px solid #fff; box-shadow: 0 0 0 2px ${step >= 4 ? '#10b981' : '#cbd5e1'};"></div>
                            <span style="font-size: 10px; font-weight: 700; margin-top: 6px;">Delivered</span>
                        </div>
                    </div>
                </div>

                <div class="order-card-body">
                    ${order.items.map(item => `
                        <div class="order-item-row">
                            <span>${item.item_name} (${item.pack_name}) x ${item.quantity}</span>
                            <span>₹${parseFloat(item.final_item_price).toFixed(2)}</span>
                        </div>
                    `).join("")}
                    
                    <!-- Shipment Tracking Timeline Logs -->
                    <div class="order-tracking-timeline" style="margin-top: 15px; border-top: 1px solid var(--border-light); padding-top: 12px; font-size: 13px;">
                        <p style="font-weight: 700; margin-bottom: 8px; color: #000;">📦 Shipment Milestones:</p>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${order.tracking && order.tracking.length > 0 ? order.tracking.map(t => `
                                <div style="display: flex; gap: 10px; align-items: flex-start;">
                                    <span style="color: #10b981; font-size: 12px; margin-top: 2px;">●</span>
                                    <div>
                                        <strong>${t.status_update}</strong> (${t.location || 'In Transit'})
                                        <p style="color: var(--text-muted); font-size: 11px; margin: 0;">${t.description}</p>
                                    </div>
                                </div>
                            `).join("") : '<p style="color: var(--text-muted); font-size: 12px;">Waiting for order dispatch...</p>'}
                        </div>
                    </div>
                </div>
                <div class="order-card-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:13px; color:var(--text-muted);">Method: ${order.payment_method} (${order.payment_status})</span>
                    <div style="display:flex; gap:10px; align-items:center;">
                        ${order.status === 'delivered' ? `
                            <button onclick="reportDamagedGoods('${order.order_id}')" class="btn btn-secondary" style="padding:4px 8px; font-size:11px; margin:0; cursor:pointer;">Report Damage</button>
                        ` : ''}
                        <strong style="color:var(--secondary-color);">Total Paid: ₹${parseFloat(order.final_amount).toFixed(2)}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// ==========================================
// 💳 SIMULATED SECURE PAYMENT GATEWAY
// ==========================================
function setupPaymentGatewayListeners() {
    cancelPaymentBtn.addEventListener("click", () => {
        paymentGatewayModal.style.display = "none";
    });

    confirmPaymentBtn.addEventListener("click", processGatewayPayment);
}

function triggerCheckoutModal() {
    if (!authToken) {
        alert("Please log in or register an account before checking out.");
        switchTab("account");
        cartModal.classList.remove("open");
        return;
    }

    const total = parseFloat(cartTotal.innerText.replace("₹", ""));
    const method = document.querySelector('input[name="payment-method"]:checked').value;

    gatewayTotalAmount.innerText = `₹${total.toFixed(2)}`;
    
    if (method === "COD") {
        cardFields.style.display = "none";
        codFields.style.display = "block";
        gatewayEmiSchedule.style.display = "none";
    } else if (method === "EMI") {
        cardFields.style.display = "block";
        codFields.style.display = "none";
        gatewayEmiSchedule.style.display = "block";
        
        const inst = total / 6; // 6 Month plan simulation
        gatewayEmiSchedule.innerText = `EMI Schedule: 6 monthly installments of ₹${inst.toFixed(2)} each.`;
    } else {
        cardFields.style.display = "block";
        codFields.style.display = "none";
        gatewayEmiSchedule.style.display = "none";
    }

    cartModal.classList.remove("open");
    paymentGatewayModal.style.display = "flex";
}

async function processGatewayPayment() {
    const method = document.querySelector('input[name="payment-method"]:checked').value;
    const cardNum = document.getElementById("card-number").value;
    const cardHolder = document.getElementById("card-holder").value;
    const cardExp = document.getElementById("card-expiry").value;
    const cardCvv = document.getElementById("card-cvv").value;
    const shippingAddress = document.getElementById("shipping-address-input").value.trim();

    if (!shippingAddress) {
        alert("Please enter a shipping address.");
        return;
    }

    let payload = {
        cartItems: cart,
        paymentMethod: method,
        discountCode: appliedCoupon,
        shippingAddress: shippingAddress
    };

    if (method === "EMI") {
        payload.emiTenure = 6;
    }

    if (method !== "COD") {
        if (!cardHolder || cardNum.length < 16) {
            alert("Payment rejected: Please fill in valid card information.");
            return;
        }
        payload.cardDetails = { number: cardNum };
    }

    confirmPaymentBtn.disabled = true;
    confirmPaymentBtn.innerText = "Authorizing transaction...";

    try {
        const res = await customFetch(`${API_URL}/checkout`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        alert(`Payment Success!\nTransaction Ref: ${data.transactionReference}`);
        
        // Reset Cart
        cart = [];
        appliedCoupon = null;
        couponInput.value = "";
        document.getElementById("shipping-address-input").value = "";
        updateCartUI();
        paymentGatewayModal.style.display = "none";
        
        // Load updated order history
        await fetchProfile();
        switchTab("account");
    } catch (err) {
        alert(err.message);
    } finally {
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.innerText = "Authorize Payment";
    }
}



function setupVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const searchRecognizer = new SpeechRecognition();
    searchRecognizer.continuous = false;
    searchRecognizer.lang = 'en-IN';

    if (activateVoiceSearch) {
        activateVoiceSearch.addEventListener("click", () => {
            if (isRecordingSearch) {
                stopSearchRecording();
            } else {
                startSearchRecording();
            }
        });
    }

    if (stopVoiceSearch) {
        stopVoiceSearch.addEventListener("click", stopSearchRecording);
    }

    searchRecognizer.onresult = (e) => {
        const query = e.results[0][0].transcript.toLowerCase().replace(".", "");
        voiceSearchStatus.innerText = `Searching for: "${query}"`;
        
        setTimeout(() => {
            filterCatalog(query);
            stopSearchRecording();
        }, 1000);
    };

    searchRecognizer.onerror = () => {
        stopSearchRecording();
    };

    function startSearchRecording() {
        isRecordingSearch = true;
        voiceSearchIndicator.style.display = "block";
        voiceSearchStatus.innerText = "Listening for search terms...";
        searchRecognizer.start();
    }

    function stopSearchRecording() {
        isRecordingSearch = false;
        voiceSearchIndicator.style.display = "none";
        try { searchRecognizer.stop(); } catch(e) {}
    }
}

function filterCatalog(query) {
    const filtered = products.filter(p => {
        return p.name.toLowerCase().includes(query) || 
               p.description.toLowerCase().includes(query) || 
               p.variants.some(v => v.name.toLowerCase().includes(query));
    });
    renderCatalog(filtered);
}

// ==========================================
// 👑 ADMIN MANAGEMENT FORM HANDLERS
// ==========================================
async function adminCreateSeller() {
    const fname = document.getElementById("new-seller-fname").value.trim();
    const lname = document.getElementById("new-seller-lname").value.trim();
    const email = document.getElementById("new-seller-email").value.trim();
    const password = document.getElementById("new-seller-password").value;
    
    try {
        const res = await customFetch(`${API_URL}/admin/sellers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({ first_name: fname, last_name: lname, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        alert("Seller account registered successfully!");
        document.getElementById("admin-create-seller-form").reset();
        await loadAdminSellers(); // Refresh dropdown list
    } catch (err) {
        alert(err.message);
    }
}

async function adminCreateProduct() {
    const name = document.getElementById("new-prod-name").value.trim();
    const description = document.getElementById("new-prod-desc").value.trim();
    const sku_base = document.getElementById("new-prod-sku-base").value.trim();
    const category_id = parseInt(document.getElementById("new-prod-category").value);
    const variant_name = document.getElementById("new-prod-var-name").value.trim();
    const sku_variant = document.getElementById("new-prod-sku-var").value.trim();
    const price = parseFloat(document.getElementById("new-prod-price").value);
    const initial_stock = parseInt(document.getElementById("new-prod-stock").value);
    const seller_id = document.getElementById("new-prod-seller").value;
    
    try {
        const res = await customFetch(`${API_URL}/admin/products`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name, description, sku_base, category_id,
                variant_name, sku_variant, price, initial_stock, seller_id
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        alert("Product and assigned inventory published successfully!");
        document.getElementById("admin-create-product-form").reset();
        await fetchCatalog(); // Refresh storefront products catalog
    } catch (err) {
        alert(err.message);
    }
}

async function loadAdminSellers() {
    try {
        const res = await customFetch(`${API_URL}/admin/sellers`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        const sellers = await res.json();
        if (!res.ok) throw new Error(sellers.error);
        
        const select = document.getElementById("new-prod-seller");
        if (select) {
            select.innerHTML = '<option value="">Select Assignee Seller...</option>' + 
                sellers.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name} (${s.email})</option>`).join("");
        }

        const listDiv = document.getElementById("admin-sellers-list");
        if (listDiv) {
            if (sellers.length === 0) {
                listDiv.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No registered sellers.</p>`;
            } else {
                listDiv.innerHTML = sellers.map(s => `
                    <div style="background: #f8fafc; border: 1px solid var(--border-light); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-weight: 700; font-size: 13px; color:#000;">👤 ${s.first_name} ${s.last_name}</span>
                        <span style="color: var(--text-secondary); font-size: 11px;">✉️ ${s.email}</span>
                        <span style="color: #64748b; font-size: 10px;">ID: ${s.id.substring(0, 8)}...</span>
                    </div>
                `).join("");
            }
        }
    } catch (err) {
        console.error("Failed to load sellers:", err);
    }
}

// Customer Report Damaged Product / Request Return
async function reportDamagedGoods(orderId) {
    const reason = prompt("Describe the damaged issue or return reason:");
    if (!reason || !reason.trim()) return;

    try {
        const res = await customFetch(`${API_URL}/support/tickets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject: "Damaged Goods Return",
                message: `Order ${orderId.substring(0,8)}... damage report: ${reason.trim()}`,
                transaction_id: orderId
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert("Return request filed successfully! Support team will review this shortly.");
    } catch (err) {
        alert(err.message);
    }
}
window.reportDamagedGoods = reportDamagedGoods;

// Admin Stocks Count Overview Loader
async function loadAdminInventory() {
    const tbody = document.getElementById("admin-inventory-table");
    if (!tbody) return;

    if (products.length === 0) {
        await fetchCatalog();
    }

    let rowsHtml = "";
    products.forEach(p => {
        p.variants.forEach(v => {
            v.uoms.forEach(u => {
                (u.sellers || []).forEach(s => {
                    rowsHtml += `
                        <tr style="border-bottom: 1px solid var(--border-light);">
                            <td style="padding: 10px;"><strong>${p.name}</strong><br><span style="color:var(--text-muted); font-size:11px;">${v.name} (${u.name})</span></td>
                            <td style="padding: 10px;">${u.sku}</td>
                            <td style="padding: 10px;">👤 ${s.first_name} ${s.last_name}</td>
                            <td style="padding: 10px;"><span class="badge" style="background:${s.stock > 10 ? '#e2f0d9' : '#fce4d6'}; color:${s.stock > 10 ? '#385723' : '#c65911'}; padding:4px 8px; border-radius:4px; font-weight:700;">${s.stock} pcs</span></td>
                        </tr>
                    `;
                });
                if ((u.sellers || []).length === 0) {
                    rowsHtml += `
                        <tr style="border-bottom: 1px solid var(--border-light); opacity: 0.6;">
                            <td style="padding: 10px;"><strong>${p.name}</strong><br><span style="color:var(--text-muted); font-size:11px;">${v.name} (${u.name})</span></td>
                            <td style="padding: 10px;">${u.sku}</td>
                            <td style="padding: 10px; color:var(--accent-red);">No Active Seller</td>
                            <td style="padding: 10px; color:var(--accent-red); font-weight:700;">OUT OF STOCK</td>
                        </tr>
                    `;
                }
            });
        });
    });

    tbody.innerHTML = rowsHtml || `<tr><td colspan="4" style="padding:15px; text-align:center;">No stock data.</td></tr>`;
}
window.loadAdminInventory = loadAdminInventory;

// Seller Publish Product Listing
async function sellerCreateProduct() {
    const name = document.getElementById("seller-prod-name").value.trim();
    const description = document.getElementById("seller-prod-desc").value.trim();
    const sku_base = document.getElementById("seller-prod-sku-base").value.trim();
    const category_id = parseInt(document.getElementById("seller-prod-category").value);
    const variant_name = document.getElementById("seller-prod-var-name").value.trim();
    const sku_variant = document.getElementById("seller-prod-sku-var").value.trim();
    const price = parseFloat(document.getElementById("seller-prod-price").value);
    const initial_stock = parseInt(document.getElementById("seller-prod-stock").value);
    
    try {
        const res = await customFetch(`${API_URL}/admin/products`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name, description, sku_base, category_id,
                variant_name, sku_variant, price, initial_stock
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        alert("Product listed and stock registered successfully!");
        document.getElementById("seller-create-product-form").reset();
        await fetchCatalog(); // Refresh catalog products globally
        await loadSellerInventory(); // Refresh seller inventory table
    } catch (err) {
        alert(err.message);
    }
}
window.sellerCreateProduct = sellerCreateProduct;

// Publish handlers globally
window.adminCreateSeller = adminCreateSeller;
window.adminCreateProduct = adminCreateProduct;
window.switchTab = switchTab;
window.filterCatalog = filterCatalog;
window.updateProfileAddress = updateProfileAddress;

// Route handler based on URL hash
function handleHashRoute() {
    const hash = window.location.hash;
    if (hash === "#account") {
        switchTab("account");
    } else {
        switchTab("catalog");
    }
}

// Listen for hash changes
window.addEventListener("hashchange", handleHashRoute);

// Make site logo clickable to return to home catalog
const siteLogo = document.getElementById("site-logo");
if (siteLogo) {
    siteLogo.addEventListener("click", () => {
        window.location.hash = "#catalog";
        filterCatalog(""); // Reset filters
        const searchInput = document.getElementById("catalog-search-input");
        if (searchInput) searchInput.value = "";
    });
}

// Start app
initStore();
handleHashRoute(); // Process initial hash state
