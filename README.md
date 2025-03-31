# ICY TOWER Multiplayer

A multiplayer version of the classic Icy Tower game where players climb an infinitely high tower by jumping between platforms, while escaping the rising lava.

## Game Features

- Tower width of 300 pixels
- Infinite vertical climbing
- Rising lava that eliminates players who touch it
- Visible lava countdown before it reaches floor level
- Increased spacing between platforms for more challenging jumps
- Special numbered platforms worth 50-250 points
- Dangerous spike platforms that stun the player
- Dynamic platform generation with randomized sizes and gaps
- Round-based gameplay with respawns
- Enhanced icy physics with momentum preservation
- Improved wall bouncing that adds vertical boosts
- Diagonal movement amplification for 45-degree jumps
- Chained wall bounces for combo moves
- Spectator mode to watch other players when you die
- Multiplayer synchronization
- Velocity-based scoring system
- Player represented as a red square
- Platforms with three different types (normal, numbered, and spikes)

## Game Rules

- Each round, players race to climb the tower while escaping the rising lava
- If you fall into the lava, you die and enter spectator mode
- The first player to reach the top wins the round
- If all players die, a new round begins after a countdown
- Each new round generates a fresh tower layout
- Points are earned primarily through movement speed and special platforms
- Hitting spike platforms stuns the player for 2 seconds, making them fall through platforms

## Platform Types

- **Blue Platforms**: Normal platforms worth 10 points
- **Orange Platforms**: Special numbered platforms worth 50, 100, 150, 200, or 250 points
- **Gray Platforms with Spikes**: Dangerous platforms that stun players for 2 seconds

## Controls

- **Left/Right Arrow Keys**: Move horizontally
- **Spacebar**: Jump
- **Tab**: Cycle through players in spectator mode
- Advanced techniques:
  - Hold direction while jumping to maintain and enhance horizontal momentum
  - Bounce off walls to gain both horizontal and vertical speed boosts
  - Chain multiple wall bounces for extreme speed (up to 3 consecutive boosted bounces)
  - The faster you move horizontally, the higher and further you'll jump

## Installation and Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed

2. Clone this repository
```
git clone <repository-url>
cd icy-tower
```

3. Install dependencies
```
npm install
```

4. Start the server
```
npm start
```

5. Open your browser and navigate to `http://localhost:4245`

## Game Mechanics

- Platforms are spaced farther apart (60 pixels) with 30% chance to skip platforms for extra challenge
- Very long platforms are rare (5% chance) with most platforms being smaller
- Hitting gray spike platforms stuns the player for 2 seconds, allowing them to fall through platforms
- Horizontal velocity is preserved and enhanced when jumping
- Wall bounces give increasing boosts with each consecutive bounce
- The faster you're moving, the more points you earn
- Special numbered platforms give large point bonuses
- Lava countdown shows time remaining before the lava reaches the floor level 