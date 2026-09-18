import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RENT_DATA, TRAIN_RENT, TRAIN_TILES, COLOR_GROUPS } from './gameData.js';

const app = express();
app.use(cors());

// Health check endpoints for cloud deployment and connection verification
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    game: 'PseudoPoly Multiplayer Server',
    activeRooms: Object.keys(rooms).length,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game rooms storage: { roomCode: { gameState, players: [{id, name, avatar, socketId}] } }
const rooms = {};

// Generate 4-digit numeric room code (no alphabets)
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

// Generate unique session token for reconnection
function generateSessionToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Check if the game has a winner (only 1 active non-bankrupt player remains)
function checkForWinner(room) {
  if (!room || !room.gameState || room.gameState.gameStage !== 'playing') return;
  const activePlayers = room.players.filter((p, idx) => {
    const isBankrupt = room.gameState.bankruptPlayers && room.gameState.bankruptPlayers[idx];
    const isKicked = p.kicked;
    const isForfeited = p.forfeited;
    return !isBankrupt && !isKicked && !isForfeited;
  });
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const winnerIdx = room.players.indexOf(winner);
    console.log(`[SERVER] Game Over! Winner: ${winner.name} (P${winnerIdx})`);
    room.gameState.history.unshift(`🏆 ${winner.name} wins the game!`);
    room.gameState.gameStage = 'game_over';
    io.to(room.roomCode).emit('game_won', { winnerIndex: winnerIdx, winnerName: winner.name });
    broadcastState(room);
  }
}

// Initialize default game state
function createInitialGameState() {
  return {
    currentPlayer: 0,
    diceValues: [1, 1],
    isRolling: false,
    playerPositions: [0, 0, 0, 0],
    playerMoney: [12500, 12500, 12500, 12500],
    propertyOwnership: {},
    propertyLevels: {},
    history: ['Game started!'],
    gameStage: 'lobby',
    hoppingPlayer: null,
    turnFinished: false,
    isProcessingTurn: false,
    cashStack: 0,
    battlePot: 0,
    jailStatus: {},
    skippedTurns: {},
    modalState: { type: 'NONE', status: 'IDLE', payload: {} },
    warState: {
      active: false,
      phase: 'idle',
      mode: 'A',
      participants: [],
      property: null,
      rolls: {},
      currentRoller: 0,
      diceValues: [1, 1],
      winner: null
    },
    auctionState: {
      status: 'idle', // idle, thinking, announcing, active, processing
      propertyIndex: null,
      initiator: null,
      bids: [],
      currentBid: 0,
      participants: [],
      winner: null
    },
    playerLoans: {}, // { playerIndex: { principalAmount, repayAmount, lapsRemaining, loanStartTile } }
    bankruptPlayers: {}, // { playerIndex: true }
    landingResolved: false, // Per-turn guard: prevents duplicate landing processing
    activeDeal: null // { proposer, recipient, giveProperties, receiveProperties, moneyOffer }
  };
}

// Broadcast game state to all players in a room
function broadcastState(room) {
  if (!room || !room.roomCode) {
    console.error('[broadcastState] Invalid room or missing roomCode');
    return;
  }
  io.to(room.roomCode).emit('state_update', { 
    gameState: room.gameState, 
    players: room.players 
  });
}

// Helper: Core reconnect logic used by both join_room fallback and reconnect_session event
function handleSessionReconnect(socket, room, playerIndex) {
  const player = room.players[playerIndex];
  const roomCode = room.roomCode;

  player.socketId = socket.id;
  player.connected = true;
  player.canBeKicked = false;
  player.disconnectedAt = null;
  player.reconnectDeadline = null;

  socket.join(roomCode);
  socket.roomCode = roomCode;
  socket.playerIndex = playerIndex;

  // Cancel host shutdown timer if host is reconnecting
  if (player.isHost && room.hostDisconnectTimer) {
    clearTimeout(room.hostDisconnectTimer);
    room.hostDisconnectTimer = null;
  }

  // Cancel 60s player timer
  if (!room.playerDisconnectTimers) room.playerDisconnectTimers = {};
  if (room.playerDisconnectTimers[playerIndex]) {
    clearTimeout(room.playerDisconnectTimers[playerIndex]);
    delete room.playerDisconnectTimers[playerIndex];
  }

  // Cancel war auto-roll and auction auto-fold timers
  if (room.warAutoRollTimer) {
    clearTimeout(room.warAutoRollTimer);
    room.warAutoRollTimer = null;
  }
  if (room.auctionAutoFoldTimers && room.auctionAutoFoldTimers[playerIndex]) {
    clearTimeout(room.auctionAutoFoldTimers[playerIndex]);
    delete room.auctionAutoFoldTimers[playerIndex];
  }

  if (room.gameState && room.gameState.history) {
    room.gameState.history.unshift(`✅ ${player.name} reconnected!`);
  }

  const isPlaying = room.gameState && room.gameState.gameStage === 'playing';

  socket.emit('session_reconnected', {
    roomCode,
    playerIndex,
    sessionToken: player.sessionToken,
    gameState: room.gameState,
    players: room.players,
    gameStage: isPlaying ? 'playing' : 'lobby'
  });

  broadcastState(room);
  io.to(roomCode).emit('players_updated', { players: room.players });
  io.to(roomCode).emit('player_reconnected', { playerIndex, playerName: player.name });
  io.to(roomCode).emit('toast', { message: `✅ ${player.name} reconnected!` });
}

// Helper: Strict Turn & Player State Validation
function validatePlayerTurn(room, playerIndex, action) {
  if (!room || !room.gameState) return false;
  if (playerIndex === undefined || playerIndex === null) return false;
  
  const player = room.players[playerIndex];
  if (!player || player.kicked || player.forfeited) return false;
  if (room.gameState.bankruptPlayers && room.gameState.bankruptPlayers[playerIndex]) return false;

  // Actions that require the game to be actively playing
  const gameplayActions = [
    'roll_dice', 'buy_property', 'build_complete', 'sell_buildings',
    'attempt_robbery', 'cash_stack_claim', 'pay_bail', 'jail_skip',
    'take_loan', 'repay_loan', 'parking_confirm', 'card_action',
    'train_travel', 'auction_start_selection', 'war_init', 'end_turn'
  ];

  if (gameplayActions.includes(action)) {
    if (room.gameState.gameStage !== 'playing') return false;
  }

  // Actions that STRICTLY require it to be this player's turn
  const turnRestrictedActions = [
    'roll_dice', 'buy_property', 'build_complete', 'sell_buildings',
    'attempt_robbery', 'cash_stack_claim', 'pay_bail', 'jail_skip',
    'take_loan', 'repay_loan', 'parking_confirm', 'card_action',
    'train_travel', 'auction_start_selection', 'war_init', 'end_turn'
  ];

  if (turnRestrictedActions.includes(action)) {
    const isWarJoinAction = ['take_loan', 'repay_loan', 'sell_buildings'].includes(action) &&
      room.gameState.warState && room.gameState.warState.phase === 'join';

    if (room.gameState.currentPlayer !== playerIndex && !isWarJoinAction) {
      return false;
    }
  }

  // Special checks for rolling dice
  if (action === 'roll_dice') {
    if (room.gameState.jailStatus && room.gameState.jailStatus[playerIndex] > 0) {
      return false; // Jailed players cannot roll
    }
    if (room.gameState.isRolling || room.gameState.isProcessingTurn) {
      return false;
    }
  }

  return true;
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);


  // Host creates a new room
  socket.on('create_room', ({ name, avatar }) => {
    const roomCode = generateRoomCode();
    const sessionToken = generateSessionToken();
    
    rooms[roomCode] = {
      roomCode: roomCode, // Store roomCode for reliable broadcasts
      gameState: createInitialGameState(),
      players: [{
        id: 0,
        name,
        avatar,
        socketId: socket.id,
        isHost: true,
        connected: true, // Initial connection status
        sessionToken
      }]
    };
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerIndex = 0;
    
    console.log(`Room ${roomCode} created by ${name}`);
    
    socket.emit('room_created', { 
      roomCode, 
      playerIndex: 0,
      sessionToken,
      gameState: rooms[roomCode].gameState,
      players: rooms[roomCode].players
    });

    io.to(roomCode).emit('players_updated', { players: rooms[roomCode].players });
  });

  // Client joins an existing room
  socket.on('join_room', ({ roomCode, name, avatar }) => {
    const cleanRoomCode = String(roomCode || '').trim();
    const room = rooms[cleanRoomCode];
    
    if (!room) {
      socket.emit('error', { message: 'Room not found!' });
      return;
    }
    
    // --- RECONNECTION CHECK: only reconnect if an existing player was disconnected ---
    const disconnectedIndex = room.players.findIndex(p => !p.connected && p.name === name && p.avatar === avatar);

    if (disconnectedIndex !== -1) {
      const existingPlayer = room.players[disconnectedIndex];

      // --- RECONNECTION LOGIC ---
      console.log(`[SERVER] Player ${name} reconnecting to ${cleanRoomCode}`);

      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      existingPlayer.canBeKicked = false;
      existingPlayer.disconnectedAt = null;
      existingPlayer.reconnectDeadline = null;

      socket.join(cleanRoomCode);
      socket.roomCode = cleanRoomCode;
      socket.playerIndex = disconnectedIndex;

      if (existingPlayer.isHost && room.hostDisconnectTimer) {
        console.log(`[SERVER] Host reconnected! Cancelling destruction timer.`);
        clearTimeout(room.hostDisconnectTimer);
        room.hostDisconnectTimer = null;
      }

      if (room.playerDisconnectTimers && room.playerDisconnectTimers[disconnectedIndex]) {
        console.log(`[SERVER] Clearing disconnect timer for player ${existingPlayer.name}`);
        clearTimeout(room.playerDisconnectTimers[disconnectedIndex]);
        delete room.playerDisconnectTimers[disconnectedIndex];
      }

      if (room.warAutoRollTimer) {
        clearTimeout(room.warAutoRollTimer);
        room.warAutoRollTimer = null;
      }
      if (room.auctionAutoFoldTimers && room.auctionAutoFoldTimers[disconnectedIndex]) {
        clearTimeout(room.auctionAutoFoldTimers[disconnectedIndex]);
        delete room.auctionAutoFoldTimers[disconnectedIndex];
      }

      if (room.gameState && room.gameState.history) {
        room.gameState.history.unshift(`✅ ${existingPlayer.name} reconnected!`);
      }

      const isPlaying = room.gameState && room.gameState.gameStage === 'playing';

      socket.emit('session_reconnected', {
        roomCode: cleanRoomCode,
        playerIndex: disconnectedIndex,
        sessionToken: existingPlayer.sessionToken,
        gameState: room.gameState,
        players: room.players,
        gameStage: isPlaying ? 'playing' : 'lobby'
      });

      broadcastState(room);
      io.to(cleanRoomCode).emit('players_updated', { players: room.players });
      io.to(cleanRoomCode).emit('player_reconnected', {
        playerIndex: disconnectedIndex,
        playerName: existingPlayer.name
      });
      io.to(cleanRoomCode).emit('toast', { message: `✅ ${existingPlayer.name} reconnected!` });
      return;
    }

    // --- AUTO-RESOLVE name conflict: append number suffix if name is taken ---
    const takenNames = new Set(room.players.map(p => p.name));
    let finalName = name;
    if (takenNames.has(finalName)) {
      let counter = 2;
      while (takenNames.has(`${name} ${counter}`)) counter++;
      finalName = `${name} ${counter}`;
      console.log(`[SERVER] Name "${name}" taken, auto-renamed to "${finalName}"`);
    }
    // Note: duplicate avatars are allowed – players are distinguished by index, not avatar

    
    if (room.players.length >= 4) {
      socket.emit('error', { message: 'Room is full!' });
      return;
    }
    
    const playerIndex = room.players.length;
    const sessionToken = generateSessionToken();
    
    room.players.push({
      id: playerIndex,
      name: finalName,
      avatar,
      socketId: socket.id,
      isHost: false,
      connected: true, // Track connection status
      sessionToken
    });
    
    socket.join(cleanRoomCode);
    socket.roomCode = cleanRoomCode;
    socket.playerIndex = playerIndex;
    
    console.log(`${finalName} joined room ${cleanRoomCode} as player ${playerIndex}`);

    
    // Send join confirmation to the new player
    socket.emit('joined_room', {
      roomCode: cleanRoomCode,
      playerIndex,
      sessionToken,
      gameState: room.gameState,
      players: room.players
    });
    
    // Broadcast updated players list to all in room
    io.to(cleanRoomCode).emit('players_updated', { players: room.players });
  });

  // Session-based reconnection (for app relaunch within grace window)
  socket.on('reconnect_session', ({ roomCode, sessionToken, name, avatar, playerIndex: claimedIndex }) => {
    const cleanRoomCode = String(roomCode || '').trim();
    const room = rooms[cleanRoomCode];

    if (!room) {
      socket.emit('error', { message: 'Session expired or room not found.' });
      return;
    }

    // Find player by session token for secure reconnect
    const pIdx = claimedIndex !== undefined ? Number(claimedIndex) : -1;
    const player = room.players[pIdx];

    if (!player || player.sessionToken !== sessionToken) {
      // Fallback: match by name+avatar
      const fallbackIdx = room.players.findIndex(p => p.name === name && p.avatar === avatar);
      if (fallbackIdx === -1 || room.players[fallbackIdx].connected) {
        socket.emit('error', { message: 'Session token invalid. Please join normally.' });
        return;
      }
      // Allow fallback reconnect
      handleSessionReconnect(socket, room, fallbackIdx);
      return;
    }

    if (player.connected) {
      socket.emit('error', { message: 'Already connected from another device.' });
      return;
    }

    handleSessionReconnect(socket, room, pIdx);
  });


  // Start game (host only)
  socket.on('start_game', () => {
    // ... (unchanged logic, omitted for brevity, logic remains valid)
    const room = rooms[socket.roomCode];
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.gameState.gameStage = 'playing';
    console.log(`Game started in room ${socket.roomCode}`);
    io.to(socket.roomCode).emit('game_started', { gameState: room.gameState, players: room.players });
  });

  // Game action (roll, buy, end turn, etc.)
  socket.on('game_action', ({ action, payload }) => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    
    const playerIndex = socket.playerIndex;
    
    console.log(`[SERVER] Action: ${action} from P${playerIndex} in room ${socket.roomCode}. Host? ${room.players[playerIndex]?.isHost}`);
    console.log(`[SERVER] Current socket rooms:`, Array.from(socket.rooms));
    
    // Validate it's this player's turn and action is permitted
    if (!validatePlayerTurn(room, playerIndex, action)) {
      console.log(`[SERVER] Action ${action} rejected for P${playerIndex} (not permitted or not turn)`);
      socket.emit('error', { message: 'Action not allowed or not your turn!' });
      return;
    }
    
    // Process the action and update game state
    switch (action) {
      case 'roll_dice':
        handleRollDice(room, playerIndex, payload);
        break;
      case 'buy_property':
        handleBuyProperty(room, playerIndex, payload);
        break;
      case 'upgrade_property':
        handleUpgradeProperty(room, playerIndex, payload);
        break;
      case 'take_loan':
        handleTakeLoan(room, playerIndex, payload);
        break;
      case 'repay_loan':
        handleRepayLoan(room, playerIndex);
        break;
      case 'pay_bail':
        handlePayBail(room, playerIndex);
        break;
      case 'jail_skip':
        handleJailSkip(room, playerIndex);
        break;
      case 'parking_confirm':
        handleParkingConfirm(room, playerIndex);
        break;
      case 'card_action':
        handleCardAction(room, playerIndex, payload);
        break;
      case 'train_travel':
        handleTrainTravel(room, playerIndex, payload);
        break;
      case 'attempt_robbery':
        handleAttemptRobbery(room, playerIndex);
        break;
      case 'close_modal':
        room.gameState.modalState = { type: 'NONE', status: 'IDLE', payload: {} };
        room.gameState.isProcessingTurn = false;
        broadcastState(room);
        break;
      case 'floating_price':
        if (payload && payload.tileIndex !== undefined) {
          io.to(room.roomCode).emit('floating_price', payload);
        }
        break;
      case 'bankrupt':
        console.log(`[SERVER] Player ${playerIndex} declared bankruptcy`);
        Object.keys(room.gameState.propertyOwnership).forEach(tileIdx => {
          if (room.gameState.propertyOwnership[tileIdx] === playerIndex) {
            delete room.gameState.propertyOwnership[tileIdx];
            if (room.gameState.propertyLevels[tileIdx]) {
              delete room.gameState.propertyLevels[tileIdx];
            }
          }
        });
        if (!room.gameState.bankruptPlayers) room.gameState.bankruptPlayers = {};
        room.gameState.bankruptPlayers[playerIndex] = true;
        if (room.gameState.playerLoans) delete room.gameState.playerLoans[playerIndex];
        const bankruptName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
        room.gameState.history.unshift(`💀 ${bankruptName} declared BANKRUPTCY!`);
        if (room.gameState.currentPlayer === playerIndex) {
          handleEndTurn(room);
        }
        broadcastState(room);
        checkForWinner(room);
        break;
      case 'kick_player':
        // Allow any player who is currently a host (not just playerIndex===0, for host migration support)
        const isActingHost = room.players[playerIndex]?.isHost;
        if (isActingHost && payload && payload.targetIndex !== undefined && payload.targetIndex !== playerIndex) {
          const targetIdx = payload.targetIndex;
          const targetPlayer = room.players[targetIdx];
          if (targetPlayer) {
            console.log(`[SERVER] Host kicked player ${targetPlayer.name} (P${targetIdx})`);
            targetPlayer.kicked = true;
            targetPlayer.connected = false;
            if (!room.gameState.bankruptPlayers) room.gameState.bankruptPlayers = {};
            room.gameState.bankruptPlayers[targetIdx] = true;

            // Release their properties back to unowned
            if (room.gameState.propertyOwnership) {
              Object.keys(room.gameState.propertyOwnership).forEach(tileIdx => {
                if (room.gameState.propertyOwnership[tileIdx] === targetIdx) {
                  delete room.gameState.propertyOwnership[tileIdx];
                  if (room.gameState.propertyLevels) {
                    delete room.gameState.propertyLevels[tileIdx];
                  }
                }
              });
            }

            if (room.gameState.history) {
              room.gameState.history.unshift(`👢 ${targetPlayer.name} was kicked by the host.`);
            }

            // Clear their disconnect timer if running
            if (room.playerDisconnectTimers && room.playerDisconnectTimers[targetIdx]) {
              clearTimeout(room.playerDisconnectTimers[targetIdx]);
              delete room.playerDisconnectTimers[targetIdx];
            }

            // If it was this player's turn, advance to next player
            if (room.gameState.currentPlayer === targetIdx) {
              handleEndTurn(room);
            }

            broadcastState(room);
            io.to(room.roomCode).emit('players_updated', { players: room.players });
            io.to(room.roomCode).emit('toast', { message: `👢 ${targetPlayer.name} was kicked by the host.` });
            checkForWinner(room);
          }
        }
        break;
      case 'skip_offline_turn':
        const hostPlayer = room.players[playerIndex];
        if (hostPlayer && hostPlayer.isHost && payload && payload.targetIndex !== undefined) {
          const targetP = room.players[payload.targetIndex];
          if (targetP && !targetP.connected && room.gameState.currentPlayer === payload.targetIndex) {
            console.log(`[SERVER] Host force skipped turn for offline player ${targetP.name} (P${payload.targetIndex})`);
            room.gameState.history.unshift(`⏭️ Host skipped turn for offline player ${targetP.name}.`);
            room.gameState.modalState = { type: 'NONE', status: 'IDLE', payload: {} };
            room.gameState.hoppingPlayer = null;
            room.gameState.isProcessingTurn = false;
            handleEndTurn(room);
            broadcastState(room);
            io.to(room.roomCode).emit('toast', { message: `⏭️ Turn skipped for ${targetP.name}` });
          }
        }
        break;
      case 'modal_open':
        // Generic modal broadcast (Chance, Chest, Parking, Rob Bank)
        if (payload && payload.type) {
            console.log(`[SERVER] Broadcasting modal_open: ${payload.type}`);
            room.gameState.modalState = {
                type: payload.type,
                status: payload.status || 'ACTIVE',
                payload: payload.payload || {}
            };
            if (payload.type === 'ROB_BANK') {
              room.gameState.isProcessingTurn = true;
            }
            broadcastState(room);
        }
        break;
      case 'auction_cancel':
        room.gameState.auctionState = {
            status: 'idle',
            propertyIndex: null,
            initiator: null,
            bids: [],
            currentBid: 0,
            participants: [],
            winner: null
        };
        console.log(`[SERVER] Auction Cancelled by Player ${playerIndex}`);
        broadcastState(room);
        break;
      // Auction Actions
      case 'auction_start_selection':
        room.gameState.auctionState.status = 'thinking';
        room.gameState.auctionState.initiator = playerIndex;
        // Reset auction state
        room.gameState.auctionState.bids = [];
        room.gameState.auctionState.currentBid = 0; // No bid yet
        room.gameState.auctionState.participants = room.players.map((_, idx) => idx);
        room.gameState.auctionState.winner = null;
        room.gameState.auctionState.propertyIndex = null;
        room.gameState.auctionState.currentBidder = null; // Will be set in 'active' phase
        console.log(`[SERVER] Auction Selection Started by Player ${playerIndex}`);
        broadcastState(room); // Broadcast 'thinking' to all players
        break;
      case 'war_init':
        // Property War started - set server-side warState and broadcast
        room.gameState.warState = {
          active: true,
          mode: payload.mode || 'A',
          phase: 'join',
          participants: [], // Start with empty array (players join manually)
          rolls: {},
          property: null,
          propertyIndex: null, // Initialize propertyIndex
          currentRoller: null,
          diceValues: [1, 1],
          isRolling: false // Initialize isRolling
        };
        
        // Add history entry on server side
        room.gameState.history.unshift(`⚔️ ${room.players[playerIndex]?.name || 'Player'} triggered PROPERTY WAR!`);
        
        console.log(`[SERVER] Property War initiated by Player ${playerIndex}, mode: ${payload.mode}`);
        broadcastState(room);
        break;
      case 'war_join':
        handleWarJoin(room, playerIndex);
        break;
      case 'war_withdraw':
        handleWarWithdraw(room, playerIndex);
        break;
      case 'update_state':
        console.warn(`[SERVER] Blocked update_state from P${playerIndex}: Action is deprecated and insecure.`);
        socket.emit('error', { message: 'update_state is disabled. Use authoritative game actions.' });
        break;
      case 'chance_move':
        // Synchronized movement for Chance cards, Jail, and Fast Travel
        if (payload) {
          const { playerIndex: movePlayerIdx, targetPos, steps, delay, cardText, isJail, oldPos } = payload;
          const pIdx = movePlayerIdx !== undefined ? movePlayerIdx : playerIndex;
          const currentPos = oldPos !== undefined ? oldPos : room.gameState.playerPositions[pIdx];
          room.gameState.playerPositions[pIdx] = targetPos;
          
          if (isJail) {
            if (!room.gameState.jailStatus) room.gameState.jailStatus = {};
            room.gameState.jailStatus[pIdx] = 3;
          }
          
          // Passing GO reward ($1000)
          if (!isJail && steps > 0 && (targetPos === 0 || (currentPos + steps >= 36))) {
            room.gameState.playerMoney[pIdx] += 1000;
            const pName = room.players[pIdx]?.name || `Player ${pIdx}`;
            room.gameState.history.unshift(`${pName} passed GO! Collect $1000`);
            io.to(room.roomCode).emit('floating_price', {
              tileIndex: 0,
              price: 1000,
              isPositive: true
            });
          }
          
          if (cardText) {
            const pName = room.players[pIdx]?.name || `Player ${pIdx}`;
            room.gameState.history.unshift(`❓ ${pName}: ${cardText}`);
          }
          
          console.log(`[SERVER] Broadcasting chance_move_animated: P${pIdx} from ${currentPos} to ${targetPos} (${steps} steps)`);
          io.to(room.roomCode).emit('chance_move_animated', {
            playerIndex: pIdx,
            oldPos: currentPos,
            targetPos,
            steps,
            delay: delay || 180,
            cardText
          });
          
          broadcastState(room);
        }
        break;
      case 'build_complete':
        handleBuildComplete(room, playerIndex, payload);
        break;
      case 'sell_buildings':
        handleSellBuildings(room, playerIndex, payload);
        break;
      case 'cash_stack_claim':
        // Must be standing on tile 3
        if (room.gameState.playerPositions[playerIndex] !== 3) {
          console.warn(`[SERVER] Rejected cash_stack_claim from P${playerIndex} (not on tile 3)`);
          break;
        }
        const pot = room.gameState.cashStack || 0;
        if (pot > 0) {
            room.gameState.playerMoney[playerIndex] += pot;
            room.gameState.cashStack = 0;
            room.gameState.history.unshift(`💰 ${room.players[playerIndex]?.name || 'Player'} won the Cash Stack: $${pot}!`);
            console.log(`[SERVER] Player ${playerIndex} claimed Cash Stack: $${pot}`);
            
            // Broadcast floating price animation to ALL players
            io.to(room.roomCode).emit('floating_price', {
              tileIndex: 3,           // Cash Stack tile
              price: pot,             // Amount won
              isPositive: true,       // Green (positive) animation
              label: `+$${pot}`       // Optional: custom label
            });
            broadcastState(room);
        }
        break;
      case 'war_start':
        // Start the war (host/initiator only)
        if (room.gameState.warState && room.gameState.warState.phase === 'join') {
          handleWarStart(room, payload);
        }
        break;
      case 'war_roll':
        // Player rolls their dice
        if (room.gameState.warState && room.gameState.warState.phase === 'roll') {
            const warState = room.gameState.warState;
            const currentRollerIdx = warState.participants[warState.currentRoller];
            if (playerIndex === currentRollerIdx) {
                 handleWarRoll(room);
            }
        }
        break;
      case 'war_close':
        // Close the war modal and reset state
        room.gameState.warState = {
          active: false,
          mode: 'A',
          phase: 'idle',
          participants: [],
          rolls: {},
          property: null,
          currentRoller: null,
          diceValues: [1, 1],
          tiedPlayers: null,
          tieRoll: null
        };
        console.log(`[SERVER] Property War closed`);
        broadcastState(room);
        break;
      case 'auction_select_property':
        handleAuctionSelect(room, playerIndex, payload);
        break;
      case 'auction_place_bid':
        handleAuctionBid(room, playerIndex, payload);
        break;
      case 'auction_fold':
        handleAuctionFold(room, playerIndex);
        break;
      case 'auction_complete':
        handleAuctionComplete(room, payload);
        break;
      case 'landed':
        // GUARD: Prevent duplicate landing processing this turn
        if (room.gameState.landingResolved) {
          console.log(`[SERVER] Landing ignored - already resolved this turn`);
          break;
        }
        room.gameState.landingResolved = true;
        
        // Authoritative landing processing
        handleLanding(room, playerIndex, room.gameState.playerPositions[playerIndex]);
        room.gameState.hoppingPlayer = null;
        if (!room.gameState.modalState || room.gameState.modalState.type === 'NONE') {
          room.gameState.isProcessingTurn = false;
        }
        broadcastState(room);
        break;
      case 'audit_show':
        console.log('[SERVER] Received audit_show. Broadcasting AUDIT modal.');
        // Show audit modal to all players
        room.gameState.modalState = {
          type: 'AUDIT',
          status: 'RESULT',
          payload: {
            diceValues: payload.diceValues,
            taxAmount: payload.taxAmount
          }
        };
        break;
      case 'audit_complete':
        // Clear audit modal safely without client state injection
        room.gameState.modalState = { type: 'NONE', status: 'IDLE', payload: {} };
        room.gameState.isProcessingTurn = false;
        broadcastState(room);
        break;
      case 'deal_offer':
        handleDealOffer(room, playerIndex, payload);
        break;
      case 'deal_cancel':
        handleDealCancel(room, playerIndex);
        break;
      case 'deal_response':
        handleDealResponse(room, playerIndex, payload);
        break;
      case 'exit_game':
        // Player voluntarily exits (like bankruptcy but manual)
        console.log(`[SERVER] Player ${playerIndex} exiting game voluntarily`);
        
        // Clear all properties owned by this player
        Object.keys(room.gameState.propertyOwnership).forEach(tileIdx => {
          if (room.gameState.propertyOwnership[tileIdx] === playerIndex) {
            delete room.gameState.propertyOwnership[tileIdx];
            // Also clear any buildings on these properties
            if (room.gameState.propertyLevels[tileIdx]) {
              delete room.gameState.propertyLevels[tileIdx];
            }
          }
        });
        
        // Mark player as "bankrupt" (exits turn rotation)
        room.gameState.bankruptPlayers[playerIndex] = true;
        
        // Mark player as disconnected/exited
        if (room.players[playerIndex]) {
          room.players[playerIndex].connected = false;
          room.players[playerIndex].exited = true;
        }
        
        const exitingPlayerName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
        room.gameState.history.unshift(`🚪 ${exitingPlayerName} has left the game!`);
        
        // Notify all players
        io.to(room.roomCode).emit('player_exited', { 
          playerIndex, 
          playerName: exitingPlayerName 
        });
        
        // If it was their turn, end it
        if (room.gameState.currentPlayer === playerIndex) {
          handleEndTurn(room);
        }
        
        broadcastState(room);
        checkForWinner(room);
        break;
      case 'end_turn':
        handleEndTurn(room);
        break;
    }
    
    // Broadcast updated state to all players
    console.log(`[SERVER] Broadcasting state to room ${socket.roomCode}. propertyOwnership:`, JSON.stringify(room.gameState.propertyOwnership));
    io.to(socket.roomCode).emit('state_update', { 
      gameState: room.gameState,
      players: room.players
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    const roomCode = socket.roomCode;
    if (roomCode && rooms[roomCode]) {
      const room = rooms[roomCode];
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];

        // If player voluntarily exited already (exit_game action), skip disconnect handling
        if (player.exited) return;

        player.connected = false; // Mark as disconnected (don't remove yet)
        
        console.log(`[SERVER] Player ${player.name} disconnected (Host: ${player.isHost})`);
        
        const disconnectedAt = Date.now();
        const reconnectDeadline = disconnectedAt + 60000;
        player.disconnectedAt = disconnectedAt;
        player.reconnectDeadline = reconnectDeadline;
        player.canBeKicked = false;

        // If game is in progress, announce in history
        if (room.gameState && room.gameState.history) {
          room.gameState.history.unshift(`⚠️ ${player.name} went offline. 60s to reconnect...`);
          broadcastState(room);
        }

        // Notify all clients: disconnect with deadline for live countdown UI
        io.to(roomCode).emit('players_updated', { players: room.players });
        io.to(roomCode).emit('player_disconnected', {
          playerIndex,
          playerName: player.name,
          reconnectDeadline,
          graceSeconds: 60
        });

        // --- EDGE CASE: Active Deal — auto-deny if either party goes offline ---
        if (room.gameState && room.gameState.activeDeal) {
          const deal = room.gameState.activeDeal;
          if (deal.proposer === playerIndex || deal.recipient === playerIndex) {
            console.log(`[SERVER] Auto-denying active deal because Player ${playerIndex} disconnected`);
            const proposerSocket = room.players[deal.proposer]?.socketId;
            room.gameState.activeDeal = null;
            if (proposerSocket) {
              io.to(proposerSocket).emit('deal_result', { accepted: false, deal });
            }
            room.gameState.history && room.gameState.history.unshift(`❌ Deal cancelled — ${player.name} went offline.`);
            broadcastState(room);
          }
        }

        // --- EDGE CASE: Auction — auto-fold if the current bidder disconnects ---
        if (
          room.gameState &&
          room.gameState.auctionState &&
          room.gameState.auctionState.status === 'active' &&
          room.gameState.auctionState.currentBidder === playerIndex
        ) {
          console.log(`[SERVER] Active bidder P${playerIndex} disconnected. Auto-fold in 10s.`);
          if (!room.auctionAutoFoldTimers) room.auctionAutoFoldTimers = {};
          room.auctionAutoFoldTimers[playerIndex] = setTimeout(() => {
            if (!player.connected && room.gameState.auctionState && room.gameState.auctionState.currentBidder === playerIndex) {
              console.log(`[SERVER] Auto-folding offline bidder P${playerIndex} in auction`);
              handleAuctionFold(room, playerIndex);
              broadcastState(room);
            }
          }, 10000);
        }

        // --- EDGE CASE: Property War — auto-roll if the rolling player disconnects ---
        if (
          room.gameState &&
          room.gameState.warState &&
          room.gameState.warState.phase === 'roll' &&
          room.gameState.warState.participants &&
          room.gameState.warState.participants[room.gameState.warState.currentRoller] === playerIndex
        ) {
          console.log(`[SERVER] War roller P${playerIndex} disconnected. Auto-roll in 6s.`);
          room.warAutoRollTimer = setTimeout(() => {
            if (
              !player.connected &&
              room.gameState.warState &&
              room.gameState.warState.phase === 'roll' &&
              room.gameState.warState.participants[room.gameState.warState.currentRoller] === playerIndex
            ) {
              console.log(`[SERVER] Auto-rolling for offline war player P${playerIndex}`);
              handleWarRoll(room);
              broadcastState(room);
            }
          }, 6000);
        }

        // Start 60-second grace timer for this player (turn skip & kick eligibility)
        if (!room.playerDisconnectTimers) room.playerDisconnectTimers = {};
        if (room.playerDisconnectTimers[playerIndex]) {
          clearTimeout(room.playerDisconnectTimers[playerIndex]);
        }

        room.playerDisconnectTimers[playerIndex] = setTimeout(() => {
          if (!player.connected) {
            console.log(`[SERVER] 60s expired: Player ${player.name} (P${playerIndex}) did not return.`);
            player.canBeKicked = true;
            player.reconnectDeadline = null;

            // If it's currently this player's turn, skip their turn
            if (room.gameState && room.gameState.currentPlayer === playerIndex) {
              console.log(`[SERVER] 1 minute elapsed: Skipping turn for offline player ${player.name}`);
              // Clear any open modal that could be blocking turn progression
              if (room.gameState.modalState && room.gameState.modalState.type !== 'NONE') {
                room.gameState.modalState = { type: 'NONE', status: 'IDLE', payload: {} };
                room.gameState.isProcessingTurn = false;
              }
              if (room.gameState.history) {
                room.gameState.history.unshift(`⏭️ Skipped turn for ${player.name} (offline > 1 min).`);
              }
              handleEndTurn(room);
            } else if (room.gameState && room.gameState.history) {
              room.gameState.history.unshift(`⏱️ ${player.name} offline > 1 min. Host can kick.`);
            }

            broadcastState(room);
            io.to(roomCode).emit('players_updated', { players: room.players });
            io.to(roomCode).emit('toast', { message: `⏱️ ${player.name} exceeded 1 min offline. Turn skipped.` });
          }
        }, 60000);
        
        // If HOST disconnected, start host migration timer (60s grace, then migrate instead of close)
        if (player.isHost) {
          console.log(`[SERVER] Host disconnected! Starting 60s migration timer.`);
          
          // Clear existing timer if any
          if (room.hostDisconnectTimer) clearTimeout(room.hostDisconnectTimer);
          
          room.hostDisconnectTimer = setTimeout(() => {
            // Check if host is STILL disconnected
            if (!player.connected) {
              // Try to find the next active connected player to promote as host
              const nextHostIdx = room.players.findIndex((p, idx) => idx !== playerIndex && p.connected && !p.kicked && !p.exited);
              
              if (nextHostIdx !== -1) {
                // Migrate host to next connected player
                player.isHost = false;
                room.players[nextHostIdx].isHost = true;
                console.log(`[SERVER] Host migrated from P${playerIndex} to P${nextHostIdx} (${room.players[nextHostIdx].name})`);
                
                if (room.gameState && room.gameState.history) {
                  room.gameState.history.unshift(`👑 ${room.players[nextHostIdx].name} is now the host.`);
                }
                
                broadcastState(room);
                io.to(roomCode).emit('players_updated', { players: room.players });
                io.to(roomCode).emit('host_migrated', {
                  newHostIndex: nextHostIdx,
                  newHostName: room.players[nextHostIdx].name
                });
                io.to(roomCode).emit('toast', { message: `👑 ${room.players[nextHostIdx].name} is now the host.` });
              } else {
                // No connected players left — close the room
                console.log(`[SERVER] No active players left. Closing room ${roomCode}.`);
                io.to(roomCode).emit('room_closed', { message: 'All players left. Room closed.' });
                delete rooms[roomCode];
              }
            }
          }, 60000); // 60 seconds grace period
        }
      }
    }
  });

});

// Helper: Check for Monopoly on Server
function hasMonopoly(room, tileIndex, ownerIndex) {
  const property = RENT_DATA[tileIndex];
  if (!property) return false;
  
  const groupId = property.groupId;
  const groupTiles = Object.keys(RENT_DATA).filter(key => RENT_DATA[key].groupId === groupId);
  
  return groupTiles.every(tIndex => Number(room.gameState.propertyOwnership[tIndex]) === Number(ownerIndex));
}

// Helper: Calculate Rent on Server
function calculateRent(room, tileIndex) {
  const ownership = room.gameState.propertyOwnership;
  const levels = room.gameState.propertyLevels;
  
  // 1. Check if it's a Train
  if (TRAIN_TILES.includes(tileIndex)) {
    const ownerIndex = ownership[tileIndex];
    if (ownerIndex === undefined) return 0;
    
    const ownedTrains = TRAIN_TILES.filter(t => ownership[t] === ownerIndex).length;
    return TRAIN_RENT[ownedTrains - 1] || 0;
  }
  
  // 2. Regular Property
  const property = RENT_DATA[tileIndex];
  if (!property) return 0;
  
  const ownerIndex = ownership[tileIndex];
  const level = levels[tileIndex] || 0;
  
  if (level === 0 && hasMonopoly(room, tileIndex, ownerIndex)) {
    return property.rentLevels[0] * 2;
  }
  
  return property.rentLevels[level] || property.rentLevels[0];
}

// Authoritative Landing Logic
function handleLanding(room, playerIndex, tileIndex) {
  const property = RENT_DATA[tileIndex];
  const ownership = room.gameState.propertyOwnership;
  const ownerIndex = ownership[tileIndex];

  console.log(`[SERVER] Processing Landing for P${playerIndex} on Tile ${tileIndex}`);

  if (property && ownerIndex !== undefined && Number(ownerIndex) !== playerIndex) {
    // Check if owner is bankrupt
    if (room.gameState.bankruptPlayers && room.gameState.bankruptPlayers[ownerIndex]) {
      console.log(`[SERVER] Rent skipped: Owner ${ownerIndex} is bankrupt`);
      return;
    }
    // 1. RENT PROCESSING
    const jailStatus = room.gameState.jailStatus || {};
    if (jailStatus[ownerIndex] > 0) {
      room.gameState.history.unshift(`${room.players[playerIndex].name} pays NO rent - Owner is in Jail!`);
    } else {
      const rent = calculateRent(room, tileIndex);
      const ownerPos = room.gameState.playerPositions[ownerIndex];

      // Deduct rent
      room.gameState.playerMoney[playerIndex] -= rent;
      room.gameState.playerMoney[ownerIndex] += rent;
      
      room.gameState.history.unshift(`${room.players[playerIndex].name} paid $${rent} rent to ${room.players[ownerIndex].name}`);

      // Broadcast Floating Prices
      io.to(room.roomCode).emit('floating_price', { tileIndex: tileIndex, price: rent, isPositive: false });
      io.to(room.roomCode).emit('floating_price', { tileIndex: ownerPos, price: rent, isPositive: true });
    }
  } else if (tileIndex === 7) {
    // 2. THE AUDIT (TAX)
    const dice = room.gameState.diceValues || [1, 1];
    const tax = (dice[0] + dice[1]) * 300;
    
    room.gameState.playerMoney[playerIndex] -= tax;
    room.gameState.cashStack = (room.gameState.cashStack || 0) + tax;
    
    room.gameState.history.unshift(`🧾 ${room.players[playerIndex].name} paid $${tax} in THE AUDIT!`);
    
    io.to(room.roomCode).emit('floating_price', { tileIndex: 7, price: tax, isPositive: false });
  } else if (tileIndex === 28) {
    // 3. GO TO JAIL
    const duration = Math.floor(Math.random() * 2) + 2; 
    if (!room.gameState.jailStatus) room.gameState.jailStatus = {};
    room.gameState.jailStatus[playerIndex] = duration;
    room.gameState.playerPositions[playerIndex] = 28; // Authoritatively move to Jail
    room.gameState.history.unshift(`👮 ${room.players[playerIndex].name} is arrested for ${duration} turns!`);
  } else if (tileIndex === 3) {
    // 4. CASH STACK (Server processed immediately upon landing if not handled by dedicated claim action)
    const pot = room.gameState.cashStack || 0;
    if (pot > 0) {
       room.gameState.playerMoney[playerIndex] += pot;
       room.gameState.cashStack = 0;
       room.gameState.history.unshift(`💰 ${room.players[playerIndex]?.name || 'Player'} won the Cash Stack: $${pot}!`);
       
       io.to(room.roomCode).emit('floating_price', { tileIndex: 3, price: pot, isPositive: true });
    } else {
       room.gameState.history.unshift(`${room.players[playerIndex]?.name || 'Player'} landed on Cash Stack, but it's empty!`);
    }
  } else if (tileIndex === 18) {
    // 5. ROB BANK
    room.gameState.modalState = {
      type: 'ROB_BANK',
      status: 'IDLE',
      payload: { playerIndex }
    };
    room.gameState.isProcessingTurn = true;
  }
}

// Game logic handlers
function handleRollDice(room, playerIndex, payload = {}) {
  if (room.gameState.isRolling || room.gameState.isProcessingTurn) return;
  
  room.gameState.isRolling = true;
  room.gameState.isProcessingTurn = true;
  room.gameState.landingResolved = false; // Reset for this roll
  
  // BROADCAST: Dice roll started - so ALL players animate and play sound
  console.log(`[SERVER-DEBUG] Broadcasting dice_roll_started to room ${room.roomCode} for roller ${playerIndex}`);
  io.to(room.roomCode).emit('dice_roll_started', { roller: playerIndex });
  
  // Sync "isRolling" state immediately so clients know we are busy
  broadcastState(room);

  // MANDATORY DELAY: Wait 1s for animation to play on all clients
  setTimeout(() => {
      // 1. Generate Dice
      let die1, die2;
      if (process.env.NODE_ENV === 'development' && payload.forcedValue) {
        die1 = Math.floor(payload.forcedValue / 2);
        die2 = payload.forcedValue - die1;
      } else {
        die1 = Math.floor(Math.random() * 6) + 1;
        die2 = Math.floor(Math.random() * 6) + 1;
      }
      const moveAmount = die1 + die2;
      const isDoubles = die1 === die2;
      
      room.gameState.diceValues = [die1, die2];
      
      // 2. Update Position
      const currentPos = room.gameState.playerPositions[playerIndex];
      const newPos = (currentPos + moveAmount) % 36;
      room.gameState.playerPositions[playerIndex] = newPos;
      
      // Passing GO logic:
      if (newPos < currentPos) {
        room.gameState.playerMoney[playerIndex] += 1000;
        room.gameState.history.unshift(`${room.players[playerIndex]?.name || 'Player'} passed GO! +$1000`);
      }

      // Authoritative Loan Tracking across laps
      if (room.gameState.playerLoans && room.gameState.playerLoans[playerIndex]) {
        const loan = room.gameState.playerLoans[playerIndex];
        let passedLoanTile = false;
        if (newPos < currentPos) {
          // Wrapped around board
          passedLoanTile = (loan.loanStartTile >= currentPos || loan.loanStartTile <= newPos);
        } else {
          passedLoanTile = (loan.loanStartTile >= currentPos && loan.loanStartTile <= newPos);
        }
        
        if (passedLoanTile && loan.loanStartTile !== currentPos) {
          loan.lapsRemaining -= 1;
          const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
          if (loan.lapsRemaining <= 0) {
            const repayAmt = loan.repayAmount;
            room.gameState.playerMoney[playerIndex] -= repayAmt;
            delete room.gameState.playerLoans[playerIndex];
            room.gameState.history.unshift(`🏦 Bank auto-debited $${repayAmt.toLocaleString()} loan repayment from ${pName}`);
            io.to(room.roomCode).emit('floating_price', {
              tileIndex: newPos,
              price: repayAmt,
              isPositive: false
            });
          } else {
            room.gameState.history.unshift(`🏦 ${pName} completed a lap! ${loan.lapsRemaining} lap${loan.lapsRemaining > 1 ? 's' : ''} left to repay loan.`);
          }
        }
      }
      
      room.gameState.history.unshift(
        `${room.players[playerIndex]?.name || 'Player'} rolled ${moveAmount}${isDoubles ? ' (DOUBLES!)' : ''}`
      );
      if (room.gameState.history.length > 50) room.gameState.history.length = 50;
      
      room.gameState.hoppingPlayer = playerIndex;
      room.gameState.isRolling = false;
      // Only finish turn if NOT doubles
      room.gameState.turnFinished = !isDoubles;
      
      // 4. Broadcast Final Result (stops dice animation & triggers client hop animation)
      broadcastState(room);
      
      // Fallback: If client disconnects or fails to send 'landed' action within 8s, resolve landing
      if (room.landingFallbackTimer) clearTimeout(room.landingFallbackTimer);
      room.landingFallbackTimer = setTimeout(() => {
        if (!room.gameState.landingResolved) {
          console.log(`[SERVER] Fallback landing triggered for P${playerIndex} on tile ${newPos}`);
          room.gameState.landingResolved = true;
          handleLanding(room, playerIndex, newPos);
          room.gameState.hoppingPlayer = null;
          if (!room.gameState.modalState || room.gameState.modalState.type === 'NONE') {
            room.gameState.isProcessingTurn = false;
          }
          broadcastState(room);
        }
      }, 8000); 
      
  }, 1000);
}

function handleBuyProperty(room, playerIndex, payload) {
  const { tileIndex } = payload || {};
  if (tileIndex === undefined) {
    console.log(`[SERVER] Buy failed: Missing tileIndex`);
    return;
  }
  
  const pIndex = Number(playerIndex);
  const tIndex = Number(tileIndex);
  const prop = RENT_DATA[tIndex];
  if (!prop) {
    console.log(`[SERVER] Buy failed: Invalid tileIndex ${tIndex}`);
    return;
  }
  
  // Verify player is actually on this tile
  if (room.gameState.playerPositions[pIndex] !== tIndex) {
    console.log(`[SERVER] Buy failed: Player ${pIndex} not on tile ${tIndex}`);
    return;
  }
  
  // Verify tile is currently unowned
  if (room.gameState.propertyOwnership[tIndex] !== undefined) {
    console.log(`[SERVER] Buy failed: Tile ${tIndex} already owned`);
    return;
  }
  
  // Authoritative price from server game data
  const cost = prop.price;
  if (room.gameState.playerMoney[pIndex] >= cost) {
    room.gameState.playerMoney[pIndex] -= cost;
    room.gameState.propertyOwnership[tIndex] = pIndex;
    console.log(`[SERVER] Ownership updated: Tile ${tIndex} -> Player ${pIndex} for $${cost}`);
    
    room.gameState.history.unshift(
      `${room.players[pIndex]?.name || 'Player'} bought ${prop.name} for $${cost.toLocaleString()}`
    );
    if (room.gameState.history.length > 50) room.gameState.history.length = 50;
    
    const playerPos = room.gameState.playerPositions[pIndex];
    io.to(room.roomCode).emit('floating_price', {
         tileIndex: playerPos,
         price: cost,
         isPositive: false
    });
    const isDoubles = room.gameState.diceValues && room.gameState.diceValues[0] === room.gameState.diceValues[1];
    room.gameState.turnFinished = !isDoubles;
    room.gameState.isProcessingTurn = false;
    broadcastState(room);
  } else {
    console.log(`[SERVER] Buy failed: Insufficient funds ($${room.gameState.playerMoney[pIndex]} < $${cost})`);
  }
}

function handleUpgradeProperty(room, playerIndex, payload) {
  const { tileIndex } = payload || {};
  if (tileIndex === undefined) return;
  const tIndex = Number(tileIndex);
  const prop = RENT_DATA[tIndex];
  if (!prop || !prop.upgradeCost) return;
  
  if (Number(room.gameState.propertyOwnership[tIndex]) !== playerIndex) return;
  if (!hasMonopoly(room, tIndex, playerIndex)) return;
  
  const currentLevel = room.gameState.propertyLevels[tIndex] || 0;
  if (currentLevel >= 5) return;
  
  const cost = prop.upgradeCost;
  if (room.gameState.playerMoney[playerIndex] >= cost) {
    room.gameState.playerMoney[playerIndex] -= cost;
    room.gameState.propertyLevels[tIndex] = currentLevel + 1;
    
    room.gameState.history.unshift(
      `${room.players[playerIndex]?.name || 'Player'} upgraded ${prop.name} for $${cost.toLocaleString()}`
    );
    if (room.gameState.history.length > 50) room.gameState.history.length = 50;
    broadcastState(room);
  }
}

function handleBuildComplete(room, playerIndex, payload) {
  const newLevels = payload?.propertyLevels;
  if (!newLevels || typeof newLevels !== 'object') return;
  
  const oldLevels = room.gameState.propertyLevels || {};
  let totalCost = 0;
  
  for (const tileStr of Object.keys(newLevels)) {
    const tileIdx = Number(tileStr);
    const oldL = oldLevels[tileIdx] || 0;
    const newL = Number(newLevels[tileIdx]) || 0;
    
    if (newL === oldL) continue;
    if (newL < 0 || newL > 5 || !Number.isInteger(newL)) return;
    if (newL <= oldL) return; // Upgrades only
    
    if (Number(room.gameState.propertyOwnership[tileIdx]) !== playerIndex) {
      console.log(`[SERVER] Build rejected: P${playerIndex} does not own tile ${tileIdx}`);
      return;
    }
    
    if (!hasMonopoly(room, tileIdx, playerIndex)) {
      console.log(`[SERVER] Build rejected: P${playerIndex} lacks monopoly for tile ${tileIdx}`);
      return;
    }
    
    const propData = RENT_DATA[tileIdx];
    if (!propData || !propData.upgradeCost) return;
    
    totalCost += (newL - oldL) * propData.upgradeCost;
  }
  
  if (totalCost <= 0) return;
  if (room.gameState.playerMoney[playerIndex] < totalCost) {
    console.log(`[SERVER] Build rejected: P${playerIndex} insufficient funds ($${room.gameState.playerMoney[playerIndex]} < $${totalCost})`);
    return;
  }
  
  room.gameState.playerMoney[playerIndex] -= totalCost;
  for (const [tileIdx, lvl] of Object.entries(newLevels)) {
    if (Number(room.gameState.propertyOwnership[tileIdx]) === playerIndex) {
      room.gameState.propertyLevels[tileIdx] = Number(lvl);
    }
  }
  
  const buildPlayerName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  room.gameState.history.unshift(`🏗️ ${buildPlayerName} built upgrades for $${totalCost.toLocaleString()}`);
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  
  const buildPlayerPos = room.gameState.playerPositions[playerIndex];
  io.to(room.roomCode).emit('floating_price', { 
    tileIndex: buildPlayerPos, 
    price: totalCost, 
    isPositive: false 
  });
  
  broadcastState(room);
}

function handleSellBuildings(room, playerIndex, payload) {
  const newLevels = payload?.propertyLevels;
  if (!newLevels || typeof newLevels !== 'object') return;
  
  let sellTotalRefund = 0;
  const oldLevels = room.gameState.propertyLevels || {};
  
  for (const tileStr of Object.keys(newLevels)) {
    const tileIdx = Number(tileStr);
    const oldL = oldLevels[tileIdx] || 0;
    const newL = Number(newLevels[tileIdx]) || 0;
    
    if (newL >= oldL) continue;
    if (newL < 0 || !Number.isInteger(newL)) return;
    
    if (Number(room.gameState.propertyOwnership[tileIdx]) !== playerIndex) {
      console.log(`[SERVER] Sell rejected: P${playerIndex} does not own tile ${tileIdx}`);
      return;
    }
    
    const propData = RENT_DATA[tileIdx];
    if (!propData || !propData.upgradeCost) return;
    
    sellTotalRefund += Math.round(propData.upgradeCost * 0.5) * (oldL - newL);
  }
  
  if (sellTotalRefund > 0) {
    for (const [tileIdx, lvl] of Object.entries(newLevels)) {
      if (Number(room.gameState.propertyOwnership[tileIdx]) === playerIndex) {
        const numLvl = Number(lvl);
        if (numLvl === 0) {
          delete room.gameState.propertyLevels[tileIdx];
        } else {
          room.gameState.propertyLevels[tileIdx] = numLvl;
        }
      }
    }
    room.gameState.playerMoney[playerIndex] += sellTotalRefund;
    
    const sellPlayerName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
    room.gameState.history.unshift(`💰 ${sellPlayerName} sold buildings for $${sellTotalRefund.toLocaleString()}`);
    if (room.gameState.history.length > 50) room.gameState.history.length = 50;
    
    const sellPlayerPos = room.gameState.playerPositions[playerIndex];
    io.to(room.roomCode).emit('floating_price', { 
      tileIndex: sellPlayerPos, 
      price: sellTotalRefund, 
      isPositive: true 
    });
    
    broadcastState(room);
  }
}

function handleTakeLoan(room, playerIndex, payload) {
  if (room.gameState.playerLoans && room.gameState.playerLoans[playerIndex]) {
    console.log(`[SERVER] Player ${playerIndex} already has an active loan`);
    return;
  }
  
  const principal = Math.min(10000, Math.max(1000, Number(payload?.principalAmount) || 1000));
  const repay = Math.round(principal * 1.3);
  const startTile = room.gameState.playerPositions[playerIndex];
  
  if (!room.gameState.playerLoans) room.gameState.playerLoans = {};
  room.gameState.playerLoans[playerIndex] = {
    principalAmount: principal,
    repayAmount: repay,
    lapsRemaining: 3,
    loanStartTile: startTile
  };
  
  room.gameState.playerMoney[playerIndex] += principal;
  
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  room.gameState.history.unshift(`🏦 ${pName} took a $${principal.toLocaleString()} loan`);
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  
  io.to(room.roomCode).emit('floating_price', {
    tileIndex: startTile,
    price: principal,
    isPositive: true
  });
  
  broadcastState(room);
}

function handleRepayLoan(room, playerIndex) {
  const loan = room.gameState.playerLoans?.[playerIndex];
  if (!loan) return;
  
  if (room.gameState.playerMoney[playerIndex] < loan.repayAmount) {
    console.log(`[SERVER] P${playerIndex} insufficient funds to repay loan`);
    return;
  }
  
  room.gameState.playerMoney[playerIndex] -= loan.repayAmount;
  delete room.gameState.playerLoans[playerIndex];
  
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  room.gameState.history.unshift(`🏦 ${pName} repaid their $${loan.repayAmount.toLocaleString()} loan`);
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  
  const pPos = room.gameState.playerPositions[playerIndex];
  io.to(room.roomCode).emit('floating_price', {
    tileIndex: pPos,
    price: loan.repayAmount,
    isPositive: false
  });
  
  broadcastState(room);
}

function handlePayBail(room, playerIndex) {
  const turns = room.gameState.jailStatus?.[playerIndex] || 0;
  if (turns <= 0) return;
  
  let bail = 1000;
  if (turns === 2) bail = 500;
  if (turns === 1) bail = 200;
  
  if (room.gameState.playerMoney[playerIndex] < bail) {
    console.log(`[SERVER] P${playerIndex} cannot afford bail ($${bail})`);
    return;
  }
  
  room.gameState.playerMoney[playerIndex] -= bail;
  room.gameState.jailStatus[playerIndex] = 0;
  room.gameState.cashStack = (room.gameState.cashStack || 0) + bail;
  
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  room.gameState.history.unshift(`🔓 ${pName} paid $${bail.toLocaleString()} bail to get out of Jail!`);
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  
  io.to(room.roomCode).emit('floating_price', { tileIndex: 28, price: bail, isPositive: false });
  broadcastState(room);
}

function handleJailSkip(room, playerIndex) {
  const turns = room.gameState.jailStatus?.[playerIndex] || 0;
  if (turns <= 0) return;
  
  const newTurns = turns - 1;
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  if (newTurns <= 0) {
    room.gameState.jailStatus[playerIndex] = 0;
    room.gameState.history.unshift(`🔓 ${pName} served jail time and is now free!`);
  } else {
    room.gameState.jailStatus[playerIndex] = newTurns;
    room.gameState.history.unshift(`👮 ${pName} stays in Jail (${newTurns} turn${newTurns > 1 ? 's' : ''} left).`);
  }
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  
  handleEndTurn(room);
  broadcastState(room);
}

function handleParkingConfirm(room, playerIndex) {
  if (!room.gameState.skippedTurns) room.gameState.skippedTurns = {};
  room.gameState.skippedTurns[playerIndex] = true;
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  room.gameState.history.unshift(`🅿️ ${pName} resting at Free Parking (skips next turn).`);
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  handleEndTurn(room);
  broadcastState(room);
}

function handleCardAction(room, playerIndex, payload) {
  const { action, amount, houseCost, hotelCost } = payload || {};
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  const currentPos = room.gameState.playerPositions[playerIndex];
  
  switch (action) {
    case 'MONEY_ADD': {
      const amt = Math.min(1000, Math.max(0, Number(amount) || 0));
      if (amt > 0) {
        room.gameState.playerMoney[playerIndex] += amt;
        io.to(room.roomCode).emit('floating_price', { tileIndex: currentPos, price: amt, isPositive: true });
      }
      break;
    }
    case 'MONEY_SUBTRACT': {
      const amt = Math.min(1000, Math.max(0, Number(amount) || 0));
      if (amt > 0) {
        room.gameState.playerMoney[playerIndex] -= amt;
        room.gameState.cashStack = (room.gameState.cashStack || 0) + amt;
        io.to(room.roomCode).emit('floating_price', { tileIndex: currentPos, price: amt, isPositive: false });
      }
      break;
    }
    case 'REPAIRS': {
      let cost = 0;
      const hCost = Number(houseCost) || 25;
      const hotCost = Number(hotelCost) || 100;
      Object.entries(room.gameState.propertyOwnership || {}).forEach(([tileIdx, ownerIdx]) => {
        if (Number(ownerIdx) === playerIndex) {
          const lvl = room.gameState.propertyLevels?.[tileIdx] || 0;
          if (lvl === 5) cost += hotCost;
          else cost += lvl * hCost;
        }
      });
      if (cost > 0) {
        room.gameState.playerMoney[playerIndex] -= cost;
        room.gameState.cashStack = (room.gameState.cashStack || 0) + cost;
        room.gameState.history.unshift(`🛠️ ${pName} paid $${cost.toLocaleString()} for repairs.`);
        io.to(room.roomCode).emit('floating_price', { tileIndex: currentPos, price: cost, isPositive: false });
      }
      break;
    }
    case 'PAY_ALL_PLAYERS': {
      const amt = Math.min(200, Math.max(0, Number(amount) || 50));
      const otherPlayers = room.players.filter((p, idx) => idx !== playerIndex && !room.gameState.bankruptPlayers?.[idx] && !p.kicked);
      const totalCost = amt * otherPlayers.length;
      room.gameState.playerMoney[playerIndex] -= totalCost;
      otherPlayers.forEach(p => {
        room.gameState.playerMoney[p.id] += amt;
      });
      io.to(room.roomCode).emit('floating_price', { tileIndex: currentPos, price: totalCost, isPositive: false });
      break;
    }
    case 'CLEAR_DEBT': {
      if (room.gameState.playerMoney[playerIndex] < 0) {
        room.gameState.playerMoney[playerIndex] = 0;
        room.gameState.history.unshift(`💸 ${pName}'s debt was cleared by the Bank!`);
      }
      break;
    }
  }
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  broadcastState(room);
}

function handleTrainTravel(room, playerIndex, payload) {
  const { targetIndex } = payload || {};
  if (targetIndex === undefined) return;
  const currentPos = room.gameState.playerPositions[playerIndex];
  const target = Number(targetIndex);
  
  if (!TRAIN_TILES.includes(currentPos) || !TRAIN_TILES.includes(target)) {
    console.log(`[SERVER] Train travel invalid: ${currentPos} -> ${target}`);
    return;
  }
  
  const travelCost = 100;
  if (room.gameState.playerMoney[playerIndex] < travelCost) return;
  
  room.gameState.playerMoney[playerIndex] -= travelCost;
  room.gameState.cashStack = (room.gameState.cashStack || 0) + travelCost;
  
  const steps = (target - currentPos + 36) % 36;
  room.gameState.playerPositions[playerIndex] = target;
  
  const pName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
  room.gameState.history.unshift(`🚆 ${pName} traveled by train to ${RENT_DATA[target]?.name || 'Station'}`);
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  
  io.to(room.roomCode).emit('floating_price', { tileIndex: currentPos, price: travelCost, isPositive: false });
  io.to(room.roomCode).emit('chance_move_animated', {
    playerIndex,
    oldPos: currentPos,
    targetPos: target,
    steps,
    delay: 150,
    cardText: `Traveled to ${RENT_DATA[target]?.name || 'Station'}`
  });
  
  broadcastState(room);
}

function handleDealOffer(room, playerIndex, payload) {
  const { recipient, giveProperties, receiveProperties, moneyOffer } = payload || {};
  if (recipient === undefined || Number(recipient) === playerIndex) return;
  const rIdx = Number(recipient);
  if (!room.players[rIdx] || room.players[rIdx].kicked) return;
  
  const give = Array.isArray(giveProperties) ? giveProperties.map(Number) : [];
  const receive = Array.isArray(receiveProperties) ? receiveProperties.map(Number) : [];
  const money = Number(moneyOffer) || 0;
  
  for (const t of give) {
    if (Number(room.gameState.propertyOwnership[t]) !== playerIndex) return;
  }
  for (const t of receive) {
    if (Number(room.gameState.propertyOwnership[t]) !== rIdx) return;
  }
  if (money > 0 && room.gameState.playerMoney[playerIndex] < money) return;
  
  room.gameState.activeDeal = {
    proposer: playerIndex,
    recipient: rIdx,
    giveProperties: give,
    receiveProperties: receive,
    moneyOffer: money
  };
  
  const recipientSocket = room.players[rIdx]?.socketId;
  if (recipientSocket) {
    io.to(recipientSocket).emit('deal_offer', room.gameState.activeDeal);
  }
  broadcastState(room);
}

function handleDealCancel(room, playerIndex) {
  const deal = room.gameState.activeDeal;
  if (!deal) return;
  if (playerIndex === deal.proposer || playerIndex === deal.recipient) {
    room.gameState.activeDeal = null;
    broadcastState(room);
  }
}

function handleDealResponse(room, playerIndex, payload) {
  const activeDeal = room.gameState.activeDeal;
  if (!activeDeal) return;
  if (playerIndex !== activeDeal.recipient) return;
  
  const { accepted } = payload || {};
  const proposerSocket = room.players[activeDeal.proposer]?.socketId;
  room.gameState.activeDeal = null;
  
  if (accepted) {
    const { proposer, recipient, giveProperties, receiveProperties, moneyOffer } = activeDeal;
    
    const validGive = giveProperties.every(t => Number(room.gameState.propertyOwnership[t]) === proposer);
    const validReceive = receiveProperties.every(t => Number(room.gameState.propertyOwnership[t]) === recipient);
    const proposerCanPay = moneyOffer <= 0 || room.gameState.playerMoney[proposer] >= moneyOffer;
    const recipientCanPay = moneyOffer >= 0 || room.gameState.playerMoney[recipient] >= Math.abs(moneyOffer);
    
    if (!validGive || !validReceive || !proposerCanPay || !recipientCanPay) {
      console.log(`[SERVER] Deal failed verification on execution`);
      broadcastState(room);
      if (proposerSocket) {
        io.to(proposerSocket).emit('deal_result', { accepted: false, deal: activeDeal, reason: 'Conditions no longer met' });
      }
      return;
    }
    
    giveProperties.forEach(tile => {
      room.gameState.propertyOwnership[tile] = recipient;
      if (room.gameState.propertyLevels) delete room.gameState.propertyLevels[tile];
    });
    receiveProperties.forEach(tile => {
      room.gameState.propertyOwnership[tile] = proposer;
      if (room.gameState.propertyLevels) delete room.gameState.propertyLevels[tile];
    });
    
    if (moneyOffer !== 0) {
      room.gameState.playerMoney[proposer] -= moneyOffer;
      room.gameState.playerMoney[recipient] += moneyOffer;
      
      const pPos = room.gameState.playerPositions[proposer];
      const rPos = room.gameState.playerPositions[recipient];
      const absAmount = Math.abs(moneyOffer);
      
      if (moneyOffer > 0) {
        io.to(room.roomCode).emit('floating_price', { tileIndex: pPos, price: absAmount, isPositive: false, label: 'PAID' });
        io.to(room.roomCode).emit('floating_price', { tileIndex: rPos, price: absAmount, isPositive: true, label: 'RECEIVED' });
      } else {
        io.to(room.roomCode).emit('floating_price', { tileIndex: pPos, price: absAmount, isPositive: true, label: 'RECEIVED' });
        io.to(room.roomCode).emit('floating_price', { tileIndex: rPos, price: absAmount, isPositive: false, label: 'PAID' });
      }
    }
    
    const pName = room.players[proposer]?.name || `Player ${proposer}`;
    const rName = room.players[recipient]?.name || `Player ${recipient}`;
    room.gameState.history.unshift(`🤝 ${pName} and ${rName} completed a trade!`);
    if (room.gameState.history.length > 50) room.gameState.history.length = 50;
    
    broadcastState(room);
    if (proposerSocket) {
      io.to(proposerSocket).emit('deal_result', { accepted: true, deal: activeDeal });
    }
  } else {
    broadcastState(room);
    if (proposerSocket) {
      io.to(proposerSocket).emit('deal_result', { accepted: false, deal: activeDeal });
    }
  }
}

function handlePayRent(room, playerIndex, payload) {
  const { payerIndex, ownerIndex, rent, tileIndex } = payload || {};
  console.log(`[SERVER] Rent Payment: Payer ${payerIndex} -> Owner ${ownerIndex}, Amount ${rent}, Tile ${tileIndex}`);
  
  if (payerIndex === undefined || ownerIndex === undefined || rent === undefined || tileIndex === undefined) {
    console.error('[SERVER] PayRent failed: Missing required fields in payload');
    return;
  }

  const pIdx = Number(payerIndex);
  const oIdx = Number(ownerIndex);
  const amount = Number(rent);
  const tIdx = Number(tileIndex);

  // Update money
  room.gameState.playerMoney[pIdx] -= amount;
  room.gameState.playerMoney[oIdx] += amount;

  // Add history
  const payerName = room.players[pIdx]?.name || `Player ${pIdx}`;
  const ownerName = room.players[oIdx]?.name || `Player ${oIdx}`;
  room.gameState.history.unshift(`${payerName} paid $${amount} rent to ${ownerName}`);

  // Broadcast Floating Prices
  // 1. Payer (Red/Negative)
  io.to(room.roomCode).emit('floating_price', {
    tileIndex: tIdx,
    price: amount,
    isPositive: false
  });

  // 2. Owner (Green/Positive) - Use owner's current position for the green animation
  const ownerPos = room.gameState.playerPositions[oIdx];
  io.to(room.roomCode).emit('floating_price', {
    tileIndex: ownerPos,
    price: amount,
    isPositive: true
  });

  // Broadcast final state
  broadcastState(room);
}

function handleWarInit(room, { mode }) {
  room.gameState.warState = {
    active: true,
    phase: 'join',
    mode: mode,
    participants: [],
    property: null,
    rolls: {},
    currentRoller: 0,
    diceValues: [1, 1],
    winner: null
  };
  broadcastState(room);
}

function handleWarJoin(room, playerIndex) {
  if (!room.gameState.warState || room.gameState.warState.phase !== 'join') return;
  const fee = room.gameState.warState.mode === 'A' ? 3000 : 2000;
  
  // Check if already joined
  if (room.gameState.warState.participants.includes(playerIndex)) return;
  
  // Check funds
  if (room.gameState.playerMoney[playerIndex] < fee) {
    console.log(`[SERVER] War join rejected: P${playerIndex} has insufficient funds`);
    return;
  }
  
  // Deduct fee
  room.gameState.playerMoney[playerIndex] -= fee;
  
  // Add to pot
  if (room.gameState.warState.mode === 'A') {
    room.gameState.cashStack = (room.gameState.cashStack || 0) + fee;
  } else {
    room.gameState.battlePot = (room.gameState.battlePot || 0) + fee;
  }
  
  // Add to participants
  room.gameState.warState.participants.push(playerIndex);
  room.gameState.warState.participants.sort((a, b) => a - b); // Keep sorted
  
  room.gameState.history.unshift(
    `${room.players[playerIndex]?.name || 'Player'} joined the war! (-$${fee})`
  );
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  broadcastState(room);
}

function handleWarWithdraw(room, playerIndex) {
  if (!room.gameState.warState || room.gameState.warState.phase !== 'join') return;
  const fee = room.gameState.warState.mode === 'A' ? 3000 : 2000;
  
  // Check if joined
  if (!room.gameState.warState.participants.includes(playerIndex)) return;
  
  // Refund fee
  room.gameState.playerMoney[playerIndex] += fee;
  
  // Remove from pot
  if (room.gameState.warState.mode === 'A') {
    room.gameState.cashStack = Math.max(0, (room.gameState.cashStack || 0) - fee);
  } else {
    room.gameState.battlePot = Math.max(0, (room.gameState.battlePot || 0) - fee);
  }
  
  // Remove from participants
  room.gameState.warState.participants = room.gameState.warState.participants.filter(p => p !== playerIndex);
  
  room.gameState.history.unshift(
    `${room.players[playerIndex]?.name || 'Player'} withdrew from the war. (+$${fee})`
  );
  if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  broadcastState(room);
}

function handleWarStart(room, payload = {}) {
  // Validate participants
  if (room.gameState.warState.participants.length < 2) {
    console.log(`[SERVER] Cannot start war: Not enough participants (${room.gameState.warState.participants.length}/2)`);
    return;
  }

  if (room.gameState.warState.mode === 'A') {
    // Transition to progress phase
    room.gameState.warState.phase = 'progress';
    console.log(`[SERVER] Property War starting progress phase. ${room.gameState.warState.participants.length} participants`);
    broadcastState(room);
    
    // Available properties passed from client payload
    let availableIndices = payload.availableIndices || [];
    console.log(`[SERVER] War Start Payload availableIndices: ${availableIndices.length}`);
    
    // Fallback if client sent nothing (safety net)
    if (availableIndices.length === 0) {
        console.log(`[SERVER] Warning: No availableIndices received. Using fallback (all properties).`);
        // Fallback: all non-train properties from RENT_DATA (36-tile board)
        availableIndices = Object.keys(RENT_DATA).map(Number).filter(i => !TRAIN_TILES.includes(i));
    }

    // After 3 seconds, Select Property and Reveal
    setTimeout(() => {
      // Validate still in progress phase
      if (room.gameState.warState && room.gameState.warState.phase === 'progress') {
        if (availableIndices.length > 0) {
              const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
              room.gameState.warState.propertyIndex = randomIndex;
              room.gameState.warState.phase = 'reveal';
              console.log(`[SERVER] Property War transitioning to reveal phase. Property: ${randomIndex}`);
              broadcastState(room);
              
              // After 4 seconds, start rolling
              setTimeout(() => {
                  if (room.gameState.warState && room.gameState.warState.phase === 'reveal') {
                      room.gameState.warState.phase = 'roll';
                      room.gameState.warState.currentRoller = 0;
                      room.gameState.warState.rolls = {};
                      console.log(`[SERVER] Property War transitioning to roll phase`);
                      broadcastState(room);
                  }
              }, 4000);
        } else {
            // No valid properties? Fallback to roll directly
            console.log(`[SERVER] No available properties for War! Skipping to roll.`);
            room.gameState.warState.phase = 'roll';
            room.gameState.warState.currentRoller = 0;
            room.gameState.warState.rolls = {};
            broadcastState(room);
        }
      }
    }, 3000);
  } else {
    // Mode B: Direct to roll
    room.gameState.warState.phase = 'roll';
    room.gameState.warState.currentRoller = 0;
    room.gameState.warState.rolls = {};
    broadcastState(room);
  }
}

function handleWarRoll(room) {
  const { participants, currentRoller } = room.gameState.warState;
  
  // Set explicit rolling state for animation
  room.gameState.warState.isRolling = true;
  broadcastState(room);
  
  // Wait 1 second for animation
  setTimeout(() => {
    const playerIndex = participants[currentRoller];
    
    // Roll dice
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;
    
    room.gameState.warState.isRolling = false;
    room.gameState.warState.diceValues = [die1, die2];
    room.gameState.warState.rolls[playerIndex] = total;
    
    room.gameState.history.unshift(
      `🎲 ${room.players[playerIndex]?.name || 'Player'} rolled ${total}!`
    );
    
    // Next roller
    if (currentRoller + 1 < participants.length) {
      room.gameState.warState.currentRoller++;
      broadcastState(room);
    } else {
      // All participants have rolled! Mark evaluating so roll button is NEVER displayed again
      room.gameState.warState.currentRoller = null;
      room.gameState.warState.phase = 'evaluating';
      broadcastState(room);

      // Delay before computing and displaying results so players have time to see the last roll
      setTimeout(() => {
        if (!room.gameState.warState || !room.gameState.warState.active) return;

        // All rolled, determine winner
        const rolls = room.gameState.warState.rolls;
        const maxRoll = Math.max(...Object.values(rolls));
        const winners = Object.entries(rolls)
          .filter(([_, roll]) => roll === maxRoll)
          .map(([idx]) => parseInt(idx));
          
        if (winners.length > 1) {
          // Tie logic: Show message with highlighted tied players, wait 2.8s, then sudden-death rematch
          const names = winners.map(idx => room.players[idx]?.name || `Player ${idx+1}`).join(' & ');
          
          room.gameState.warState.phase = 'tie';
          room.gameState.warState.tiedPlayers = winners;
          room.gameState.warState.tieRoll = maxRoll;
          room.gameState.warState.tieMessage = `${names} tied with ${maxRoll}!`;
          broadcastState(room); // Update clients to show tie screen
          
          setTimeout(() => {
             // Reset for sudden-death re-roll with ONLY tied players
             if (room.gameState.warState && room.gameState.warState.active) {
               room.gameState.warState.participants = winners;
               room.gameState.warState.rolls = {};
               room.gameState.warState.currentRoller = 0;
               room.gameState.warState.phase = 'roll';
               room.gameState.warState.tieMessage = null;
               room.gameState.warState.tiedPlayers = null;
               room.gameState.warState.tieRoll = null;
               room.gameState.history.unshift(`⚔️ TIE! Sudden-death rematch between ${names}...`);
               broadcastState(room);
             }
          }, 2800);
        } else {
          // Winner
          const winnerIdx = winners[0];
          room.gameState.warState.winner = winnerIdx;
          room.gameState.warState.phase = 'result';
          
          if (room.gameState.warState.mode === 'A') {
            // Mode A: Award Property to winner
            const propIndex = room.gameState.warState.propertyIndex;
            if (propIndex !== undefined && propIndex !== null) {
              room.gameState.propertyOwnership[propIndex] = winnerIdx;
              console.log(`[SERVER] War Result: Property ${propIndex} transferred to Player ${winnerIdx}`);
              room.gameState.history.unshift(`🏆 ${room.players[winnerIdx]?.name || 'Player'} won the property!`);
            } else {
               console.log(`[SERVER] War Result Error: No propertyIndex found!`);
            }
          } else {
            // Mode B: Cash win
            room.gameState.playerMoney[winnerIdx] += room.gameState.battlePot;
            room.gameState.battlePot = 0;
          }
          room.gameState.history.unshift(`🏆 ${room.players[winnerIdx]?.name || 'Player'} won the war!`);
          broadcastState(room);
        }
      }, 2200);
    }
  }, 1000);
}

function handleWarClose(room) {
  room.gameState.warState = {
    active: false,
    mode: 'A',
    phase: 'idle',
    participants: [],
    rolls: {},
    property: null,
    currentRoller: null,
    diceValues: [1, 1],
    tiedPlayers: null,
    tieRoll: null
  };
  room.gameState.isProcessingTurn = false;
  room.gameState.turnFinished = true;
  console.log(`[SERVER] Property War closed`);
  broadcastState(room);
}

function handleAttemptRobbery(room, playerIndex) {
  // 1. Start Processing
  room.gameState.modalState = { type: 'ROB_BANK', status: 'PROCESSING', payload: { playerIndex } };
  room.gameState.isProcessingTurn = true;
  console.log(`[SERVER] Rob Bank PROCESSING for player ${playerIndex}`);
  
  // Broadcast processing state
  broadcastState(room);
  
  // 2. Wait and Calculate Result
  setTimeout(() => {
    const successChance = 0.5; // 50% chance
    const isSuccess = Math.random() < successChance;
    
    if (isSuccess) {
      // Win $1k - $10k
      const amount = (Math.floor(Math.random() * 10) + 1) * 1000;
      room.gameState.modalState = { 
        type: 'ROB_BANK', 
        status: 'RESULT', 
        payload: { result: 'success', amount, playerIndex } 
      };
      room.gameState.playerMoney[playerIndex] += amount;
      room.gameState.history.unshift(
        `💰 ${room.players[playerIndex]?.name || 'Player'} robbed the bank for $${amount}!`
      );
      console.log(`[SERVER] Rob Bank SUCCESS for player ${playerIndex}: $${amount}`);
      io.to(room.roomCode).emit('floating_price', { tileIndex: 18, price: amount, isPositive: true });
    } else {
      // Go to Jail
      room.gameState.modalState = { 
        type: 'ROB_BANK', 
        status: 'RESULT', 
        payload: { result: 'caught', playerIndex } 
      };
      room.gameState.playerPositions[playerIndex] = 28; // Move to Jail tile
      if (!room.gameState.jailStatus) room.gameState.jailStatus = {};
      room.gameState.jailStatus[playerIndex] = 3;
      room.gameState.turnFinished = true;
      room.gameState.history.unshift(
        `👮 ${room.players[playerIndex]?.name || 'Player'} got caught robbing the bank! Sent to Jail!`
      );
      console.log(`[SERVER] Rob Bank CAUGHT for player ${playerIndex}`);
    }
    room.gameState.isProcessingTurn = false;
    
    // Broadcast result
    broadcastState(room);
  }, 2200);
}

function handleEndTurn(room) {
  const numPlayers = room.players.length;
  let nextIdx = (room.gameState.currentPlayer + 1) % numPlayers;
  let loopCount = 0;
  
  // Skip bankrupt, kicked, timed-out offline players, or skipped turns (Free Parking)
  while (loopCount < numPlayers) {
    const p = room.players[nextIdx];
    const isBankrupt = room.gameState.bankruptPlayers && room.gameState.bankruptPlayers[nextIdx];
    const isKicked = p && p.kicked;
    const isTimedOut = p && !p.connected && p.canBeKicked;
    const isSkipped = room.gameState.skippedTurns && room.gameState.skippedTurns[nextIdx];

    if (isBankrupt || isKicked || isTimedOut || isSkipped) {
      if (isSkipped) {
        room.gameState.skippedTurns[nextIdx] = false;
        if (room.gameState.history) {
          room.gameState.history.unshift(`🅿️ Skipped turn for ${p ? p.name : 'Player ' + nextIdx} (Free Parking).`);
        }
      } else if (isTimedOut && room.gameState.history) {
        room.gameState.history.unshift(`⏭️ Skipped turn for ${p.name} (offline > 1 min).`);
      }
      nextIdx = (nextIdx + 1) % numPlayers;
      loopCount++;
      continue;
    }
    break;
  }
  
  room.gameState.currentPlayer = nextIdx;
  room.gameState.turnFinished = false;
  room.gameState.isProcessingTurn = false;
  room.gameState.hoppingPlayer = null;
  room.gameState.landingResolved = false; // Reset for new turn
  if (room.gameState.history) {
    room.gameState.history.unshift(
      `${room.players[room.gameState.currentPlayer]?.name || 'Player'}'s turn`
    );
    if (room.gameState.history.length > 50) room.gameState.history.length = 50;
  }
}

// --- Auction Handlers ---

function handleAuctionSelect(room, playerIndex, payload) {
  const { propertyIndex } = payload;
  if (!propertyIndex) return;

  // Deduct fee from initiator
  const fee = 3000;
  if (room.gameState.playerMoney[playerIndex] >= fee) {
    room.gameState.playerMoney[playerIndex] -= fee;
    room.gameState.cashStack += fee;
  }

  // Store original owner for payout later
  // Store original owner for payout later
  room.gameState.auctionState.originalOwner = room.gameState.propertyOwnership[propertyIndex];
  
  // ANNOUNCING PHASE
  room.gameState.auctionState.status = 'announcing'; 
  room.gameState.auctionState.propertyIndex = propertyIndex;
  
  // Set initial participants (all player indices: 0, 1, 2, 3...)
  room.gameState.auctionState.participants = room.players.map((_, idx) => idx);
  room.gameState.auctionState.foldedPlayers = []; // NEW: Track distinct folded players
  room.gameState.auctionState.bids = [];
  room.gameState.auctionState.currentBid = 0;
  room.gameState.auctionState.winner = null;

  console.log(`[SERVER] Auction Announced: Property ${propertyIndex}`);
  broadcastState(room);

  // Transition to active after 1.5 seconds (per user request)
  setTimeout(() => {
    // Set currentBidder to initiator (they bid first)
    room.gameState.auctionState.currentBidder = playerIndex;
    room.gameState.auctionState.status = 'active';
    // Auto-fold players who can't afford to bid $10
    room.gameState.auctionState.participants = room.gameState.auctionState.participants.filter(pIdx => {
      return room.gameState.playerMoney[pIdx] >= 10;
    });
    console.log(`[SERVER] Auction Active! First bidder: ${playerIndex}`);
    broadcastState(room);
  }, 1500);
}

function handleAuctionBid(room, playerIndex, payload) {
  const { bidAmount } = payload;
  const { participants, currentBidder, currentBid, status, foldedPlayers } = room.gameState.auctionState;
  
  if (status !== 'active') return;
  if (!participants.includes(playerIndex)) return;
  if (foldedPlayers && foldedPlayers.includes(playerIndex)) return; // Double protection
  if (playerIndex !== currentBidder) {
    console.log(`[SERVER] Bid rejected: Not your turn (${playerIndex} != ${currentBidder})`);
    return;
  }
  
  // Get bid amount from payload (slider value) - must be at least currentBid + 10
  const finalBidAmount = bidAmount || (currentBid + 10);
  const minBid = currentBid + 10;
  
  if (finalBidAmount < minBid) {
    console.log(`[SERVER] Bid rejected: $${finalBidAmount} is below minimum $${minBid}`);
    return;
  }
  
  // Check if player can afford
  if (room.gameState.playerMoney[playerIndex] < finalBidAmount) {
    console.log(`[SERVER] Bid rejected: Insufficient funds`);
    return;
  }

  // Record the bid
  room.gameState.auctionState.currentBid = finalBidAmount;
  room.gameState.auctionState.bids.unshift({ player: playerIndex, amount: finalBidAmount });
  room.gameState.auctionState.winner = playerIndex; // Highest bidder so far
  
  console.log(`[SERVER] Bid placed: $${finalBidAmount} by Player ${playerIndex}`);
  
  // Auto-fold players who can't afford next bid (currentBid + 10)
  const nextMinBid = finalBidAmount + 10;
  room.gameState.auctionState.participants = participants.filter(pIdx => {
    if (pIdx === playerIndex) return true; // Bidder stays
    const canAfford = room.gameState.playerMoney[pIdx] >= nextMinBid;
    if (!canAfford) {
      console.log(`[SERVER] Player ${pIdx} auto-folded (can't afford $${nextMinBid})`);
    }
    return canAfford;
  });
  
  // Check for winner (last man standing OR only 1 participant left)
  const remainingParticipants = room.gameState.auctionState.participants;
  if (remainingParticipants.length === 1) {
    endAuction(room, remainingParticipants[0]);
    return;
  }
  
  // Move to next bidder
  const currentIdx = remainingParticipants.indexOf(playerIndex);
  const nextIdx = (currentIdx + 1) % remainingParticipants.length;
  room.gameState.auctionState.currentBidder = remainingParticipants[nextIdx];
  
  console.log(`[SERVER] Next bidder: Player ${remainingParticipants[nextIdx]}`);
  broadcastState(room);
}

function handleAuctionFold(room, playerIndex) {
  const auctionState = room.gameState.auctionState;
  const { participants, currentBidder, status } = auctionState;
  
  // GUARD 1: Auction resolution lock
  if (status === 'complete' || status === 'idle') {
    console.log(`[SERVER] Fold ignored - auction already ${status}`);
    return;
  }
  
  // Initialize foldedPlayers if missing
  if (!auctionState.foldedPlayers) auctionState.foldedPlayers = [];
  
  // GUARD 2: Irreversible Fold Check
  if (auctionState.foldedPlayers.includes(playerIndex)) {
     console.log(`[SERVER] Fold ignored - Player ${playerIndex} already folded (Spam protection)`);
     return;
  }
  
  // Mark as folded
  auctionState.foldedPlayers.push(playerIndex);
  
  // Remove player from participants
  const newParticipants = participants.filter(p => p !== playerIndex);
  room.gameState.auctionState.participants = newParticipants;
  
  console.log(`[SERVER] Player ${playerIndex} Folded. Remaining: ${newParticipants.length}`);
  
  // Check for Winner
  if (newParticipants.length === 1) {
    endAuction(room, newParticipants[0]);
    return;
  } else if (newParticipants.length === 0) {
    // No one left - should not happen, but reset auction
    room.gameState.auctionState.status = 'idle';
    broadcastState(room);
    return;
  }
  
  // If the folder was current bidder, move to next
  if (playerIndex === currentBidder) {
    const folderIdx = participants.indexOf(playerIndex);
    const nextIdx = folderIdx % newParticipants.length;
    room.gameState.auctionState.currentBidder = newParticipants[nextIdx];
    console.log(`[SERVER] Folder was current bidder, moving to: ${newParticipants[nextIdx]}`);
  }
  
  broadcastState(room);
}

function endAuction(room, winnerIndex) {
  // CRITICAL GUARD: Prevent Double Charge
  if (room.gameState.auctionState.status === 'complete') {
      console.log(`[SERVER-GUARD] endAuction ignored - already complete`);
      return;
  }

  const { propertyIndex, currentBid, originalOwner } = room.gameState.auctionState;
  const finalAmount = currentBid || 10; // Minimum $10 if no bids
  
  console.log(`[SERVER] Auction Won by Player ${winnerIndex} for $${finalAmount}`);
  
  // Deduct from winner
  room.gameState.playerMoney[winnerIndex] -= finalAmount;
  
  if (winnerIndex === originalOwner) {
    // Self-Defense: Winner keeps property, money goes to Cash Stack
    room.gameState.cashStack = (room.gameState.cashStack || 0) + finalAmount;
    room.gameState.history.unshift(`🏆 ${room.players[winnerIndex]?.name} defended their property for $${finalAmount}!`);
  } else {
    // Hostile Takeover: Original owner gets money, winner gets property
    room.gameState.playerMoney[originalOwner] += finalAmount;
    room.gameState.propertyOwnership[propertyIndex] = winnerIndex;
    room.gameState.history.unshift(`🏆 ${room.players[winnerIndex]?.name} won the auction for $${finalAmount}!`);
  }
  
  // Set status to 'complete' for client to show animations
  room.gameState.auctionState.status = 'complete';
  room.gameState.auctionState.winner = winnerIndex;
  room.gameState.auctionState.finalAmount = finalAmount;
  
  broadcastState(room);
  
  // Reset auction after 3 seconds
  setTimeout(() => {
    room.gameState.auctionState = {
      status: 'idle',
      propertyIndex: null,
      initiator: null,
      bids: [],
      currentBid: 0,
      participants: [],
      winner: null,
      currentBidder: null,
      originalOwner: null,
      finalAmount: 0
    };
    room.gameState.isProcessingTurn = false;
    room.gameState.turnFinished = true;
    broadcastState(room);
  }, 3000);
}

function handleAuctionComplete(room, payload) {
    // This handler is triggered by client "auction_complete" action
    // BUT server logic (endAuction) should be authoritative.
    // We only use this if somehow server logic failed or for legacy syncing.
    // GUARD: If status is already complete, DO NOT CHARGE AGAIN.
    if (room.gameState.auctionState.status === 'complete') {
         console.log(`[SERVER] handleAuctionComplete ignored - already resolved`);
         return;
    }

    const { winner, bidAmount, propertyIndex, originalOwner } = payload || {};
    
    if (winner !== undefined && bidAmount && propertyIndex) {
        // ... Logic duplicated from endAuction ...
        // Better to just call endAuction if valid?
        // But endAuction relies on gameState. 
        // Let's just trust endAuction to have run.
        // If we represent a "Force Complete" from client (admin?), okay.
        // But for safety:
        endAuction(room, Number(winner));
    }

    // Reset State
    room.gameState.auctionState.status = 'idle';
    room.gameState.auctionState.propertyIndex = null;
    room.gameState.auctionState.winner = null;
    room.gameState.auctionState.bids = [];
    room.gameState.auctionState.currentBid = 0;
    room.gameState.auctionState.participants = [];
    
    broadcastState(room);
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[PseudoPoly Server] Running on http://0.0.0.0:${PORT} (ready for Hotspot & Online connections)`);
});
