import subprocess
import time
import sys

# 1. Wait for Docker daemon
print("Checking Docker status...")
docker_ready = False
for i in range(36):
    res = subprocess.run(["docker", "ps"], capture_output=True, text=True)
    if res.returncode == 0:
        docker_ready = True
        print("Docker is ready!")
        break
    print("Waiting for Docker to become ready... (5s)")
    time.sleep(5)

if not docker_ready:
    print("Error: Docker daemon is not running. Please launch Docker Desktop manually.")
    sys.exit(1)

# 2. Start PostgreSQL container if stopped, or create it if removed
res = subprocess.run(["docker", "ps", "-a", "--filter", "name=stationeryhub-postgres", "--format", "{{.Status}}"], capture_output=True, text=True)
status = res.stdout.strip()

if not status:
    print("Creating new PostgreSQL container...")
    subprocess.run(["docker", "run", "--name", "stationeryhub-postgres", "-e", "POSTGRES_PASSWORD=mysecretpassword", "-e", "POSTGRES_DB=stationeryhub", "-p", "5432:5432", "-d", "postgres:latest"])
    time.sleep(5)
elif "Exited" in status or "stopped" in status or not status.startswith("Up"):
    print("Starting existing PostgreSQL container...")
    subprocess.run(["docker", "start", "stationeryhub-postgres"])
    time.sleep(3)
else:
    print("PostgreSQL container is already running.")

# 3. Copy schema.sql and run it to ensure clean slate
print("Initializing database schema...")
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-c", "DROP DATABASE IF EXISTS stationeryhub WITH (FORCE);"])
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-c", "CREATE DATABASE stationeryhub;"])
subprocess.run(["docker", "cp", "schema.sql", "stationeryhub-postgres:/schema.sql"])
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-d", "stationeryhub", "-f", "/schema.sql"])

# 4. Write and execute a SQL seed script
seed_sql = """
-- Seed Categories
INSERT INTO categories (id, name, description, parent_category_id) VALUES
(1, 'Writing Instruments', 'All pens, pencils, and markers', NULL),
(2, 'Paper Products', 'Notebooks, diaries, and sketchbooks', NULL),
(3, 'Gel Pens', 'Fine gel ink writing pens', 1),
(4, 'Spiral Notebooks', 'Single and multi-subject spiral bound books', 2);

-- Seed Users
INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@stationeryhub.com', 'hash123', 'Aravind', 'Sharma', 'admin'),
('b0000000-0000-0000-0000-000000000002', 'rahul.singh@gmail.com', 'hash456', 'Rahul', 'Singh', 'customer'),
('c0000000-0000-0000-0000-000000000003', 'priya.employee@sh.com', 'hash789', 'Priya', 'Verma', 'employee');

-- Seed Suppliers
INSERT INTO suppliers (id, company_name, gst_number, contact_person, phone_number, email) VALUES
('d0000000-0000-0000-0000-000000000001', 'Classmate Industries Ltd', '29AAACC1208D1Z5', 'Sanjay Dutt', '9876543210', 'sales@classmate.in'),
('d0000000-0000-0000-0000-000000000002', 'Pilot India Distributors', '07BBBDD9820K2Z9', 'Vikram Seth', '9123456789', 'orders@pilotpen.co.in');

-- Seed Item Master
INSERT INTO item_master (id, name, description, sku_base, category_id) VALUES
('e0000000-0000-0000-0000-000000000001', 'Pilot V7 Gel Pen', 'Hi-Tecpoint liquid ink gel pen 0.7mm', 'PLT-V7', 3),
('e0000000-0000-0000-0000-000000000002', 'Classmate Spiral A4 Notebook', 'Single Subject, 180 Pages, Ruled', 'CLS-A4-SPIRAL', 4);

-- Seed Item UOMs (Pieces, Boxes, Cartons)
INSERT INTO item_uoms (id, item_id, uom_id, quantity_multiplier, sku_uom) VALUES
('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1, 1, 'PLT-V7-PCS'),       -- 1 Pen
('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 2, 12, 'PLT-V7-BOX'),     -- 12 Pens
('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 3, 120, 'PLT-V7-CTN'),    -- 120 Pens
('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 1, 1, 'CLS-A4-PCS'),      -- 1 Notebook
('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000002', 2, 6, 'CLS-A4-BOX');       -- 6 Notebooks

-- Seed Item Prices
INSERT INTO item_prices (item_uom_id, unit_price, is_active) VALUES
('f0000000-0000-0000-0000-000000000001', 80.00, TRUE),   -- 1 Pen = Rs 80
('f0000000-0000-0000-0000-000000000002', 900.00, TRUE),  -- 1 Box (12 Pens) = Rs 900 (Discounted pack)
('f0000000-0000-0000-0000-000000000003', 8500.00, TRUE), -- 1 Carton = Rs 8500
('f0000000-0000-0000-0000-000000000004', 120.00, TRUE),  -- 1 Notebook = Rs 120
('f0000000-0000-0000-0000-000000000005', 680.00, TRUE);  -- 1 Box (6 Books) = Rs 680

-- Seed Inventory
INSERT INTO inventory (item_uom_id, quantity, low_stock_threshold) VALUES
('f0000000-0000-0000-0000-000000000001', 500, 50),
('f0000000-0000-0000-0000-000000000002', 100, 10),
('f0000000-0000-0000-0000-000000000003', 20, 2),
('f0000000-0000-0000-0000-000000000004', 1000, 100),
('f0000000-0000-0000-0000-000000000005', 150, 15);

-- Seed Assets
INSERT INTO assets (id, name, serial_number, asset_tag, status, purchase_date) VALUES
('30000000-0000-0000-0000-000000000001', 'MacBook Air M2', 'SN-MAC-7728A', 'AST-SH-091', 'assigned', '2025-05-10'),
('30000000-0000-0000-0000-000000000002', 'Logitech MX Master Mouse', 'SN-LOG-9911X', 'AST-SH-112', 'available', '2026-01-15');

-- Seed Asset Assignments
INSERT INTO asset_assignments (asset_id, user_id, remarks) VALUES
('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Assigned to Priya for sales operations');

-- Seed Maintenance Logs
INSERT INTO maintenance_logs (asset_id, description, cost, performed_by) VALUES
('30000000-0000-0000-0000-000000000001', 'Battery replacement service', 4500.00, 'Apple Authorized Service Center');

-- Seed B2B & B2C Transactions
-- Sale Order 1: Value >= 2000 (Eligible for EMI)
INSERT INTO transactions (id, type, customer_user_id, total_raw_amount, final_amount, status) VALUES
('90000000-0000-0000-0000-000000000001', 'customer_sale', 'b0000000-0000-0000-0000-000000000002', 2480.00, 2480.00, 'confirmed');

INSERT INTO transaction_items (transaction_id, item_uom_id, quantity, unit_price, final_item_price) VALUES
('90000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 2, 900.00, 1800.00), -- 2 Boxes of Pens
('90000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 1, 680.00, 680.00);  -- 1 Box of Notebooks

-- EMI Plan for Order 1 (Allowed since final_amount >= 2000)
INSERT INTO emi_plans (transaction_id, tenure_months, interest_rate, monthly_installment, status) VALUES
('90000000-0000-0000-0000-000000000001', 6, 12.00, 435.00, 'active');

-- Purchase Order from Supplier
INSERT INTO transactions (id, type, supplier_id, total_raw_amount, final_amount, status) VALUES
('90000000-0000-0000-0000-000000000002', 'supplier_purchase', 'd0000000-0000-0000-0000-000000000001', 34000.00, 34000.00, 'delivered');

INSERT INTO transaction_items (transaction_id, item_uom_id, quantity, unit_price, final_item_price) VALUES
('90000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000005', 50, 680.00, 34000.00);

-- Payment for Purchase
INSERT INTO payments (transaction_id, payment_method, payment_status, amount_paid, transaction_reference) VALUES
('90000000-0000-0000-0000-000000000002', 'advance_full', 'completed', 34000.00, 'TXN-PO-18892');
"""

with open("seed.sql", "w") as f:
    f.write(seed_sql)

print("Running seed scripts inside container...")
subprocess.run(["docker", "cp", "seed.sql", "stationeryhub-postgres:/seed.sql"])
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-d", "stationeryhub", "-f", "/seed.sql"])

print("Database and seed data successfully initialized!")
