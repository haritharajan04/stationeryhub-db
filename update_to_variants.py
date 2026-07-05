import subprocess
import time
import sys

# 1. Wait for Docker
print("Connecting to Docker...")
docker_ready = False
for i in range(36):
    res = subprocess.run(["docker", "ps"], capture_output=True, text=True)
    if res.returncode == 0:
        docker_ready = True
        print("Docker is ready!")
        break
    print("Waiting for Docker to start... (5s)")
    time.sleep(5)

if not docker_ready:
    print("Error: Docker daemon is not active. Please ensure Docker Desktop is running.")
    sys.exit(1)

# 2. Start PostgreSQL Container
res = subprocess.run(["docker", "ps", "-a", "--filter", "name=stationeryhub-postgres", "--format", "{{.Status}}"], capture_output=True, text=True)
status = res.stdout.strip()

if not status:
    print("Creating and starting PostgreSQL container...")
    subprocess.run(["docker", "run", "--name", "stationeryhub-postgres", "-e", "POSTGRES_PASSWORD=mysecretpassword", "-e", "POSTGRES_DB=stationeryhub", "-p", "5432:5432", "-d", "postgres:latest"])
    time.sleep(5)
else:
    print("Starting existing PostgreSQL container...")
    subprocess.run(["docker", "start", "stationeryhub-postgres"])
    time.sleep(3)

# 3. Create schema with variants support
schema_sql = """
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Custom Enum Types
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'employee');
CREATE TYPE transaction_type AS ENUM ('customer_sale', 'supplier_purchase');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_method AS ENUM ('COD', 'advance_full', 'advance_partial', 'EMI');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE emi_status AS ENUM ('active', 'completed', 'defaulted');
CREATE TYPE asset_status AS ENUM ('available', 'assigned', 'under_maintenance', 'retired');

-- -----------------------------------------------------
-- Table: Users
-- -----------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(15),
    address TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Suppliers
-- -----------------------------------------------------
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(200) NOT NULL,
    gst_number VARCHAR(20) UNIQUE NOT NULL,
    contact_person VARCHAR(100) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Categories
-- -----------------------------------------------------
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Item Master (Base Products)
-- -----------------------------------------------------
CREATE TABLE item_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku_base VARCHAR(50) UNIQUE NOT NULL,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Product Variants
-- -----------------------------------------------------
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    attributes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_variants_item_id ON product_variants(item_id);

-- -----------------------------------------------------
-- Table: Units of Measure (UOM)
-- -----------------------------------------------------
CREATE TABLE units_of_measure (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    abbreviation VARCHAR(10) UNIQUE NOT NULL
);

-- Insert standard UOMs
INSERT INTO units_of_measure (name, abbreviation) VALUES 
('Piece', 'pc'),
('Box', 'box'),
('Carton', 'ctn')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------
-- Table: Item UOM Config
-- -----------------------------------------------------
CREATE TABLE item_uoms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    uom_id INT NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    quantity_multiplier INT NOT NULL DEFAULT 1 CHECK (quantity_multiplier >= 1),
    sku_uom VARCHAR(100) UNIQUE NOT NULL,
    
    UNIQUE (variant_id, uom_id)
);

-- -----------------------------------------------------
-- Table: Item Prices
-- -----------------------------------------------------
CREATE TABLE item_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_uom_id UUID NOT NULL REFERENCES item_uoms(id) ON DELETE CASCADE,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0.00),
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    CONSTRAINT check_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_item_prices_active ON item_prices(item_uom_id, is_active);

-- -----------------------------------------------------
-- Table: Inventory
-- -----------------------------------------------------
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_uom_id UUID NOT NULL REFERENCES item_uoms(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0.00),
    low_stock_threshold INT NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (item_uom_id, seller_id)
);

-- -----------------------------------------------------
-- Table: Assets
-- -----------------------------------------------------
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    asset_tag VARCHAR(50) UNIQUE NOT NULL,
    status asset_status NOT NULL DEFAULT 'available',
    purchase_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Asset Assignments
-- -----------------------------------------------------
CREATE TABLE asset_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    returned_at TIMESTAMP WITH TIME ZONE,
    remarks TEXT
);

-- -----------------------------------------------------
-- Table: Maintenance Logs
-- -----------------------------------------------------
CREATE TABLE maintenance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    maintenance_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT NOT NULL,
    cost NUMERIC(10, 2) NOT NULL CHECK (cost >= 0.00),
    performed_by VARCHAR(150),
    next_due_date DATE
);

-- -----------------------------------------------------
-- Table: Communications
-- -----------------------------------------------------
CREATE TABLE communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Transactions
-- -----------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type transaction_type NOT NULL,
    customer_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    
    total_raw_amount NUMERIC(10, 2) NOT NULL CHECK (total_raw_amount >= 0.00),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0.00),
    shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_fee >= 0.00),
    final_amount NUMERIC(10, 2) NOT NULL CHECK (final_amount >= 0.00),
    
    status order_status NOT NULL DEFAULT 'pending',
    gst_number VARCHAR(20),
    shipping_address VARCHAR(500) DEFAULT 'Customer Address',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_transaction_party CHECK (
        (type = 'customer_sale' AND customer_user_id IS NOT NULL AND supplier_id IS NULL) OR
        (type = 'supplier_purchase' AND supplier_id IS NOT NULL AND customer_user_id IS NULL)
    )
);

-- -----------------------------------------------------
-- Table: Transaction Items
-- -----------------------------------------------------
CREATE TABLE transaction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_uom_id UUID NOT NULL REFERENCES item_uoms(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0.00),
    final_item_price NUMERIC(10, 2) NOT NULL CHECK (final_item_price >= 0.00)
);

-- -----------------------------------------------------
-- Table: Payments
-- -----------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL,
    payment_status payment_status NOT NULL DEFAULT 'pending',
    amount_paid NUMERIC(10, 2) NOT NULL CHECK (amount_paid >= 0.00),
    transaction_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: EMI Plans (For transactions >= ₹2000)
-- -----------------------------------------------------
CREATE TABLE emi_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tenure_months INT NOT NULL CHECK (tenure_months IN (3, 6, 9, 12, 18, 24)),
    interest_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (interest_rate >= 0.00),
    monthly_installment NUMERIC(10, 2) NOT NULL CHECK (monthly_installment > 0.00),
    status emi_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: Order Tracking
-- -----------------------------------------------------
CREATE TABLE order_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    status_update VARCHAR(100) NOT NULL,
    description TEXT,
    location VARCHAR(150),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Trigger Function: EMI Eligibility Check
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION verify_emi_eligibility() 
RETURNS TRIGGER AS $$
DECLARE
    order_amount NUMERIC(10, 2);
BEGIN
    SELECT final_amount INTO order_amount FROM transactions WHERE id = NEW.transaction_id;
    IF order_amount < 2000.00 THEN
        RAISE EXCEPTION 'Transaction final amount (₹%) is less than the minimum ₹2000.00 threshold required for EMI.', order_amount;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_emi_eligibility
BEFORE INSERT OR UPDATE ON emi_plans
FOR EACH ROW EXECUTE FUNCTION verify_emi_eligibility();

-- -----------------------------------------------------
-- Table: Support Tickets
-- -----------------------------------------------------
CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    subject VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending Review',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
"""

with open("schema.sql", "w", encoding="utf-8") as f:
    f.write(schema_sql)

print("Recreating database...")
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-c", "DROP DATABASE IF EXISTS stationeryhub WITH (FORCE);"])
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-c", "CREATE DATABASE stationeryhub;"])
subprocess.run(["docker", "cp", "schema.sql", "stationeryhub-postgres:/schema.sql"])
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-d", "stationeryhub", "-f", "/schema.sql"])

# Seed with variant products data matching figma catalog
seed_sql = """
-- Seed Categories
INSERT INTO categories (id, name, description, parent_category_id) VALUES
(1, 'Writing Instruments', 'All pens, pencils, and markers', NULL),
(2, 'Paper Products', 'Notebooks, sketchbooks, and canvases', NULL),
(3, 'Fine Art Media', 'Acrylic, watercolors, and oil paints', NULL),
(4, 'Accessories', 'Pouches, dividers, and ruler tools', NULL);

-- Seed Users
INSERT INTO users (id, email, password_hash, first_name, last_name, address, role) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@stationeryhub.com', '$2b$10$jFsnlsPWH7Tp2MckNuhe6./Y9rmMDJ4mkIv3GSrjRV0Hnt/tFFOVu', 'Aravind', 'Sharma', NULL, 'admin'),
('a0000000-0000-0000-0000-000000000002', 'seller@stationeryhub.com', '$2b$10$CC8gRIF0JrGs2wFpGk.ugOADnV6RTDZx6UowoaPOzAXYKTQ1as2Yi', 'Rahul', 'Singh', NULL, 'employee'),
('a0000000-0000-0000-0000-000000000003', 'seller2@stationeryhub.com', '$2b$10$CC8gRIF0JrGs2wFpGk.ugOADnV6RTDZx6UowoaPOzAXYKTQ1as2Yi', 'Nithya', 'Warrier', NULL, 'employee'),
('a0000000-0000-0000-0000-000000000004', 'customer@stationeryhub.com', '$2b$10$CC8gRIF0JrGs2wFpGk.ugOADnV6RTDZx6UowoaPOzAXYKTQ1as2Yi', 'Haritha', 'Rajan', '123 Main Street, Chennai, TN - 600001', 'customer');

-- Seed Item Master (Products)
INSERT INTO item_master (id, name, description, sku_base, category_id) VALUES
('e0000000-0000-0000-0000-000000000001', 'Pilot V7 Gel Pen', 'Hi-Tecpoint liquid ink gel pen 0.7mm for smooth writing.', 'PLT-V7', 1),
('e0000000-0000-0000-0000-000000000002', 'Classmate Writing Notebook', 'High density paper writing notebook.', 'CLS-NB', 2),
('e0000000-0000-0000-0000-000000000003', 'Artist Paint Brush Set', 'Professional synthetic detail brushes.', 'ART-BRSH', 3),
('e0000000-0000-0000-0000-000000000004', 'Stretched Artist Canvas', 'Stretched cotton canvases on frame.', 'ART-CNVS', 2),
('e0000000-0000-0000-0000-000000000005', 'Artist Acrylic Paint Set', 'Vibrant lightfast acrylic paints set.', 'ART-ACRY', 3),
('e0000000-0000-0000-0000-000000000006', 'Professional Watercolor Pan Set', 'Rich watercolor pans for illustrations.', 'ART-WCLR', 3),
('e0000000-0000-0000-0000-000000000007', 'Studio Oil Paint Tubes', 'Premium quality slow drying oil paints.', 'ART-OIL', 3),
('e0000000-0000-0000-0000-000000000008', 'Canvas Stationery Pouch', 'Heavy-duty zippered desk accessory bag.', 'ACC-PCH', 4),
('e0000000-0000-0000-0000-000000000009', 'Faber-Castell 2B Pencils', 'Premium black graphite lead pencils for drafting.', 'FBR-PNC', 1),
('e0000000-0000-0000-0000-000000000010', 'Reynolds Ball Point Pen', 'Classic ballpoint pen with fine fluid writing tip.', 'RYN-BAL', 1),
('e0000000-0000-0000-0000-000000000011', 'Wooden Paint Palette', 'Traditional mixing palette with thumb hole.', 'ART-PLT', 3),
('e0000000-0000-0000-0000-000000000012', 'Ergonomic School Bag', 'Waterproof multi-compartment student backpack.', 'BAG-SCH', 4),
('e0000000-0000-0000-0000-000000000013', 'Stainless Steel Bottle', 'Vacuum insulated thermos flask water bottle.', 'BTL-WTR', 4),
('e0000000-0000-0000-0000-000000000014', 'Camel Wax Crayons Set', 'Non-toxic smooth wax crayons for school children.', 'ART-CRY', 3);

-- Seed Product Variants
INSERT INTO product_variants (id, item_id, name, sku, attributes) VALUES
('20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Blue Color', 'PLT-V7-BLUE', '{"color": "Blue"}'),
('20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Black Color', 'PLT-V7-BLACK', '{"color": "Black"}'),
('20000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'A4 Size / 180 Pages / Ruled', 'CLS-NB-A4-180-R', '{"size": "A4", "pages": 180, "style": "Ruled"}'),
('20000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 'A5 Size / 120 Pages / Unruled', 'CLS-NB-A5-120-U', '{"size": "A5", "pages": 120, "style": "Unruled"}'),
('20000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000003', 'Synthetic Round Set', 'ART-BRSH-RND', '{"type": "Round"}'),
('20000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', 'Synthetic Flat Set', 'ART-BRSH-FLT', '{"type": "Flat"}'),
('20000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000004', 'A3 Size', 'ART-CNVS-A3', '{"size": "A3"}'),
('20000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000004', 'A4 Size', 'ART-CNVS-A4', '{"size": "A4"}'),
('20000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000005', '12-Color Tube Set', 'ART-ACRY-12', '{"colors": 12}'),
('20000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000005', '24-Color Tube Set', 'ART-ACRY-24', '{"colors": 24}'),
('20000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000006', '18-Color Watercolor Pan', 'ART-WCLR-18', '{"colors": 18}'),
('20000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000007', '12-Tubes Studio Set', 'ART-OIL-12', '{"colors": 12}'),
('20000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000008', 'Heavy-Duty Grey Fabric', 'ACC-PCH-GRY', '{"color": "Grey", "material": "Canvas"}'),
('20000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000008', 'Premium Tan Leather', 'ACC-PCH-LTHR', '{"color": "Tan", "material": "Leather"}'),
('20000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000009', '12-Pack Graphite Pencils', 'FBR-PNC-2B', '{"pack": 12}'),
('20000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000000010', 'Blue Color 5-pack', 'RYN-BAL-BLU', '{"color": "Blue"}'),
('20000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000011', 'Oval Wood Palette', 'ART-PLT-WDN', '{"material": "Wood"}'),
('20000000-0000-0000-0000-000000000018', 'e0000000-0000-0000-0000-000000000012', 'Royal Blue Backpack', 'BAG-SCH-BLU', '{"color": "Blue"}'),
('20000000-0000-0000-0000-000000000019', 'e0000000-0000-0000-0000-000000000013', 'Matte Silver 750ml', 'BTL-WTR-SLV', '{"color": "Silver"}'),
('20000000-0000-0000-0000-000000000020', 'e0000000-0000-0000-0000-000000000014', '24-Color Wax Pack', 'ART-CRY-WAX', '{"colors": 24}');

-- Seed Item UOMs linked to Variants
INSERT INTO item_uoms (id, variant_id, uom_id, quantity_multiplier, sku_uom) VALUES
('f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 1, 'PLT-V7-BLUE-PC'),
('f0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2, 12, 'PLT-V7-BLUE-BOX'),
('f0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 1, 1, 'PLT-V7-BLACK-PC'),
('f0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 1, 1, 'CLS-NB-A4-PC'),
('f0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 2, 6, 'CLS-NB-A4-BOX'),
('f0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', 1, 1, 'CLS-NB-A5-PC'),
('f0000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000005', 1, 1, 'ART-BRSH-RND-PC'),
('f0000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000006', 1, 1, 'ART-BRSH-FLT-PC'),
('f0000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000007', 1, 1, 'ART-CNVS-A3-PC'),
('f0000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000008', 1, 1, 'ART-CNVS-A4-PC'),
('f0000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000009', 1, 1, 'ART-ACRY-12-PC'),
('f0000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000010', 1, 1, 'ART-ACRY-24-PC'),
('f0000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000011', 1, 1, 'ART-WCLR-18-PC'),
('f0000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000012', 1, 1, 'ART-OIL-12-PC'),
('f0000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000013', 1, 1, 'ACC-PCH-GRY-PC'),
('f0000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000014', 1, 1, 'ACC-PCH-LTHR-PC'),
('f0000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000015', 1, 1, 'FBR-PNC-2B-PC'),
('f0000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000016', 1, 1, 'RYN-BAL-BLU-PC'),
('f0000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000017', 1, 1, 'ART-PLT-WDN-PC'),
('f0000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000018', 1, 1, 'BAG-SCH-BLU-PC'),
('f0000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000019', 1, 1, 'BTL-WTR-SLV-PC'),
('f0000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000020', 1, 1, 'ART-CRY-WAX-PC'),
('f0000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000001', 3, 144, 'PLT-V7-BLUE-CTN'),
('f0000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000003', 3, 72, 'CLS-NB-A4-CTN'),
('f0000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000015', 2, 12, 'FBR-PNC-2B-BOX'),
('f0000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000015', 3, 144, 'FBR-PNC-2B-CTN'),
('f0000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000016', 2, 20, 'RYN-BAL-BLU-BOX'),
('f0000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000016', 3, 200, 'RYN-BAL-BLU-CTN');

-- Seed Prices
INSERT INTO item_prices (item_uom_id, unit_price, is_active) VALUES
('f0000000-0000-0000-0000-000000000001', 80.00, TRUE),
('f0000000-0000-0000-0000-000000000002', 900.00, TRUE),
('f0000000-0000-0000-0000-000000000003', 80.00, TRUE),
('f0000000-0000-0000-0000-000000000004', 60.00, TRUE),
('f0000000-0000-0000-0000-000000000005', 340.00, TRUE),
('f0000000-0000-0000-0000-000000000006', 50.00, TRUE),
('f0000000-0000-0000-0000-000000000007', 350.00, TRUE),
('f0000000-0000-0000-0000-000000000008', 380.00, TRUE),
('f0000000-0000-0000-0000-000000000009', 220.00, TRUE),
('f0000000-0000-0000-0000-000000000010', 160.00, TRUE),
('f0000000-0000-0000-0000-000000000011', 450.00, TRUE),
('f0000000-0000-0000-0000-000000000012', 850.00, TRUE),
('f0000000-0000-0000-0000-000000000013', 620.00, TRUE),
('f0000000-0000-0000-0000-000000000014', 980.00, TRUE),
('f0000000-0000-0000-0000-000000000015', 250.00, TRUE),
('f0000000-0000-0000-0000-000000000016', 750.00, TRUE),
('f0000000-0000-0000-0000-000000000030', 9600.00, TRUE),
('f0000000-0000-0000-0000-000000000031', 3900.00, TRUE),
('f0000000-0000-0000-0000-000000000032', 1300.00, TRUE),
('f0000000-0000-0000-0000-000000000033', 14000.00, TRUE),
('f0000000-0000-0000-0000-000000000040', 180.00, TRUE),
('f0000000-0000-0000-0000-000000000041', 1600.00, TRUE);

-- Seed Inventory
INSERT INTO inventory (item_uom_id, seller_id, quantity, unit_price, low_stock_threshold) VALUES
('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 300, 80.00, 30),
('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 150, 75.00, 15),
('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 50, 900.00, 5),
('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 25, 880.00, 2),
('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 100, 100.00, 10),
('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 100, 95.00, 10),
('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 500, 60.00, 50),
('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 200, 55.00, 20),
('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 60, 340.00, 6),
('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 30, 320.00, 3),
('f0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 400, 50.00, 40),
('f0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 120, 350.00, 12),
('f0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 120, 380.00, 12),
('f0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003', 50, 360.00, 5),
('f0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000002', 80, 220.00, 8),
('f0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000002', 100, 160.00, 10),
('f0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002', 50, 450.00, 5),
('f0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000002', 30, 850.00, 3),
('f0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', 45, 620.00, 4),
('f0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000002', 25, 980.00, 2),
('f0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000002', 100, 250.00, 10),
('f0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000002', 40, 750.00, 4),
('f0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000003', 20, 730.00, 2),
('f0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000002', 100, 120.00, 10),
('f0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000003', 50, 115.00, 5),
('f0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000002', 200, 50.00, 20),
('f0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000002', 80, 180.00, 8),
('f0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000002', 30, 1450.00, 3),
('f0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000003', 15, 1420.00, 2),
('f0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002', 60, 650.00, 6),
('f0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000002', 120, 150.00, 12),
('f0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000003', 70, 140.00, 5),
('f0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000002', 10, 9600.00, 2),
('f0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000003', 5, 9300.00, 1),
('f0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000002', 12, 3900.00, 2),
('f0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000003', 5, 3700.00, 1),
('f0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000002', 40, 1300.00, 5),
('f0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000003', 20, 1250.00, 2),
('f0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000002', 8, 14000.00, 1),
('f0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000002', 100, 180.00, 10),
('f0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000003', 80, 175.00, 8),
('f0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000002', 20, 1600.00, 2),
('f0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000003', 15, 1550.00, 1);

-- Seed Support Tickets (Damaged Returns / Complaints)
INSERT INTO support_tickets (user_id, subject, message, status) VALUES
('a0000000-0000-0000-0000-000000000004', 'Damaged Goods', 'My artist sketchbooks arrived with small tears on the front cover.', 'Pending Review'),
('a0000000-0000-0000-0000-000000000004', 'Incorrect Item Pack', 'Ordered a box of Reynolds pens but received only a single piece.', 'Resolved');
"""

with open("seed.sql", "w", encoding="utf-8") as f:
    f.write(seed_sql)

print("Running seed scripts...")
subprocess.run(["docker", "cp", "seed.sql", "stationeryhub-postgres:/seed.sql"])
subprocess.run(["docker", "exec", "-i", "stationeryhub-postgres", "psql", "-U", "postgres", "-d", "stationeryhub", "-f", "/seed.sql"])

print("Successfully updated database items list!")
