const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const path = require('path');
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));


const JWT_SECRET = 'stationery_super_secret_key_123';

// Database Pool Connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'stationeryhub',
    password: 'mysecretpassword',
    port: 5432,
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected successfully at:', res.rows[0].now);
    }
});

// Middleware: Authenticate JWT Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required.' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
};

// ==========================================
// 🔐 AUTHENTICATION ENDPOINTS
// ==========================================

// Register User
app.post('/api/auth/register', async (req, res) => {
    const { email, password, first_name, last_name, phone_number, address } = req.body;
    
    if (!email || !password || !first_name || !last_name) {
        return res.status(400).json({ error: 'Please fill in all required fields.' });
    }
    
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, first_name, last_name, phone_number, address, role) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, first_name, last_name, role',
            [email, hash, first_name, last_name, phone_number, address || null, 'customer']
        );
        res.status(201).json({ message: 'User registered successfully!', user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: 'Email already registered.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Please enter email and password.' });
    }
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }
        
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            message: 'Login successful!',
            token,
            user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get User Profile & Order History
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userRes = await pool.query('SELECT id, email, first_name, last_name, role, address FROM users WHERE id = $1', [req.user.id]);

// Update User Profile Address
app.post('/api/profile/address', authenticateToken, async (req, res) => {
    const { address } = req.body;
    try {
        await pool.query('UPDATE users SET address = $1 WHERE id = $2', [address || null, req.user.id]);
        res.json({ message: 'Shipping address updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
        
        // Fetch User's Transactions & Items
        const ordersRes = await pool.query(`
            SELECT 
                t.id AS order_id, t.total_raw_amount, t.discount_amount, t.final_amount, t.status, t.created_at,
                p.payment_method, p.payment_status,
                e.tenure_months AS emi_tenure, e.status AS emi_status
            FROM transactions t
            LEFT JOIN payments p ON t.id = p.transaction_id
            LEFT JOIN emi_plans e ON t.id = e.transaction_id
            WHERE t.customer_user_id = $1
            ORDER BY t.created_at DESC
        `, [req.user.id]);

        // Get details for each transaction
        const orders = [];
        for (let order of ordersRes.rows) {
            const itemsRes = await pool.query(`
                SELECT ti.quantity, ti.unit_price, ti.final_item_price, iu.sku_uom, im.name AS item_name, uom.name AS pack_name
                FROM transaction_items ti
                JOIN item_uoms iu ON ti.item_uom_id = iu.id
                JOIN units_of_measure uom ON iu.uom_id = uom.id
                JOIN product_variants pv ON iu.variant_id = pv.id
                JOIN item_master im ON pv.item_id = im.id
                WHERE ti.transaction_id = $1
            `, [order.order_id]);
            
            const trackingRes = await pool.query(`
                SELECT status_update, description, location, updated_at
                FROM order_tracking
                WHERE transaction_id = $1
                ORDER BY updated_at DESC
            `, [order.order_id]);
            
            orders.push({
                ...order,
                items: itemsRes.rows,
                tracking: trackingRes.rows
            });
        }
        
        res.json({ user: userRes.rows[0], orders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🛒 CATALOG & CHECKOUT ENDPOINTS
// ==========================================

// Get Catalog Products, Variants & Prices
app.get('/api/products', async (req, res) => {
    try {
        const productsQuery = await pool.query(`
            SELECT 
                im.id AS product_id, im.name AS product_name, im.description AS product_description,
                pv.id AS variant_id, pv.name AS variant_name, pv.sku AS variant_sku,
                iu.id AS uom_id, iu.quantity_multiplier, iu.sku_uom,
                uom.name AS uom_name, uom.abbreviation AS uom_abbr,
                inv.unit_price,
                inv.quantity AS stock,
                sel.id AS seller_id, sel.first_name AS seller_first_name, sel.last_name AS seller_last_name
            FROM item_master im
            JOIN product_variants pv ON im.id = pv.item_id
            JOIN item_uoms iu ON pv.id = iu.variant_id
            JOIN units_of_measure uom ON iu.uom_id = uom.id
            LEFT JOIN inventory inv ON iu.id = inv.item_uom_id
            LEFT JOIN users sel ON inv.seller_id = sel.id
            ORDER BY im.name, pv.name, uom.id
        `);
        
        // Structure flat DB rows into nested objects
        const catalog = [];
        productsQuery.rows.forEach(row => {
            let product = catalog.find(p => p.id === row.product_id);
            if (!product) {
                product = {
                    id: row.product_id,
                    name: row.product_name,
                    description: row.product_description,
                    variants: []
                };
                catalog.push(product);
            }
            
            let variant = product.variants.find(v => v.id === row.variant_id);
            if (!variant) {
                variant = {
                    id: row.variant_id,
                    name: row.variant_name,
                    sku: row.variant_sku,
                    uoms: []
                };
                product.variants.push(variant);
            }
            
            let uom = variant.uoms.find(u => u.id === row.uom_id);
            if (!uom) {
                uom = {
                    id: row.uom_id,
                    name: row.uom_name,
                    sku: row.sku_uom,
                    price: 0,
                    sellers: []
                };
                variant.uoms.push(uom);
            }
            
            if (row.seller_id) {
                uom.sellers.push({
                    seller_id: row.seller_id,
                    first_name: row.seller_first_name,
                    last_name: row.seller_last_name,
                    stock: row.stock,
                    price: parseFloat(row.unit_price || 0)
                });
                
                // Default UOM price to the first seller's price
                if (uom.price === 0) {
                    uom.price = parseFloat(row.unit_price || 0);
                }
            }
        });
        
        res.json(catalog);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Secure Checkout & Payment Processing
app.post('/api/checkout', authenticateToken, async (req, res) => {
    const { cartItems, paymentMethod, cardDetails, emiTenure, discountCode, shippingAddress } = req.body;
    
    if (!cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: 'Your cart is empty.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start ACID transaction
        
        let subtotal = 0;
        const itemsToInsert = [];
        
        // 1. Validate Stock & Calculate pricing from Database
        for (let cartItem of cartItems) {
            const uomRes = await client.query(`
                SELECT iu.id, inv.unit_price, inv.quantity, inv.seller_id 
                FROM item_uoms iu
                JOIN inventory inv ON iu.id = inv.item_uom_id
                WHERE iu.sku_uom = $1 AND inv.seller_id = $2
            `, [cartItem.sku, cartItem.sellerId]);
            
            if (uomRes.rows.length === 0) {
                throw new Error(`Product SKU ${cartItem.sku} from selected Seller not found or active price missing.`);
            }
            
            const dbUom = uomRes.rows[0];
            if (dbUom.quantity < cartItem.quantity) {
                throw new Error(`Insufficient stock for SKU ${cartItem.sku} with this seller. Available: ${dbUom.quantity}`);
            }
            
            const price = parseFloat(dbUom.unit_price);
            subtotal += price * cartItem.quantity;
            
            itemsToInsert.push({
                uom_id: dbUom.id,
                seller_id: dbUom.seller_id,
                quantity: cartItem.quantity,
                unit_price: price,
                total_price: price * cartItem.quantity
            });
        }
        
        // 2. Coupon Validation Check
        let discount = 0;
        if (discountCode === 'WELCOME10') {
            discount = subtotal * 0.10;
        }
        const total = subtotal - discount;
        
        // 3. Create Transaction Record
        const transactionRes = await client.query(`
            INSERT INTO transactions (type, customer_user_id, total_raw_amount, discount_amount, final_amount, status, shipping_address)
            VALUES ('customer_sale', $1, $2, $3, $4, 'confirmed', $5)
            RETURNING id
        `, [req.user.id, subtotal, discount, total, shippingAddress || 'Customer Address']);
        
        const transactionId = transactionRes.rows[0].id;
        
        // 4. Save Transaction Items & Decrease Inventory Stock
        for (let item of itemsToInsert) {
            await client.query(`
                INSERT INTO transaction_items (transaction_id, item_uom_id, quantity, unit_price, final_item_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [transactionId, item.uom_id, item.quantity, item.unit_price, item.total_price]);
            
            await client.query(`
                UPDATE inventory 
                SET quantity = quantity - $1 
                WHERE item_uom_id = $2 AND seller_id = $3
            `, [item.quantity, item.uom_id, item.seller_id]);
        }
        
        // 5. Secure Payment Simulation & Gateway Handshake
        let paymentStatus = 'completed';
        let amountPaid = total;
        
        if (paymentMethod === 'COD') {
            paymentStatus = 'pending';
            amountPaid = 0.00;
        } else if (paymentMethod === 'EMI') {
            // Check Database EMI rule trigger criteria
            if (total < 2000.00) {
                throw new Error('EMI is only available for transaction amounts of ₹2000.00 or above.');
            }
            
            // Insert EMI financing structure
            const monthlyInst = total / emiTenure;
            await client.query(`
                INSERT INTO emi_plans (transaction_id, tenure_months, interest_rate, monthly_installment, status)
                VALUES ($1, $2, 0.00, $3, 'active')
            `, [transactionId, emiTenure, monthlyInst]);
            
            paymentStatus = 'completed';
            amountPaid = monthlyInst; // First installment paid
        } else {
            // Simulated Stripe/UPI Payment Gateway check
            if (!cardDetails || cardDetails.number.length < 16) {
                throw new Error('Payment gateway rejected: Invalid credit/debit card details.');
            }
        }
        
        let dbPaymentMethod = paymentMethod;
        if (paymentMethod === 'CARD') {
            dbPaymentMethod = 'advance_full';
        }

        const txnRef = 'TXN-' + Math.floor(Math.random() * 90000000 + 10000000);
        await client.query(`
            INSERT INTO payments (transaction_id, payment_method, payment_status, amount_paid, transaction_reference)
            VALUES ($1, $2, $3, $4, $5)
        `, [transactionId, dbPaymentMethod, paymentStatus, amountPaid, txnRef]);
        
        // 6. Register Order Tracking Info
        await client.query(`
            INSERT INTO order_tracking (transaction_id, status_update, description, location)
            VALUES ($1, 'Order Confirmed', 'Transaction processed successfully', 'StationeryHub warehouse')
        `, [transactionId]);
        
        await client.query('COMMIT'); // Commit Transaction
        res.json({ message: 'Checkout successful!', transactionId, transactionReference: txnRef });
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback on failure
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Get Inventory list (Admin & Seller / Employee)
app.get('/api/inventory', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
        return res.status(403).json({ error: 'Access denied. Authorized personnel only.' });
    }
    
    try {
        let queryStr = `
            SELECT 
                inv.item_uom_id, inv.quantity, inv.low_stock_threshold,
                iu.sku_uom, im.name AS product_name, pv.name AS variant_name,
                u.first_name || ' ' || u.last_name AS seller_name
            FROM inventory inv
            JOIN item_uoms iu ON inv.item_uom_id = iu.id
            JOIN product_variants pv ON iu.variant_id = pv.id
            JOIN item_master im ON pv.item_id = im.id
            JOIN users u ON inv.seller_id = u.id
        `;
        let params = [];
        if (req.user.role === 'employee') {
            queryStr += ` WHERE inv.seller_id = $1`;
            params.push(req.user.id);
        }
        queryStr += ` ORDER BY im.name, pv.name, iu.sku_uom`;
        
        const result = await pool.query(queryStr, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Inventory quantity (Admin & Seller / Employee)
app.put('/api/inventory/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
        return res.status(403).json({ error: 'Access denied. Authorized personnel only.' });
    }
    
    const { quantity } = req.body;
    if (quantity === undefined || quantity < 0) {
        return res.status(400).json({ error: 'Please specify a valid quantity >= 0' });
    }
    
    try {
        if (req.user.role === 'employee') {
            await pool.query(
                'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE item_uom_id = $2 AND seller_id = $3',
                [quantity, req.params.id, req.user.id]
            );
        } else {
            const sellerId = req.body.sellerId;
            if (sellerId) {
                await pool.query(
                    'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE item_uom_id = $2 AND seller_id = $3',
                    [quantity, req.params.id, sellerId]
                );
            } else {
                await pool.query(
                    'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE item_uom_id = $2',
                    [quantity, req.params.id]
                );
            }
        }
        res.json({ message: 'Stock updated successfully!', quantity });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all orders (Admin only)
app.get('/api/admin/orders', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator only.' });
    }
    
    try {
        const ordersRes = await pool.query(`
            SELECT 
                t.id AS order_id, t.final_amount, t.status, pay.payment_method, pay.payment_status, t.created_at, t.shipping_address,
                u.email, u.first_name, u.last_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'item_name', im.name,
                            'pack_name', pv.name,
                            'quantity', ti.quantity,
                            'final_item_price', ti.final_item_price
                        )
                    ) FILTER (WHERE ti.id IS NOT NULL), '[]'
                ) AS items
            FROM transactions t
            JOIN users u ON t.customer_user_id = u.id
            LEFT JOIN payments pay ON t.id = pay.transaction_id
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            LEFT JOIN item_uoms iu ON ti.item_uom_id = iu.id
            LEFT JOIN product_variants pv ON iu.variant_id = pv.id
            LEFT JOIN item_master im ON pv.item_id = im.id
            GROUP BY t.id, u.id, pay.id
            ORDER BY t.created_at DESC
        `);

        const revenueRes = await pool.query(`
            SELECT 
                COALESCE(SUM(amount_paid), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN (SELECT final_amount FROM transactions WHERE id = transaction_id) ELSE 0 END), 0) AS pending_revenue
            FROM payments
        `);
        
        const metrics = revenueRes.rows[0];
        
        res.json({
            orders: ordersRes.rows,
            totalRevenue: parseFloat(metrics.total_revenue),
            pendingRevenue: parseFloat(metrics.pending_revenue)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update order status & append shipping milestone (Admin only)
app.put('/api/admin/orders/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator only.' });
    }
    
    const { status } = req.body;
    if (!['confirmed', 'shipped', 'delivered'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status type.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Update Transaction status
        await client.query(
            'UPDATE transactions SET status = $1 WHERE id = $2',
            [status, req.params.id]
        );
        
        // 2. Append order tracking logs
        let statusUpdate = 'Order Shipped';
        let description = 'Order packed and handed over to logistics partner.';
        let location = 'Delhi Dispatch Hub';
        
        if (status === 'delivered') {
            statusUpdate = 'Delivered';
            description = 'Shipment successfully handed over to customer.';
            location = 'Customer Address';
            
            // Also mark payment as completed if it was COD
            await client.query(
                "UPDATE payments SET payment_status = 'completed', amount_paid = (SELECT final_amount FROM transactions WHERE id = $1) WHERE transaction_id = $1 AND payment_method = 'COD'",
                [req.params.id]
            );
        }
        
        await client.query(`
            INSERT INTO order_tracking (transaction_id, status_update, description, location)
            VALUES ($1, $2, $3, $4)
        `, [req.params.id, statusUpdate, description, location]);
        
        await client.query('COMMIT');
        res.json({ message: 'Order status updated successfully!', status });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Fetch all sellers (Admin only)
app.get('/api/admin/sellers', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator only.' });
    }
    try {
        const result = await pool.query("SELECT id, email, first_name, last_name FROM users WHERE role = 'employee' ORDER BY first_name");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register new seller (Admin only)
app.post('/api/admin/sellers', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator only.' });
    }
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, 'employee')",
            [email, hash, first_name, last_name]
        );
        res.json({ message: 'Seller registered successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new product & assign initial seller stock (Admin/Sellers allowed)
app.post('/api/admin/products', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
        return res.status(403).json({ error: 'Access denied. Administrator or Sellers only.' });
    }
    const { name, description, sku_base, category_id, variant_name, sku_variant, price, initial_stock, seller_id } = req.body;
    const targetSellerId = req.user.role === 'employee' ? req.user.id : seller_id;
    
    if (!name || !sku_base || !category_id || !variant_name || !sku_variant || !price || !targetSellerId) {
        return res.status(400).json({ error: 'Missing required product information fields.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Insert into item_master
        const prodRes = await client.query(
            "INSERT INTO item_master (name, description, sku_base, category_id) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, description, sku_base, category_id]
        );
        const productId = prodRes.rows[0].id;
        
        // 2. Insert variant
        const varRes = await client.query(
            "INSERT INTO product_variants (item_id, name, sku, attributes) VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id",
            [productId, variant_name, sku_variant]
        );
        const variantId = varRes.rows[0].id;
        
        // 3. Insert UOM (Piece)
        const uomRes = await client.query(
            "INSERT INTO item_uoms (variant_id, uom_id, quantity_multiplier, sku_uom) VALUES ($1, 1, 1, $2) RETURNING id",
            [variantId, sku_variant + '-PC']
        );
        const uomId = uomRes.rows[0].id;
        
        // 4. Insert Price
        await client.query(
            "INSERT INTO item_prices (item_uom_id, unit_price) VALUES ($1, $2)",
            [uomId, price]
        );
        
        // 5. Insert stock under selected seller
        await client.query(
            "INSERT INTO inventory (item_uom_id, seller_id, quantity, unit_price, low_stock_threshold) VALUES ($1, $2, $3, $4, 5)",
            [uomId, targetSellerId, initial_stock || 0, price]
        );
        
        await client.query('COMMIT');
        res.json({ message: 'Product and inventory listing created successfully!' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// File a new support ticket (Customer)
app.post('/api/support/tickets', authenticateToken, async (req, res) => {
    const { subject, message, transaction_id } = req.body;
    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required.' });
    }
    try {
        await pool.query(
            "INSERT INTO support_tickets (user_id, transaction_id, subject, message) VALUES ($1, $2, $3, $4)",
            [req.user.id, transaction_id || null, subject, message]
        );
        res.status(201).json({ message: 'Support ticket registered successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch all support tickets (Admin only)
app.get('/api/admin/complaints', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
    }
    try {
        const result = await pool.query(`
            SELECT t.id, t.subject, t.message, t.status, t.created_at, u.email 
            FROM support_tickets t 
            JOIN users u ON t.user_id = u.id 
            ORDER BY t.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update support ticket status (Admin only)
app.put('/api/admin/complaints/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
    }
    const { status } = req.body;
    try {
        await pool.query("UPDATE support_tickets SET status = $1 WHERE id = $2", [status, req.params.id]);
        res.json({ message: 'Ticket status updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
});
