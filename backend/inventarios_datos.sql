-- =====================================================================
-- inventarios_datos.sql  (MySQL 8)
-- Datos de ejemplo para la demo. Ejecutar DESPUÉS de inventarios.sql
-- y sobre una BD vacía (los id van fijos para que los ejemplos cuadren).
--
-- Usuarios de prueba (mismas contraseñas que auth.service.ts):
--   admin / Admin#2026            rh / Rh#2026
--   almacen / Almacen#2026        (almacenista de Central Kepler)
--   almacen.mittal / Almacen#2026 (almacenista de Colonia de Contratistas)
--   compras / Compras#2026        12345678901 / Trabajador#2026 (solicitante)
-- CÁMBIENLAS antes de publicar la app.
-- =====================================================================
USE Inventarios;

INSERT INTO almacen (id_almacen, nombre_almacen) VALUES
  (1, 'Colonia de Contratistas (Mittal)'),
  (2, 'Central Kepler'),
  (3, 'Área Midrex'),
  (4, 'Área HYL'),
  (5, 'Área Laminador'),
  (6, 'Área Minas');

INSERT INTO curso (id_curso, clave, nombre) VALUES
  (1, 'BASICO', 'Curso básico de seguridad - Externo'),
  (2, 'ALTURAS', 'Trabajos en altura'),
  (3, 'CONFINADOS', 'Espacios confinados'),
  (4, 'CALIENTE', 'Trabajos en caliente (corte y soldadura)'),
  (5, 'LOTO', 'Bloqueo y etiquetado (LOTO)'),
  (6, 'IZAJE', 'Maniobras e izaje');

INSERT INTO obra (id_obra, nombre) VALUES
  (1, 'Planta 1 - Paro programado'),
  (2, 'Planta 2 - Mantenimiento general'),
  (3, 'Taller central');

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
INSERT INTO catalogo
  (id_catalogo, clave, nombre, tipo, categoria, tipo_seguimiento, tipo_retorno, tallas, limite_por_vale, stock_minimo, costoso)
VALUES
  -- Equipo de alturas: se controla POR PIEZA
  (1,  'ALT-KEV', 'Arnés Kevlar',                 'EPP',         'Trabajo en alturas',    'Individual', 'Devolutivo', NULL, 1, 1, TRUE),
  (2,  'ALT-POL', 'Arnés Poliéster',              'EPP',         'Trabajo en alturas',    'Individual', 'Devolutivo', NULL, 1, 1, TRUE),
  (3,  'ALT-BAN', 'Bandola',                      'EPP',         'Trabajo en alturas',    'Individual', 'Devolutivo', NULL, 1, 1, FALSE),
  (4,  'ALT-GAN', 'Gancho doble de vida',         'EPP',         'Trabajo en alturas',    'Individual', 'Devolutivo', NULL, 1, 1, FALSE),
  -- Herramienta y equipo que se presta y se devuelve
  (5,  'HER-MPU', 'Minipulidor',                  'Herramienta', 'Herramienta eléctrica', 'Granel', 'Devolutivo', NULL, 1, 2, TRUE),
  (6,  'HER-FLX', 'Flexómetro',                   'Herramienta', 'Herramienta manual',    'Granel', 'Devolutivo', NULL, 1, 5, FALSE),
  (7,  'HER-GAS', 'Detector de gases',            'Equipo',      'Medición',              'Granel', 'Devolutivo', NULL, 1, 1, TRUE),
  (8,  'EPP-RET', 'Retráctil 3 mts',              'EPP',         'Trabajo en alturas',    'Granel', 'Devolutivo', NULL, 1, 2, TRUE),
  (9,  'HER-MAR', 'Marro bola',                   'Herramienta', 'Herramienta manual',    'Granel', 'Devolutivo', NULL, 1, 3, FALSE),
  (10, 'HER-CIN', 'Cincel',                       'Herramienta', 'Herramienta manual',    'Granel', 'Devolutivo', NULL, 2, 3, FALSE),
  (11, 'HER-EXT', 'Extensión eléctrica',          'Herramienta', 'Herramienta eléctrica', 'Granel', 'Devolutivo', NULL, 1, 3, FALSE),
  (12, 'HER-REF', 'Reflector o lámpara',          'Herramienta', 'Herramienta eléctrica', 'Granel', 'Devolutivo', NULL, 1, 3, FALSE),
  (13, 'HER-TAL', 'Taladro percutor Bosch',       'Herramienta', 'Herramienta eléctrica', 'Granel', 'Devolutivo', NULL, 1, 1, TRUE),
  (14, 'MED-MUL', 'Multímetro Fluke 117',         'Equipo',      'Medición',              'Granel', 'Devolutivo', NULL, 1, 1, TRUE),
  (15, 'ELE-ESC', 'Escalera telescópica',         'Equipo',      'Elevación',             'Granel', 'Devolutivo', NULL, 1, 1, FALSE),
  -- Se entregan y NO regresan
  (16, 'EPP-PET', 'Peto',                         'EPP',         'Protección personal',   'Granel', 'Consumible', NULL, 1, 10, FALSE),
  (17, 'EPP-POL', 'Polainas',                     'EPP',         'Protección personal',   'Granel', 'Consumible', NULL, 1, 10, FALSE),
  (18, 'EPP-CAS', 'Casco de seguridad',           'EPP',         'Protección personal',   'Granel', 'Consumible', NULL, 1, 10, FALSE),
  (19, 'EPP-LEN', 'Lentes de seguridad',          'EPP',         'Protección personal',   'Granel', 'Consumible', NULL, 1, 10, FALSE),
  (20, 'EPP-GUA', 'Guantes de protección',        'EPP',         'Protección personal',   'Granel', 'Consumible', 'S,M,L,XL', 2, 10, FALSE),
  (21, 'EPP-BOT', 'Botas de seguridad',           'EPP',         'Protección personal',   'Granel', 'Consumible', '25,26,27,28,29,30', 1, 3, FALSE),
  (22, 'EPP-CHA', 'Chaleco de alta visibilidad',  'EPP',         'Protección personal',   'Granel', 'Consumible', 'S,M,L,XL', 1, 5, FALSE),
  (23, 'HER-D9',  'Discos de corte 9"',           'Herramienta', 'Consumibles',           'Granel', 'Consumible', NULL, 5, 20, FALSE),
  (24, 'HER-D45', 'Discos de corte 4 1/2"',       'Herramienta', 'Consumibles',           'Granel', 'Consumible', NULL, 10, 30, FALSE);

-- ---------------------------------------------------------------------
-- Existencias por cantidad (código = clave, o clave-talla)
-- ---------------------------------------------------------------------
INSERT INTO inventario_almacen_conjunto (id_almacen, id_catalogo, codigo, talla, cantidad, danados) VALUES
  -- Colonia de Contratistas (Mittal)
  (1, 5,  'HER-MPU', '', 6, 0),
  (1, 6,  'HER-FLX', '', 20, 0),
  (1, 7,  'HER-GAS', '', 3, 0),
  (1, 8,  'EPP-RET', '', 8, 0),
  (1, 9,  'HER-MAR', '', 10, 0),
  (1, 10, 'HER-CIN', '', 15, 0),
  (1, 11, 'HER-EXT', '', 9, 1),
  (1, 12, 'HER-REF', '', 7, 0),
  (1, 16, 'EPP-PET', '', 25, 0),
  (1, 17, 'EPP-POL', '', 25, 0),
  (1, 18, 'EPP-CAS', '', 40, 0),
  (1, 19, 'EPP-LEN', '', 60, 0),
  (1, 20, 'EPP-GUA-M', 'M', 40, 0),
  (1, 20, 'EPP-GUA-L', 'L', 35, 0),
  (1, 21, 'EPP-BOT-27', '27', 6, 0),
  (1, 21, 'EPP-BOT-28', '28', 2, 0),
  (1, 23, 'HER-D9',  '', 80, 0),
  (1, 24, 'HER-D45', '', 120, 0),
  -- Central Kepler
  (2, 5,  'HER-MPU', '', 4, 0),
  (2, 6,  'HER-FLX', '', 12, 0),
  (2, 7,  'HER-GAS', '', 1, 0),
  (2, 11, 'HER-EXT', '', 5, 0),
  (2, 13, 'HER-TAL', '', 5, 0),
  (2, 14, 'MED-MUL', '', 2, 0),
  (2, 15, 'ELE-ESC', '', 6, 0),
  (2, 16, 'EPP-PET', '', 10, 0),
  (2, 18, 'EPP-CAS', '', 20, 0),
  (2, 20, 'EPP-GUA-S', 'S', 15, 0),
  (2, 20, 'EPP-GUA-M', 'M', 30, 0),
  (2, 22, 'EPP-CHA-L', 'L', 12, 0),
  (2, 24, 'HER-D45', '', 60, 0);

-- ---------------------------------------------------------------------
-- Piezas con código propio (equipo de alturas)
-- ---------------------------------------------------------------------
INSERT INTO inventario_almacen_individual (id_invalmind, id_catalogo, id_almacen, codigo, estatus, ultima_inspeccion) VALUES
  (1,  1, 1, 'ALT-001', 'disponible',    '2026-09-20'),
  (2,  1, 1, 'ALT-002', 'disponible',    '2026-09-20'),
  (3,  1, 1, 'ALT-003', 'dañado',        '2026-08-02'),
  (4,  2, 1, 'ALT-024', 'disponible',    '2026-09-28'),
  (5,  2, 1, 'ALT-025', 'disponible',    '2026-09-28'),
  (6,  3, 1, 'BAN-010', 'disponible',    '2026-09-15'),
  (7,  3, 1, 'BAN-011', 'en reparación', '2026-07-30'),
  (8,  3, 1, 'BAN-012', 'disponible',    '2026-09-15'),
  (9,  4, 1, 'GAN-100', 'disponible',    '2026-09-10'),
  (10, 4, 1, 'GAN-101', 'disponible',    '2026-09-10'),
  (11, 2, 2, 'ALT-030', 'disponible',    '2026-09-25'),
  (12, 2, 2, 'ALT-031', 'disponible',    '2026-09-25'),
  (13, 4, 2, 'GAN-110', 'disponible',    '2026-09-25');

-- ---------------------------------------------------------------------
-- Trabajadores y usuarios
-- ---------------------------------------------------------------------
INSERT INTO trabajadores
  (id_trabajador, num_empleado, nombres, apellido_paterno, apellido_materno, curp, rfc, nss, telefono,
   puesto, area, contrato, supervisor, fecha_ingreso, talla_ropa, talla_calzado,
   doc_identificacion, doc_comprobante_dom, doc_datos_bancarios, doc_contrato_firmado, doc_alta_imss, induccion_seguridad)
VALUES
  (1, 'IMH-00001', 'Juan', 'Pérez', 'García', 'PEGJ900101HNLRRN01', 'PEGJ900101AB1', '12345678901', '8180000001',
   'Técnico mecánico', 'Mantenimiento', 'LC-2026-001', 'Roberto Vega', '2026-09-01', 'M', '27',
   TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
  (2, 'IMH-00002', 'María', 'López', 'Ruiz', 'LORM920315MNLPZR02', 'LORM920315CD2', '12345678902', '8180000002',
   'Soldadora', 'Pailería', 'LC-2026-001', 'Roberto Vega', '2026-09-15', 'S', '24',
   TRUE, TRUE, FALSE, TRUE, FALSE, FALSE);

INSERT INTO usuario (id_usuario, nombre_completo, username, password_hash, rol, id_almacen, id_trabajador) VALUES
  (1, 'Administrador',     'admin',          'scrypt:32768:8:1$BwHq7EUjo5VRHoRj$56aa85ea28df383ee359703977e30ffceaaabcea9c43e66a7a84fd619963b74b28f2d6f2fc28f7d31151c369e305394c03694bb50b3d06d023ea8da5d8cb255c',      'admin',       NULL, NULL),
  (2, 'Recursos Humanos',  'rh',             'scrypt:32768:8:1$yum0qErQbAZ44rpS$a4b978e41a074ca3124dcc44f92c3dbba58f110dd77fbfe580c2c76cc4c159b2a25bd2d7c230038200033d2d0127de8a39fb4e9aadaf8823e0777252040a56cc',         'rh',          NULL, NULL),
  (3, 'Oscar Salas',       'almacen',        'scrypt:32768:8:1$d2u1tLaS9xIhRGiC$2c710e179e245132e0395324f95a7f05d0bf771e20c82292c0a89576ddb9782c80ddee5addfdfd0df2f677f28962a0f89c5de5daf828121fd56e54a4a2bcfe89',    'almacenista', 2,    NULL),
  (4, 'Laura Ríos',        'almacen.mittal', 'scrypt:32768:8:1$4diWN1W2zDdgE6wC$5c2a615172e0f2766c33f7103a96a86ae636cce86624aace4de96725042237128064ae64fde1449575eaaffaffb831fa8d6245f62aa6d9bdfecc02e8b57a8d0f',    'almacenista', 1,    NULL),
  (5, 'Compras',           'compras',        'scrypt:32768:8:1$UTA2avXxsSpYIIty$83e7cca3e3083b04ce6082f1fb3553d461664cf34b9c22571298946c85fe236d4d94e5cc36316fd3c31879ddfdba639adf75b083f65b4c621f7431cb7319426d',    'comprador',   NULL, NULL),
  (6, 'Juan Pérez García', '12345678901',    'scrypt:32768:8:1$9xqpTZjYT0OWnhEJ$235d2d804ee7d6cc49b2f70cdc5bb0032d4944cd141bd1c289261a1682f864939aa931bf7b5779867f5364ab893aa6995a9eb1d231ca998335ce928fa43258ae', 'solicitante', NULL, 1);

-- Inspecciones que respaldan la fecha de ultima_inspeccion de algunas piezas
INSERT INTO inspeccion (id_invalmind, fecha, resultado, id_usuario, notas) VALUES
  (1, '2026-09-20', 'apto',    4, NULL),
  (3, '2026-08-02', 'no apto', 4, 'Costura de la pierna izquierda deshilachada'),
  (7, '2026-07-30', 'no apto', 4, 'Mosquetón con corrosión');

-- ---------------------------------------------------------------------
-- Un préstamo de ejemplo: Juan se llevó un minipulidor y un arnés en Mittal
-- ---------------------------------------------------------------------
INSERT INTO vale (id_vale, folio, tipo, id_almacen, id_trabajador, id_usuario, id_obra, actividad, motivo, fecha, fecha_devolucion) VALUES
  (1, 'V-0001', 'ENTREGA', 1, 1, 4, 1, 'Mantenimiento a banda transportadora', 'Corte de soportes dañados en altura',
   '2026-10-05 08:30:00', '2026-10-12');

INSERT INTO vale_detalle (id_vale, id_catalogo, id_invalmind, talla, cantidad) VALUES
  (1, 5, NULL, '', 1),
  (1, 2, 4,    '', 1),
  (1, 24, NULL, '', 5);

INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, id_trabajador, id_vale, cantidad, id_usuario, fecha) VALUES
  ('ENTREGA', 1, 5,  NULL, 1, 1, 1, 4, '2026-10-05 08:30:00'),
  ('ENTREGA', 1, 2,  4,    1, 1, 1, 4, '2026-10-05 08:30:00'),
  ('ENTREGA', 1, 24, NULL, 1, 1, 5, 4, '2026-10-05 08:30:00');

-- El inventario ya refleja esa salida
UPDATE inventario_almacen_conjunto SET cantidad = cantidad - 1 WHERE id_almacen = 1 AND id_catalogo = 5;
UPDATE inventario_almacen_conjunto SET cantidad = cantidad - 5 WHERE id_almacen = 1 AND id_catalogo = 24;
UPDATE inventario_almacen_individual SET estatus = 'en uso' WHERE id_invalmind = 4;

-- Una solicitud pendiente de María desde su celular
INSERT INTO solicitud (id_solicitud, folio, id_trabajador, id_obra, id_almacen, fecha_devolucion, notas, confirma_induccion) VALUES
  (1, 'VE-2026-0001', 2, 2, 2, '2026-10-15', 'Trabajo en pailería, nave 3', TRUE);

INSERT INTO solicitud_detalle (id_solicitud, id_catalogo, talla, cantidad) VALUES
  (1, 18, '', 1),
  (1, 20, 'S', 2),
  (1, 13, '', 1);

-- ---------------------------------------------------------------------
-- Credencial y cursos
-- ---------------------------------------------------------------------
UPDATE trabajadores SET numero_tarjeta = '10000101', administrador = 'Adriana González', fecha_emision = '2026-09-01', reglas_oro = TRUE, fps_nivel0 = TRUE WHERE id_trabajador = 1;
UPDATE trabajadores SET numero_tarjeta = '10000102', administrador = 'Adriana González', fecha_emision = '2026-09-15' WHERE id_trabajador = 2;

INSERT INTO trabajador_curso (id_trabajador, id_curso, folio, vigencia) VALUES
  (1, 1, '130101', '2027-09-01'),
  (1, 2, '130102', '2027-03-15'),
  (2, 1, '130201', '2027-09-15');

-- Equipo que solo se presta con curso vigente
UPDATE catalogo SET id_curso_requerido = 2 WHERE clave IN ('ALT-KEV', 'ALT-POL', 'ALT-BAN', 'ALT-GAN', 'EPP-RET');
UPDATE catalogo SET id_curso_requerido = 3 WHERE clave = 'HER-GAS';
UPDATE catalogo SET id_curso_requerido = 4 WHERE clave = 'HER-MPU';
