# YutuJam 🎵

Aplicación web para ver videos de YouTube con amigos en tiempo real.

## Características

- 🔐 Autenticación simple con nombre de usuario
- 🏠 Sistema de salas (crear o unirse con código)
- 📹 Reproducción sincronizada de videos de YouTube
- 🔍 **Buscador integrado de YouTube** - No necesitas pegar URLs
- 📋 Lista de reproducción compartida
- 💬 Chat de texto en tiempo real
- ▶️ Controles básicos de YouTube (play/pause, seek)
- ⛶ **Modo pantalla completa**
- 📋 **Botón para compartir sala**
- 👥 Vista de usuarios en la sala

## Tecnologías

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Tiempo real**: Socket.io
- **YouTube**: YouTube IFrame API (react-youtube)

## Instalación

### Requisitos previos
- Node.js (v14 o superior)
- npm

### Pasos

1. Clonar o descargar el proyecto

2. Instalar dependencias del servidor:
```bash
cd server
npm install
```

3. Instalar dependencias del cliente:
```bash
cd client
npm install
```

## Uso

### Iniciar el servidor

En una terminal:
```bash
cd server
npm start
```

El servidor se iniciará en `http://localhost:3001`

### Iniciar el cliente

En otra terminal:
```bash
cd client
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Cómo usar

1. **Login**: Ingresa tu nombre de usuario
2. **Crear sala**: Haz clic en "Crear Sala" para obtener un código de sala
3. **Unirse a sala**: Ingresa el código de una sala existente y haz clic en "Unirse"
4. **Buscar videos**: Usa el buscador integrado para encontrar videos sin necesidad de URLs
5. **Agregar videos**: Haz clic en "+ Agregar" en los resultados de búsqueda
6. **Reproducir**: Haz clic en un video de la lista para reproducirlo
7. **Chat**: Usa el chat para comunicarte con otros usuarios en la sala
8. **Controles**: 
   - Play/Pause
   - Avanzar/Retroceder 10 segundos
   - Pantalla completa
9. **Compartir**: Usa el botón "📋 Compartir" para copiar el código de sala

## Sincronización

La aplicación sincroniza automáticamente:
- El video actual
- El tiempo de reproducción
- El estado de play/pause
- La lista de reproducción
- Los mensajes del chat

Cuando un usuario realiza una acción, todos los demás usuarios en la sala verán los cambios en tiempo real.

## Estructura del proyecto

```
youtube-party/
├── server/
│   ├── server.js          # Servidor Express + Socket.io
│   ├── package.json
│   └── .env
├── client/
│   ├── src/
│   │   ├── App.jsx         # Componente principal
│   │   ├── main.jsx        # Punto de entrada
│   │   └── index.css       # Estilos
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Notas

- La aplicación usa almacenamiento en memoria para las salas. Si reinicias el servidor, se perderán todas las salas activas.
- Para producción, considera usar una base de datos para persistencia.
- La autenticación es básica (solo nombre de usuario). Para producción, implementa un sistema de autenticación real.
- El buscador usa videos populares de demostración. Para una búsqueda real de YouTube, necesitarías configurar la YouTube Data API.
