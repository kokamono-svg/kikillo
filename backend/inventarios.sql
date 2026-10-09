-- =====================================================================
-- inventarios.sql  (MySQL 8)
-- Esquema completo de la BD Inventarios.
--
-- Orden: primero las tablas "catálogo" (almacén, obra, trabajador,
-- usuario, artículo), luego el inventario y al final lo que se mueve
-- (solicitudes, vales, movimientos). Así cada FOREIGN KEY apunta a
-- una tabla que ya existe.
--
-- Se puede volver a ejecutar: todo es IF NOT EXISTS / OR REPLACE.
-- utf8mb4_unicode_ci: acepta acentos y ñ, y las búsquedas con LIKE
-- ignoran acentos y mayúsculas ("perez" encuentra a "Pérez").
-- Datos de ejemplo: inventarios_datos.sql
-- =====================================================================
CREATE DATABASE IF NOT EXISTS Inventarios
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE Inventarios;

-- ---------------------------------------------------------------------
-- 1. ALMACENES Y OBRAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS almacen (
    id_almacen INT AUTO_INCREMENT PRIMARY KEY,
    nombre_almacen VARCHAR(100) NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- Obras o frentes de trabajo que elige el solicitante ("Planta 1 - Paro programado")
CREATE TABLE IF NOT EXISTS obra (
    id_obra INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    activa BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- Cursos de seguridad (van en el kardex de la credencial y los pide el almacén)
CREATE TABLE IF NOT EXISTS curso (
    id_curso INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(20) NOT NULL UNIQUE,             -- ALTURAS, CONFINADOS...
    nombre VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. PERSONAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trabajadores (
    id_trabajador INT AUTO_INCREMENT PRIMARY KEY,
    num_empleado VARCHAR(20) NULL UNIQUE,          -- lo genera el backend al dar de alta: IMH-00001
    numero_tarjeta VARCHAR(30) NULL UNIQUE,        -- N° de tarjeta de la credencial: es lo que guarda su QR
    nombres VARCHAR(60) NOT NULL,
    apellido_paterno VARCHAR(40) NOT NULL,
    apellido_materno VARCHAR(40) NULL,
    -- Se calcula solo: nunca se desfasa del nombre por partes
    nombre_completo VARCHAR(150) GENERATED ALWAYS AS
        (CONCAT_WS(' ', nombres, apellido_paterno, apellido_materno)) STORED,
    curp CHAR(18) NULL UNIQUE,                     -- evita registrar dos veces a la misma persona
    rfc VARCHAR(13) NULL,
    nss CHAR(11) NULL UNIQUE,                      -- también es su usuario para iniciar sesión
    telefono VARCHAR(20) NULL,
    dato_bancario VARCHAR(100) NULL,
    puesto VARCHAR(60) NULL,
    area VARCHAR(60) NULL,
    contrato VARCHAR(30) NULL,                     -- contrato u orden, ej. LC-2026-001
    supervisor VARCHAR(100) NULL,
    compania_contratista VARCHAR(150) DEFAULT 'MANTENIMIENTO INDUSTRIAL IMHOTEP S. DE R.L. DE C.V.',
    administrador VARCHAR(100) NULL,
    fecha_emision DATE NULL,                       -- emisión del gafete
    foto_ruta VARCHAR(255) NULL,                   -- nombre del archivo de la foto (no la imagen)
    reglas_oro BOOLEAN NOT NULL DEFAULT FALSE,     -- firmó las 10 Reglas de Oro
    fps_nivel0 BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_ingreso DATE NULL,
    talla_ropa VARCHAR(5) NULL,
    talla_calzado VARCHAR(5) NULL,
    -- Documentos que RH revisa al contratar (TRUE = ya los entregó)
    doc_identificacion BOOLEAN NOT NULL DEFAULT FALSE,
    doc_comprobante_dom BOOLEAN NOT NULL DEFAULT FALSE,
    doc_datos_bancarios BOOLEAN NOT NULL DEFAULT FALSE,
    doc_contrato_firmado BOOLEAN NOT NULL DEFAULT FALSE,
    doc_alta_imss BOOLEAN NOT NULL DEFAULT FALSE,
    induccion_seguridad BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_baja DATE NULL,
    motivo_baja VARCHAR(60) NULL,
    comentarios_baja VARCHAR(500) NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_trabajador_nombre (nombre_completo)  -- buscador de RH
) ENGINE=InnoDB;

-- Cursos que tomó cada trabajador (el "kardex" del reverso de la credencial)
CREATE TABLE IF NOT EXISTS trabajador_curso (
    id_trabajador_curso INT AUTO_INCREMENT PRIMARY KEY,
    id_trabajador INT NOT NULL,
    id_curso INT NOT NULL,
    folio VARCHAR(30) NULL,                        -- "ID" del curso impreso en la credencial
    vigencia DATE NOT NULL,                        -- válido hasta este día
    UNIQUE KEY uq_trabajador_curso (id_trabajador, id_curso),
    CONSTRAINT fk_tcurso_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador) ON DELETE CASCADE,
    CONSTRAINT fk_tcurso_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso)
) ENGINE=InnoDB;

-- Quién puede iniciar sesión. La contraseña va como hash, NUNCA en texto plano:
--   python -c "from werkzeug.security import generate_password_hash as g; print(g('LaContraseña'))"
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre_completo VARCHAR(200) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,          -- para trabajadores (rol solicitante): su NSS
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'rh', 'almacenista', 'comprador', 'solicitante') NOT NULL,
    id_almacen INT NULL,                           -- solo almacenista: el ÚNICO almacén que ve y presta
    id_trabajador INT NULL UNIQUE,                 -- solo solicitante: su ficha de trabajador
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuario_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT fk_usuario_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
    -- Un almacenista sin almacén no podría trabajar
    CONSTRAINT chk_usuario_almacenista CHECK (rol <> 'almacenista' OR id_almacen IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. CATÁLOGO E INVENTARIO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogo (
    id_catalogo INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(30) NOT NULL UNIQUE,             -- ej. HER-MPU (la usa el buscador y el kardex)
    nombre VARCHAR(150) NOT NULL,
    tipo ENUM('EPP', 'Herramienta', 'Equipo') NOT NULL,
    categoria VARCHAR(50) NULL,                    -- agrupa en pantalla: Herramienta eléctrica, Medición...
    tipo_seguimiento ENUM('Individual', 'Granel') NOT NULL,   -- Individual = cada pieza con código propio
    tipo_retorno ENUM('Consumible', 'Devolutivo') NOT NULL,   -- Consumible = se entrega y NO regresa
    tallas VARCHAR(100) NULL,                      -- tallas que maneja, separadas por coma: 'S,M,L,XL'
    limite_por_vale INT NOT NULL DEFAULT 1,        -- si se pide más, autoriza un supervisor
    stock_minimo INT NOT NULL DEFAULT 3,           -- con esto o menos sale en "stock bajo"
    costoso BOOLEAN NOT NULL DEFAULT FALSE,        -- alto valor: al devolverlo se piden notas y fotos
    id_curso_requerido INT NULL,                   -- solo se presta a quien tenga ese curso vigente
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_catalogo_curso FOREIGN KEY (id_curso_requerido) REFERENCES curso(id_curso),
    CONSTRAINT chk_catalogo_limite CHECK (limite_por_vale > 0),
    CONSTRAINT chk_catalogo_minimo CHECK (stock_minimo >= 0)
) ENGINE=InnoDB;

-- Existencias por cantidad (Granel): una fila por almacén + artículo + talla
CREATE TABLE IF NOT EXISTS inventario_almacen_conjunto (
    id_invalmcon INT AUTO_INCREMENT PRIMARY KEY,
    id_almacen INT NOT NULL,
    id_catalogo INT NOT NULL,
    codigo VARCHAR(50) NOT NULL,                   -- lo que lee el QR / pistola en ESE almacén
    talla VARCHAR(10) NOT NULL DEFAULT '',         -- '' = el artículo no lleva talla
    cantidad INT NOT NULL DEFAULT 0,               -- disponibles para prestar
    danados INT NOT NULL DEFAULT 0,                -- regresaron dañados: NO se prestan
    CONSTRAINT chk_conjunto_cantidad CHECK (cantidad >= 0),
    CONSTRAINT chk_conjunto_danados CHECK (danados >= 0),
    UNIQUE KEY uq_conjunto_almacen_catalogo (id_almacen, id_catalogo, talla),
    -- El mismo código puede existir en dos almacenes (cada uno tiene su HER-MPU)
    UNIQUE KEY uq_conjunto_almacen_codigo (id_almacen, codigo),
    CONSTRAINT fk_conjunto_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT fk_conjunto_catalogo FOREIGN KEY (id_catalogo) REFERENCES catalogo(id_catalogo)
) ENGINE=InnoDB;

-- Piezas con código propio (Individual): arnés, bandola, gancho...
CREATE TABLE IF NOT EXISTS inventario_almacen_individual (
    id_invalmind INT AUTO_INCREMENT PRIMARY KEY,
    id_catalogo INT NOT NULL,
    id_almacen INT NOT NULL,
    codigo VARCHAR(50) NOT NULL UNIQUE,            -- serie única en toda la empresa, ej. ALT-024
    talla VARCHAR(10) NULL,
    estatus ENUM(
        'disponible',
        'en uso',
        'dañado',
        'en reparación',
        'baja'
    ) NOT NULL DEFAULT 'disponible',
    ultima_inspeccion DATE NULL,                   -- copia de la más reciente en la tabla inspeccion
    CONSTRAINT fk_individual_catalogo FOREIGN KEY (id_catalogo) REFERENCES catalogo(id_catalogo),
    CONSTRAINT fk_individual_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    INDEX idx_individual_almacen (id_almacen, estatus)
) ENGINE=InnoDB;

-- Historial de inspecciones del equipo por pieza (apto / no apto)
CREATE TABLE IF NOT EXISTS inspeccion (
    id_inspeccion INT AUTO_INCREMENT PRIMARY KEY,
    id_invalmind INT NOT NULL,
    fecha DATE NOT NULL,
    resultado ENUM('apto', 'no apto') NOT NULL,
    id_usuario INT NOT NULL,                       -- quién inspeccionó
    notas VARCHAR(500) NULL,
    CONSTRAINT fk_inspeccion_pieza FOREIGN KEY (id_invalmind) REFERENCES inventario_almacen_individual(id_invalmind),
    CONSTRAINT fk_inspeccion_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    INDEX idx_inspeccion_pieza (id_invalmind, fecha)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. SOLICITUDES (lo que pide el trabajador desde su celular)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitud (
    id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
    folio VARCHAR(20) NOT NULL UNIQUE,             -- VE-2026-0001
    id_trabajador INT NOT NULL,
    id_obra INT NULL,
    id_almacen INT NULL,                           -- almacén que la surte
    fecha_devolucion DATE NULL,                    -- solo si pidió herramienta que se devuelve
    notas VARCHAR(500) NULL,
    confirma_induccion BOOLEAN NOT NULL DEFAULT FALSE,
    estatus ENUM('pendiente', 'aprobada', 'rechazada', 'surtida', 'cancelada') NOT NULL DEFAULT 'pendiente',
    motivo_rechazo VARCHAR(255) NULL,
    id_usuario_atiende INT NULL,
    creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atendida_en DATETIME NULL,
    CONSTRAINT fk_solicitud_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
    CONSTRAINT fk_solicitud_obra FOREIGN KEY (id_obra) REFERENCES obra(id_obra),
    CONSTRAINT fk_solicitud_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT fk_solicitud_usuario FOREIGN KEY (id_usuario_atiende) REFERENCES usuario(id_usuario),
    INDEX idx_solicitud_estatus (estatus, creada_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS solicitud_detalle (
    id_solicitud_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_solicitud INT NOT NULL,
    id_catalogo INT NOT NULL,
    talla VARCHAR(10) NOT NULL DEFAULT '',
    cantidad INT NOT NULL,
    CONSTRAINT chk_solicitud_cantidad CHECK (cantidad > 0),
    CONSTRAINT fk_soldet_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitud(id_solicitud) ON DELETE CASCADE,
    CONSTRAINT fk_soldet_catalogo FOREIGN KEY (id_catalogo) REFERENCES catalogo(id_catalogo)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. VALES (entrega del almacén o vale de adeudos de RH)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vale (
    id_vale INT AUTO_INCREMENT PRIMARY KEY,
    folio VARCHAR(20) NOT NULL UNIQUE,             -- V-0001 (entrega) o ADE-0001 (adeudos)
    tipo ENUM('ENTREGA', 'ADEUDOS') NOT NULL DEFAULT 'ENTREGA',
    id_almacen INT NULL,                           -- NULL en vales de adeudos (los emite RH)
    id_trabajador INT NOT NULL,                    -- quién recibe
    id_usuario INT NOT NULL,                       -- quién entrega (almacenista) o emite (RH)
    id_solicitud INT NULL,                         -- si nació de una solicitud
    id_obra INT NULL,
    actividad VARCHAR(150) NULL,                   -- qué trabajo va a realizar
    motivo VARCHAR(255) NULL,                      -- para qué ocupa el equipo
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_devolucion DATE NULL,                    -- fecha estimada de entrega (NULL = solo consumibles)
    firma_ruta VARCHAR(255) NULL,                  -- archivo PNG de la firma (no la imagen en la BD)
    autorizo_supervisor VARCHAR(100) NULL,         -- si se pasó el límite por vale
    devuelto_en DATETIME NULL,                     -- NULL = sigue prestado
    observaciones VARCHAR(255) NULL,
    CONSTRAINT fk_vale_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT fk_vale_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
    CONSTRAINT fk_vale_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT fk_vale_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitud(id_solicitud),
    CONSTRAINT fk_vale_obra FOREIGN KEY (id_obra) REFERENCES obra(id_obra),
    INDEX idx_vale_almacen (id_almacen, fecha),
    INDEX idx_vale_trabajador (id_trabajador, fecha)
) ENGINE=InnoDB;

-- Renglones del vale + cómo regresó cada uno
CREATE TABLE IF NOT EXISTS vale_detalle (
    id_vale_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_vale INT NOT NULL,
    id_catalogo INT NOT NULL,
    id_invalmind INT NULL,                         -- la pieza exacta (solo equipo Individual)
    talla VARCHAR(10) NOT NULL DEFAULT '',
    cantidad INT NOT NULL,
    estado VARCHAR(40) NULL,                       -- vale de adeudos: "Pendiente de devolución"...
    -- Se llenan al recibir la devolución (nunca en consumibles)
    condicion_devolucion ENUM('bueno', 'dañado') NULL,
    cantidad_danada INT NOT NULL DEFAULT 0,
    notas_devolucion VARCHAR(500) NULL,
    devuelto_en DATETIME NULL,
    CONSTRAINT chk_valedet_cantidad CHECK (cantidad > 0),
    CONSTRAINT chk_valedet_danada CHECK (cantidad_danada BETWEEN 0 AND cantidad),
    CONSTRAINT fk_valedet_vale FOREIGN KEY (id_vale) REFERENCES vale(id_vale) ON DELETE CASCADE,
    CONSTRAINT fk_valedet_catalogo FOREIGN KEY (id_catalogo) REFERENCES catalogo(id_catalogo),
    CONSTRAINT fk_valedet_pieza FOREIGN KEY (id_invalmind) REFERENCES inventario_almacen_individual(id_invalmind)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. MOVIMIENTOS (kardex): cada entrada o salida de un artículo.
--    Es la fuente de los adeudos y del historial de cada trabajador.
--      ENTREGA / REPOSICION  -> sale del almacén hacia el trabajador
--      DEVOLUCION            -> regresa en buen estado
--      DANO                  -> regresa dañado (cierra el adeudo, no vuelve a prestarse)
--      PERDIDA               -> no regresó (el adeudo sigue hasta que RH lo resuelva)
--      ENTRADA / AJUSTE      -> compras o conteo físico (sin trabajador)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimiento (
    id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('ENTREGA', 'DEVOLUCION', 'REPOSICION', 'DANO', 'PERDIDA', 'ENTRADA', 'AJUSTE') NOT NULL,
    id_almacen INT NOT NULL,
    id_catalogo INT NOT NULL,
    id_invalmind INT NULL,
    talla VARCHAR(10) NOT NULL DEFAULT '',
    id_trabajador INT NULL,                        -- NULL en ENTRADA y AJUSTE
    id_vale INT NULL,
    cantidad INT NOT NULL,
    id_usuario INT NOT NULL,                       -- responsable que lo registró
    notas VARCHAR(500) NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_movimiento_cantidad CHECK (cantidad > 0),
    CONSTRAINT fk_mov_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT fk_mov_catalogo FOREIGN KEY (id_catalogo) REFERENCES catalogo(id_catalogo),
    CONSTRAINT fk_mov_pieza FOREIGN KEY (id_invalmind) REFERENCES inventario_almacen_individual(id_invalmind),
    CONSTRAINT fk_mov_trabajador FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
    CONSTRAINT fk_mov_vale FOREIGN KEY (id_vale) REFERENCES vale(id_vale),
    CONSTRAINT fk_mov_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    INDEX idx_mov_trabajador (id_trabajador, fecha),   -- kardex y adeudos con cientos de miles de registros
    INDEX idx_mov_almacen (id_almacen, fecha)
) ENGINE=InnoDB;

-- Fotos opcionales de una devolución (DEVOLUCION o DANO).
-- Se guarda solo la ruta del archivo en el servidor, NUNCA la imagen en la BD.
CREATE TABLE IF NOT EXISTS movimiento_foto (
    id_movimiento_foto INT AUTO_INCREMENT PRIMARY KEY,
    id_movimiento INT NOT NULL,
    ruta VARCHAR(255) NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_foto_movimiento FOREIGN KEY (id_movimiento) REFERENCES movimiento(id_movimiento) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. VISTAS: consultas listas para el backend (se usan como tablas)
-- ---------------------------------------------------------------------

-- Cursos vigentes de cada trabajador
CREATE OR REPLACE VIEW v_cursos_vigentes AS
SELECT tc.id_trabajador, c.clave, c.nombre, tc.folio, tc.vigencia
FROM trabajador_curso tc
JOIN curso c ON c.id_curso = tc.id_curso
WHERE tc.vigencia >= CURDATE();

-- Lo que cada trabajador todavía debe (consumibles fuera)
CREATE OR REPLACE VIEW v_adeudos AS
SELECT m.id_trabajador, m.id_almacen, m.id_catalogo, m.id_invalmind, m.talla,
       SUM(CASE WHEN m.tipo IN ('ENTREGA', 'REPOSICION') THEN m.cantidad
                WHEN m.tipo IN ('DEVOLUCION', 'DANO') THEN -m.cantidad
                ELSE 0 END) AS pendiente,
       MIN(CASE WHEN m.tipo IN ('ENTREGA', 'REPOSICION') THEN m.fecha END) AS fecha_entrega,
       MAX(m.id_vale) AS id_vale
FROM movimiento m
JOIN catalogo c ON c.id_catalogo = m.id_catalogo
WHERE c.tipo_retorno = 'Devolutivo' AND m.id_trabajador IS NOT NULL
GROUP BY m.id_trabajador, m.id_almacen, m.id_catalogo, m.id_invalmind, m.talla
HAVING pendiente > 0;

-- Existencias por almacén y artículo, sin importar si es Granel o Individual
-- (el tablero del almacenista y el inventario salen de aquí)
CREATE OR REPLACE VIEW v_existencias AS
SELECT al.id_almacen, al.nombre_almacen,
       c.id_catalogo, c.clave, c.nombre, c.tipo, c.categoria,
       c.tipo_seguimiento, c.tipo_retorno, c.limite_por_vale, c.stock_minimo, c.costoso,
       x.disponibles, x.prestadas, x.no_aptas,
       (x.disponibles <= c.stock_minimo) AS stock_bajo
FROM (
    SELECT g.id_almacen, g.id_catalogo,
           SUM(g.cantidad) AS disponibles,
           COALESCE((SELECT SUM(a.pendiente) FROM v_adeudos a
                     WHERE a.id_almacen = g.id_almacen AND a.id_catalogo = g.id_catalogo), 0) AS prestadas,
           SUM(g.danados) AS no_aptas
    FROM inventario_almacen_conjunto g
    GROUP BY g.id_almacen, g.id_catalogo
    UNION ALL
    SELECT i.id_almacen, i.id_catalogo,
           SUM(i.estatus = 'disponible'),
           SUM(i.estatus = 'en uso'),
           SUM(i.estatus IN ('dañado', 'en reparación'))
    FROM inventario_almacen_individual i
    WHERE i.estatus <> 'baja'
    GROUP BY i.id_almacen, i.id_catalogo
) x
JOIN almacen al ON al.id_almacen = x.id_almacen
JOIN catalogo c ON c.id_catalogo = x.id_catalogo;
