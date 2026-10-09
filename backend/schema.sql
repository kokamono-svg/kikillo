-- =====================================================================
-- schema.sql  (MySQL / MariaDB)
-- Tablas que usa el módulo de RH. Es una propuesta: ajústenla al
-- esquema que ya tenga el equipo.
-- utf8mb4_unicode_ci: las búsquedas con LIKE ignoran acentos y
-- mayúsculas ("perez" encuentra a "Pérez").
-- =====================================================================

CREATE TABLE almacenes (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL UNIQUE          -- Kepler, Contratistas (Mittal), Midrex, HYL...
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE articulos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  clave       VARCHAR(30)  NOT NULL UNIQUE,
  descripcion VARCHAR(120) NOT NULL,
  tipo        ENUM('EPP','Herramienta','Equipo','Consumible') NOT NULL,
  por_pieza   BOOLEAN NOT NULL DEFAULT FALSE     -- TRUE = cada pieza lleva ID propio (arnés, bandola...)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE trabajadores (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  numero_empleado       VARCHAR(12) UNIQUE,      -- lo llena el backend: IMH-00001
  nombres               VARCHAR(60) NOT NULL,
  apellido_paterno      VARCHAR(40) NOT NULL,
  apellido_materno      VARCHAR(40),
  curp                  CHAR(18) NOT NULL UNIQUE, -- evita registrar dos veces a la misma persona
  rfc                   CHAR(13) NOT NULL,
  nss                   CHAR(11) NOT NULL,
  telefono              VARCHAR(10),
  puesto                VARCHAR(60) NOT NULL,
  area                  VARCHAR(60) NOT NULL,
  contrato              VARCHAR(30) NOT NULL,
  supervisor            VARCHAR(80) NOT NULL,
  fecha_ingreso         DATE NOT NULL,
  talla_ropa            VARCHAR(5) NOT NULL,
  talla_calzado         VARCHAR(5) NOT NULL,
  doc_identificacion    BOOLEAN NOT NULL DEFAULT FALSE,
  doc_comprobante_dom   BOOLEAN NOT NULL DEFAULT FALSE,
  doc_datos_bancarios   BOOLEAN NOT NULL DEFAULT FALSE,
  doc_contrato_firmado  BOOLEAN NOT NULL DEFAULT FALSE,
  doc_alta_imss         BOOLEAN NOT NULL DEFAULT FALSE,
  induccion_seguridad   BOOLEAN NOT NULL DEFAULT FALSE,
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_baja            DATE NULL,
  motivo_baja           VARCHAR(60) NULL,
  comentarios_baja      VARCHAR(500) NULL,
  creado_en             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Encabezado de cada vale (de entrega o de adeudos)
CREATE TABLE vales (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  folio          VARCHAR(12) NOT NULL UNIQUE,     -- 0001 (entrega) o ADE-0001 (adeudos)
  tipo           ENUM('ENTREGA','ADEUDOS') NOT NULL,
  trabajador_id  INT NOT NULL,
  fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responsable    VARCHAR(80) NOT NULL,
  observaciones  VARCHAR(255),
  FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Renglones congelados del vale de adeudos (una "foto" de lo que debía ese día)
CREATE TABLE vale_renglones (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  vale_id       INT NOT NULL,
  articulo_id   INT NOT NULL,
  id_serie      VARCHAR(30),
  cantidad      INT NOT NULL,
  estado        VARCHAR(40) NOT NULL,
  FOREIGN KEY (vale_id) REFERENCES vales(id),
  FOREIGN KEY (articulo_id) REFERENCES articulos(id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Cada entrada o salida de un artículo: es la fuente del kardex y de los adeudos
CREATE TABLE movimientos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  trabajador_id  INT NOT NULL,
  articulo_id    INT NOT NULL,
  almacen_id     INT NOT NULL,
  vale_id        INT NULL,
  tipo           ENUM('ENTREGA','DEVOLUCION','REPOSICION','DANO','PERDIDA') NOT NULL,
  id_serie       VARCHAR(30) NULL,
  cantidad       INT NOT NULL CHECK (cantidad > 0),
  responsable    VARCHAR(80) NOT NULL,
  fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id),
  FOREIGN KEY (articulo_id) REFERENCES articulos(id),
  FOREIGN KEY (almacen_id) REFERENCES almacenes(id),
  FOREIGN KEY (vale_id) REFERENCES vales(id),
  INDEX idx_mov_trabajador (trabajador_id, fecha)   -- acelera kardex y adeudos con cientos de miles de registros
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
