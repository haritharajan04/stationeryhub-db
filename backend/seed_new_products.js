const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'stationeryhub',
    password: 'mysecretpassword',
    port: 5432,
});

const sellers = [
    'a0000000-0000-0000-0000-000000000002', // Rahul Singh
    'a0000000-0000-0000-0000-000000000003'  // Nithya Warrier
];

const newProducts = [
    {
        name: "Mechanical Pencil",
        description: "Fine drafting mechanical pencil with click advances.",
        sku_base: "MCH-PNC",
        category_id: 1,
        variants: [
            { name: "0.5mm Tip", sku: "MCH-PNC-05", price: 30 },
            { name: "0.7mm Tip", sku: "MCH-PNC-07", price: 30 }
        ]
    },
    {
        name: "Highlighter Set",
        description: "Vibrant fluorescent sticky highlighter sets.",
        sku_base: "HL-SET",
        category_id: 1,
        variants: [
            { name: "Pack of 4", sku: "HL-SET-4", price: 120 },
            { name: "Pack of 6", sku: "HL-SET-6", price: 180 },
            { name: "Pack of 12", sku: "HL-SET-12", price: 350 }
        ]
    },
    {
        name: "Fountain Pen",
        description: "Elegant fountain pen with fine steel nib.",
        sku_base: "FNT-PEN",
        category_id: 1,
        variants: [
            { name: "Black Ink", sku: "FNT-PEN-BLK", price: 450 },
            { name: "Blue Ink", sku: "FNT-PEN-BLU", price: 450 },
            { name: "Gift Edition", sku: "FNT-PEN-GFT", price: 1200 }
        ]
    },
    {
        name: "Spiral Notebook",
        description: "Double wire-O bound notebook with microperforated sheets.",
        sku_base: "SPR-NB",
        category_id: 2,
        variants: [
            { name: "A4 Size / 100 Pages", sku: "SPR-NB-A4-100", price: 90 },
            { name: "A4 Size / 200 Pages", sku: "SPR-NB-A4-200", price: 160 },
            { name: "A5 Size / 100 Pages", sku: "SPR-NB-A5-100", price: 60 },
            { name: "A5 Size / 200 Pages", sku: "SPR-NB-A5-200", price: 110 }
        ]
    },
    {
        name: "Expanding File Folder",
        description: "Polyexpanding accordion document organizer briefcase.",
        sku_base: "EXP-FLD",
        category_id: 4,
        variants: [
            { name: "12-Pocket Accordion", sku: "EXP-FLD-12", price: 250 },
            { name: "24-Pocket Accordion", sku: "EXP-FLD-24", price: 450 }
        ]
    },
    {
        name: "Geometry Box",
        description: "Metal compass and divider drawing set for students.",
        sku_base: "GEO-BOX",
        category_id: 4,
        variants: [
            { name: "Basic Student Set", sku: "GEO-BOX-BSC", price: 150 },
            { name: "Premium Brass Compass Set", sku: "GEO-BOX-PRM", price: 280 }
        ]
    },
    {
        name: "Push Pins",
        description: "Assorted colored plastic mapping board push pins.",
        sku_base: "PSH-PIN",
        category_id: 4,
        variants: [
            { name: "50 Pcs Tub", sku: "PSH-PIN-50", price: 40 },
            { name: "100 Pcs Tub", sku: "PSH-PIN-100", price: 70 }
        ]
    },
    {
        name: "Sticky Page Flags",
        description: "Self-adhesive colorful marking flags indices.",
        sku_base: "STK-FLG",
        category_id: 2,
        variants: [
            { name: "Neon Color Set", sku: "STK-FLG-NEON", price: 50 },
            { name: "Pastel Color Set", sku: "STK-FLG-PSTL", price: 60 }
        ]
    },
    {
        name: "Binder Clips",
        description: "Tempered steel binder clamps for sorting documents.",
        sku_base: "BND-CLP",
        category_id: 4,
        variants: [
            { name: "Small Size (Pack of 12)", sku: "BND-CLP-SML", price: 45 },
            { name: "Medium Size (Pack of 8)", sku: "BND-CLP-MED", price: 60 },
            { name: "Large Size (Pack of 6)", sku: "BND-CLP-LRG", price: 80 }
        ]
    },
    {
        name: "Clipboard",
        description: "Hardboard clipboard with sturdy spring action clamp.",
        sku_base: "CLP-BRD",
        category_id: 4,
        variants: [
            { name: "Plastic Clipboard", sku: "CLP-BRD-PLST", price: 90 },
            { name: "Wooden Clipboard", sku: "CLP-BRD-WDN", price: 120 },
            { name: "Metal Clipboard", sku: "CLP-BRD-MTL", price: 180 }
        ]
    },
    {
        name: "Year Planning Diary",
        description: "Organized daily year planning notebook diary tracker.",
        sku_base: "PLN-DRY",
        category_id: 2,
        variants: [
            { name: "Year 2026 Edition", sku: "PLN-DRY-2026", price: 350 }
        ]
    }
];

async function seed() {
    try {
        console.log("Seeding new product catalog listings...");
        for (const prod of newProducts) {
            // Check if product already exists
            const existingProd = await pool.query("SELECT id FROM item_master WHERE sku_base = $1", [prod.sku_base]);
            let productId;
            if (existingProd.rows.length > 0) {
                productId = existingProd.rows[0].id;
                console.log(`Product ${prod.name} already exists. Skipping master record creation.`);
            } else {
                const prodRes = await pool.query(
                    "INSERT INTO item_master (name, description, sku_base, category_id) VALUES ($1, $2, $3, $4) RETURNING id",
                    [prod.name, prod.description, prod.sku_base, prod.category_id]
                );
                productId = prodRes.rows[0].id;
                console.log(`Created product listing for: ${prod.name}`);
            }

            for (const variant of prod.variants) {
                // Check if variant already exists
                const existingVar = await pool.query("SELECT id FROM product_variants WHERE sku = $1", [variant.sku]);
                let variantId;
                if (existingVar.rows.length > 0) {
                    variantId = existingVar.rows[0].id;
                } else {
                    const varRes = await pool.query(
                        "INSERT INTO product_variants (item_id, name, sku, attributes) VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id",
                        [productId, variant.name, variant.sku]
                    );
                    variantId = varRes.rows[0].id;
                    console.log(`  Added variant: ${variant.name}`);
                }

                // Check if Piece UOM exists
                const sku_uom = variant.sku + "-PC";
                const existingUom = await pool.query("SELECT id FROM item_uoms WHERE sku_uom = $1", [sku_uom]);
                let uomId;
                if (existingUom.rows.length > 0) {
                    uomId = existingUom.rows[0].id;
                } else {
                    const uomRes = await pool.query(
                        "INSERT INTO item_uoms (variant_id, uom_id, quantity_multiplier, sku_uom) VALUES ($1, 1, 1, $2) RETURNING id",
                        [variantId, sku_uom]
                    );
                    uomId = uomRes.rows[0].id;
                }

                // Check if price exists
                const existingPrice = await pool.query("SELECT id FROM item_prices WHERE item_uom_id = $1", [uomId]);
                if (existingPrice.rows.length === 0) {
                    await pool.query(
                        "INSERT INTO item_prices (item_uom_id, unit_price) VALUES ($1, $2)",
                        [uomId, variant.price]
                    );
                }

                // Seed inventory under both sellers
                for (const sellerId of sellers) {
                    const existingInv = await pool.query("SELECT id FROM inventory WHERE item_uom_id = $1 AND seller_id = $2", [uomId, sellerId]);
                    if (existingInv.rows.length === 0) {
                        const priceVariation = sellerId === sellers[0] ? variant.price : variant.price - 2; // Slight variation
                        await pool.query(
                            "INSERT INTO inventory (item_uom_id, seller_id, quantity, unit_price, low_stock_threshold) VALUES ($1, $2, 100, $3, 5)",
                            [uomId, sellerId, priceVariation]
                        );
                    }
                }
            }
        }
        console.log("Seeding completed successfully!");
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
seed();
