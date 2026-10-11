-- =====================================================================
-- migraciones.sql
-- Cambios para BDs que ya existían antes de cada versión. crear_bd.py lo
-- corre siempre después de inventarios.sql: todo aquí se puede repetir
-- sin dañar nada (MODIFY deja la columna igual si ya estaba así).
-- =====================================================================

-- 2026-10-11 · Estado "en mantenimiento" para las piezas y rol "supervisor"
ALTER TABLE inventario_almacen_individual
    MODIFY estatus ENUM('disponible', 'en uso', 'dañado', 'en reparación', 'en mantenimiento', 'baja')
    NOT NULL DEFAULT 'disponible';

ALTER TABLE usuario
    MODIFY rol ENUM('admin', 'rh', 'almacenista', 'comprador', 'supervisor', 'solicitante') NOT NULL;
