const express = require('express');
const mysql = require('mysql2');

const app = express();

// ==================== CONFIGURACIÓN DE CORS ULTRA-AGRESIVA ====================
// Esto reemplaza al paquete 'cors' para forzar las cabeceras en cada respuesta
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Si el navegador hace la pregunta previa (OPTIONS), respondemos OK de inmediato
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// ==================== CONEXIÓN A MYSQL (CONFIGURACIÓN RAILWAY) ====================
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway',
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión a MySQL:', err.message);
        return;
    }
    console.log('✅ ¡Conexión exitosa a MySQL!');
});

// ==================== RUTAS ====================

app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    console.log(`Intentando login para: ${usuario}`);

    const sql = 'SELECT usuario, rol, estado FROM usuarios WHERE usuario = ? AND password = ? AND estado = "Activo"';

    db.query(sql, [usuario, password], (err, results) => {
        if (err) {
            console.error("Error en login:", err.message);
            return res.status(500).json({ success: false, message: "Error en el servidor" });
        }
        
        if (results.length > 0) {
            return res.json({ 
                success: true, 
                message: "Autenticación satisfactoria",
                user: results[0].usuario,
                rol: results[0].rol, 
                estado: results[0].estado
            });
        } else {
            return res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
    });
});

app.get('/api/dashboard-stats', (req, res) => {
    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM productos) AS total_productos,
            (SELECT COUNT(*) FROM productos WHERE stock_actual <= stock_minimo) AS alertas,
            (SELECT COUNT(*) FROM proveedores) AS total_proveedores,
            (SELECT COUNT(*) FROM movimientos WHERE DATE(fecha) = CURDATE()) AS movimientos_hoy
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results[0]);
    });
});

app.get('/productos', (req, res) => {
    // Esta consulta obliga a la DB a buscar el nombre en la tabla categorias
    const sql = `
        SELECT 
            p.*, 
            c.nombre_categoria, 
            prov.nombre_proveedor
        FROM productos p
        INNER JOIN categorias c ON p.id_categoria = c.id_categoria
        INNER JOIN proveedores prov ON p.id_proveedor = prov.id_proveedor
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error en el JOIN:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json(results);
    });
});

app.get('/api/movimientos-resumen', (req, res) => {
    const sql = `
        SELECT fecha, id_producto AS producto, id_tipo AS tipo, 
               cantidad, id_usuario AS responsable 
        FROM movimientos 
        ORDER BY id_movimiento DESC LIMIT 5
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// 1. RUTA PARA LA TABLA (TODOS LOS USUARIOS)
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

// 2. RUTA PARA EL FORMULARIO DE EDITAR (UN SOLO USUARIO)
app.get('/api/usuarios/:id', (req, res) => {
    const { id } = req.params; 
    const sql = `
        SELECT 
            id_usuario AS id, 
            nombre_completo AS nombre, 
            usuario, 
            estado, 
            id_rol 
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

// ==================== RUTA PARA GUARDAR CAMBIOS (ACTUALIZAR) ====================
// ESTA ES LA RUTA QUE ESCRIBE EN LA BASE DE DATOS
app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, estado, id_rol } = req.body;

    // IMPORTANTE: Aquí usamos id_rol que es el NÚMERO (1 o 2)
    const sql = `UPDATE usuarios SET nombre_completo = ?, estado = ?, id_rol = ? WHERE id_usuario = ?`;
    
    db.query(sql, [nombre, estado, id_rol, id], (err, result) => {
        if (err) {
            console.error("Error en Railway:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json({ success: true, message: "Actualizado en Railway" });
    });
});

// ==================== NUEVA RUTA: ELIMINAR USUARIO ====================
app.delete('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;

    // Consulta SQL para borrar físicamente al usuario de la tabla
    const sql = 'DELETE FROM usuarios WHERE id_usuario = ?';

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar en la base de datos:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        // Si no se borró nada (por ejemplo, el ID no existe)
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        console.log(`🗑️ Usuario con ID ${id} eliminado correctamente`);
        res.json({ success: true, message: "Usuario eliminado con éxito" });
    });
});

// ==================== NUEVA RUTA: CREAR USUARIO (POST) ====================
app.post('/api/usuarios', (req, res) => {
    const { nombre, usuario, password, id_rol, estado } = req.body;

    // IMPORTANTE: Asegúrate de que los nombres de las columnas coincidan con tu DB
    const sql = `
        INSERT INTO usuarios (nombre_completo, usuario, password, id_rol, estado) 
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [nombre, usuario, password, id_rol, estado], (err, result) => {
        if (err) {
            console.error("Error al insertar usuario:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        
        console.log("✅ Nuevo usuario creado con éxito");
        res.status(201).json({ 
            success: true, 
            message: "Usuario creado", 
            id: result.insertId 
        });
    });
});
// ==================== INICIO DEL SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Inventracker corriendo en el puerto ${PORT}`);
});

