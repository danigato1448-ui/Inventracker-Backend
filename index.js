const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();

// ✅ CORS mejorado: permite tu GitHub Pages + localhost para desarrollo
app.use(cors({
    origin: [
        'https://danigato1448-ui.github.io/repository-fronted/',           // Cambia por tu dominio real de GitHub Pages
        'https://github.com/danigato1448-ui/repository-fronted.git',   // Si el frontend está en una subcarpeta
        'http://localhost:3000',                 // Para pruebas locales
        'http://127.0.0.1:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// Conexión a MySQL (Railway inyecta estas variables automáticamente)
const db = mysql.createConnection({
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
    port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
    // Opcional: para más estabilidad en Railway
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a la base de datos MySQL en Railway');
});

// Rutas (las que ya tienes se mantienen igual)
// ... tu ruta /api/login, /api/dashboard-stats, /productos, etc.

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
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