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

// Initialize default game state
function createInitialGameState() {
  return {
    currentPlayer: 0,
    diceValues: [1, 1],
    isRolling: false,
    playerPositions: [0, 0, 0, 0],
    playerMoney: [10000, 10000, 10000, 10000],
    propertyOwnership: {},
    propertyLevels: {},
    history: ['Game started!'],
    gameStage: 'lobby',
    hoppingPlayer: null,
    turnFinished: false,
    isProcessingTurn: false,
    cashStack: 0,
    battlePot: 0,
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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Host creates a new room
  socket.on('create_room', ({ name, avatar }) => {
    const roomCode = generateRoomCode();
    
    rooms[roomCode] = {
      roomCode: roomCode, // Store roomCode for reliable broadcasts
      gameState: createInitialGameState(),
      players: [{
        id: 0,
        name,
        avatar,
        socketId: socket.id,
        isHost: true,
        connected: true // Initial connection status
      }]
    };
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerIndex = 0;
    
    console.log(`Room ${roomCode} created by ${name}`);
    
    socket.emit('room_created', { 
      roomCode, 
      playerIndex: 0,
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
    
    // Check if duplicate identity (Reconnection vs Collision)
    const existingPlayerIndex = room.players.findIndex(p => p.name === name || p.avatar === avatar);
    
    if (existingPlayerIndex !== -1) {
      const existingPlayer = room.players[existingPlayerIndex];
      
      // allow precise match to reconnect if they were disconnected
      if (existingPlayer.name === name && existingPlayer.avatar === avatar) {
         if (!existingPlayer.connected) {
           // --- RECONNECTION LOGIC ---
           console.log(`[SERVER] Player ${name} reconnecting to ${roomCode}`);
           
           // Update socket ID and status
           existingPlayer.socketId = socket.id;
           existingPlayer.connected = true;
           
           socket.join(roomCode);
           socket.roomCode = roomCode;
           socket.playerIndex = existingPlayerIndex;
           
           // If Host Reconnected, cancel destruction timer
           if (existingPlayer.isHost && room.hostDisconnectTimer) {
             console.log(`[SERVER] Host reconnected! Cancelling destruction timer.`);
             clearTimeout(room.hostDisconnectTimer);
             room.hostDisconnectTimer = null;
             io.to(roomCode).emit('message', { type: 'system', text: 'Host has reconnected!' });
           }

           // If player was disconnected, clear their 60s disconnect timer
           if (room.playerDisconnectTimers && room.playerDisconnectTimers[existingPlayerIndex]) {
             console.log(`[SERVER] Clearing disconnect timer for player ${existingPlayer.name}`);
             clearTimeout(room.playerDisconnectTimers[existingPlayerIndex]);
             delete room.playerDisconnectTimers[existingPlayerIndex];
           }
           existingPlayer.canBeKicked = false;
           existingPlayer.disconnectedAt = null;
           if (room.gameState && room.gameState.history) {
             room.gameState.history.unshift(`✓ ${existingPlayer.name} reconnected!`);
           }

           // Send sync data to reconnecting player
           socket.emit('joined_room', {
             roomCode,
             playerIndex: existingPlayerIndex,
             gameState: room.gameState,
             players: room.players
           });
           
           // Notify others
           io.to(roomCode).emit('players_updated', { players: room.players });
           return;
         } else {
           // Player is already connected - collision
           socket.emit('error', { message: 'Name or Avatar already active in this room!' });
           return;
         }
      } else {
        // Name or avatar taken by someone else
        socket.emit('error', { message: 'Name or Avatar already taken!' });
        return;
      }
    }
    
    if (room.players.length >= 4) {
      socket.emit('error', { message: 'Room is full!' });
      return;
    }
    
    const playerIndex = room.players.length;
    
    room.players.push({
      id: playerIndex,
      name,
      avatar,
      socketId: socket.id,
      isHost: false,
      connected: true // Track connection status
    });
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerIndex = playerIndex;
    
    console.log(`${name} joined room ${roomCode} as player ${playerIndex}`);
    
    // Send join confirmation to the new player
    socket.emit('joined_room', {
      roomCode,
      playerIndex,
      gameState: room.gameState,
      players: room.players
    });
    
    // Broadcast updated players list to all in room
    io.to(roomCode).emit('players_updated', { players: room.players });
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
    
    // Validate it's this player's turn for certain actions
    if (['roll_dice', 'buy_property', 'end_turn'].includes(action)) {
      if (room.gameState.currentPlayer !== playerIndex) {
        socket.emit('error', { message: 'Not your turn!' });
        return;
      }
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
      case 'attempt_robbery':
        handleAttemptRobbery(room, playerIndex);
        break;
      case 'close_modal':
        room.gameState.modalState = { type: 'NONE', status: 'IDLE', payload: {} };
        room.gameState.isProcessingTurn = false;
        break;
      case 'floating_price':
        if (payload && payload.tileIndex !== undefined) {
          io.to(room.roomCode).emit('floating_price', payload);
        }
        break;
      case 'pay_bail':
        if (room.gameState.playerMoney[playerIndex] >= 500) {
          room.gameState.playerMoney[playerIndex] -= 500;
          if (!room.gameState.jailStatus) room.gameState.jailStatus = {};
          room.gameState.jailStatus[playerIndex] = 0;
          room.gameState.cashStack = (room.gameState.cashStack || 0) + 500;
          room.gameState.history.unshift(`🔓 ${room.players[playerIndex]?.name || 'Player'} paid $500 bail to get out of Jail!`);
          io.to(room.roomCode).emit('floating_price', { tileIndex: 28, price: 500, isPositive: false });
          broadcastState(room);
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
        break;
      case 'kick_player':
        if (playerIndex === 0 && payload && payload.targetIndex !== undefined && payload.targetIndex !== 0) {
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
          }
        }
        break;
      case 'modal_open':
        // Generic modal broadcast (Chance, Chest, Parking)
        if (payload && payload.type) {
            console.log(`[SERVER] Broadcasting modal_open: ${payload.type}`);
            room.gameState.modalState = {
                type: payload.type,
                status: 'ACTIVE',
                payload: payload.payload || {}
            };
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
        // Allow clients to update specific state fields (e.g. paying tax to cashStack)
        if (payload) {
             console.log(`[SERVER] Update State from P${playerIndex}:`, Object.keys(payload));
             Object.assign(room.gameState, payload);
             broadcastState(room);
        }
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
        // Authoritative building completion with broadcast
        if (payload.totalCost > 0) {
          console.log(`[SERVER] Player ${playerIndex} built for $${payload.totalCost}`);
          
          room.gameState.playerMoney[playerIndex] -= payload.totalCost;
          if (payload.propertyLevels) {
            room.gameState.propertyLevels = payload.propertyLevels;
          }
          
          const buildPlayerName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
          room.gameState.history.unshift(`🏗️ ${buildPlayerName} built upgrades for $${payload.totalCost.toLocaleString()}`);
          
          // Broadcast floating price (Red/Negative) to ALL players
          const buildPlayerPos = room.gameState.playerPositions[playerIndex];
          io.to(room.roomCode).emit('floating_price', { 
            tileIndex: buildPlayerPos, 
            price: payload.totalCost, 
            isPositive: false 
          });
          
          broadcastState(room);
        }
        break;
      case 'sell_buildings':
        // Authoritative building sale
        if (payload.propertyLevels) {
          console.log(`[SERVER] Player ${playerIndex} requested building sale`);
          
          let sellTotalRefund = 0;
          const oldLevels = room.gameState.propertyLevels || {};
          const newLevels = payload.propertyLevels;
          
          // Calculate refund based on level differences
          Object.keys(newLevels).forEach(tileIdx => {
             const oldL = oldLevels[tileIdx] || 0;
             const newL = newLevels[tileIdx] || 0;
             if (newL < oldL) {
                const propData = RENT_DATA[tileIdx];
                if (propData && propData.upgradeCost) {
                   const count = oldL - newL;
                   sellTotalRefund += Math.round(propData.upgradeCost * 0.5) * count;
                }
             }
          });

          if (sellTotalRefund > 0) {
            room.gameState.propertyLevels = newLevels;
            room.gameState.playerMoney[playerIndex] += sellTotalRefund;
            
            const sellPlayerName = room.players[playerIndex]?.name || `Player ${playerIndex}`;
            room.gameState.history.unshift(`💰 ${sellPlayerName} sold buildings for $${sellTotalRefund.toLocaleString()}`);
            
            // Broadcast floating price (Green/Positive) to ALL players
            const sellPlayerPos = room.gameState.playerPositions[playerIndex];
            io.to(room.roomCode).emit('floating_price', { 
              tileIndex: sellPlayerPos, 
              price: sellTotalRefund, 
              isPositive: true 
            });
            
            broadcastState(room);
          }
        }
        break;
      case 'cash_stack_claim':
        // Handle claiming the pot if not already handled by handleLanding
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
        // Clear audit modal and update money
        room.gameState.modalState = { type: 'NONE' };
        if (payload.playerMoney) room.gameState.playerMoney = payload.playerMoney;
        if (payload.cashStack !== undefined) room.gameState.cashStack = payload.cashStack;
        break;
      case 'deal_offer':
        // Broadcast deal offer to recipient and set activeDeal for table visibility
        console.log(`[SERVER] Deal offer from Player ${playerIndex} to Player ${payload.recipient}`);
        room.gameState.activeDeal = {
          proposer: payload.proposer ?? playerIndex,
          recipient: payload.recipient,
          giveProperties: payload.giveProperties || [],
          receiveProperties: payload.receiveProperties || [],
          moneyOffer: payload.moneyOffer || 0
        };
        const recipientSocket = room.players[payload.recipient]?.socketId;
        if (recipientSocket) {
          io.to(recipientSocket).emit('deal_offer', {
            proposer: payload.proposer ?? playerIndex,
            recipient: payload.recipient,
            giveProperties: payload.giveProperties,
            receiveProperties: payload.receiveProperties,
            moneyOffer: payload.moneyOffer
          });
        }
        broadcastState(room);
        break;
      case 'deal_cancel':
        console.log(`[SERVER] Deal cancelled by Player ${playerIndex}`);
        room.gameState.activeDeal = null;
        broadcastState(room);
        break;
      case 'deal_response':
        // Handle deal accept or deny
        const deal = payload.deal;
        const proposerSocket = room.players[deal.proposer]?.socketId;
        room.gameState.activeDeal = null;
        
        if (payload.accepted) {
          console.log(`[SERVER] Deal ACCEPTED between Player ${deal.proposer} and Player ${deal.recipient}`);
          
          // Transfer properties
          deal.giveProperties.forEach(tile => {
            room.gameState.propertyOwnership[tile] = deal.recipient;
          });
          deal.receiveProperties.forEach(tile => {
            room.gameState.propertyOwnership[tile] = deal.proposer;
          });
          
          // Transfer money (bidirectional: positive = proposer gives, negative = proposer receives)
          if (deal.moneyOffer !== 0) {
            room.gameState.playerMoney[deal.proposer] -= deal.moneyOffer;
            room.gameState.playerMoney[deal.recipient] += deal.moneyOffer;
            
            // Broadcast floating prices for money transfer
            const proposerPos = room.gameState.playerPositions[deal.proposer];
            const recipientPos = room.gameState.playerPositions[deal.recipient];
            const absAmount = Math.abs(deal.moneyOffer);
            
            if (deal.moneyOffer > 0) {
              // Proposer GIVES money -> Red for proposer, Green for recipient
              io.to(room.roomCode).emit('floating_price', { tileIndex: proposerPos, price: absAmount, isPositive: false, label: 'PAID' });
              io.to(room.roomCode).emit('floating_price', { tileIndex: recipientPos, price: absAmount, isPositive: true, label: 'RECEIVED' });
            } else {
              // Proposer RECEIVES money -> Green for proposer, Red for recipient
              io.to(room.roomCode).emit('floating_price', { tileIndex: proposerPos, price: absAmount, isPositive: true, label: 'RECEIVED' });
              io.to(room.roomCode).emit('floating_price', { tileIndex: recipientPos, price: absAmount, isPositive: false, label: 'PAID' });
            }
          }
          
          // Broadcast updated state to all
          broadcastState(room);
          
          // Notify proposer of success
          if (proposerSocket) {
            io.to(proposerSocket).emit('deal_result', { accepted: true, deal });
          }
        } else {
          console.log(`[SERVER] Deal DENIED between Player ${deal.proposer} and Player ${deal.recipient}`);
          broadcastState(room);
          // Notify proposer of denial
          if (proposerSocket) {
            io.to(proposerSocket).emit('deal_result', { accepted: false, deal });
          }
        }
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
        player.connected = false; // Mark as disconnected (don't remove yet)
        
        console.log(`[SERVER] Player ${player.name} disconnected (Host: ${player.isHost})`);
        
        player.disconnectedAt = Date.now();
        player.canBeKicked = false;

        // If game is in progress, announce in history
        if (room.gameState && room.gameState.history) {
          room.gameState.history.unshift(`⚠️ ${player.name} went offline. Waiting 60s for return...`);
          broadcastState(room);
        }

        // Notify others of disconnect
        io.to(roomCode).emit('players_updated', { players: room.players });
        io.to(roomCode).emit('toast', { message: `⚠️ ${player.name} went offline. 60s reconnection window started.` });

        // Start 60-second grace timer for this player (turn skip & kick eligibility)
        if (!room.playerDisconnectTimers) room.playerDisconnectTimers = {};
        if (room.playerDisconnectTimers[playerIndex]) {
          clearTimeout(room.playerDisconnectTimers[playerIndex]);
        }

        room.playerDisconnectTimers[playerIndex] = setTimeout(() => {
          if (!player.connected) {
            console.log(`[SERVER] 60s expired: Player ${player.name} (P${playerIndex}) did not return.`);
            player.canBeKicked = true;

            // If it's currently this player's turn, skip their turn!
            if (room.gameState && room.gameState.currentPlayer === playerIndex) {
              console.log(`[SERVER] 1 minute elapsed: Skipping turn for offline player ${player.name}`);
              if (room.gameState.history) {
                room.gameState.history.unshift(`⏭️ Skipped turn for ${player.name} (offline > 1 min).`);
              }
              handleEndTurn(room);
            } else if (room.gameState && room.gameState.history) {
              room.gameState.history.unshift(`⏱️ ${player.name} offline > 1 min. Turn will skip and host can kick.`);
            }

            broadcastState(room);
            io.to(roomCode).emit('players_updated', { players: room.players });
            io.to(roomCode).emit('toast', { message: `⏱️ ${player.name} exceeded 1 min offline. Turn skipped.` });
          }
        }, 60000);
        
        // If HOST disconnected, start graceful shutdown timer
        if (player.isHost) {
          console.log(`[SERVER] Host disconnected! Starting 60s grace timer.`);
          io.to(roomCode).emit('message', { type: 'system', text: 'Host disconnected! Waiting 60s for reconnect...' });
          
          // Clear existing timer if any
          if (room.hostDisconnectTimer) clearTimeout(room.hostDisconnectTimer);
          
          room.hostDisconnectTimer = setTimeout(() => {
             // Check if host is STILL disconnected
             if (!player.connected) {
               console.log(`[SERVER] Host timeout. Closing room ${roomCode}.`);
               io.to(roomCode).emit('room_closed', { message: 'Host failed to reconnect. Game over.' });
               delete rooms[roomCode];
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
  
  return groupTiles.every(tIndex => room.gameState.propertyOwnership[tIndex] === ownerIndex);
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
      if (payload.forcedValue) {
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
      
      room.gameState.history.unshift(
        `${room.players[playerIndex]?.name || 'Player'} rolled ${moveAmount}${isDoubles ? ' (DOUBLES!)' : ''}`
      );
      
      room.gameState.hoppingPlayer = playerIndex;
      room.gameState.isRolling = false;
      // Only finish turn if NOT doubles
      room.gameState.turnFinished = !isDoubles;
      
      // 4. Broadcast Final Result (stops animation)
      broadcastState(room);
      
      // 5. Handle Landing Logic (delayed slightly for visual sync)
      setTimeout(() => {
          handleLanding(room, playerIndex, newPos);
          room.gameState.landingResolved = true; // Mark resolved so client 'landed' doesn't duplicate!
          
          // Clear hopping player visual and turn lock after landing processed
          setTimeout(() => {
             room.gameState.hoppingPlayer = null;
             room.gameState.isProcessingTurn = false; // Turn processing unlocked!
             broadcastState(room);
          }, 800);
      }, 500); 
      
  }, 1000);
}

function handleBuyProperty(room, playerIndex, payload) {
  const { tileIndex, price } = payload || {};
  console.log(`[SERVER] Buy Property Request: Player ${playerIndex}, Tile ${tileIndex}, Price ${price}`);
  
  if (tileIndex === undefined || price === undefined) {
    console.log(`[SERVER] Buy failed: Missing tileIndex or price`);
    return;
  }
  
  const pIndex = Number(playerIndex);
  const tIndex = Number(tileIndex);
  const cost = Number(price);
  
  if (room.gameState.playerMoney[pIndex] >= cost) {
    room.gameState.playerMoney[pIndex] -= cost;
    room.gameState.propertyOwnership[tIndex] = pIndex; // Explicitly save as Number
    console.log(`[SERVER] Ownership updated: Tile ${tIndex} -> Player ${pIndex}`);
    
    room.gameState.history.unshift(
      `${room.players[pIndex]?.name || 'Player'} bought property for $${cost}`
    );
    
    // Broadcast Floating Price for Purchase cost
    const playerPos = room.gameState.playerPositions[pIndex];
    io.to(room.roomCode).emit('floating_price', {
         tileIndex: playerPos,
         price: cost,
         isPositive: false
    });
    const isDoubles = room.gameState.diceValues && room.gameState.diceValues[0] === room.gameState.diceValues[1];
    room.gameState.turnFinished = !isDoubles;
    room.gameState.isProcessingTurn = false;
  } else {
    console.log(`[SERVER] Buy failed: Insufficient funds`);
  }
}

function handleUpgradeProperty(room, playerIndex, payload) {
  const { tileIndex, price } = payload || {};
  if (!tileIndex || !price) return;
  
  if (room.gameState.playerMoney[playerIndex] >= price) {
    room.gameState.playerMoney[playerIndex] -= price;
    
    const currentLevel = room.gameState.propertyLevels[tileIndex] || 0;
    room.gameState.propertyLevels[tileIndex] = currentLevel + 1;
    
    room.gameState.history.unshift(
      `${room.players[playerIndex]?.name || 'Player'} upgraded property for $${price}`
    );
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
  const fee = room.gameState.warState.mode === 'A' ? 3000 : 2000;
  
  // Check if already joined
  if (room.gameState.warState.participants.includes(playerIndex)) return;
  
  // Deduct fee
  room.gameState.playerMoney[playerIndex] -= fee;
  
  // Add to pot
  if (room.gameState.warState.mode === 'A') {
    room.gameState.cashStack += fee;
  } else {
    room.gameState.battlePot += fee;
  }
  
  // Add to participants
  room.gameState.warState.participants.push(playerIndex);
  room.gameState.warState.participants.sort((a, b) => a - b); // Keep sorted
  
  room.gameState.history.unshift(
    `${room.players[playerIndex]?.name || 'Player'} joined the war! (-$${fee})`
  );
  broadcastState(room);
}

function handleWarWithdraw(room, playerIndex) {
  const fee = room.gameState.warState.mode === 'A' ? 3000 : 2000;
  
  // Check if joined
  if (!room.gameState.warState.participants.includes(playerIndex)) return;
  
  // Refund fee
  room.gameState.playerMoney[playerIndex] += fee;
  
  // Remove from pot
  if (room.gameState.warState.mode === 'A') {
    room.gameState.cashStack -= fee;
  } else {
    room.gameState.battlePot -= fee;
  }
  
  // Remove from participants
  room.gameState.warState.participants = room.gameState.warState.participants.filter(p => p !== playerIndex);
  
  room.gameState.history.unshift(
    `${room.players[playerIndex]?.name || 'Player'} withdrew from the war. (+$${fee})`
  );
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
  room.gameState.modalState = { type: 'ROB_BANK', status: 'PROCESSING', payload: {} };
  room.gameState.isProcessingTurn = true;
  console.log(`[SERVER] Rob Bank PROCESSING for player ${playerIndex}`);
  
  // Broadcast processing state
  if (room.roomCode) {
    io.to(room.roomCode).emit('state_update', {
      gameState: room.gameState,
      players: room.players
    });
  }
  
  // 2. Wait and Calculate Result
  setTimeout(() => {
    const successChance = 0.4; // 40% chance
    const isSuccess = Math.random() < successChance;
    
    if (isSuccess) {
      // Win $1k - $10k
      const amount = (Math.floor(Math.random() * 10) + 1) * 1000;
      room.gameState.modalState = { 
        type: 'ROB_BANK', 
        status: 'RESULT', 
        payload: { result: 'success', amount } 
      };
      room.gameState.playerMoney[playerIndex] += amount;
      room.gameState.history.unshift(
        `💰 ${room.players[playerIndex]?.name || 'Player'} robbed the bank for $${amount}!`
      );
      console.log(`[SERVER] Rob Bank SUCCESS for player ${playerIndex}: $${amount}`);
    } else {
      // Go to Jail
      room.gameState.modalState = { 
        type: 'ROB_BANK', 
        status: 'RESULT', 
        payload: { result: 'caught' } 
      };
      room.gameState.playerPositions[playerIndex] = 28; // Move to Jail tile
      if (!room.gameState.jailStatus) room.gameState.jailStatus = {};
      room.gameState.jailStatus[playerIndex] = 3;
      room.gameState.history.unshift(
        `👮 ${room.players[playerIndex]?.name || 'Player'} got caught robbing the bank! Sent to Jail!`
      );
      console.log(`[SERVER] Rob Bank CAUGHT for player ${playerIndex}`);
    }
    room.gameState.isProcessingTurn = false;
    
    // Broadcast result
    if (room.roomCode) {
      io.to(room.roomCode).emit('state_update', {
        gameState: room.gameState,
        players: room.players
      });
      console.log(`[SERVER] Rob Bank RESULT broadcast to room ${room.roomCode}`);
    } else {
      console.log(`[SERVER] ERROR: No roomCode for room, cannot broadcast RESULT`);
    }
  }, 3000); // 3 seconds processing
}

function handleEndTurn(room) {
  const numPlayers = room.players.length;
  let nextIdx = (room.gameState.currentPlayer + 1) % numPlayers;
  let loopCount = 0;
  
  // Skip bankrupt, kicked, or timed-out offline players
  while (loopCount < numPlayers) {
    const p = room.players[nextIdx];
    const isBankrupt = room.gameState.bankruptPlayers && room.gameState.bankruptPlayers[nextIdx];
    const isKicked = p && p.kicked;
    const isTimedOut = p && !p.connected && p.canBeKicked;

    if (isBankrupt || isKicked || isTimedOut) {
      if (isTimedOut && room.gameState.history) {
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
  room.gameState.history.unshift(
    `${room.players[room.gameState.currentPlayer]?.name || 'Player'}'s turn`
  );
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
