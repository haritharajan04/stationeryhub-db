
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
