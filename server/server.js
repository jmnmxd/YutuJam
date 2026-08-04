const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const { randomUUID } = require('crypto');
require('dotenv').config();

// Import youtube-search-api (opcional - requiere npm install youtube-search-api)
let ytplApi;
try {
  ytplApi = require('youtube-search-api');
  console.log('youtube-search-api cargado correctamente');
} catch (error) {
  console.log('youtube-search-api no disponible. Las funciones de playlist estarán limitadas.');
}

// Función para sanitizar entrada y prevenir XSS
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  
  // Eliminar etiquetas HTML y scripts
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
};

// Función para validar que el contenido sea texto válido
const isValidText = (input) => {
  if (typeof input !== 'string') return false;
  if (input.trim().length === 0) return false;
  if (input.length > 1000) return false; // Limitar longitud
  
  // Verificar que no sea un objeto o array en string
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === 'object') return false;
  } catch (e) {
    // Si no es JSON válido, asumimos que es texto normal
  }
  
  return true;
};

const app = express();
console.log("Servidor cargando archivo correcto");
app.use(helmet());
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Almacenamiento en memoria para las salas
const rooms = {};
const ROOM_EMPTY_TIMEOUT = 10 * 60 * 1000; // 10 minutos en milisegundos

// Intervalo para limpiar salas vacías después de 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Si la sala está vacía y ha pasado el tiempo de espera
    if (room.users.length === 0 && room.emptySince) {
      if (now - room.emptySince > ROOM_EMPTY_TIMEOUT) {
        console.log(`Sala ${roomId} eliminada por inactividad (10 minutos sin usuarios)`);
        delete rooms[roomId];
      }
    }
  }
}, 60000); // Verificar cada minuto

// Generar ID único para salas
const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};
// Ruta para crear una nueva sala
app.post('/api/rooms', (req, res) => {
  console.log("Creando sala...");

  const roomId = generateRoomId();

  rooms[roomId] = {
    users: [],
    currentVideo: null,
    currentTime: 0,
    isPlaying: false,
    playlist: [],
    messages: [],
    createdAt: Date.now(),
    emptySince: null
  };

  res.status(200).json({ roomId });
});

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Unirse a una sala
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    
    console.log(`Usuario ${username} intentando unirse a sala ${roomId}`);
    
    // Sanitizar username
    const sanitizedUsername = sanitizeInput(username);
    
    if (!isValidText(sanitizedUsername)) {
      console.log('Username inválido rechazado');
      return;
    }
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        currentVideo: null,
        currentTime: 0,
        isPlaying: false,
        playlist: [],
        messages: [],
        createdAt: Date.now(),
        emptySince: null
      };
    }

    // Verificar si el usuario ya está en la sala
    const existingUserIndex = rooms[roomId].users.findIndex(u => u.username === sanitizedUsername);
    if (existingUserIndex !== -1) {
      // Actualizar el socket.id del usuario existente
      rooms[roomId].users[existingUserIndex].id = socket.id;
      rooms[roomId].users[existingUserIndex].joinedAt = new Date();
      console.log(`Usuario ${sanitizedUsername} actualizado en sala ${roomId}`);
    } else {
      // Agregar nuevo usuario a la sala
      rooms[roomId].users.push({
        id: socket.id,
        username: sanitizedUsername,
        joinedAt: new Date()
      });
      console.log(`Usuario ${sanitizedUsername} agregado a sala ${roomId}`);
    }

    // Si la sala estaba vacía, eliminar el registro de vacía
    if (rooms[roomId].emptySince) {
      delete rooms[roomId].emptySince;
      console.log(`Sala ${roomId} ya no está vacía, se mantiene activa.`);
    }

    // Notificar a todos en la sala (incluyendo al que se une)
    io.to(roomId).emit('user-joined', {
      username: sanitizedUsername,
      users: rooms[roomId].users
    });

    // Enviar estado actual de la sala al nuevo usuario
    socket.emit('room-state', rooms[roomId]);

    console.log(`Usuario ${sanitizedUsername} se unió a la sala ${roomId}. Total usuarios: ${rooms[roomId].users.length}`);
  });

  // Sincronizar video
  socket.on('sync-video', ({ roomId, videoId, currentTime, isPlaying }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentVideo = videoId;
      rooms[roomId].currentTime = currentTime;
      rooms[roomId].isPlaying = isPlaying;

      socket.to(roomId).emit('video-sync', {
        videoId,
        currentTime,
        isPlaying
      });
    }
  });

  // Cambiar video
 socket.on('change-video', (data) => {

  if (!data || !data.roomId || !data.videoId) {
    return;
  }

  const { roomId, videoId } = data;

  if (rooms[roomId]) {
      rooms[roomId].currentVideo = videoId;
      rooms[roomId].currentTime = 0;
      rooms[roomId].isPlaying = true;

      io.to(roomId).emit('video-changed', {
        videoId,
        currentTime: 0,
        isPlaying: true
      });
    }
  });

  // Pausar/Reproducir
  socket.on('toggle-playback', ({ roomId, isPlaying }) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = isPlaying;
      socket.to(roomId).emit('playback-toggled', { isPlaying });
    }
  });

  // Seek (cambiar tiempo del video)
  socket.on('seek-video', ({ roomId, currentTime }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentTime = currentTime;
      socket.to(roomId).emit('video-seeked', { currentTime });
    }
  });

  // Agregar video a la playlist
  socket.on('add-to-playlist', ({ roomId, video }) => {
    if (rooms[roomId] && video && typeof video === 'object') {
      // Validar y sanitizar datos del video
      const sanitizedVideo = {
        id: sanitizeInput(video.id || ''),
        url: sanitizeInput(video.url || ''),
        title: sanitizeInput(video.title || 'Video sin título'),
        thumbnail: sanitizeInput(video.thumbnail || ''),
        addedBy: sanitizeInput(video.addedBy || 'Unknown')
      };
      
      // Validar que el ID sea válido
      if (!isValidText(sanitizedVideo.id) || sanitizedVideo.id.length !== 11) {
        console.log('Video rechazado: ID inválido');
        return;
      }
      
      rooms[roomId].playlist.push(sanitizedVideo);
      io.to(roomId).emit('playlist-updated', rooms[roomId].playlist);
    }
  });

  // Eliminar video de la playlist
  socket.on('remove-from-playlist', ({ roomId, videoId }) => {
    if (rooms[roomId]) {
      rooms[roomId].playlist = rooms[roomId].playlist.filter(v => v.id !== videoId);
      io.to(roomId).emit('playlist-updated', rooms[roomId].playlist);
    }
  });

  // Enviar mensaje de chat
  socket.on('send-message', (data, callback) => {
    console.log('Mensaje recibido del cliente:', data);
    
    if (!data?.roomId || !data?.username || !data?.message) {
      console.log('Mensaje rechazado: datos incompletos', data);
      if (callback) callback({ success: false, error: 'Datos incompletos' });
      return;
    }

    const { roomId, username, message } = data;

    // Validar y sanitizar el mensaje
    if (!isValidText(message)) {
      console.log('Mensaje rechazado: contenido inválido', message);
      if (callback) callback({ success: false, error: 'Contenido inválido' });
      return;
    }

    const sanitizedMessage = sanitizeInput(message);
    const sanitizedUsername = sanitizeInput(username);

    if (rooms[roomId]) {
      const messageId = randomUUID();
      const messageData = {
        id: messageId,
        username: sanitizedUsername,
        message: sanitizedMessage,
        timestamp: new Date(),
        status: 'pending' // pending, delivered
      };

      rooms[roomId].messages.push(messageData);

      // Máximo 100 mensajes guardados
      if (rooms[roomId].messages.length > 100) {
        rooms[roomId].messages.shift();
      }

      console.log('Mensaje enviado a sala:', roomId, 'Total mensajes:', rooms[roomId].messages.length);
      
      // Enviar mensaje a todos los usuarios con estado pending
      io.to(roomId).emit('new-message', messageData);
      
      // Enviar acknowledgment al cliente
      if (callback) callback({ success: true, messageId });
      
      // Simular que todos los usuarios recibieron el mensaje después de 1 segundo
      setTimeout(() => {
        if (rooms[roomId]) {
          const msgIndex = rooms[roomId].messages.findIndex(m => m.id === messageId);
          if (msgIndex !== -1) {
            rooms[roomId].messages[msgIndex].status = 'delivered';
            io.to(roomId).emit('message-delivered', { messageId });
          }
        }
      }, 1000);
    } else {
      console.log('Mensaje rechazado: sala no existe', roomId);
      if (callback) callback({ success: false, error: 'Sala no existe' });
    }
  });

  // Video terminado - reproducir siguiente y eliminar de playlist
  socket.on('video-ended', ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].playlist.length > 0) {
      const currentVideoId = rooms[roomId].currentVideo;
      
      // Eliminar el video actual de la playlist
      rooms[roomId].playlist = rooms[roomId].playlist.filter(v => v.id !== currentVideoId);
      io.to(roomId).emit('playlist-updated', rooms[roomId].playlist);
      
      // Reproducir siguiente video
      if (rooms[roomId].playlist.length > 0) {
        const nextVideoId = rooms[roomId].playlist[0].id;
        
        rooms[roomId].currentVideo = nextVideoId;
        rooms[roomId].currentTime = 0;
        rooms[roomId].isPlaying = true;
        
        io.to(roomId).emit('video-changed', {
          videoId: nextVideoId,
          currentTime: 0,
          isPlaying: true
        });
      } else {
        // No hay más videos
        rooms[roomId].currentVideo = null;
        rooms[roomId].currentTime = 0;
        rooms[roomId].isPlaying = false;
        
        io.to(roomId).emit('video-changed', {
          videoId: null,
          currentTime: 0,
          isPlaying: false
        });
      }
    }
  });
  // Usuario desconectado
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    
    // Remover usuario de todas las salas
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex(u => u.id === socket.id);
      
      if (userIndex !== -1) {
        const username = room.users[userIndex].username;
        room.users.splice(userIndex, 1);
        
        io.to(roomId).emit('user-left', {
          username,
          users: room.users
        });

        // Registrar cuándo quedó vacía la sala
        if (room.users.length === 0) {
          room.emptySince = Date.now();
          console.log(`Sala ${roomId} quedó vacía. Se eliminará en 10 minutos si no se une nadie.`);
        }
      }
    }
  });
});


// Ruta para verificar si una sala existe
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const exists = !!rooms[roomId];
  res.json({ exists });
});

// Ruta para obtener videos de una playlist de YouTube
app.get('/api/playlist', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Extraer ID de playlist de la URL
    const playlistIdMatch = url.match(/[?&]list=([^&]+)/);
    if (!playlistIdMatch) {
      return res.status(400).json({ error: 'Invalid playlist URL' });
    }
    
    const playlistId = playlistIdMatch[1];
    let videos = [];

    // Intentar usar youtube-search-api si está disponible
    if (ytplApi) {
      try {
        console.log(`Intentando obtener playlist con youtube-search-api: ${playlistId}`);
        const playlistData = await ytplApi.GetPlaylistData(playlistId, Infinity);
        
        videos = playlistData.items.map(item => ({
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail?.url || `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`,
          channel: item.channelTitle || 'Unknown',
          duration: item.lengthSimple || '0:00',
          addedBy: 'System'
        }));
        
        console.log(`Playlist obtenida con youtube-search-api: ${videos.length} videos`);
        return res.json({ videos, title: playlistData.meta.title });
      } catch (apiError) {
        console.log('Error con youtube-search-api, intentando Invidious:', apiError.message);
      }
    }

    // Fallback: Usar Invidious API
    const invidiousInstances = [
      'https://vid.puffyan.us',
      'https://invidious.fdn.fr',
      'https://invidious.perennialte.ch',
      'https://invidious.snopyta.org',
      'https://inv.bp.projectsegfau.lt',
      'https://invidious.io.lol'
    ];

    let lastError = null;
    for (const instance of invidiousInstances) {
      try {
        console.log(`Intentando obtener playlist en: ${instance}`);
        
        const response = await axios.get(`${instance}/api/v1/playlists/${playlistId}`, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.data && response.data.videos) {
          videos = response.data.videos.map(video => ({
            id: video.videoId,
            title: video.title,
            thumbnail: video.videoThumbnails?.[4]?.url || 
                      video.videoThumbnails?.[0]?.url || 
                      `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
            channel: video.author,
            duration: video.lengthSeconds,
            addedBy: 'System'
          }));
          
          console.log(`Playlist obtenida en ${instance}: ${videos.length} videos encontrados`);
          return res.json({ videos, title: response.data.title });
        }
      } catch (error) {
        console.log(`Error con ${instance}:`, error.message);
        lastError = error;
        continue;
      }
    }

    // Si todo falla
    console.log('No se pudo obtener la playlist');
    res.status(500).json({ 
      error: 'No se pudo obtener la playlist. Inténtalo de nuevo más tarde.',
      details: lastError?.message 
    });

  } catch (error) {
    console.error('Error al obtener playlist:', error.message);
    res.status(500).json({ error: 'Error al obtener playlist' });
  }
});

// Ruta para buscar videos en YouTube usando Invidious API (gratuito y sin API key)
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    // Lista de instancias públicas de Invidious (alternativa gratuita a YouTube API)
    const invidiousInstances = [
      'https://vid.puffyan.us',
      'https://invidious.fdn.fr',
      'https://invidious.perennialte.ch',
      'https://invidious.snopyta.org',
      'https://inv.bp.projectsegfau.lt',
      'https://invidious.io.lol'
    ];

    let videos = [];
    let lastError = null;

    // Intentar con cada instancia hasta encontrar una que funcione
    for (const instance of invidiousInstances) {
      try {
        console.log(`Intentando buscar en: ${instance}`);
        
        const response = await axios.get(`${instance}/api/v1/search`, {
          params: {
            q: q,
            type: 'video',
            field: 'title'
          },
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.data && response.data.length > 0) {
          videos = response.data.slice(0, 10).map(video => ({
            id: video.videoId,
            title: video.title,
            thumbnail: video.videoThumbnails?.[4]?.url || 
                      video.videoThumbnails?.[0]?.url || 
                      `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
            channel: video.author,
            channelUrl: video.authorUrl,
            duration: video.lengthSeconds,
            views: video.viewCount,
            published: video.publishedText
          }));
          
          console.log(`Búsqueda exitosa en ${instance}: ${videos.length} videos encontrados`);
          break;
        }
      } catch (error) {
        console.log(`Error con ${instance}:`, error.message);
        lastError = error;
        continue;
      }
    }

    // Si todas las instancias fallan, usar videos de fallback
    if (videos.length === 0) {
      console.log('Todas las instancias fallaron, usando videos de fallback');
      videos = getFallbackVideos(q);
    }

    res.json({ videos });
  } catch (error) {
    console.error('Error en búsqueda:', error.message);
    // En caso de error general, usar videos de fallback
    const fallbackVideos = getFallbackVideos(req.query.q);
    res.json({ videos: fallbackVideos });
  }
});

// Videos de fallback si las APIs fallan
function getFallbackVideos(query) {
  const fallbackVideos = [
    {
      id: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      channel: 'Rick Astley',
      duration: 213
    },
    {
      id: 'jNQXAC9IVRw',
      title: 'Me at the zoo - Primer video de YouTube',
      thumbnail: 'https://img.youtube.com/vi/jNQXAC9IVRw/mqdefault.jpg',
      channel: 'jawed',
      duration: 19
    },
    {
      id: '9bZkp7q19f0',
      title: 'PSY - Gangnam Style',
      thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg',
      channel: 'PSY',
      duration: 252
    },
    {
      id: 'kJQP7kiw5Fk',
      title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
      thumbnail: 'https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg',
      channel: 'Luis Fonsi',
      duration: 279
    },
    {
      id: 'RgKAFK5djSk',
      title: 'Ed Sheeran - Shape of You',
      thumbnail: 'https://img.youtube.com/vi/RgKAFK5djSk/mqdefault.jpg',
      channel: 'Ed Sheeran',
      duration: 234
    }
  ];

  // Filtrar por query si es posible
  if (query) {
    const filtered = fallbackVideos.filter(v => 
      v.title.toLowerCase().includes(query.toLowerCase()) ||
      v.channel.toLowerCase().includes(query.toLowerCase())
    );
    return filtered.length > 0 ? filtered : fallbackVideos;
  }

  return fallbackVideos;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
