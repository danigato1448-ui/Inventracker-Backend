const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(express.json());

// Conexión real a la base de datos Inventracker
const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '', 
    database: process.env.MYSQLDATABASE || 'inventracker_db', // nombre de tu DB local
    port: process.env.MYSQLPORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Error de conexión a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a la base de datos MySQL (Inventracker)');
});

// --- RUTA DE LOGIN ---
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    const sql = 'SELECT * FROM usuarios WHERE usuario = ? AND password = ? AND estado = "Activo"';

    db.query(sql, [usuario, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error en el servidor" });
        if (results.length > 0) {
            return res.status(200).json({ success: true, message: "Autenticación satisfactoria" });
        } else {
            return res.status(401).json({ success: false, message: "Error en la autenticación" });
        }
    });
});

// --- RUTA: ESTADÍSTICAS PARA LAS TARJETAS ---
app.get('/api/dashboard-stats', (req, res) => {
    // Usando stock_actual y stock_minimo de tu tabla productos
    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM productos) AS total_productos,
            (SELECT COUNT(*) FROM productos WHERE stock_actual <= stock_minimo) AS alertas,
            (SELECT COUNT(*) FROM proveedores) AS total_proveedores,
            (SELECT COUNT(*) FROM movimientos WHERE DATE(fecha) = CURDATE()) AS movimientos_hoy
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ ERROR EN SQL STATS:", err.sqlMessage);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.status(200).json(results[0]);
    });
});

// --- RUTA: LISTADO COMPLETO DE PRODUCTOS ---
app.get('/productos', (req, res) => {
    // Usamos asterisco para que traiga TODO sin errores de nombres
    const sql = 'SELECT * FROM productos'; 

    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ ERROR EN SQL:", err.sqlMessage);
            return res.status(500).json({ error: err.sqlMessage });
        }
        console.log("📦 Productos enviados a Android:", results.length);
        res.status(200).json(results);
    });
});

// --- RUTA: ÚLTIMOS MOVIMIENTOS ---
app.get('/api/movimientos-resumen', (req, res) => {
    // Usando id_movimiento, id_producto, id_tipo, cantidad, fecha e id_usuario
    const sql = `
        SELECT 
            fecha, 
            id_producto AS producto, 
            id_tipo AS tipo, 
            cantidad, 
            id_usuario AS responsable 
        FROM movimientos 
        ORDER BY id_movimiento DESC LIMIT 5
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ ERROR EN SQL MOVIMIENTOS:", err.sqlMessage);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.status(200).json(results);
    });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});