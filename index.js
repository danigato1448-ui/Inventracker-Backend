const express = require('express');
const mysql = require('mysql2');

const app = express();

// ==================== CONFIGURACIÓN DE CORS ====================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// ==================== CONEXIÓN A MYSQL ====================
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway',
    port: parseInt(process.env.DB_PORT) || 3306
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión:', err.message);
        return;
    }
    console.log('✅ ¡Conexión exitosa a MySQL!');
});

// ==================== RUTAS DE USUARIOS ====================

// 1. LISTAR TODOS LOS USUARIOS (Para la tabla principal)
app.get('/api/usuarios', (req, res) => {
    const sql = `
        SELECT 
            u.id_usuario AS id, 
            u.nombre_completo AS nombre, 
            u.usuario, 
            u.estado, 
            r.nombre_rol AS rol 
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
    `;
   db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// 2. OBTENER UN SOLO USUARIO (ESTA ES LA QUE FALTABA PARA EDITAR)
app.get('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT 
            id_usuario AS id, 
            nombre_completo AS nombre, 
            usuario, 
            estado,
            id_rol -- Enviamos el ID numérico para que el <select> del HTML lo reconozca
        FROM usuarios 
        WHERE id_usuario = ?
    `;

    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.status(404).json({ message: "Usuario no encontrado" });
        }
    });
});

// 3. ACTUALIZAR USUARIO
app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, estado, id_rol } = req.body;
    const sql = 'UPDATE usuarios SET nombre_completo = ?, estado = ?, id_rol = ? WHERE id_usuario = ?';
    
    db.query(sql, [nombre, estado, id_rol, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ success: true, message: "Usuario actualizado" });
    });
});

// ==================== OTRAS RUTAS (LOGIN, DASHBOARD, PRODUCTOS) ====================

app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    const sql = 'SELECT usuario, rol, estado FROM usuarios WHERE usuario = ? AND password = ? AND estado = "Activo"';
    db.query(sql, [usuario, password], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (results.length > 0) {
            res.json({ success: true, user: results[0].usuario, rol: results[0].rol });
        } else {
            res.status(401).json({ success: false, message: "Credenciales inválidas" });
        }
    });
});

app.get('/api/dashboard-stats', (req, res) => {
    const sql = `SELECT (SELECT COUNT(*) FROM productos) AS total_productos, (SELECT COUNT(*) FROM proveedores) AS total_proveedores`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results[0]);
    });
});

app.get('/productos', (req, res) => {
    const sql = `SELECT p.*, c.nombre_categoria FROM productos p INNER JOIN categorias c ON p.id_categoria = c.id_categoria`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// ==================== INICIO DEL SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});