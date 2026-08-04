import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import YouTube from 'react-youtube';

// Función para escapar HTML y prevenir XSS en el cliente
const escapeHtml = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const socket = io('https://yutujam.onrender.com', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000
});

function App() {
  const [view, setView] = useState('login'); // login, lobby, room
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [users, setUsers] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [player, setPlayer] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [messageStatus, setMessageStatus] = useState({});
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [pendingMessages, setPendingMessages] = useState([]);

  const chatEndRef = useRef(null);

  // Función para mostrar notificaciones
  const showNotification = (message, type = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Efecto para auto-scroll en el chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Manejar login
  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      setView('lobby');
    }
  };

  // Crear sala
  const handleCreateRoom = async () => {
    try {
      const response = await fetch('https://yutujam.onrender.com/api/rooms', {
        method: 'POST'
      });
      const data = await response.json();
      setRoomId(data.roomId);
      socket.emit('join-room', { roomId: data.roomId, username });
      setView('room');
    } catch (error) {
      console.error('Error al crear sala:', error);
    }
  };

  // Unirse a sala
  const handleJoinRoom = () => {
    if (joinRoomId.trim()) {
      setRoomId(joinRoomId.toUpperCase());
      socket.emit('join-room', { roomId: joinRoomId.toUpperCase(), username });
      setView('room');
    }
  };

  // Socket events
  useEffect(() => {
    // Manejo de conexión
    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
      console.log('Conectado al servidor');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Desconectado del servidor');
    });

    socket.on('connect_error', (error) => {
      setIsConnected(false);
      setConnectionError(error.message);
      showNotification('Error de conexión: ' + error.message, 'error');
      console.error('Error de conexión:', error);
    });

    socket.on('user-joined', ({ username: newUsername, users: newUsers }) => {
      setUsers(newUsers);
    });

    socket.on('user-left', ({ username: leftUsername, users: newUsers }) => {
      setUsers(newUsers);
    });

    socket.on('room-state', (state) => {
      setCurrentVideo(state.currentVideo);
      setCurrentTime(state.currentTime);
      setIsPlaying(state.isPlaying);
      setPlaylist(state.playlist || []);
      setMessages(state.messages || []);
    });

    socket.on('video-sync', ({ videoId, currentTime: newTime, isPlaying: newPlaying }) => {
      if (!isSyncing) {
        setCurrentVideo(videoId);
        setCurrentTime(newTime);
        setIsPlaying(newPlaying);
        
        if (player && videoId) {
          setIsSyncing(true);
          player.loadVideoById(videoId, newTime);
          if (newPlaying) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
          setTimeout(() => setIsSyncing(false), 500);
        }
      }
    });

    socket.on('video-changed', ({ videoId, currentTime: newTime, isPlaying: newPlaying }) => {
      setCurrentVideo(videoId);
      setCurrentTime(newTime);
      setIsPlaying(newPlaying);
      
      if (player && videoId) {
        player.loadVideoById(videoId, newTime);
        if (newPlaying) {
          player.playVideo();
        }
      }
    });

    socket.on('playback-toggled', ({ isPlaying: newPlaying }) => {
      setIsPlaying(newPlaying);
      if (player) {
        if (newPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      }
    });

    socket.on('video-seeked', ({ currentTime: newTime }) => {
      setCurrentTime(newTime);
      if (player) {
        player.seekTo(newTime, true);
      }
    });

    socket.on('playlist-updated', (newPlaylist) => {
      setPlaylist(newPlaylist);
    });

    socket.on('new-message', (messageData) => {
      setMessages(prev => [...prev, messageData]);
    });

    socket.on('message-delivered', ({ messageId }) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'delivered' } : msg
      ));
    });

    socket.on('play-next-video', ({ videoId }) => {
      handlePlayVideo(videoId);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('room-state');
      socket.off('video-sync');
      socket.off('video-changed');
      socket.off('playback-toggled');
      socket.off('video-seeked');
      socket.off('playlist-updated');
      socket.off('new-message');
      socket.off('play-next-video');
      socket.off('message-delivered');
    };
  }, [player, isSyncing]);

  // YouTube player ready
  const onPlayerReady = (event) => {
    setPlayer(event.target);
    if (currentVideo) {
      event.target.loadVideoById(currentVideo, currentTime);
      if (!isPlaying) {
        event.target.pauseVideo();
      }
    }
  };

  // YouTube player state change
  const onPlayerStateChange = (event) => {
    const playerState = event.data;
    const newIsPlaying = playerState === 1; // YT.PlayerState.PLAYING
    const videoEnded = playerState === 0; // YT.PlayerState.ENDED
    
    if (newIsPlaying !== isPlaying && !isSyncing) {
      setIsPlaying(newIsPlaying);
      socket.emit('toggle-playback', { roomId, isPlaying: newIsPlaying });
    }
    
    // Reproducir siguiente video cuando el actual termine (sincronizado)
    if (videoEnded && !isSyncing) {
      socket.emit('video-ended', { roomId });
    }
  };

  // Sync video progress
  useEffect(() => {
    const interval = setInterval(() => {
      if (player && isPlaying && !isSyncing) {
        const currentTime = player.getCurrentTime();
        setCurrentTime(currentTime);
        
        // Sync every 5 seconds
        if (Math.floor(currentTime) % 5 === 0) {
          socket.emit('sync-video', {
            roomId,
            videoId: currentVideo,
            currentTime,
            isPlaying
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [player, isPlaying, currentVideo, roomId, isSyncing]);

  // Agregar video a playlist
  const handleAddVideo = (e) => {
    e.preventDefault();
    if (videoUrl.trim()) {
      const videoId = extractVideoId(videoUrl);
      if (videoId) {
        const video = {
          id: videoId,
          url: videoUrl,
          title: `Video ${videoId}`,
          thumbnail: `https://img.youtube.com/vi/${videoId}/default.jpg`,
          addedBy: username
        };
        socket.emit('add-to-playlist', { roomId, video });
        setVideoUrl('');
        
        // Si no hay video actual, reproducir este
        if (!currentVideo) {
          handlePlayVideo(videoId);
        }
      }
    }
  };

  // Extraer ID de video de URL de YouTube
  const extractVideoId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Buscar videos en YouTube (abre YouTube directamente)
  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
      window.open(youtubeSearchUrl, '_blank');
    }
  };

  // Reproducir siguiente video automáticamente
  const playNextVideo = () => {
    if (playlist.length > 0) {
      const currentIndex = playlist.findIndex(v => v.id === currentVideo);
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < playlist.length) {
        const nextVideo = playlist[nextIndex];
        handlePlayVideo(nextVideo.id);
      } else {
        // Si es el último, volver al primero
        const firstVideo = playlist[0];
        handlePlayVideo(firstVideo.id);
      }
    }
  };

  // Reproducir video de playlist
  const handlePlayVideo = (videoId) => {
    socket.emit('change-video', { roomId, videoId });
  };

  // Eliminar video de playlist
  const handleRemoveVideo = (videoId) => {
    socket.emit('remove-from-playlist', { roomId, videoId });
  };

  // Enviar mensaje
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    // Validaciones adicionales en el cliente
    if (!newMessage.trim()) {
      showNotification('Error: el mensaje no puede estar vacío', 'error');
      return;
    }
    
    if (newMessage.length > 1000) {
      showNotification('Error: el mensaje es demasiado largo (máximo 1000 caracteres)', 'error');
      return;
    }
    
    if (!roomId) {
      showNotification('Error: no estás en una sala', 'error');
      return;
    }
    
    // Verificar que no sea un objeto/array intentando ser enviado como string
    try {
      const parsed = JSON.parse(newMessage);
      if (typeof parsed === 'object') {
        showNotification('Error: no se pueden enviar objetos o archivos', 'error');
        return;
      }
    } catch (e) {
      // Si no es JSON válido, asumimos que es texto normal - esto es correcto
    }
    
    const messageText = newMessage;
    
    console.log('Enviando mensaje:', { roomId, username, message: messageText });
    
    // Marcar como enviando (rojo)
    setIsSendingMessage(true);
    
    socket.emit('send-message', { roomId, username, message: messageText }, (ack) => {
      if (ack && ack.success) {
        // Marcar como entregado (verde)
        setIsSendingMessage(false);
        console.log('Mensaje entregado correctamente');
        showNotification('Mensaje enviado', 'success');
      } else {
        // Marcar como error
        setIsSendingMessage(false);
        console.log('Error al entregar mensaje:', ack?.error);
        showNotification('Error al enviar mensaje: ' + (ack?.error || 'Desconocido'), 'error');
      }
    });
    
    setNewMessage('');
  };

  // Controles de video
  const handlePlayPause = () => {
    if (player) {
      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    }
  };

  const handleSeek = (seconds) => {
    if (player) {
      const newTime = player.getCurrentTime() + seconds;
      player.seekTo(newTime, true);
      socket.emit('seek-video', { roomId, currentTime: newTime });
    }
  };

  // YouTube player options
  const opts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0
    }
  };

  // Vista de Login
  if (view === 'login') {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>🎵 YutuJam</h1>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Tu nombre de usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <button type="submit">Iniciar Sesión</button>
          </form>
        </div>
      </div>
    );
  }

  // Vista de Lobby
  if (view === 'lobby') {
    return (
      <div className="lobby-container">
        <div className="lobby-box">
          <h1>🎵 YutuJam</h1>
          <div className="user-info">
            <p>Conectado como: <strong>{username}</strong></p>
          </div>
          <div className="buttons">
            <button className="create-btn" onClick={handleCreateRoom}>
              Crear Sala
            </button>
          </div>
          <p style={{ textAlign: 'center', marginBottom: '15px' }}>o</p>
          <input
            type="text"
            placeholder="Código de sala"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            maxLength={6}
          />
          <button className="join-btn" onClick={handleJoinRoom}>
            Unirse a Sala
          </button>
        </div>
      </div>
    );
  }

  // Compartir sala
  const handleShareRoom = () => {
    const shareText = `Únete a mi sala de YutuJam! Código: ${roomId}`;
    if (navigator.share) {
      navigator.share({
        title: 'YutuJam',
        text: shareText
      });
    } else {
      navigator.clipboard.writeText(roomId);
      alert('Código de sala copiado al portapapeles: ' + roomId);
    }
  };

  // Vista de Sala
  return (
    <div className="room-container">
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      <div className="room-header">
        <h2>🎵 YutuJam</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
          </div>
          <div className="room-id">{roomId}</div>
          <button onClick={handleShareRoom} className="share-btn">
            📋 Compartir
          </button>
        </div>
      </div>
      
      <div className="room-content">
        <div className="video-section">
          <div className="video-container">
            {currentVideo ? (
              <YouTube
                videoId={currentVideo}
                opts={opts}
                onReady={onPlayerReady}
                onStateChange={onPlayerStateChange}
              />
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '1.2rem'
              }}>
                Agrega un video para comenzar
              </div>
            )}
          </div>
          
          <div className="video-controls">
            <button onClick={handlePlayPause} className={isPlaying ? 'active' : ''}>
              {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
            </button>
            <button onClick={() => handleSeek(-10)}>⏪ -10s</button>
            <button onClick={() => handleSeek(10)}>+10s ⏩</button>
          </div>
          
          <div className="playlist-section">
            <h3>Lista de Reproducción</h3>
            
            <form className="search-form" onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="🔍 Buscar en YouTube (abre nueva pestaña)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit">🔍 Buscar</button>
            </form>
            
            <form className="add-video-form" onSubmit={handleAddVideo}>
              <input
                type="text"
                placeholder="O pega URL de YouTube"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <button type="submit">Agregar</button>
            </form>
            
            <div className="playlist-items">
              {playlist.map((video) => (
                <div
                  key={video.id}
                  className={`playlist-item ${currentVideo === video.id ? 'playing' : ''}`}
                  onClick={() => handlePlayVideo(video.id)}
                >
                  <img src={video.thumbnail} alt={video.title} />
                  <div className="playlist-item-info">
                    <h4>{video.title}</h4>
                    <p>Agregado por: {video.addedBy}</p>
                  </div>
                  <button
                    className="playlist-item-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveVideo(video.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {playlist.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                  No hay videos en la lista
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="sidebar">
          <div className="users-section">
            <h3>Usuarios en la sala ({users.length})</h3>
            <div className="users-list">
              {users.map((user) => (
                <div key={user.id} className="user-item">
                  <div className="user-item-avatar">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-item-name">
                    {user.username}
                    {user.username === username && ' (Tú)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="chat-section">
            <h3>Chat</h3>
            <div className="chat-messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-message ${msg.username === username ? 'own' : ''} ${msg.status || 'delivered'}`}
                >
                  <div className="chat-message-header">
                    <span>{escapeHtml(msg.username)}</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="chat-message-text">{escapeHtml(msg.message)}</div>
                  {msg.status === 'pending' && (
                    <div className="message-status">🔴 Enviando...</div>
                  )}
                  {msg.status === 'delivered' && (
                    <div className="message-status">🟢 Entregado</div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={handleSendMessage}>
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className={isSendingMessage ? 'sending' : ''}
              />
              <button 
                type="submit"
                className={isSendingMessage ? 'sending' : ''}
              >
                {isSendingMessage ? '🔴 Enviando...' : 'Enviar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
