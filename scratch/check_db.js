const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT iu.sku_uom, inv.unit_price, inv.quantity, u.first_name
            FROM inventory inv
            JOIN item_uoms iu ON inv.item_uom_id = iu.id
            JOIN users u ON inv.seller_id = u.id
            ORDER BY iu.sku_uom, u.first_name
        `);
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
