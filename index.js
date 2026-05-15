const express = require('express');
const mysql = require('mysql2');

const app = express();

// ==================== CONFIGURACIÓN DE CORS ULTRA-AGRESIVA ====================
// Esto reemplaza al paquete 'cors' para forzar las cabeceras en cada respuesta
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, user-role');
    
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

function crearAlerta(titulo, mensaje, tipo, usuario = 'Sistema') {
    const sql = 'INSERT INTO notificaciones (titulo, mensaje, tipo, usuario) VALUES (?, ?, ?, ?)';
    db.query(sql, [titulo, mensaje, tipo, usuario], (err) => {
        if (err) console.error("❌ Error al crear alerta automática:", err.message);
    });
}

// ==================== RUTAS ====================

app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    console.log(`Intentando login para: ${usuario}`);

    const sql = 'SELECT id_usuario, usuario, rol, estado FROM usuarios WHERE usuario = ? AND password = ? AND estado = "Activo"';

    db.query(sql, [usuario, password], (err, results) => {
        if (err) {
            console.error("Error en login:", err.message);
            return res.status(500).json({ success: false, message: "Error en el servidor" });
        }
        
        if (results.length > 0) {
            // AQUÍ ENVIAMOS EL ID CORRECTO AL FRONTEND
            return res.json({ 
                success: true, 
                message: "Autenticación satisfactoria",
                user: results[0].usuario,
                rol: results[0].rol, 
                estado: results[0].estado,
                user_id: results[0].id_usuario // <--- IMPORTANTE: Este nombre debe coincidir con el login.html
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

        crearAlerta('Usuario Eliminado', `El usuario con ID ${id} fue removido`, 'danger', 'Admin');

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
        
        crearAlerta('Nuevo Usuario', `Se registró a ${nombre} como ${textoRol}`, 'success', 'Sistema');

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

    // VALIDACIÓN: Evitar stock negativo
    if (parseInt(stock_actual) < 0 || parseInt(stock_minimo) < 0) {
        return res.status(400).json({ 
            success: false, 
            message: "El stock no puede ser un valor negativo." 
        });
    }

    const sql = `INSERT INTO productos (nombre_producto, referencia, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_venta) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [nombre, referencia, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_venta], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        crearAlerta('Nuevo Producto', `Se registró el producto: ${nombre} con stock inicial de ${stock_actual}`, 'success', 'Sistema');
        
        res.status(201).json({ success: true, id: result.insertId });
    });
});

// CORRECCIÓN: Ruta de Actualizar Producto (Asegúrate de que NO tenga async si usas callbacks)
app.put('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, id_categoria, id_proveedor, stock_actual, precio_venta } = req.body;
    
    const sql = `UPDATE productos SET nombre_producto = ?, id_categoria = ?, id_proveedor = ?, stock_actual = ?, precio_venta = ? 
                 WHERE id_producto = ?`;
    
    db.query(sql, [nombre, id_categoria, id_proveedor, stock_actual, precio_venta, id], (err, result) => {
        if (err) {
            console.error("Error al actualizar:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        crearAlerta('Producto Actualizado', `Se modificó el producto: ${nombre} (ID: ${id})`, 'info', 'Admin');
        res.json({ success: true });
    });
});

// CORRECCIÓN: Ruta de Eliminar Producto (Asegúrate de que esté así)
app.delete('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM productos WHERE id_producto = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar de la DB:", err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Producto no encontrado" });
        }

        // Llamamos a la alerta DESPUÉS de confirmar que se borró
        crearAlerta('Producto Eliminado', `El producto con ID: ${id} fue removido del sistema`, 'warning', 'Admin');

        console.log(`🗑️ Producto con ID ${id} eliminado`);
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

        crearAlerta('Nuevo Proveedor', `Se agregó al proveedor: ${nombre}`, 'success', 'Sistema');

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

        crearAlerta('Proveedor Eliminado', `Se eliminó al proveedor con ID: ${id}`, 'warning', 'Admin');

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

app.post('/api/movimientos', (req, res) => {
    const { id_producto, tipo_movimiento, cantidad, fecha, id_usuario, observaciones } = req.body;
    
    // 1. Forzamos que los números sean números para evitar líos con MySQL
    const numProducto = parseInt(id_producto);
    const numCantidad = parseInt(cantidad);
    const numUsuario = parseInt(id_usuario);
    const id_tipo = (tipo_movimiento === 'Entrada') ? 1 : 2;

    // 2. Insertamos el movimiento
    const sqlMov = "INSERT INTO movimientos (id_producto, id_tipo, cantidad, fecha, id_usuario, observaciones) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.query(sqlMov, [numProducto, id_tipo, numCantidad, fecha, numUsuario, observaciones], (err, result) => {
        if (err) {
            console.error("❌ Error en INSERT:", err.message);
            return res.status(500).send("Error al registrar movimiento: " + err.message);
        }

    // --- CORRECCIÓN AQUÍ: Verificar si bajó del mínimo ---
    const sqlCheck = "SELECT nombre_producto, stock_actual, stock_minimo FROM productos WHERE id_producto = ?";
    db.query(sqlCheck, [numProducto], (errCheck, results) => {
        if (!errCheck && results.length > 0) {
            const p = results[0];
            if (p.stock_actual <= p.stock_minimo) {
                crearAlerta('⚠️ Stock Bajo', `El producto ${p.nombre_producto} llegó a su límite: ${p.stock_actual} unidades.`, 'danger', 'Sistema');
            }
        }
    });

        // --- LÓGICA DE ALERTA POR STOCK MÍNIMO ---
    const sqlCheck = "SELECT nombre_producto, stock_actual, stock_minimo FROM productos WHERE id_producto = ?";
    
    db.query(sqlCheck, [numProducto], (errCheck, results) => {
        if (errCheck) {
            console.error("❌ Error al verificar stock crítico:", errCheck.message);
            return;
        }

        if (results.length > 0) {
            const p = results[0];
            // Si el stock actual es menor o igual al mínimo, disparamos la alerta
            if (p.stock_actual <= p.stock_minimo) {
                crearAlerta(
                    '⚠️ Stock Bajo', 
                    `El producto ${p.nombre_producto} (ID: ${numProducto}) ha llegado a un nivel crítico: ${p.stock_actual} unidades.`, 
                    'danger', 
                    'Sistema'
                );
            }
        }
    });

    res.json({ success: true, message: "Movimiento registrado y stock verificado" });
});

        if (id_tipo === 1) { // Si es tipo 1 (Entrada), viene de un proveedor
            crearAlerta(
                '📦 Recepción de Pedido', 
                `Se recibió una entrada de ${numCantidad} unidades para el producto ID: ${numProducto}.`, 
                'success', 
                'Sistema'
            );
        }
        // 3. ACTUALIZACIÓN DE STOCK (Sintaxis corregida)
        // En lugar de usar ${operacion}, usamos IF para que MySQL decida qué hacer
        const sqlUpdateStock = `
            UPDATE productos 
            SET stock_actual = CASE 
                WHEN ? = 1 THEN stock_actual + ? 
                WHEN ? = 2 THEN stock_actual - ? 
            END 
            WHERE id_producto = ?`;

        db.query(sqlUpdateStock, [id_tipo, numCantidad, id_tipo, numCantidad, numProducto], (errUpdate) => {
    if (errUpdate) return res.status(500).send("Error al actualizar stock");

    // >>> PEGA TU LÓGICA DE ALERTA AQUÍ:
    const sqlCheck = "SELECT nombre_producto, stock_actual, stock_minimo FROM productos WHERE id_producto = ?";
    db.query(sqlCheck, [numProducto], (errCheck, results) => {
        if (!errCheck && results.length > 0) {
            const p = results[0];
            if (p.stock_actual <= p.stock_minimo) {
                crearAlerta(
                    '⚠️ Stock Bajo', 
                    `El producto ${p.nombre_producto} llegó a su límite: ${p.stock_actual} unidades.`, 
                    'danger', 
                    'Sistema'
                );
            }
        }
    });
    // >>> FIN DE LA LÓGICA DE ALERTA

    res.json({ success: true, message: "Movimiento registrado y stock actualizado" });
});
    });


// REEMPLAZA EL DELETE Y PEGA EL PUT EN TU index.js

// 1. ELIMINAR MOVIMIENTO (Actualizado con seguridad)
app.delete('/api/movimientos/:id', (req, res) => {
    const id_movimiento = req.params.id;
    const userRole = req.headers['user-role'];

    if (userRole !== 'Administrador') {
        return res.status(403).send("Acceso denegado: Se requiere rol de Administrador");
    }

    const sqlSelect = "SELECT id_producto, id_tipo, cantidad FROM movimientos WHERE id_movimiento = ?";
    db.query(sqlSelect, [id_movimiento], (err, results) => {
        if (err || results.length === 0) return res.status(500).send("Movimiento no encontrado");

        const { id_producto, id_tipo, cantidad } = results[0];
        const operacion = (id_tipo === 1) ? '-' : '+';

        db.query("DELETE FROM movimientos WHERE id_movimiento = ?", [id_movimiento], (errDel) => {
            if (errDel) return res.status(500).send("Error al eliminar");

            const sqlUpdate = `UPDATE productos SET stock_actual = stock_actual ${operacion} ? WHERE id_producto = ?`;
            db.query(sqlUpdate, [cantidad, id_producto], (errUpd) => {
                res.json({ message: "Eliminado y stock ajustado" });
            });
        });
    });
});

// 2. EDITAR MOVIMIENTO (Nueva ruta)
// BUSCA Y REEMPLAZA ESTA RUTA EN TU index_2.js
app.put('/api/movimientos/:id', (req, res) => {
    const id_movimiento = req.params.id;
    const { cantidad_nueva, observaciones_nuevas } = req.body;
    const userRole = req.headers['user-role'];

    // 1. Verificación de seguridad
    if (userRole !== 'Administrador') return res.status(403).send("No autorizado");

    // 2. Obtener datos antiguos para recalcular el stock
    const sqlOriginal = "SELECT id_producto, id_tipo, cantidad FROM movimientos WHERE id_movimiento = ?";
    db.query(sqlOriginal, [id_movimiento], (err, results) => {
        if (err || results.length === 0) return res.status(500).send("Movimiento no encontrado");

        const { id_producto, id_tipo, cantidad } = results[0];
        const diferencia = parseInt(cantidad_nueva) - cantidad;
        const operacionStock = (id_tipo === 1) ? '+' : '-';

        // 3. Actualizar el registro del movimiento
        const sqlUpdateMov = "UPDATE movimientos SET cantidad = ?, observaciones = ? WHERE id_movimiento = ?";
        db.query(sqlUpdateMov, [cantidad_nueva, observaciones_nuevas, id_movimiento], (errUpd) => {
            if (errUpd) return res.status(500).send("Error al actualizar registro");

            // 4. Ajustar el stock del producto basándose en la diferencia
            const sqlUpdateStock = `UPDATE productos SET stock_actual = stock_actual ${operacionStock} ? WHERE id_producto = ?`;
            db.query(sqlUpdateStock, [diferencia, id_producto], (errStock) => {
                if (errStock) return res.status(500).send("Error al ajustar stock");
                
                // IMPORTANTE: Responder con JSON para que el fetch del front no falle
                res.json({ success: true, message: "¡Inventario actualizado!" });
            });
        });
    });
});

app.get('/api/notificaciones', (req, res) => {
    db.query('SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 20', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.delete('/api/notificaciones/:id', (req, res) => {
    db.query('DELETE FROM notificaciones WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });
});

// ==================== INICIO DEL SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Inventracker corriendo en el puerto ${PORT}`);
});

