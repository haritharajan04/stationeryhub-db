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
        const res = await pool.query(`
            SELECT iu.sku_uom, inv.unit_price, inv.quantity, u.first_name
            FROM inventory inv
            JOIN item_uoms iu ON inv.item_uom_id = iu.id
            JOIN users u ON inv.seller_id = u.id
            ORDER BY iu.sku_uom, u.first_name
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
