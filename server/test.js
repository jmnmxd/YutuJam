console.log('Iniciando prueba...');
console.log('Node.js version:', process.version);

try {
  const express = require('express');
  console.log('Express cargado correctamente');
  
  const http = require('http');
  console.log('HTTP cargado correctamente');
  
  const { Server } = require('socket.io');
  console.log('Socket.io cargado correctamente');
  
  const cors = require('cors');
  console.log('CORS cargado correctamente');
  
  console.log('Todas las dependencias están instaladas correctamente');
} catch (error) {
  console.error('Error cargando dependencias:', error.message);
  process.exit(1);
}
