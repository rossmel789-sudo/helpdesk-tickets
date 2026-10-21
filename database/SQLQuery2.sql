USE HelpDeskDB;
GO

DELETE FROM bitacora;
DELETE FROM rol_permiso;
DELETE FROM usuarios;
DBCC CHECKIDENT ('bitacora', RESEED, 0);
DBCC CHECKIDENT ('usuarios', RESEED, 0);
GO

-- Volver a insertar los permisos por rol (se habían borrado)
INSERT INTO rol_permiso VALUES (1,1), (1,2), (1,6);
INSERT INTO rol_permiso VALUES (2,1), (2,2), (2,3), (2,5), (2,6);
INSERT INTO rol_permiso
SELECT 3, id_permiso FROM permisos;
GO

SELECT * FROM usuarios;
SELECT * FROM bitacora;