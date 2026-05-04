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
                estado: results[0].estado,
                user_id: results[0].id_usuario
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

app.get('/api/productos', (req, res) => {
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

    // Determinamos el texto del rol basado en el ID que viene del HTML
    const textoRol = (id_rol === 1) ? 'Administrador' : 'Empleado';

    const sql = `
        INSERT INTO usuarios (nombre_completo, usuario, password, rol, id_rol, estado) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    // Pasamos 6 valores para las 6 columnas
    db.query(sql, [nombre, usuario, password, textoRol, id_rol, estado], (err, result) => {
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

// ==================== RUTAS DE PRODUCTOS ====================

// Crear Producto 
app.post('/api/productos', (req, res) => {
    const { nombre, referencia, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_venta } = req.body;
    const sql = `INSERT INTO productos (nombre_producto, referencia, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_venta) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [nombre, referencia, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_venta], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(201).json({ success: true, id: result.insertId });
    });
});

// Actualizar Producto
// En tu index.js, busca la ruta PUT de productos y déjala así:
app.put('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, id_categoria, id_proveedor, stock_actual, precio_venta } = req.body;
    
    const sql = `UPDATE productos SET nombre_producto = ?, id_categoria = ?, id_proveedor = ?, stock_actual = ?, precio_venta = ? 
                 WHERE id_producto = ?`;
    
    db.query(sql, [nombre, id_categoria, id_proveedor, stock_actual, precio_venta, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ success: true });
    });
});

// ==================== RUTA PARA ELIMINAR PRODUCTO ====================
app.delete('/api/productos/:id', (req, res) => {
    const { id } = req.params;

    // Usamos el ID que viene de la URL para borrar la fila exacta
    const sql = "DELETE FROM productos WHERE id_producto = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar de la DB:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        // Si result.affectedRows es 0, significa que el ID no existía
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Producto no encontrado" });
        }

        console.log(`🗑️ Producto con ID ${id} eliminado de la base de datos`);
        res.json({ success: true, message: "Producto eliminado correctamente" });
    });
});
// ==================== RUTAS DE PROVEEDORES ====================

// Crear Proveedores
app.post('/api/proveedor', (req, res) => {
    const { nombre, contacto, nit, telefono, email, ciudad } = req.body;
    const sql = `INSERT INTO proveedores (nombre_proveedor, contacto, nit, telefono, email, ciudad) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [nombre, contacto,nit, telefono, email, ciudad], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(201).json({ success: true, id: result.insertId });
    });
});
// ==================== RUTA PARA ELIMINAR PROVEEDOR ====================
app.delete('/api/proveedores/:id', (req, res) => {
    const { id } = req.params;

    // Usamos el ID que viene de la URL para borrar la fila exacta
    const sql = "DELETE FROM proveedores WHERE id_proveedor = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar de la DB:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        // Si result.affectedRows es 0, significa que el ID no existía
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Proveedor no encontrado" });
        }

        console.log(`🗑️ Proveedor con ID ${id} eliminado de la base de datos`);
        res.json({ success: true, message: "Proveedor eliminado correctamente" });
    });
});

// Obtener todas las categorías
app.get('/api/categorias', (req, res) => {
    db.query('SELECT id_categoria, nombre_categoria FROM categorias', (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// Obtener todos los proveedores
app.get('/api/proveedores', (req, res) => {
    db.query('SELECT id_proveedor, nombre_proveedor, contacto, telefono, email, ciudad FROM proveedores', (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// --- RUTAS PARA MOVIMIENTOS ---

// 1. Obtener historial (Uniendo con productos para el nombre)
app.get('/api/movimientos', (req, res) => {
    const query = `
        SELECT m.id_movimiento, m.id_producto, p.nombre_producto, m.id_tipo, m.cantidad, m.fecha, m.id_usuario, m.observaciones 
        FROM movimientos m 
        JOIN productos p ON m.id_producto = p.id_producto 
        ORDER BY m.fecha DESC`;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// 2. Estadísticas para las cards
app.get('/api/movimientos/stats', (req, res) => {
    const query = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN id_tipo = 1 THEN 1 ELSE 0 END) as entradas,
            SUM(CASE WHEN id_tipo = 2 THEN 1 ELSE 0 END) as salidas
        FROM movimientos`;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results[0] || { total: 0, entradas: 0, salidas: 0 });
    });
});

// 3. REGISTRAR MOVIMIENTO (Traduciendo palabras a números) ---
app.post('/api/movimientos', (req, res) => {
    // Recibimos 'tipo_movimiento' como palabra desde el frontend
    const { id_producto, tipo_movimiento, cantidad, fecha, id_usuario, observaciones } = req.body;
    
    // Traducimos para la base de datos: Entrada = 1, Salida = 2
    const id_tipo = (tipo_movimiento === 'Entrada') ? 1 : 2;
    const operacion = (tipo_movimiento === 'Entrada') ? '+' : '-';

    const sqlMov = "INSERT INTO movimientos (id_producto, id_tipo, cantidad, fecha, id_usuario, observaciones) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.query(sqlMov, [id_producto, id_tipo, cantidad, fecha, id_usuario, observaciones], (err, result) => {
        if (err) return res.status(500).send("Error al registrar movimiento");

        // Usamos la operación (+ o -) según el texto recibido
        const sqlUpdateStock = `UPDATE productos SET stock_actual = stock_actual ${operacion} ? WHERE id_producto = ?`;

        db.query(sqlUpdateStock, [cantidad, id_producto], (errUpdate) => {
            if (errUpdate) return res.status(500).send("Error al actualizar stock");
            res.json({ message: "Movimiento registrado con éxito" });
        });
    });
});

// ==================== INICIO DEL SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Inventracker corriendo en el puerto ${PORT}`);
});

