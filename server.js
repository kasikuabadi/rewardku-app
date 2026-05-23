const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Menghubungkan ke PostgreSQL Supabase menggunakan Environment Variable di Render nanti
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Wajib aktif untuk koneksi aman ke cloud database
});

// Inisialisasi Tabel Otomatis saat server menyala
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                coins INTEGER DEFAULT 1000
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT,
                phone TEXT,
                method TEXT,
                amount INTEGER,
                status TEXT DEFAULT 'Pending',
                date TEXT
            );
        `);
        console.log("Database PostgreSQL Supabase Sukses Terhubung via Render!");
    } catch (err) {
        console.error("Gagal inisialisasi database Supabase:", err);
    }
})();

// API 1: Sinkronisasi / Ambil Koin User
app.post('/api/user/sync', async (req, res) => {
    const { userId } = req.body;
    try {
        let resUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (resUser.rows.length === 0) {
            await pool.query('INSERT INTO users (id, coins) VALUES ($1, $2)', [userId, 1000]);
            return res.json({ id: userId, coins: 1000 });
        }
        res.json(resUser.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API 2: Tambah Koin (Anti-Cheat)
app.post('/api/user/add-coins', async (req, res) => {
    const { userId, amount } = req.body;
    if (amount > 1000) return res.status(400).json({ error: "Aktivitas mencurigakan!" });
    
    try {
        await pool.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [amount, userId]);
        const resUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        res.json(resUser.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API 3: Ajukan WD ke Supabase
app.post('/api/wd/submit', async (req, res) => {
    const { userId, name, phone, method, amount } = req.body;
    try {
        const resUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (resUser.rows.length === 0 || resUser.rows[0].coins < (amount * 10)) {
            return res.status(400).json({ error: "Koin tidak mencukupi!" });
        }

        const wdId = "WD-" + Math.floor(Math.random() * 90000 + 10000);
        const dateStr = new Date().toLocaleDateString('id-ID');

        await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [(amount * 10), userId]);
        await pool.query('INSERT INTO withdrawals (id, user_id, name, phone, method, amount, date) VALUES ($1,$2,$3,$4,$5,$6,$7)', 
            [wdId, userId, name, phone, method, amount, dateStr]);

        res.json({ success: true, wdId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API 4: Ambil Data Antrean WD untuk Admin
app.post('/api/admin/pendings', async (req, res) => {
    const { secret } = req.body;
    if (secret !== "YXJrYTEyMw==") return res.status(403).json({ error: "Akses ditolak" });
    
    try {
        const resPendings = await pool.query("SELECT * FROM withdrawals WHERE status = 'Pending' ORDER BY date DESC");
        res.json(resPendings.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API 5: Admin Selesai Transfer Manual
app.post('/api/admin/complete-wd', async (req, res) => {
    const { secret, wdId } = req.body;
    if (secret !== "YXJrYTEyMw==") return res.status(403).json({ error: "Akses ditolak" });
    
    try {
        await pool.query("UPDATE withdrawals SET status = 'Completed' WHERE id = $1", [wdId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Menggunakan PORT dinamis bawaan Render.com
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Backend berjalan di port ${PORT}`);
});

