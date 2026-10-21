CREATE DATABASE HelpDeskDB;
GO
USE HelpDeskDB;
GO

CREATE TABLE roles (
    id_rol INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE  -- Cliente, Tecnico, Administrador
);

CREATE TABLE usuarios (
    id_usuario INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,   -- nunca texto plano
    id_rol INT NOT NULL,
    estado VARCHAR(15) NOT NULL DEFAULT 'Activo',  -- Activo / Bloqueado
    intentos_fallidos INT NOT NULL DEFAULT 0,
    fecha_creacion DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_usuarios_roles FOREIGN KEY (id_rol) REFERENCES roles(id_rol)
);

CREATE TABLE bitacora (
    id_bitacora INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NULL,
    accion VARCHAR(60) NOT NULL,   -- LOGIN_OK, LOGIN_FALLIDO, CREAR_TICKET...
    detalle VARCHAR(255) NULL,
    fecha_hora DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_bitacora_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

INSERT INTO roles (nombre) VALUES ('Cliente'), ('Tecnico'), ('Administrador');