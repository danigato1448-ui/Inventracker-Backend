const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();

// Configuración de CORS: Permite que tu GitHub Pages y tu App de Android se conecten
app.use(cors());
app.use(express.json());

// Conexión dinámica a la base de datos
// Usamos los nombres de variables que configuraste en Railway
const db = mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '', 
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'railway',
    port: process.env.DB_PORT || process.env.MYSQLPORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a la base de datos MySQL en Railway');
});

// --- RUTA DE LOGIN ---
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    const sql = 'SELECT * FROM usuarios WHERE usuario = ? AND password = ? AND estado = "Activo"';

    db.query(sql, [usuario, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error en el servidor" });
        if (results.length > 0) {
            // Enviamos un JSON claro para que tanto el HTML como Android lo entiendan
            return res.status(200).json({ 
                success: true, 
                message: "Autenticación satisfactoria",
                user: results[0].usuario 
            });
        } else {
            return res.status(401).json({ success: false, message: "Error en la autenticación" });
        }
    });
});

// --- RUTA: ESTADÍSTICAS PARA LAS TARJETAS ---
app.get('/api/dashboard-stats', (req, res) => {
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
    const sql = 'SELECT * FROM productos'; 
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ ERROR EN SQL:", err.sqlMessage);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.status(200).json(results);
    });
});

// --- RUTA: ÚLTIMOS MOVIMIENTOS ---
app.get('/api/movimientos-resumen', (req, res) => {
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

// --- INICIO DEL SERVIDOR ---
// Railway asigna el puerto mediante process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Inventracker activo en puerto ${PORT}`);
});