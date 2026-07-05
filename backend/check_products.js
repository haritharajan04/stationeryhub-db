const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'stationeryhub',
    password: 'mysecretpassword',
    port: 5432,
});

async function check() {
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
                
                if (uom.price === 0) {
                    uom.price = parseFloat(row.unit_price || 0);
                }
            }
        });
        console.log("Count of products: ", catalog.length);
        if (catalog.length > 0) {
            console.log("First product details: ", JSON.stringify(catalog[0], null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
