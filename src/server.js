const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Game constants
const GAME_WIDTH = 300;
const TOWER_HEIGHT = 10000; // Very tall to simulate "infinite"
const PLATFORM_GAP = 40; // Reduced from 60 to 40
const PLATFORM_WIDTH_MIN = 30;
const PLATFORM_WIDTH_MAX = 180;
const PLATFORM_VERY_LONG_CHANCE = 0.05; // 5% chance for long platforms
const PLATFORM_SKIP_CHANCE = 0.15; // Reduced skip chance from 0.3 to 0.15
const SPECIAL_PLATFORM_CHANCE = 0.15; // 15% chance of a special platform with a number
const SPIKE_PLATFORM_CHANCE = 0.1; // 10% chance for platforms above 50 to have spikes
const SPIKE_STUN_DURATION = 2000; // 2 seconds stun duration for spike platforms
const JUMP_HEIGHT = 50;
const WALL_BOUNCE_BOOST = 0.3; // 30% speed increase
const LAVA_INITIAL_HEIGHT = -150; // Lower the lava start position to prevent instant death
const LAVA_SPEED = 0.4; // Slowed down from 0.5 to give players more time
const ROUND_COUNTDOWN = 5; // Seconds between rounds
const WINNER_HEIGHT = 200000; // Height to reach to win the round

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Game state
let players = {};
let platforms = [];
let lavaHeight = LAVA_INITIAL_HEIGHT;
let gameState = {
  status: 'playing', // playing, countdown
  countdown: 0,
  roundNumber: 1,
  winner: null
};

// Initialize game
initializeGame();

function initializeGame() {
  generatePlatforms();
  lavaHeight = LAVA_INITIAL_HEIGHT;
  gameState = {
    status: 'playing',
    countdown: 0,
    roundNumber: gameState.roundNumber || 1,
    winner: null
  };
  
  // Reset all players (but don't remove them)
  Object.keys(players).forEach(id => {
    players[id].x = GAME_WIDTH / 2;
    players[id].y = PLATFORM_GAP;
    players[id].vx = 0;
    players[id].vy = 0;
    players[id].score = 0;
    players[id].isJumping = false;
    players[id].isDead = false;
  });
  
  // Broadcast game state to all players
  io.emit('gameReset', {
    platforms: platforms,
    lavaHeight: lavaHeight,
    gameState: gameState
  });
}

// Generate platforms
function generatePlatforms() {
  platforms = [];
  const numPlatforms = Math.floor(TOWER_HEIGHT / PLATFORM_GAP);
  
  // Add floor platform
  platforms.push({
    x: 0,
    y: 0, // Bottom platform
    width: GAME_WIDTH,
    points: 0,
    type: 'normal'
  });
  
  // Generate random platforms going up
  let lastY = 0;
  for (let i = 1; i < numPlatforms; i++) {
    // Sometimes skip a platform to create more challenging jumps
    if (i > 5 && Math.random() < PLATFORM_SKIP_CHANCE) {
      continue;
    }
    
    // Determine platform width with occasional very long platforms
    let width;
    if (Math.random() < PLATFORM_VERY_LONG_CHANCE) {
      width = Math.floor(Math.random() * (PLATFORM_WIDTH_MAX - 100)) + 100; // Long platform
    } else {
      // More varied platform widths with bias toward medium platforms
      width = Math.floor(PLATFORM_WIDTH_MIN + Math.random() * (PLATFORM_WIDTH_MAX - PLATFORM_WIDTH_MIN));
    }
    
    // Determine position with more randomness
    // The higher we go, the more to the sides platforms can be
    const maxOffset = Math.min(GAME_WIDTH - width, Math.floor(i / 10) * 20);
    
    // Ensure platforms aren't stuck to the walls by using better distribution
    const minOffset = 15; // Minimum offset from the left wall
    const availableWidth = GAME_WIDTH - width - minOffset * 2; // Available space minus margins
    const x = Math.floor(Math.random() * availableWidth) + minOffset; // Random position with margin
    
    // Add some variation to Y positions too but keep gaps manageable
    const yVariation = Math.floor(Math.random() * (PLATFORM_GAP / 5));
    const y = i * PLATFORM_GAP + yVariation;
    lastY = y;
    
    // Determine platform type
    let type = 'normal';
    let points = 10; // Base points for normal platforms
    
    // Special numbered platforms
    if (Math.random() < SPECIAL_PLATFORM_CHANCE) {
      // Always use score of 1 for platforms as requested
      points = 1;
      type = 'numbered';
    }
    
    // Spike platforms (only for platforms after a certain height)
    let hasSpikes = false;
    let spikeWidth = 0;
    let spikeOffset = 0;
    
    if (i > 10 && Math.random() < SPIKE_PLATFORM_CHANCE) {
      hasSpikes = true;
      type = 'spikes';
      
      // For spike platforms, only put spikes on a portion of the platform
      // The higher up, the more spikes (as a percentage of platform width)
      const heightFactor = Math.min(0.8, i / numPlatforms * 0.8 + 0.2); // 20% to 80% of platform width has spikes
      spikeWidth = Math.floor(width * heightFactor);
      
      // Place spikes randomly on the platform
      spikeOffset = Math.floor(Math.random() * (width - spikeWidth));
    }
    
    platforms.push({ 
      x, 
      y, 
      width, 
      points,
      type,
      hasSpikes,
      spikeWidth: spikeWidth,
      spikeOffset: spikeOffset,
      number: type === 'numbered' ? 1 : null // Display "1" on numbered platforms
    });
  }
  
  return platforms;
}

// Game update loop
const gameLoop = setInterval(() => {
  // Update lava position
  if (gameState.status === 'playing') {
    lavaHeight += LAVA_SPEED;
    
    // Check for players in lava
    Object.keys(players).forEach(id => {
      const player = players[id];
      if (!player.isDead && player.y <= lavaHeight) {
        player.isDead = true;
        io.emit('playerDied', id);
      }
    });
    
    // Check if all players are dead
    const allDead = Object.keys(players).length > 0 && 
                    Object.values(players).every(p => p.isDead);
    
    // Check if anyone has reached the top
    let winner = null;
    Object.keys(players).forEach(id => {
      if (!players[id].isDead && players[id].y >= WINNER_HEIGHT) {
        winner = id;
      }
    });
    
    if (winner) {
      gameState.status = 'countdown';
      gameState.countdown = ROUND_COUNTDOWN;
      gameState.winner = winner;
      io.emit('roundWinner', {winner: winner, nextRound: gameState.roundNumber + 1});
    } else if (allDead) {
      gameState.status = 'countdown';
      gameState.countdown = ROUND_COUNTDOWN;
      gameState.winner = null;
      io.emit('roundOver', {nextRound: gameState.roundNumber + 1});
    }
  } else if (gameState.status === 'countdown') {
    gameState.countdown -= 0.1;
    
    if (gameState.countdown <= 0) {
      gameState.roundNumber++;
      initializeGame();
    }
  }
  
  // Broadcast lava position and game state
  io.emit('gameUpdate', {
    lavaHeight: lavaHeight,
    gameState: gameState
  });
}, 100);

// Socket connection
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);
  
  // Create new player
  players[socket.id] = {
    id: socket.id,
    x: GAME_WIDTH / 2,
    y: PLATFORM_GAP + 20, // Place player a bit higher to prevent instant death
    vx: 0,
    vy: 0,
    score: 0,
    isJumping: false,
    isDead: false,
    isStunned: false,
    stunEndTime: 0,
    color: 'red'
  };
  
  // Send current game state to new player
  socket.emit('gameInit', {
    id: socket.id,
    players: players,
    platforms: platforms,
    gameWidth: GAME_WIDTH,
    gameHeight: TOWER_HEIGHT,
    lavaHeight: lavaHeight,
    gameState: gameState,
    constants: {
      platformGap: PLATFORM_GAP,
      spikeStunDuration: SPIKE_STUN_DURATION,
      lavaSpeed: LAVA_SPEED
    }
  });
  
  // Broadcast new player to others
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Handle player movement
  socket.on('playerMove', (data) => {
    const player = players[socket.id];
    if (player && !player.isDead) {
      player.x = data.x;
      player.y = data.y;
      player.vx = data.vx;
      player.vy = data.vy;
      player.isJumping = data.isJumping;
      player.isStunned = data.isStunned;
      player.stunEndTime = data.stunEndTime;
      
      // Update score based on velocity rather than just height
      // Reward diagonal movement (combination of horizontal and vertical speed)
      const velocityMagnitude = Math.sqrt(data.vx * data.vx + data.vy * data.vy);
      const velocityScore = Math.floor(velocityMagnitude * 0.5);
      
      player.score += velocityScore;
      player.score = Math.max(player.score, data.score); // Ensure score never decreases
      
      // Check win condition
      if (player.y >= WINNER_HEIGHT && gameState.status === 'playing') {
        gameState.status = 'countdown';
        gameState.countdown = ROUND_COUNTDOWN;
        gameState.winner = socket.id;
        io.emit('roundWinner', {winner: socket.id, nextRound: gameState.roundNumber + 1});
      }
      
      // Broadcast updated player state
      io.emit('playerUpdate', player);
    }
  });
  
  // Handle stun event
  socket.on('playerStunned', () => {
    const player = players[socket.id];
    if (player && !player.isDead) {
      player.isStunned = true;
      player.stunEndTime = Date.now() + SPIKE_STUN_DURATION;
      
      io.emit('playerUpdate', player);
      
      // Schedule a stun end
      setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].isStunned = false;
          io.emit('playerUpdate', players[socket.id]);
        }
      }, SPIKE_STUN_DURATION);
    }
  });
  
  // Handle spectate request
  socket.on('spectate', (targetId) => {
    if (players[targetId] && !players[targetId].isDead) {
      socket.emit('spectatePlayer', targetId);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    
    // Check if all players are gone
    if (Object.keys(players).length === 0) {
      // Reset game if everyone left
      lavaHeight = LAVA_INITIAL_HEIGHT;
      gameState.status = 'playing';
    }
  });
});

const PORT = process.env.PORT || 4245;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 