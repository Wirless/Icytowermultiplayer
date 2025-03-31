// Connect to the server
const socket = io();

// Game canvas setup
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const playersInfo = document.getElementById('players-info');

// Game state
let gameWidth = 300;
let gameHeight = 600; // Visible height
let playerId;
let players = {};
let platforms = [];
let cameraY = 0;
let lastTime = 0;
let keys = {};
let lavaHeight = 0;
let gameState = {
  status: 'playing',
  countdown: 0,
  roundNumber: 1,
  winner: null
};
let spectatingId = null;
let lastJumpTime = 0;
let bounceCount = 0;
let lastWallBounceTime = 0;
let platformGap = 60; // Will be updated from server
let spikeStunDuration = 2000; // Will be updated from server
let lavaSpeed = 0.4; // Default lava speed, will be updated from server
let isLavaLampMode = false; // Flag for lava lamp mode
let mousePosX = gameWidth / 2;
let mousePosY = gameHeight / 2;
let lavaParticles = []; // Particles for lava lamp effect

// Game constants
const GRAVITY = -0.2; // Inverted gravity to make player go up
const PLAYER_SIZE = 20;
const PLAYER_SPEED = 26; // Increased player movement speed
const JUMP_VELOCITY = 12; // Increased base jump to account for larger platform gaps
const FRICTION = 0.92; // Reduced friction to maintain momentum
const ICE_FRICTION = 0.98; // Even less friction on platforms
const WALL_BOUNCE_BOOST = 1.5; // Massively increased from 0.7 to 1.5 for more intense sideways bouncing
const WALL_BOUNCE_COOLDOWN = 300; // Reduced for more frequent bounces
const MULTI_JUMP_COOLDOWN = 1000; // ms cooldown between jumps
const MAX_BOUNCE_COUNT = 3; // Increased from 2 to 3 consecutive boosted bounces
const MAX_WALL_BOUNCE_SPEED = 45; // Increased dramatically for extreme diagonal movement
const PLATFORM_COLOR = 'blue';
const NUMBERED_PLATFORM_COLOR = 'orange';
const SPIKE_PLATFORM_COLOR = 'gray';
const WALL_COLOR = 'green';
const VELOCITY_JUMP_BOOST = 1.2; // Boosted to emphasize diagonal jumps
const DIAGONAL_MOVEMENT_BONUS = 1.5; // Bonus for moving diagonally
const HORIZONTAL_JUMP_PRESERVE = 1.2; // Increased to preserve more horizontal momentum while jumping
const LAVA_GRADIENT_STOPS = ['#ff4500', '#ff6a00', '#ff8c00', '#ffb700']; // Lava gradient colors
const RENDER_BELOW_GAME = 200; // Increased from 150 to 200 to show more space below the floor
const FALL_THROUGH_PLATFORMS_DURATION = 2000; // 2 seconds to fall through platforms when stunned

// Set up canvas size
canvas.width = gameWidth;
canvas.height = gameHeight + RENDER_BELOW_GAME; // Extend canvas height to show below the game

// Handle keyboard input
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  
  // Spectator controls to cycle through players
  if (players[playerId]?.isDead && (e.key === 'Tab' || e.key === 'n')) {
    const alivePlayers = Object.keys(players).filter(id => !players[id].isDead && id !== playerId);
    if (alivePlayers.length > 0) {
      const currentIndex = alivePlayers.indexOf(spectatingId);
      const nextIndex = (currentIndex + 1) % alivePlayers.length;
      spectatingId = alivePlayers[nextIndex];
      socket.emit('spectate', spectatingId);
    }
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// Initialize game state when connecting to the server
socket.on('gameInit', (data) => {
  playerId = data.id;
  players = data.players;
  platforms = data.platforms;
  gameWidth = data.gameWidth;
  lavaHeight = data.lavaHeight;
  gameState = data.gameState;
  
  // Get server constants
  if (data.constants) {
    platformGap = data.constants.platformGap || platformGap;
    spikeStunDuration = data.constants.spikeStunDuration || spikeStunDuration;
    lavaSpeed = data.constants.lavaSpeed || lavaSpeed;
  }
  
  // Reset canvas size if needed
  if (canvas.width !== gameWidth) {
    canvas.width = gameWidth;
  }
  
  console.log('Game initialized', data);
});

// Game updates from server
socket.on('gameUpdate', (data) => {
  lavaHeight = data.lavaHeight;
  gameState = data.gameState;
  
  // Update UI for countdown
  if (gameState.status === 'countdown') {
    const countdownElement = document.getElementById('countdown-display');
    if (!countdownElement) {
      const countdownDiv = document.createElement('div');
      countdownDiv.id = 'countdown-display';
      countdownDiv.style.position = 'absolute';
      countdownDiv.style.top = '50%';
      countdownDiv.style.left = '50%';
      countdownDiv.style.transform = 'translate(-50%, -50%)';
      countdownDiv.style.fontSize = '48px';
      countdownDiv.style.color = 'white';
      countdownDiv.style.textShadow = '2px 2px 4px black';
      document.getElementById('game-container').appendChild(countdownDiv);
    }
    
    const countdownDisplay = document.getElementById('countdown-display');
    if (gameState.winner) {
      const winnerId = gameState.winner.substring(0, 4);
      countdownDisplay.innerHTML = `Player ${winnerId} wins!<br>Next round in ${Math.ceil(gameState.countdown)}`;
    } else {
      countdownDisplay.innerText = `Next round in ${Math.ceil(gameState.countdown)}`;
    }
  } else {
    const countdownElement = document.getElementById('countdown-display');
    if (countdownElement) {
      countdownElement.remove();
    }
  }
});

// Game reset
socket.on('gameReset', (data) => {
  platforms = data.platforms;
  lavaHeight = data.lavaHeight;
  gameState = data.gameState;
  spectatingId = null;
  
  // Reset local variables
  bounceCount = 0;
  lastJumpTime = 0;
  lastWallBounceTime = 0;
});

// New player joined
socket.on('newPlayer', (player) => {
  players[player.id] = player;
});

// Player update
socket.on('playerUpdate', (player) => {
  players[player.id] = player;
});

// Player left
socket.on('playerLeft', (id) => {
  delete players[id];
  if (spectatingId === id) {
    spectatingId = null;
  }
});

// Player died
socket.on('playerDied', (id) => {
  if (players[id]) {
    players[id].isDead = true;
  }
  
  if (id === playerId) {
    showDeathMessage();
  }
});

// Round winner
socket.on('roundWinner', (data) => {
  const winnerMessage = document.createElement('div');
  winnerMessage.id = 'winner-message';
  winnerMessage.style.position = 'absolute';
  winnerMessage.style.top = '40%';
  winnerMessage.style.left = '50%';
  winnerMessage.style.transform = 'translate(-50%, -50%)';
  winnerMessage.style.fontSize = '32px';
  winnerMessage.style.color = 'gold';
  winnerMessage.style.textShadow = '2px 2px 4px black';
  winnerMessage.innerText = `Player ${data.winner.substring(0, 4)} wins!`;
  
  document.getElementById('game-container').appendChild(winnerMessage);
  
  setTimeout(() => {
    const winnerElement = document.getElementById('winner-message');
    if (winnerElement) {
      winnerElement.remove();
    }
  }, 3000);
});

// Round over
socket.on('roundOver', () => {
  const gameOverMessage = document.createElement('div');
  gameOverMessage.id = 'game-over-message';
  gameOverMessage.style.position = 'absolute';
  gameOverMessage.style.top = '40%';
  gameOverMessage.style.left = '50%';
  gameOverMessage.style.transform = 'translate(-50%, -50%)';
  gameOverMessage.style.fontSize = '32px';
  gameOverMessage.style.color = 'red';
  gameOverMessage.style.textShadow = '2px 2px 4px black';
  gameOverMessage.innerText = 'Everyone died!';
  
  document.getElementById('game-container').appendChild(gameOverMessage);
  
  setTimeout(() => {
    const gameOverElement = document.getElementById('game-over-message');
    if (gameOverElement) {
      gameOverElement.remove();
    }
  }, 3000);
});

// Spectate player
socket.on('spectatePlayer', (id) => {
  spectatingId = id;
  console.log('Spectating player:', id);
});

// Death message
function showDeathMessage() {
  const deathMessage = document.createElement('div');
  deathMessage.id = 'death-message';
  deathMessage.style.position = 'absolute';
  deathMessage.style.top = '30%';
  deathMessage.style.left = '50%';
  deathMessage.style.transform = 'translate(-50%, -50%)';
  deathMessage.style.fontSize = '24px';
  deathMessage.style.color = 'white';
  deathMessage.style.textShadow = '2px 2px 4px black';
  deathMessage.innerHTML = 'You died!<br>Press Tab to spectate';
  
  document.getElementById('game-container').appendChild(deathMessage);
  
  setTimeout(() => {
    const deathElement = document.getElementById('death-message');
    if (deathElement) {
      deathElement.remove();
    }
  }, 3000);
}

// Create UI elements for lava lamp mode
function createLavaLampButton() {
  const lavaLampButton = document.createElement('button');
  lavaLampButton.id = 'lava-lamp-button';
  lavaLampButton.innerText = 'LAVA';
  lavaLampButton.style.position = 'absolute';
  lavaLampButton.style.top = '10px';
  lavaLampButton.style.left = '10px';
  lavaLampButton.style.padding = '8px 15px';
  lavaLampButton.style.backgroundColor = '#ff4500';
  lavaLampButton.style.color = 'white';
  lavaLampButton.style.border = 'none';
  lavaLampButton.style.borderRadius = '5px';
  lavaLampButton.style.cursor = 'pointer';
  lavaLampButton.style.fontWeight = 'bold';
  lavaLampButton.style.zIndex = '1000';
  document.getElementById('game-container').appendChild(lavaLampButton);
  
  // Add event listener
  lavaLampButton.addEventListener('click', toggleLavaLampMode);
}

// Toggle lava lamp mode
function toggleLavaLampMode() {
  isLavaLampMode = !isLavaLampMode;
  
  // Initialize lava particles when entering lava lamp mode
  if (isLavaLampMode) {
    initLavaParticles();
    
    // Hide game UI elements
    document.getElementById('score-display').style.display = 'none';
    document.getElementById('players-info').style.display = 'none';
    document.getElementById('round-info').style.display = 'none';
    
    // Make canvas fullscreen for lava lamp mode
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Show exit message
    const exitMessage = document.createElement('div');
    exitMessage.id = 'exit-lava-message';
    exitMessage.innerText = 'LAVA LAMP MODE - Click LAVA to exit';
    exitMessage.style.position = 'absolute';
    exitMessage.style.bottom = '10px';
    exitMessage.style.left = '10px';
    exitMessage.style.color = 'white';
    exitMessage.style.fontSize = '14px';
    document.getElementById('game-container').appendChild(exitMessage);
    
    // Make sure LAVA button stays on top
    document.getElementById('lava-lamp-button').style.zIndex = '1001';
  } else {
    // Restore game canvas size
    canvas.style.position = '';
    canvas.style.top = '';
    canvas.style.left = '';
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.width = gameWidth;
    canvas.height = gameHeight + RENDER_BELOW_GAME;
    
    // Show game UI elements
    document.getElementById('score-display').style.display = 'block';
    document.getElementById('players-info').style.display = 'block';
    document.getElementById('round-info').style.display = 'block';
    
    // Remove exit message
    const exitMessage = document.getElementById('exit-lava-message');
    if (exitMessage) exitMessage.remove();
  }
}

// Initialize lava particles
function initLavaParticles() {
  lavaParticles = [];
  
  // Use more particles for fullscreen mode
  const particleCount = Math.floor((window.innerWidth * window.innerHeight) / 20000);
  
  for (let i = 0; i < particleCount; i++) {
    lavaParticles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: 30 + Math.random() * 70,
      vx: Math.random() * 2 - 1,
      vy: Math.random() * 2 - 1,
      color: LAVA_GRADIENT_STOPS[Math.floor(Math.random() * LAVA_GRADIENT_STOPS.length)]
    });
  }
}

// Track mouse position
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mousePosX = e.clientX - rect.left;
  mousePosY = e.clientY - rect.top;
});

// Create lava lamp button on page load
window.addEventListener('load', createLavaLampButton);

// Update lava lamp particles
function updateLavaLamp(deltaTime) {
  // Update each particle
  for (let i = 0; i < lavaParticles.length; i++) {
    const particle = lavaParticles[i];
    
    // Move particles randomly with slight attraction to mouse
    const dx = mousePosX - particle.x;
    const dy = mousePosY - particle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Add some force toward mouse position
    particle.vx += (dx / dist) * 0.1;
    particle.vy += (dy / dist) * 0.1;
    
    // Add some random movement
    particle.vx += (Math.random() * 2 - 1) * 0.2;
    particle.vy += (Math.random() * 2 - 1) * 0.2;
    
    // Apply some damping
    particle.vx *= 0.98;
    particle.vy *= 0.98;
    
    // Update position
    particle.x += particle.vx;
    particle.y += particle.vy;
    
    // Contain within canvas
    if (particle.x < 0) particle.x = 0;
    if (particle.x > canvas.width) particle.x = canvas.width;
    if (particle.y < 0) particle.y = 0;
    if (particle.y > canvas.height) particle.y = canvas.height;
  }
}

// Render lava lamp
function renderLavaLamp() {
  // Fill background with dark color
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw each particle
  for (let i = 0; i < lavaParticles.length; i++) {
    const particle = lavaParticles[i];
    
    // Create radial gradient for blob
    const gradient = ctx.createRadialGradient(
      particle.x, particle.y, 0,
      particle.x, particle.y, particle.size
    );
    
    // Create gradient colors
    const baseColor = particle.color;
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.7, baseColor + '99'); // Semi-transparent
    gradient.addColorStop(1, baseColor + '00'); // Fully transparent
    
    // Draw blob
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw cursor blob that follows mouse
  const cursorGradient = ctx.createRadialGradient(
    mousePosX, mousePosY, 0,
    mousePosX, mousePosY, 200 // Increased size for fullscreen
  );
  
  cursorGradient.addColorStop(0, '#ffffff');
  cursorGradient.addColorStop(0.2, '#ffffff99');
  cursorGradient.addColorStop(1, '#ffffff00');
  
  ctx.fillStyle = cursorGradient;
  ctx.beginPath();
  ctx.arc(mousePosX, mousePosY, 200, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw fluid connection lines between nearby particles
  ctx.strokeStyle = 'rgba(255, 120, 0, 0.2)';
  ctx.lineWidth = 3;
  
  for (let i = 0; i < lavaParticles.length; i++) {
    const p1 = lavaParticles[i];
    
    for (let j = i + 1; j < lavaParticles.length; j++) {
      const p2 = lavaParticles[j];
      
      // Calculate distance
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Connect nearby particles
      if (distance < 200) {
        const opacity = (200 - distance) / 200 * 0.2;
        ctx.strokeStyle = `rgba(255, 120, 0, ${opacity})`;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        
        // Create curved connections
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const offset = Math.sin(Date.now() / 1000) * 20;
        
        ctx.quadraticCurveTo(midX + offset, midY + offset, p2.x, p2.y);
        ctx.stroke();
      }
    }
  }
  
  // Add ambient bubbles
  ctx.fillStyle = 'rgba(255, 255, 150, 0.3)';
  const time = Date.now() / 1000;
  
  for (let i = 0; i < 30; i++) {
    const x = ((Math.sin(time * 0.5 + i * 0.3) + 1) / 2) * canvas.width;
    const y = ((Math.cos(time * 0.3 + i * 0.2) + 1) / 2) * canvas.height;
    const size = 2 + Math.sin(time + i) * 4;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Game loop
function gameLoop(currentTime) {
  if (!lastTime) lastTime = currentTime;
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  // Check if we're in lava lamp mode
  if (isLavaLampMode) {
    updateLavaLamp(deltaTime);
    renderLavaLamp();
    requestAnimationFrame(gameLoop);
    return;
  }
  
  // Update player
  if (playerId && players[playerId] && !players[playerId].isDead && gameState.status === 'playing') {
    updatePlayer(deltaTime);
  }
  
  // Update camera to follow player or spectated player
  updateCamera();
  
  // Draw game
  render();
  
  // Update UI
  updateUI();
  
  // Request next frame
  requestAnimationFrame(gameLoop);
}

// Start game loop
requestAnimationFrame(gameLoop);

// Update player position and physics
function updatePlayer(deltaTime) {
  const player = players[playerId];
  
  // Skip update if player is stunned
  if (player.isStunned) {
    // Check if stun has expired
    if (Date.now() > player.stunEndTime) {
      player.isStunned = false;
    } else {
      // Apply gravity even when stunned
      player.vy += GRAVITY * 0.7; // Reduced gravity while stunned
      player.y += player.vy;
      
      // Apply drag to slow horizontal movement
      player.vx *= 0.95;
      player.x += player.vx;
      
      // Check lava collision even when stunned
      if (player.y <= lavaHeight + 5 && !player.isDead) {
        player.isDead = true;
        socket.emit('playerMove', {
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          isJumping: player.isJumping,
          isStunned: player.isStunned,
          stunEndTime: player.stunEndTime,
          score: player.score,
          isDead: true
        });
        return;
      }
      
      // Emit stunned player movement
      socket.emit('playerMove', {
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        isJumping: true, // Forced jumping while stunned
        isStunned: player.isStunned,
        stunEndTime: player.stunEndTime,
        score: player.score,
        isDead: player.isDead
      });
      
      return; // Skip the rest of the update while stunned
    }
  }
  
  // Handle movement
  if (keys['ArrowLeft']) {
    player.vx -= PLAYER_SPEED * deltaTime;
  }
  if (keys['ArrowRight']) {
    player.vx += PLAYER_SPEED * deltaTime;
  }
  
  // Jump - with velocity-based boost and cooldown for multi-jumps
  const now = Date.now();
  if (keys[' '] && !player.isJumping && now - lastJumpTime > MULTI_JUMP_COOLDOWN) {
    // Base jump velocity plus a big boost based on horizontal speed to incentivize diagonal movement
    const speedBoost = Math.abs(player.vx) * VELOCITY_JUMP_BOOST;
    player.vy = JUMP_VELOCITY + speedBoost;
    
    // IMPROVED: Preserve and enhance horizontal velocity for diagonal jumps
    player.vx *= HORIZONTAL_JUMP_PRESERVE; // Maintain and slightly boost horizontal momentum when jumping
    
    player.isJumping = true;
    lastJumpTime = now;
    // Reset bounce count with each new jump
    bounceCount = 0;
    
    // Add points for jumping with velocity (directly in the client)
    if (Math.abs(player.vx) > 2) {
      const velocityBonus = Math.floor(Math.abs(player.vx) * DIAGONAL_MOVEMENT_BONUS);
      player.score += velocityBonus;
    }
  }
  
  // Apply gravity
  player.vy += GRAVITY;
  
  // Apply velocity
  player.x += player.vx;
  player.y += player.vy;
  
  // Floor collision (prevent falling below the game area)
  if (player.y < 0) {
    player.y = 0;
    player.vy = 0;
    player.isJumping = false;
  }
  
  // Apply wall bounce and speed boost with limitations
  const now2 = Date.now();
  if (player.x < 0) {
    player.x = 0;
    if (now2 - lastWallBounceTime > WALL_BOUNCE_COOLDOWN) {
      // IMPROVED: Add MASSIVE horizontal boost when bouncing off walls for extreme diagonal movement
      const currentSpeed = Math.abs(player.vx);
      
      // Calculate bounce velocity with much more aggressive boost
      let bounceVx = -player.vx * (1 + WALL_BOUNCE_BOOST + (bounceCount * 0.2)); // Major horizontal boost
      
      // Cap maximum speed
      bounceVx = Math.min(bounceVx, MAX_WALL_BOUNCE_SPEED);
      player.vx = bounceVx;
      
      // Reduce vertical boost to emphasize horizontal movement
      // Just a small vertical boost - we want sideways momentum to dominate
      player.vy += Math.min(currentSpeed * 0.15, 5);
      
      lastWallBounceTime = now2;
      bounceCount = Math.min(bounceCount + 1, MAX_BOUNCE_COUNT);
      
      // Add visual feedback
      createFloatingText('BOOST!', player.x, player.y, '#00ffff');
    } else {
      // Even regular bounces should preserve more momentum
      player.vx = -player.vx * 0.9;
    }
  } else if (player.x + PLAYER_SIZE > gameWidth) {
    player.x = gameWidth - PLAYER_SIZE;
    if (now2 - lastWallBounceTime > WALL_BOUNCE_COOLDOWN) {
      // IMPROVED: Add MASSIVE horizontal boost when bouncing off walls for extreme diagonal movement
      const currentSpeed = Math.abs(player.vx);
      
      // Calculate bounce velocity with much more aggressive boost
      let bounceVx = -player.vx * (1 + WALL_BOUNCE_BOOST + (bounceCount * 0.2)); // Major horizontal boost
      
      // Cap maximum speed
      bounceVx = Math.max(bounceVx, -MAX_WALL_BOUNCE_SPEED);
      player.vx = bounceVx;
      
      // Reduce vertical boost to emphasize horizontal movement
      // Just a small vertical boost - we want sideways momentum to dominate
      player.vy += Math.min(currentSpeed * 0.15, 5);
      
      lastWallBounceTime = now2;
      bounceCount = Math.min(bounceCount + 1, MAX_BOUNCE_COUNT);
      
      // Add visual feedback
      createFloatingText('BOOST!', player.x, player.y, '#00ffff');
    } else {
      // Even regular bounces should preserve more momentum
      player.vx = -player.vx * 0.9;
    }
  }
  
  // FIX: Ensure players don't die randomly - improve collision detection
  // Check for lava collision with better tolerance
  if (player.y <= lavaHeight + 5 && !player.isDead) { // Added tolerance to prevent random deaths
    player.isDead = true;
    socket.emit('playerMove', {
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      isJumping: player.isJumping,
      isStunned: player.isStunned,
      stunEndTime: player.stunEndTime,
      score: player.score,
      isDead: true
    });
    return;
  }
  
  // Check platform collisions
  let onPlatform = false;
  for (const platform of platforms) {
    // Skip platform collision checks if stunned
    if (player.isStunned) continue;
    
    // Only check platforms that are visible or just above/below the screen
    if (platform.y > cameraY - 200 && platform.y < cameraY + gameHeight + 200) {
      // Check for collision from below the platform (visually from above)
      if (player.vy < 0 && // Moving up
          player.y <= platform.y + 10 && 
          player.y >= platform.y && // Small tolerance
          player.x + PLAYER_SIZE > platform.x && 
          player.x < platform.x + platform.width) {
        
        // Check for spike platforms with partial spikes
        if (platform.hasSpikes) {
          // Calculate the spike area
          const spikeX = platform.x + (platform.spikeOffset || 0);
          const spikeWidth = platform.spikeWidth || platform.width;
          
          // Check if player is on the spike portion AND moving down (negative vy in our inverted system)
          // Only stun the player if they hit the spike tips (not sides or from underneath)
          if (player.x + PLAYER_SIZE > spikeX && 
              player.x < spikeX + spikeWidth && 
              player.vy < 0) { // Falling onto the spikes
            
            // Calculate if player hit the spike tips rather than sides
            // First determine which spike the player hit
            const spikeCount = Math.floor(spikeWidth / 10);
            const spikeIndividualWidth = spikeWidth / spikeCount;
            
            // Find which spike(s) the player is touching
            const playerLeftEdge = Math.max(player.x, spikeX);
            const playerRightEdge = Math.min(player.x + PLAYER_SIZE, spikeX + spikeWidth);
            const playerWidth = playerRightEdge - playerLeftEdge;
            
            // Calculate relative position within spike segment
            let hitSpikeTip = false;
            
            for (let i = 0; i < spikeCount; i++) {
              const currentSpikeX = spikeX + i * spikeIndividualWidth;
              const spikeMiddle = currentSpikeX + spikeIndividualWidth / 2;
              
              // Check if player overlaps with this spike
              if (playerRightEdge > currentSpikeX && playerLeftEdge < currentSpikeX + spikeIndividualWidth) {
                // Calculate distance from the spike tip
                const distanceFromTip = Math.abs(playerLeftEdge + playerWidth/2 - spikeMiddle);
                const tipThreshold = spikeIndividualWidth * 0.3; // 30% of spike width is considered the "tip"
                
                if (distanceFromTip < tipThreshold) {
                  hitSpikeTip = true;
                  break;
                }
              }
            }
            
            // Only stun if player hit a spike tip
            if (hitSpikeTip) {
              // Player is stunned by spikes
              player.isStunned = true;
              player.stunEndTime = Date.now() + spikeStunDuration;
              player.vy = -5; // Bounce the player down a bit
              
              // Notify server about stun
              socket.emit('playerStunned');
              
              // Add visual feedback
              createFloatingText('SPIKED!', player.x, player.y, 'red');
              
              // Skip platform collision
              continue;
            }
          }
          // If not on spike tip or moving up, treat as normal platform
        }
        
        player.y = platform.y + 10;
        player.vy = 0;
        player.isJumping = false;
        onPlatform = true;
        
        // Award points if on a platform with points
        if (platform.points > 0) {
          // Award points for special numbered platforms
          if (platform.type === 'numbered') {
            player.score += platform.points;
            createFloatingText(`+${platform.points}`, player.x, player.y, 'gold');
          } else {
            // Regular platform points
            const jumpHeight = platform.y - (player.lastPlatformY || 0);
            let pointsToAdd = platform.points;
            
            if (jumpHeight > platformGap * 2) { // More than 2 platforms
              const multiplier = Math.floor(jumpHeight / platformGap);
              pointsToAdd *= multiplier;
            }
            
            player.score += pointsToAdd;
          }
          
          player.lastPlatformY = platform.y;
        }
      }
    }
  }
  
  // Apply icy friction
  player.vx *= onPlatform ? ICE_FRICTION : FRICTION;
  
  // Make sure velocity doesn't get too small (to avoid floating point issues)
  if (Math.abs(player.vx) < 0.01) player.vx = 0;
  
  // Emit player state to server
  socket.emit('playerMove', {
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    isJumping: player.isJumping,
    isStunned: player.isStunned,
    stunEndTime: player.stunEndTime,
    score: player.score,
    isDead: player.isDead
  });
}

// Update camera position to follow player
function updateCamera() {
  // Determine which player to follow (own player or spectated player)
  const targetId = players[playerId]?.isDead ? spectatingId : playerId;
  
  if (targetId && players[targetId]) {
    const player = players[targetId];
    // Camera follows player going up - modified to always show some area below floor level
    const targetCameraY = player.y - gameHeight * 0.6; // Show more above than below
    
    // Make sure camera follows upward movement while showing some area below the floor
    // Even at floor level (y=0), we want to show area below for lava visibility
    cameraY = Math.max(-RENDER_BELOW_GAME + 50, targetCameraY); // Always keep some area below visible
  }
}

// Create lava gradient pattern
function createLavaGradient() {
  const gradientHeight = 100;
  const lavaCanvas = document.createElement('canvas');
  lavaCanvas.width = gameWidth;
  lavaCanvas.height = gradientHeight;
  const lavaCtx = lavaCanvas.getContext('2d');
  
  // Create vertical gradient
  const gradient = lavaCtx.createLinearGradient(0, 0, 0, gradientHeight);
  LAVA_GRADIENT_STOPS.forEach((color, index) => {
    gradient.addColorStop(index / (LAVA_GRADIENT_STOPS.length - 1), color);
  });
  
  lavaCtx.fillStyle = gradient;
  lavaCtx.fillRect(0, 0, gameWidth, gradientHeight);
  
  // Add some "bubbles" or variations for texture
  lavaCtx.globalAlpha = 0.1;
  lavaCtx.fillStyle = "#ffff00";
  
  const time = Date.now() / 1000;
  for (let i = 0; i < 30; i++) {
    const x = Math.sin(time + i * 0.7) * gameWidth / 2 + gameWidth / 2;
    const y = Math.cos(time + i * 0.6) * gradientHeight / 2 + gradientHeight / 2;
    const radius = 5 + Math.sin(time + i) * 3;
    
    lavaCtx.beginPath();
    lavaCtx.arc(x, y, radius, 0, Math.PI * 2);
    lavaCtx.fill();
  }
  
  lavaCtx.globalAlpha = 1.0;
  
  return lavaCanvas.toDataURL();
}

// Create floating score text
function createFloatingText(text, x, y, color) {
  const floatingText = {
    text,
    x,
    y,
    color,
    alpha: 1,
    life: 60 // Frames of life
  };
  
  // Add to floating texts array (create if not exists)
  if (!window.floatingTexts) {
    window.floatingTexts = [];
  }
  window.floatingTexts.push(floatingText);
}

// Update and draw floating texts
function updateFloatingTexts() {
  if (!window.floatingTexts) return;
  
  for (let i = window.floatingTexts.length - 1; i >= 0; i--) {
    const text = window.floatingTexts[i];
    
    // Update
    text.y += 1;
    text.alpha -= 0.016; // Fade out
    text.life--;
    
    // Remove dead texts
    if (text.life <= 0 || text.alpha <= 0) {
      window.floatingTexts.splice(i, 1);
      continue;
    }
    
    // Draw
    const screenY = gameHeight - (text.y - cameraY) + RENDER_BELOW_GAME;
    
    ctx.globalAlpha = text.alpha;
    ctx.fillStyle = text.color;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text.text, text.x + PLAYER_SIZE/2, screenY - 30);
    ctx.globalAlpha = 1.0;
  }
}

// Render game
function render() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Adjust rendering to account for the extended canvas
  const renderOffsetY = RENDER_BELOW_GAME;
  
  // Draw walls
  ctx.fillStyle = WALL_COLOR;
  ctx.fillRect(0, 0, 1, gameHeight + renderOffsetY); // Left wall
  ctx.fillRect(gameWidth - 1, 0, 1, gameHeight + renderOffsetY); // Right wall
  
  // Draw platforms
  for (const platform of platforms) {
    // Only draw platforms that are visible on screen (including below game area)
    const screenY = gameHeight - (platform.y - cameraY) + renderOffsetY;
    if (screenY >= 0 && screenY <= gameHeight + renderOffsetY) {
      // Choose color based on platform type
      if (platform.type === 'numbered') {
        ctx.fillStyle = NUMBERED_PLATFORM_COLOR;
      } else if (platform.type === 'spikes') {
        ctx.fillStyle = SPIKE_PLATFORM_COLOR;
      } else {
        ctx.fillStyle = PLATFORM_COLOR;
      }
      
      // Draw platform
      ctx.fillRect(platform.x, screenY - 10, platform.width, 10);
      
      // Draw number on numbered platforms
      if (platform.number) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(platform.number.toString(), platform.x + platform.width/2, screenY - 15);
      }
      
      // Draw spikes on spike platforms
      if (platform.hasSpikes) {
        // Get the correct section to draw spikes on
        const spikeX = platform.x + (platform.spikeOffset || 0);
        const spikeW = platform.spikeWidth || platform.width;
        
        // Draw spikes only on the portion specified
        const spikeCount = Math.floor(spikeW / 10);
        const spikeWidth = spikeW / spikeCount;
        
        for (let i = 0; i < spikeCount; i++) {
          const currentSpikeX = spikeX + i * spikeWidth;
          
          // Draw spike
          ctx.beginPath();
          ctx.moveTo(currentSpikeX, screenY - 10);
          ctx.lineTo(currentSpikeX + spikeWidth/2, screenY - 20); // Spike peak
          ctx.lineTo(currentSpikeX + spikeWidth, screenY - 10);
          ctx.fillStyle = '#aaa'; // Base spike color
          ctx.fill();
          
          // Add colored tip to make it clear where the dangerous part is
          ctx.beginPath();
          ctx.moveTo(currentSpikeX + spikeWidth/2 - 3, screenY - 17);
          ctx.lineTo(currentSpikeX + spikeWidth/2, screenY - 20); // Spike peak
          ctx.lineTo(currentSpikeX + spikeWidth/2 + 3, screenY - 17);
          ctx.fillStyle = '#ff3333'; // Red tip
          ctx.fill();
        }
      }
    }
  }
  
  // Draw floor line more prominently
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  const floorY = gameHeight - (0 - cameraY) + renderOffsetY;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(gameWidth, floorY);
  ctx.stroke();
  
  // Add floor level indicator
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '12px Arial';
  ctx.fillText('FLOOR LEVEL', 10, floorY - 5);
  
  // Draw lava
  const lavaScreenY = gameHeight - (lavaHeight - cameraY) + renderOffsetY;
  if (lavaScreenY < gameHeight + renderOffsetY + 150) { // Increased visibility range
    // Draw lava background
    ctx.fillStyle = "#ff4500";
    ctx.fillRect(0, lavaScreenY, gameWidth, gameHeight + renderOffsetY);
    
    // Create fancy lava effect
    const lavaPattern = new Image();
    lavaPattern.src = createLavaGradient();
    
    // Draw lava waves
    const time = Date.now() / 1000;
    ctx.fillStyle = "#ff6a00";
    
    ctx.beginPath();
    ctx.moveTo(0, lavaScreenY);
    
    for (let x = 0; x < gameWidth; x += 10) {
      // Generate wavy top for lava
      const waveHeight = Math.sin(x / 20 + time * 2) * 5 + Math.sin(x / 10 - time) * 3;
      ctx.lineTo(x, lavaScreenY + waveHeight);
    }
    
    ctx.lineTo(gameWidth, lavaScreenY);
    ctx.lineTo(gameWidth, gameHeight + renderOffsetY);
    ctx.lineTo(0, gameHeight + renderOffsetY);
    ctx.closePath();
    ctx.fill();
    
    // Add lava particles/bubbles
    ctx.fillStyle = "#ffff00";
    ctx.globalAlpha = 0.6;
    
    for (let i = 0; i < 20; i++) {
      const x = (Math.sin(time * 0.7 + i) + 1) / 2 * gameWidth;
      const y = lavaScreenY + Math.random() * 50 + Math.sin(time + i) * 10;
      const size = 2 + Math.random() * 4;
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add lava rise indicator - time left before floor is reached
    if (lavaHeight < 0) {
      const timeToFloor = Math.abs(lavaHeight) / lavaSpeed;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '16px Arial';
      ctx.fillText(`Lava reaches floor in: ${Math.ceil(timeToFloor / 10)}s`, gameWidth / 2 - 100, lavaScreenY - 20);
    }
  }
  
  // Draw players
  for (const id in players) {
    const player = players[id];
    
    // Skip dead players
    if (player.isDead) continue;
    
    // Determine player color
    let playerColor = 'orange';
    if (id === playerId) {
      playerColor = 'red';
    } else if (id === spectatingId) {
      playerColor = 'yellow'; // Highlight spectated player
    }
    
    // If player is stunned, make it flash
    if (player.isStunned) {
      const flashRate = Math.floor(Date.now() / 100) % 2;
      playerColor = flashRate ? 'gray' : playerColor;
    }
    
    ctx.fillStyle = playerColor;
    
    // Only draw players that are visible on screen
    const screenY = gameHeight - (player.y - cameraY) + renderOffsetY;
    if (screenY >= 0 && screenY <= gameHeight + renderOffsetY) {
      ctx.fillRect(player.x, screenY - PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
      
      // Draw stun effect
      if (player.isStunned) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        
        // Draw stars around the stunned player
        const time = Date.now() / 200;
        for (let i = 0; i < 3; i++) {
          const angle = time + i * Math.PI * 2/3;
          const starX = player.x + PLAYER_SIZE/2 + Math.cos(angle) * 15;
          const starY = screenY - PLAYER_SIZE/2 + Math.sin(angle) * 15;
          
          drawStar(starX, starY, 5, 3, 2);
        }
      }
      
      // Draw player ID above them
      ctx.fillStyle = 'white';
      ctx.font = '10px Arial';
      ctx.fillText(id.substring(0, 4), player.x, screenY - PLAYER_SIZE - 5);
      
      // Draw score above ID
      ctx.fillText(`${player.score}`, player.x, screenY - PLAYER_SIZE - 18);
      
      // Visualize velocity as arrows (for the current player only)
      if (id === playerId) {
        const velocityScale = 3;
        const vx = player.vx * velocityScale;
        const vy = -player.vy * velocityScale; // Invert y for screen coordinates
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.x + PLAYER_SIZE/2, screenY - PLAYER_SIZE/2);
        ctx.lineTo(player.x + PLAYER_SIZE/2 + vx, screenY - PLAYER_SIZE/2 + vy);
        ctx.stroke();
      }
    }
  }
  
  // Draw floating texts
  updateFloatingTexts();
  
  // Draw velocity info for the player
  if (playerId && players[playerId] && !players[playerId].isDead) {
    const player = players[playerId];
    const velocityMagnitude = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Speed: ${velocityMagnitude.toFixed(1)}`, 10, gameHeight - 10);
    
    // Show stun status if stunned
    if (player.isStunned) {
      ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      
      const timeLeft = Math.max(0, Math.ceil((player.stunEndTime - Date.now()) / 1000));
      ctx.fillText(`STUNNED! (${timeLeft}s)`, gameWidth/2, 60);
    }
  }
  
  // Draw spectator indicator
  if (players[playerId]?.isDead) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    
    if (spectatingId) {
      ctx.fillText(`Spectating: ${spectatingId.substring(0, 4)}`, gameWidth / 2, 30);
    } else {
      ctx.fillText('Press Tab to spectate', gameWidth / 2, 30);
    }
    
    ctx.textAlign = 'left';
  }
  
  // Draw game status
  if (gameState.status === 'countdown') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, gameWidth, gameHeight + renderOffsetY);
  }
}

// Draw a star (for stun effect)
function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'white';
  ctx.stroke();
  ctx.fillStyle = 'yellow';
  ctx.fill();
}

// Update UI elements
function updateUI() {
  // Determine which player's score to show (own player or spectated player)
  const targetId = players[playerId]?.isDead ? spectatingId : playerId;
  
  if (targetId && players[targetId]) {
    // Update score
    scoreDisplay.textContent = `Score: ${players[targetId].score}`;
  }
  
  // Count alive players
  const aliveCount = Object.values(players).filter(p => !p.isDead).length;
  const totalCount = Object.keys(players).length;
  
  // Update player count
  playersInfo.textContent = `Players: ${aliveCount}/${totalCount}`;
  
  // Show round information
  const roundInfo = document.getElementById('round-info') || document.createElement('div');
  if (!document.getElementById('round-info')) {
    roundInfo.id = 'round-info';
    roundInfo.style.position = 'absolute';
    roundInfo.style.top = '40px';
    roundInfo.style.right = '10px';
    roundInfo.style.color = 'white';
    roundInfo.style.fontSize = '14px';
    document.getElementById('game-container').appendChild(roundInfo);
  }
  
  roundInfo.textContent = `Round: ${gameState.roundNumber}`;
} 