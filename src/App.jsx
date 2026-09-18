import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { 
  bottomRow, 
  leftColumn, 
  topRow, 
  rightColumn, 
  corners, 
  players,
  SPACE_TYPES,
  AVATAR_COLORS,
  PROPERTY_COLORS
} from './data/boardData';
import './App.css';
import startIcon from './assets/start.png';
import parkingIcon from './assets/parking.png';
import robBankIcon from './assets/robbank.png';
import jailIcon from './assets/jail.png';
import startupBg from './assets/startup_bg.png';
import dealIcon from './assets/deal.png';
import sellIcon from './assets/sell.png';
import buildIcon from './assets/build.png';
import bankIcon from './assets/bank.png';
import './pawn.css';
import './safe_animation.css';
import './upgrades.css';
import { RENT_DATA, TRAIN_RENT, TRAIN_TILES } from './data/rentData';
import { CHANCE_CARDS } from './data/chanceCards';
import { CHEST_CARDS } from './data/chestCards';
import cashRegisterSound from './sounds/cash_register.mp3';
import './matchmaking.css';
import MatchmakingView from './components/MatchmakingView';
import BoardIcon, { YachtIcon } from './components/BoardIcons';
import './App.css';

function App() {
  const [diceValues, setDiceValues] = useState([6, 6]);
  const [isRolling, setIsRolling] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false); // New flag to prevent double turns
  const [turnFinished, setTurnFinished] = useState(false); // New flag for manual turn end
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [history, setHistory] = useState(['Player 3 starts turn']);
  const [playerPositions, setPlayerPositions] = useState([0, 0, 0, 0]);
  const [hoppingPlayer, setHoppingPlayer] = useState(null);
  const [pawnTransitionDuration, setPawnTransitionDuration] = useState(300);
  
  // Game Players State (Dynamic)
  const [gamePlayers, setGamePlayers] = useState(players); // Initialize with default
  
  // Player money state (mutable copy of initial data)
  const [playerMoney, setPlayerMoney] = useState(gamePlayers.map(p => p.money));
  
  // Identity State
  const [myIdentity, setMyIdentity] = useState({
    name: 'Player',
    avatar: players[0].avatar, // Default
    peerId: ''
  });
  const [myPlayerIndex, setMyPlayerIndex] = useState(null); // 0-3 if playing, null if spectator/lobby
  
  // Game Stage State: 'menu', 'mode_select', 'playing', 'lobby'
  const [gameStage, setGameStage] = useState('menu');
  
  // Networking State
  const [networkMode, setNetworkMode] = useState('offline'); // 'offline', 'online'
  const [roomCode, setRoomCode] = useState(''); // The 4-letter code
  const [connectedPlayers, setConnectedPlayers] = useState([]); // List of players in room
  const socketRef = useRef(null);
  
  // Jail State
  const [jailStatus, setJailStatus] = useState({}); // { playerIndex: turnsRemaining }
  const [showArrestModal, setShowArrestModal] = useState(false);
  const [showJailActionModal, setShowJailActionModal] = useState(false); // Modal for paying bail or skipping
  const [arrestDuration, setArrestDuration] = useState(0);
  
  // Input state for joining
  const [joinCode, setJoinCode] = useState('');
  
  // Property ownership: { tileIndex: playerIndex } - null means unowned
  const [propertyOwnership, setPropertyOwnership] = useState({});
  
  // Property levels: { tileIndex: level } - 0=Base, 1-4=Houses, 5=Hotel
  const [propertyLevels, setPropertyLevels] = useState({});
  
  // Buying modal state
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyingProperty, setBuyingProperty] = useState(null);
  
  // Parking modal state
  const [showParkingModal, setShowParkingModal] = useState(false);



  // Property Details/Upgrade Modal state
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  
  // Train Travel state
  const [travelMode, setTravelMode] = useState(false);
  const [travelSourceIndex, setTravelSourceIndex] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  
  // Chance Card Modal state
  const [showChanceModal, setShowChanceModal] = useState(false);
  const [currentChanceCard, setCurrentChanceCard] = useState(null);
  const [showChestModal, setShowChestModal] = useState(false);
  const [currentChestCard, setCurrentChestCard] = useState(null);
  
  // Inventory State (Immunity cards, etc.)
  // Structure: { playerIndex: { jail_card: 0, robbery_immunity: 0, tax_immunity: 0 } }
  const [playerInventory, setPlayerInventory] = useState({});
  
  // Active Effects State (Discounts, etc.)
  // Structure: { playerIndex: { discount_50: false } }
  // Active Effects State (Discounts, etc.)
  // Structure: { playerIndex: { discount_50: false } }
  const [activeEffects, setActiveEffects] = useState({});
  
  // Bank & Loan System State
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankPhase, setBankPhase] = useState('entry'); // 'entry' | 'loan'
  const [loanSliderValue, setLoanSliderValue] = useState(0);
  const [playerLoans, setPlayerLoans] = useState({}); // { playerIndex: { principalAmount, repayAmount, lapsRemaining, loanStartTile } }
  const [showBankDebitModal, setShowBankDebitModal] = useState(false);
  
  // Game State Ref (for accessing latest state in event listeners)
  const gameStateRef = useRef({
    gamePlayers,
    connectedPlayers,
    networkMode,
    gameStage,
    currentPlayer,
    diceValues,
    isRolling,
    playerPositions,
    playerMoney,
    propertyOwnership,
    propertyLevels,
    history,
    hoppingPlayer,
    myPlayerIndex,
    playerLoans
  });
  
  // Update Ref whenever state changes
  useEffect(() => {
    gameStateRef.current = {
      gamePlayers,
      connectedPlayers,
      networkMode,
      gameStage,
      currentPlayer,
      diceValues,
      isRolling,
      playerPositions,
      playerMoney,
      propertyOwnership,
      propertyLevels,
      history,
      hoppingPlayer,
      myPlayerIndex,
      playerLoans
    };
  }, [gamePlayers, connectedPlayers, networkMode, gameStage, currentPlayer, diceValues, isRolling, playerPositions, playerMoney, propertyOwnership, propertyLevels, history, hoppingPlayer, myPlayerIndex, playerLoans]);
  
  // Cash Stack (The Pot) - Collects all fines/fees
  
  // Cash Stack (The Pot) - Collects all fines/fees
  const [cashStack, setCashStack] = useState(0);
  
  // Property War State
  const [showWarModal, setShowWarModal] = useState(false);
  const [warPhase, setWarPhase] = useState('idle'); // 'idle', 'join', 'progress', 'reveal', 'roll', 'result', 'tie'
  const [warTieMessage, setWarTieMessage] = useState(null);
  const [warParticipants, setWarParticipants] = useState([]);
  const [warProperty, setWarProperty] = useState(null); // The property being fought over
  const [warRolls, setWarRolls] = useState({});
  const [battlePot, setBattlePot] = useState(0);
  const [warMode, setWarMode] = useState('A'); // 'A' = Standard War, 'B' = Cash Battle
  const [warCurrentRoller, setWarCurrentRoller] = useState(null); // Index in participants array
  const [warDiceValues, setWarDiceValues] = useState([1, 1]);
  const [warIsRolling, setWarIsRolling] = useState(false);
  const [warWinner, setWarWinner] = useState(null);
  const [warTiedPlayers, setWarTiedPlayers] = useState(null);
  const [warTieRoll, setWarTieRoll] = useState(null);

  // Initialize inventory and effects
  useEffect(() => {
    const initialInventory = {};
    const initialEffects = {};
    gamePlayers.forEach((_, idx) => {
      initialInventory[idx] = { jail_card: 0, robbery_immunity: 0, tax_immunity: 0 };
      initialEffects[idx] = { discount_50: false };
    });
    setPlayerInventory(initialInventory);
    setActiveEffects(initialEffects);
  }, []);
  
  // Modal closing animation state
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [closingModal, setClosingModal] = useState(null); // 'buy', 'parking', 'robbank', 'property', 'chance', 'chest', 'audit', 'war'
  
  // Skip turn state { playerIndex: boolean }
  const [skippedTurns, setSkippedTurns] = useState({});

  // Rob Bank State
  const [showRobBankModal, setShowRobBankModal] = useState(false);
  const [robProgress, setRobProgress] = useState(0);
  const [robStatus, setRobStatus] = useState('idle'); // 'idle', 'robbing', 'success', 'caught'
  const [robResult, setRobResult] = useState({ amount: 0, message: '' });

  // Deal System State
  const [showDealModal, setShowDealModal] = useState(false);
  const [dealPhase, setDealPhase] = useState('select'); // 'select' | 'configure' | 'review' | 'result'
  const [selectedDealPlayer, setSelectedDealPlayer] = useState(null);
  const [dealGiveProperties, setDealGiveProperties] = useState([]); // tiles active player gives
  const [dealReceiveProperties, setDealReceiveProperties] = useState([]); // tiles active player receives
  const [dealMoneyOffer, setDealMoneyOffer] = useState(0);
  const [dealSelectionMode, setDealSelectionMode] = useState(false);
  const [incomingDeal, setIncomingDeal] = useState(null);
  const [showDealReviewModal, setShowDealReviewModal] = useState(false);
  const [dealResultMessage, setDealResultMessage] = useState('');
  const [showDealResultModal, setShowDealResultModal] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null); // Synced online deal state { proposer, recipient, giveProperties, receiveProperties }
  
  // Bankruptcy System State
  const [bankruptPlayers, setBankruptPlayers] = useState({}); // { playerIndex: true }
  const [showBankruptcyModal, setShowBankruptcyModal] = useState(false);
  
  // Build System State
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [buildMode, setBuildMode] = useState(false); // true when board interaction is active
  const [buildTotalCost, setBuildTotalCost] = useState(0);
  const [buildNoMonopolyModal, setBuildNoMonopolyModal] = useState(false);
  
  // Menu System State
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [playerAnimationEnabled, setPlayerAnimationEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('pseudo_player_animation_enabled');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });
  const [animationSpeed, setAnimationSpeed] = useState(() => {
    try {
      const stored = localStorage.getItem('pseudo_animation_speed');
      return stored ? parseFloat(stored) || 1 : 1;
    } catch {
      return 1;
    }
  });
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Keep refs in sync for async functions (like movePlayerToken)
  const playerAnimationEnabledRef = useRef(playerAnimationEnabled);
  useEffect(() => {
    playerAnimationEnabledRef.current = playerAnimationEnabled;
  }, [playerAnimationEnabled]);

  const animationSpeedRef = useRef(animationSpeed);
  useEffect(() => {
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed]);

  const togglePlayerAnimation = (enabled) => {
    const next = typeof enabled === 'boolean' ? enabled : !playerAnimationEnabled;
    setPlayerAnimationEnabled(next);
    playerAnimationEnabledRef.current = next;
    try {
      localStorage.setItem('pseudo_player_animation_enabled', String(next));
    } catch {}
  };

  const updateAnimationSpeed = (val) => {
    const speed = Math.max(0.5, Math.min(3, parseFloat(val) || 1));
    setAnimationSpeed(speed);
    animationSpeedRef.current = speed;
    try {
      localStorage.setItem('pseudo_animation_speed', String(speed));
    } catch {}
  };
  
  // Toast Notification
  const [toast, setToast] = useState({ show: false, message: '' });
  const showToast = useCallback((message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  }, []);

  // Turn Validation Helper
  const validateTurn = () => {
    if (networkMode === 'online' && myPlayerIndex !== currentPlayer) {
      showToast("Not your turn!");
      return false;
    }
    return true;
  };
  

  

  
  // Forced Auction State
  const [showAuctionModal, setShowAuctionModal] = useState(false);
  const [showAuctionLandingModal, setShowAuctionLandingModal] = useState(false); // Landing choice modal
  const [showAuctionInstructionModal, setShowAuctionInstructionModal] = useState(false);
  const [isSelectingAuctionProperty, setIsSelectingAuctionProperty] = useState(false);
  const [auctionState, setAuctionState] = useState({
      status: 'idle', // idle, thinking, announcing, active, processing
      propertyIndex: null,
      initiator: null,
      bids: [],
      currentBid: 0,
      participants: [],
      winner: null
  });
  // Used to store the currently selected property OBJECT for the confirmation modal
  const [pendingAuctionProperty, setPendingAuctionProperty] = useState(null);
  // Current bid input value
  const [auctionBidAmount, setAuctionBidAmount] = useState(0);

  // Audit (Dice Gamble) State
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditStatus, setAuditStatus] = useState('idle'); // 'idle', 'rolling', 'result'
  const [auditDiceValues, setAuditDiceValues] = useState([1, 1]);
  const [auditAmount, setAuditAmount] = useState(0);
  
  // Debug Dice State
  const [debugDiceValue, setDebugDiceValue] = useState(7);
  const [devMode, setDevMode] = useState(() => {
    try { return localStorage.getItem('pseudopoly_devmode') === 'true'; } catch { return false; }
  });

  // Helper: Close any modal with animation
  const closeAllModals = (callback, keepBuyingState = false) => {
    setIsModalClosing(true);
    
    // Determine which modal is currently showing to set closingModal
    if (showBuyModal) setClosingModal('buy');
    else if (showParkingModal) setClosingModal('parking');
    else if (showRobBankModal) setClosingModal('robbank');
    else if (showPropertyModal) setClosingModal('property');
    else if (showChanceModal) setClosingModal('chance');
    else if (showChestModal) setClosingModal('chest');
    else if (showAuditModal) setClosingModal('audit');
    else if (showWarModal) setClosingModal('war');

    setTimeout(() => {
      setShowBuyModal(false);
      if (!keepBuyingState) {
        setBuyingProperty(null);
      }
      setShowParkingModal(false);
      setShowRobBankModal(false);
      setShowPropertyModal(false);
      setSelectedProperty(null);
      setShowChanceModal(false);
      setShowChestModal(false);
      setShowAuditModal(false);
      setShowWarModal(false);
      setAuditStatus('idle');
      setRobStatus('idle'); // Reset status
      setIsModalClosing(false);
      setClosingModal(null);
      if (callback) callback();
    }, 300); // 300ms matches CSS animation duration
  };

  // Helper: Immediately reset all modal states (no animation) - use before opening new modals
  const resetAllModals = () => {
    setShowBuyModal(false);
    setBuyingProperty(null);
    setShowParkingModal(false);
    setShowRobBankModal(false);
    setShowPropertyModal(false);
    setSelectedProperty(null);
    setShowChanceModal(false);
    setShowChestModal(false);
    setShowAuditModal(false);
    setShowWarModal(false);
    setAuditStatus('idle');
    setRobStatus('idle');
    setIsModalClosing(false);
    setCurrentChanceCard(null);
    setCurrentChestCard(null);
  };

  // Floating price animation state - array to support multiple animations
  const [floatingPrices, setFloatingPrices] = useState([]); // [{ price, tileIndex, key, isPositive }]
  
  // Unique key generator for floating prices to prevent duplicate React keys
  const floatingKeyCounter = useRef(0);
  const getUniqueKey = () => {
    floatingKeyCounter.current += 1;
    return `fp_${Date.now()}_${floatingKeyCounter.current}`;
  };
  


  // --- SOCKET.IO NETWORKING ---

  const formatServerUrl = (raw) => {
    let formatted = (raw || '').trim();
    if (!formatted) return '';
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      if (
        formatted.includes('.onrender.com') ||
        formatted.includes('.railway.app') ||
        formatted.includes('.herokuapp.com') ||
        formatted.includes('.repl.co') ||
        formatted.includes('.loca.lt') ||
        formatted.includes('.ngrok')
      ) {
        formatted = 'https://' + formatted;
      } else {
        formatted = 'http://' + formatted;
      }
    }
    // Auto-append port :3001 only for HTTP IP addresses or localhost
    if (formatted.startsWith('http://')) {
      const match = formatted.match(/^(https?:\/\/[^/:]+)(\/.*)?$/);
      if (match) {
        const host = match[1].replace(/^https?:\/\//, '');
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost') {
          formatted = `${match[1]}:3001${match[2] || ''}`;
        }
      }
    }
    return formatted.replace(/\/+$/, '');
  };

  const getInitialHotspotUrl = () => {
    try {
      const stored = localStorage.getItem('pseudopoly_hotspot_url');
      if (stored && !stored.includes('localhost') && !stored.includes('127.0.0.1')) {
        return formatServerUrl(stored);
      }
      // If loaded in a browser on another device on LAN, use hostname if not localhost
      if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        const hostname = window.location.hostname;
        if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
          return `http://${hostname}:3001`;
        }
      }
      // Default for Android Hotspot Gateway (Mini Militia style tethering)
      return 'http://192.168.43.1:3001';
    } catch {
      return 'http://192.168.43.1:3001';
    }
  };

  const getInitialOnlineUrl = () => {
    try {
      const stored = localStorage.getItem('pseudopoly_online_url');
      if (stored) return formatServerUrl(stored);
      if (import.meta.env.VITE_SERVER_URL) return formatServerUrl(import.meta.env.VITE_SERVER_URL);
    } catch {}
    return 'https://pseudo-poly.onrender.com';
  };

  const [networkType, setNetworkType] = useState('wifi'); // 'wifi' or 'online'
  const [hotspotServerUrl, setHotspotServerUrl] = useState(getInitialHotspotUrl);
  const [onlineServerUrl, setOnlineServerUrl] = useState(getInitialOnlineUrl);

  const serverUrl = networkType === 'online' ? onlineServerUrl : hotspotServerUrl;
  const [socketConnected, setSocketConnected] = useState(false);
  const isConnectingRef = useRef(false);

  const updateServerUrl = (newUrl) => {
    const formatted = formatServerUrl(newUrl);
    if (networkType === 'online') {
      setOnlineServerUrl(formatted);
      try { localStorage.setItem('pseudopoly_online_url', formatted); } catch {}
    } else {
      setHotspotServerUrl(formatted);
      try { localStorage.setItem('pseudopoly_hotspot_url', formatted); } catch {}
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocketConnected(false);
    setTimeout(() => {
      connectSocket(formatted);
    }, 150);
  };

  // Connect to Socket.IO server and set up event handlers
  // Wake Lock Implementation (Prevent Sleep)
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake Lock active');
        } catch (err) {
          console.log('Wake Lock error:', err);
        }
      }
    };
    
    // Request on mount
    requestWakeLock();
    
    // Re-request on visibility change (if lost)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) wakeLock.release();
    };
  }, []);

  // Connect to Socket.IO server and set up event handlers
  const connectSocket = (explicitUrl = null) => {
    const targetUrl = explicitUrl || serverUrl;
    if (socketRef.current && socketRef.current.connected) return socketRef.current;
    if (socketRef.current) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
      return socketRef.current;
    }
    
    console.log('[connectSocket] Connecting to server at:', targetUrl);
    const socket = io(targetUrl, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 6000,
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
      setSocketConnected(true);
      isConnectingRef.current = false;
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err?.message || err);
      setSocketConnected(false);
      if (isConnectingRef.current) {
        isConnectingRef.current = false;
        showToast(`⚠️ Cannot connect to ${targetUrl}. Please verify host.`);
      }
    });
    
    socket.on('room_created', ({ roomCode: code, playerIndex, gameState, players }) => {
      console.log('Room created:', code);
      setRoomCode(code);
      setMyPlayerIndex(playerIndex);
      setConnectedPlayers(players);
      if (players) {
        setGamePlayers(players.map((p, i) => ({
          id: i,
          name: p.name,
          avatar: p.avatar,
          color: AVATAR_COLORS[p.avatar] || '#888888',
          isBot: false,
          connected: p.connected !== false,
          canBeKicked: p.canBeKicked === true,
          kicked: p.kicked === true,
        })));
      }
      if (gameState) applyGameState(gameState);
      setGameStage('lobby');
    });
    
    socket.on('joined_room', ({ roomCode: code, playerIndex, gameState, players }) => {
      console.log('Joined room:', code, 'as player', playerIndex);
      setRoomCode(code);
      setMyPlayerIndex(playerIndex);
      setConnectedPlayers(players);
      if (players) {
        setGamePlayers(players.map((p, i) => ({
          id: i,
          name: p.name,
          avatar: p.avatar,
          color: AVATAR_COLORS[p.avatar] || '#888888',
          isBot: false,
          connected: p.connected !== false,
          canBeKicked: p.canBeKicked === true,
          kicked: p.kicked === true,
        })));
      }
      if (gameState) applyGameState(gameState);
      setGameStage('lobby');
    });
    
    socket.on('players_updated', ({ players }) => {
      console.log('Players updated:', players);
      setConnectedPlayers(players);
      if (players) {
        setGamePlayers(players.map((p, i) => ({
          id: i,
          name: p.name,
          avatar: p.avatar,
          color: AVATAR_COLORS[p.avatar] || '#888888',
          isBot: false,
          connected: p.connected !== false,
          canBeKicked: p.canBeKicked === true,
          kicked: p.kicked === true,
        })));
      }
    });

    socket.on('player_kicked', ({ targetIndex, name }) => {
      console.log(`[CLIENT] Player kicked: ${name} (P${targetIndex})`);
      if (myPlayerIndex === targetIndex) {
        showToast('You have been kicked from the room by the host.');
        setTimeout(() => {
          if (socketRef.current) socketRef.current.disconnect();
          socketRef.current = null;
          setGameStage('menu');
          setNetworkMode('offline');
        }, 1500);
      } else {
        showToast(`${name} was kicked from the game.`);
      }
    });
    
    socket.on('game_started', ({ gameState, players }) => {
      console.log('Game started!');
      if (players) {
        setConnectedPlayers(players);
        setGamePlayers(players.map((p, i) => ({
          id: i,
          name: p.name,
          avatar: p.avatar,
          color: AVATAR_COLORS[p.avatar] || '#888888',
          isBot: false,
          connected: p.connected !== false,
          canBeKicked: p.canBeKicked === true,
          kicked: p.kicked === true,
        })));
      }
      if (gameState) applyGameState(gameState);
      setGameStage('playing');
    });
    
    socket.on('state_update', ({ gameState, players }) => {
      console.log('State update received:', gameState.currentPlayer, gameState.playerPositions);
      console.log('Calling applyGameState now...');
      applyGameState(gameState);
      console.log('applyGameState returned');
      if (players) setConnectedPlayers(players);
    });
    
    socket.on('floating_price', (payload) => {
      // payload: { tileIndex, price, isPositive, label }
      console.log(`[CLIENT-DEBUG] Incoming floating_price event at ${new Date().toLocaleTimeString()}:`, payload);
      
      try {
        if (payload.tileIndex === undefined) {
             console.warn('[CLIENT-DEBUG] Received floating_price with undefined tileIndex!');
        }

        const animKey = getUniqueKey();
        setFloatingPrices(prev => {
          const newState = [...prev, { ...payload, key: animKey }];
          console.log('[CLIENT-DEBUG] Updated floatingPrices state. New count:', newState.length);
          return newState;
        });
        
        setTimeout(() => {
          // console.log('[CLIENT-DEBUG] Cleaning up floating price key:', animKey);
          setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey));
        }, 3000);
        
        // If it's a tax (index 7), also show Cash Stack animation
        if (payload.tileIndex === 7 && !payload.isPositive) {
           showCashStackFloatingPrice(Math.abs(payload.price));
        }
        
        // Play sound for received floating price
        if (typeof Audio !== 'undefined') {
          playBuySound();
        }
      } catch (err) {
        console.error('[CLIENT-DEBUG] Error handling floating_price:', err);
      }
    });
    
    // Dice Roll Started: All clients animate and play sound together
    socket.on('dice_roll_started', ({ roller }) => {
      console.log(`[CLIENT] Dice roll started by Player ${roller}`);
      // Trigger animation state
      setIsRolling(true);
      // Play sound for ALL players
      playDiceRollSound();
      // Animation will complete when state_update arrives with final dice values
      setTimeout(() => setIsRolling(false), 800);
    });

    // Synchronized Movement (Chance Cards, Jail, Travel): All clients animate simultaneously on track
    socket.on('chance_move_animated', async ({ playerIndex, oldPos, targetPos, steps, delay, cardText }) => {
      console.log(`[CLIENT] Received chance_move_animated: P${playerIndex} from ${oldPos} to ${targetPos} (${steps} steps)`);
      
      // Prevent double animation when state broadcast arrives
      lastKnownPositionsRef.current[playerIndex] = targetPos;
      isAnimatingRef.current = true;
      
      const moveDelay = delay || 180;
      setHoppingPlayer(playerIndex);
      await movePlayerToken(playerIndex, steps, moveDelay, oldPos);
      setHoppingPlayer(null);
      isAnimatingRef.current = false;
      
      // Ensure target position is exact
      setPlayerPositions(prev => {
        const next = [...prev];
        next[playerIndex] = targetPos;
        return next;
      });
      
      // Active player triggers landing logic once arrived
      const myIdx = gameStateRef.current.myPlayerIndex;
      if (myIdx === playerIndex) {
        sendGameAction('landed');
        handleTileArrival(playerIndex, targetPos, false, null, null, true);
      }
    });
    
    // Deal System: Handle incoming deal offers
    socket.on('deal_offer', (dealData) => {
      console.log('[CLIENT] Received deal_offer:', dealData);
      // Show the deal review modal for the recipient
      setIncomingDeal(dealData);
      setShowDealReviewModal(true);
    });
    
    // Deal System: Handle deal result (for proposer)
    // Deal System: Handle deal result (for proposer)
    socket.on('deal_result', ({ accepted, deal }) => {
      console.log('[CLIENT] Received deal_result:', accepted, deal);
      
      const { myPlayerIndex: currentMyIndex, gamePlayers: currentPlayers } = gameStateRef.current;

      // ONLY show the result modal for the proposer (the offering player)
      if (currentMyIndex === deal.proposer) {
        showDealResult(accepted, deal);
      } else if (currentMyIndex === deal.recipient) {
        // Recipient only sees history log
        const proposerName = currentPlayers[deal.proposer]?.name || 'Player';
        if (accepted) {
          setHistory(prev => [`✅ You accepted the deal from ${proposerName}!`, ...prev.slice(0, 9)]);
        } else {
          setHistory(prev => [`❌ You denied the deal from ${proposerName}.`, ...prev.slice(0, 9)]);
        }
      }
      resetDealState();
    });
    
    // Player Exited: Show notification when someone leaves
    socket.on('player_exited', ({ playerIndex: exitedIdx, playerName }) => {
      console.log(`[CLIENT] Player ${playerName} exited the game`);
      showToast(`🚪 ${playerName} has left the game!`);
    });
    
    socket.on('room_closed', ({ message }) => {
      showToast(message || 'Room was closed');
      setGameStage('mode_select');
      setNetworkMode('offline');
      socketRef.current = null;
    });
    
    socket.on('error', ({ message }) => {
      showToast(message || 'An error occurred');
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
    
    return socket;
  };

  // Automatically initiate socket connection when visiting multiplayer matchmaking screens
  useEffect(() => {
    if (gameStage === 'online_menu' || gameStage === 'mode_select') {
      connectSocket();
    }
  }, [gameStage, serverUrl, networkType]);

  // Track last known positions for animation (independent of ref which can be stale)
  const lastKnownPositionsRef = useRef([0, 0, 0, 0]);
  
  // Track when client-side animation is in progress (prevents server override)
  const isAnimatingRef = useRef(false);
  
  // Track local movement animation status for UI (e.g. disabling Done button)
  const [isLocalMoving, setIsLocalMoving] = useState(false);
  
  // Apply game state from server - handles all state sync and animations
  const applyGameState = async (state) => {
    const currentRef = gameStateRef.current;
    const myIdx = currentRef.myPlayerIndex;
    const isOnline = currentRef.networkMode === 'online';
    
    // Determine if position changed for the current player
    const currentPlayerIdx = state.currentPlayer ?? currentRef.currentPlayer;
    const oldPosition = lastKnownPositionsRef.current[currentPlayerIdx];
    let newPosition = state.playerPositions?.[currentPlayerIdx];
    
    // GUARD: Prevent bouncing back from Jail (28) to Rob Bank (18) due to stale server state
    if (oldPosition === 28 && newPosition === 18 && currentPlayerIdx === myIdx) {
        console.log('[applyGameState] Ignoring stale position update (28 -> 18) for self.');
        newPosition = 28; // Force keep at Jail
    }
    
    const positionChanged = newPosition !== undefined && oldPosition !== newPosition;
    
    // Set animation lock IMMEDIATELY if position changed to prevent race conditions
    // This must happen before any state updates or async operations
    if (positionChanged && isOnline) {
      isAnimatingRef.current = true;
      // Update tracking ref immediately to prevent duplicate animations
      lastKnownPositionsRef.current[currentPlayerIdx] = newPosition;
    }
    
    // ===== SYNC ALL UI STATE TO ALL CLIENTS =====
    // CRITICAL: Protect loan/money/history state from being overwritten during animations
    // Otherwise, server echoing stale data back will reset the lap count and wipe history
    const isSafeToOverwriteState = !isAnimatingRef.current;

    if (state.currentPlayer !== undefined) {
      if (state.currentPlayer !== currentRef.currentPlayer) {
        setBuyingProperty(null);
        setShowBuyModal(false);
      }
      setCurrentPlayer(state.currentPlayer);
    }
    if (state.diceValues) setDiceValues(state.diceValues);
    if (state.isRolling !== undefined) setIsRolling(state.isRolling);
    
    // These state updates are protected during animations
    if (isSafeToOverwriteState) {
        if (state.playerMoney) setPlayerMoney(state.playerMoney);
        if (state.history) setHistory(state.history);
        
        // Smart playerLoans sync: ALWAYS preserve local loan progress.
        // The only case we accept server's deletion is when loan was fully repaid (debit).
        // This prevents ANY stale server broadcast from resetting lap count.
        if (state.playerLoans) {
            setPlayerLoans(currentLoans => {
                const serverLoans = state.playerLoans || {};
                const merged = { ...serverLoans };
                
                // For each local loan, ALWAYS keep it (preserves progress)
                // Only exception: if server deleted it (loan was debited)
                Object.keys(currentLoans).forEach(pIdx => {
                    const localLoan = currentLoans[pIdx];
                    const serverLoan = serverLoans[pIdx];
                    
                    if (localLoan) {
                        if (serverLoan) {
                            // Both exist: ALWAYS keep local (it has the most recent progress)
                            merged[pIdx] = localLoan;
                        } else {
                            // Server deleted loan (debit happened) - accept deletion only if 
                            // we're not the loan owner OR our local laps is already 0 or less
                            // This prevents premature deletion from stale broadcasts
                            if (localLoan.lapsRemaining <= 0) {
                                // Loan was debited, accept deletion
                                delete merged[pIdx];
                            } else {
                                // Stale broadcast trying to delete active loan - keep it
                                merged[pIdx] = localLoan;
                            }
                        }
                    }
                });
                
                gameStateRef.current.playerLoans = merged;
                return merged;
            });
        }
    }
    
    if (state.propertyOwnership) setPropertyOwnership(state.propertyOwnership);
    if (state.propertyLevels) setPropertyLevels(state.propertyLevels);
    if (state.turnFinished !== undefined) setTurnFinished(state.turnFinished);
    if (state.isProcessingTurn !== undefined) setIsProcessingTurn(state.isProcessingTurn);
    if (state.cashStack !== undefined) setCashStack(state.cashStack);
    if (state.battlePot !== undefined) setBattlePot(state.battlePot);
    if (state.auctionState) setAuctionState(state.auctionState);
    if (state.bankruptPlayers) setBankruptPlayers(state.bankruptPlayers);
    if (state.gamePlayers) gameStateRef.current.gamePlayers = state.gamePlayers;
    
    // Sync Property War State
    if (state.warState) {
        setShowWarModal(state.warState.active);
        setWarPhase(state.warState.phase);
        setWarParticipants(state.warState.participants || []);
        setWarMode(state.warState.mode || 'A');
        setWarRolls(state.warState.rolls || {});
        setWarCurrentRoller(state.warState.currentRoller);
        
        // Handle warProperty sync (Server sends tileIndex or object?)
        // Server warState.property is usually the object or null.
        // If it's just an index, we might need to resolve it, but server index.js line 548 sets it to null.
        // In handleWarReveal (server side?), it might set it.
        // Let's safe check:
        setWarProperty(state.warState.property); 
        
        // Dice values for war
        if (state.warState.diceValues) setWarDiceValues(state.warState.diceValues);
    }
    // Sync Modal State
    if (state.modalState) {
      if (state.modalState.type === 'ROB_BANK') {
        setShowAuditModal(false); // Ensure Audit is closed
        setShowRobBankModal(true);
        const serverStatus = state.modalState.status.toUpperCase();
        console.log('[ROB_BANK] Modal state received:', serverStatus, state.modalState.payload);
        // ... (rest of logic same)
        if (serverStatus === 'PROCESSING') {
          setRobStatus('processing');
        } else if (serverStatus === 'RESULT') {
          // Use payload.result to determine success or caught
          const result = state.modalState.payload?.result;
          if (result === 'success') {
            setRobStatus('success');
            setRobResult({ amount: state.modalState.payload.amount, message: 'Success!' });
          } else {
            setRobStatus('caught');
            setRobResult({ amount: 0, message: 'Caught!' });
          }
        }
      } else if (state.modalState.type === 'AUDIT') {
        setShowRobBankModal(false); // Ensure Rob Bank is closed
        console.log('[applyGameState] Received AUDIT modal state:', state.modalState.payload);
        // Show audit modal to all players with dice values and tax from server
        const { diceValues: serverDice, taxAmount } = state.modalState.payload || {};
        if (serverDice) setAuditDiceValues(serverDice);
        if (taxAmount !== undefined) setAuditAmount(taxAmount);
        setAuditStatus('result');
        setShowAuditModal(true);
      } else if (state.modalState.type === 'CHANCE') {
        console.log('[applyGameState] Received CHANCE modal:', state.modalState.payload);
        if (state.modalState.payload?.card) {
             resetAllModals(); // Clear any stacked modals
             setCurrentChanceCard(state.modalState.payload.card);
             setShowChanceModal(true);
        }
      } else if (state.modalState.type === 'CHEST') {
        console.log('[applyGameState] Received CHEST modal:', state.modalState.payload);
        if (state.modalState.payload?.card) {
             resetAllModals(); // Clear any stacked modals
             setCurrentChestCard(state.modalState.payload.card);
             setShowChestModal(true);
        }
      } else if (state.modalState.type === 'PARKING') {
         resetAllModals(); // Clear any stacked modals
         setShowParkingModal(true);
      } else if (state.modalState.type === 'NONE') {
        // Only log if we are hiding a modal that was showing
        if (showAuditModal) console.log('[applyGameState] Hiding AUDIT modal (type NONE)');
        setShowRobBankModal(false);
        setShowAuditModal(false);
        setShowParkingModal(false);
        setShowChanceModal(false);
        setShowChestModal(false);
        setRobStatus('idle');
        setAuditStatus('idle');
      }
    }
    
    // Sync War State
    if (state.warState) {
      setShowWarModal(state.warState.active);
      setWarPhase(state.warState.phase);
      setWarMode(state.warState.mode);
      setWarParticipants(state.warState.participants || []);
      setWarTieMessage(state.warState.tieMessage || null);
      setWarTiedPlayers(state.warState.tiedPlayers || null);
      setWarTieRoll(state.warState.tieRoll || null);
      if (state.warState.property) {
        setWarProperty(state.warState.property);
      } else if (state.warState.propertyIndex !== undefined && state.warState.propertyIndex !== null) {
        const propData = RENT_DATA[state.warState.propertyIndex];
        console.log(`[App] Syncing War Property. Index: ${state.warState.propertyIndex}, Data Found:`, !!propData);
        if (propData) {
          setWarProperty({ ...propData, tileIndex: state.warState.propertyIndex });
        } else {
          console.error(`[App] RENT_DATA missing for index ${state.warState.propertyIndex}`);
        }
      }
      setWarRolls(state.warState.rolls || {});
      setWarCurrentRoller(state.warState.currentRoller);
      setWarDiceValues(state.warState.diceValues || [1, 1]);
      if (state.warState.isRolling !== undefined) {
        setWarIsRolling(state.warState.isRolling);
      }
      if (state.warState.winner !== undefined) {
        setWarWinner(state.warState.winner);
      }
    }
    
    if (state.activeDeal !== undefined) {
      setActiveDeal(state.activeDeal);
    }
    
    // Trigger Dice Animation if rolling
    if (state.isRolling && !isRolling) {
       playDiceRollSound();
       // Animation is handled by CSS based on isRolling state
    }
    // ===== HANDLE POSITION CHANGES WITH ANIMATION =====
    if (positionChanged && isOnline) {
      console.log('[applyGameState] Position changed, animating hop from', oldPosition, 'to', newPosition);
      
      // Calculate move amount (handle wrap around board)
      let moveAmount = newPosition - oldPosition;
      if (moveAmount < 0) moveAmount += 36;
      
      // Note: isAnimatingRef and lastKnownPositionsRef were already updated at top of function
      
      // Run hop animation
      if (playerAnimationEnabledRef.current) {
        setHoppingPlayer(currentPlayerIdx);
      }
      await movePlayerToken(currentPlayerIdx, moveAmount, 300, oldPosition);
      setHoppingPlayer(null);
      isAnimatingRef.current = false; // Clear animation lock when done
      
        // Only show modals for the player whose turn it is (on their screen)
        if (myIdx === currentPlayerIdx) {
          console.log('[applyGameState] My turn - triggering landing logic');
          
          if (isOnline) {
             // In online mode, we notify the server that we've landed
             // The server is now the authority for Rent, Tax, and Audit
             sendGameAction('landed');
             
             // We still run handleTileArrival for CLIENT-SIDE UI triggers (modals, toasts)
             // But we will refactor handleTileArrival to skip logic that the server now handles
             handleTileArrival(currentPlayerIdx, newPosition, false, state.propertyOwnership, state.diceValues, true);
          } else {
             // Offline mode: Full local logic
             handleTileArrival(currentPlayerIdx, newPosition, false, state.propertyOwnership, state.diceValues, false);
          }
        }
    } else {
      // No position change OR initial sync - just update positions directly
      // BUT only if we're not currently animating (prevents mid-animation jumps)
      if (state.playerPositions && !isAnimatingRef.current) {
        setPlayerPositions(state.playerPositions);
        // Keep our tracking ref in sync
        lastKnownPositionsRef.current = [...state.playerPositions];
      }
      // Only sync hoppingPlayer from server when NOT animating locally
      // (prevents server's null from interrupting client animation)
      if (state.hoppingPlayer !== undefined && !isAnimatingRef.current) {
        setHoppingPlayer(state.hoppingPlayer);
      }
    }
  };

  // Ref to track network mode (avoids stale closures in socket callbacks)
  const networkModeRef = useRef(networkMode);
  useEffect(() => {
    networkModeRef.current = networkMode;
  }, [networkMode]);

  // Create a new room (Host)
  const createRoom = () => {
    const socket = connectSocket();
    setNetworkMode('online');
    
    if (socket.connected) {
      socket.emit('create_room', {
        name: myIdentity.name,
        avatar: myIdentity.avatar
      });
      return;
    }

    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    showToast(`Connecting to ${networkType === 'online' ? 'Online Server' : 'Hotspot Host'} (${serverUrl})...`);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      isConnectingRef.current = false;
      showToast(`⚠️ Connection timed out. Cannot reach ${serverUrl}. Check hotspot or server status.`);
    }, 6000);

    const onConnect = () => {
      if (timedOut) return;
      clearTimeout(timeoutId);
      isConnectingRef.current = false;
      socket.emit('create_room', {
        name: myIdentity.name,
        avatar: myIdentity.avatar
      });
    };

    socket.once('connect', onConnect);
  };

  // Join an existing room
  const joinRoom = () => {
    const cleanCode = (joinCode || '').trim();
    if (!cleanCode || !/^\d{4}$/.test(cleanCode)) {
      showToast('Please enter a valid 4-digit code.');
      return;
    }
    
    const socket = connectSocket();
    setNetworkMode('online');
    
    if (socket.connected) {
      socket.emit('join_room', {
        roomCode: cleanCode,
        name: myIdentity.name,
        avatar: myIdentity.avatar
      });
      return;
    }

    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    showToast(`Connecting to ${networkType === 'online' ? 'Online Server' : 'Hotspot Host'} (${serverUrl})...`);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      isConnectingRef.current = false;
      showToast(`⚠️ Connection timed out. Cannot reach ${serverUrl}. Check room code and server.`);
    }, 6000);

    const onConnect = () => {
      if (timedOut) return;
      clearTimeout(timeoutId);
      isConnectingRef.current = false;
      socket.emit('join_room', {
        roomCode: cleanCode,
        name: myIdentity.name,
        avatar: myIdentity.avatar
      });
    };

    socket.once('connect', onConnect);
  };

  // Start the game (Host only)
  const startGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('start_game');
    }
  };

  // Send a game action to the server
  const sendGameAction = (action, payload = {}) => {
    // Check Ref ensures we see current state even in stale closures (like applyGameState)
    if (socketRef.current && networkModeRef.current === 'online') {
      console.log(`[App] Sending action: ${action}`, payload);
      socketRef.current.emit('game_action', { action, payload });
    } else {
        console.warn(`[App] Failed to send ${action}: Socket=${!!socketRef.current}, Mode=${networkModeRef.current}`);
    }
  };
  
  // Legacy function names for compatibility
  const initializeHost = createRoom;
  const joinGame = joinRoom;
  const sendAction = (action, params = {}) => sendGameAction(action.toLowerCase(), params);
  const broadcastState = () => {}; // No longer needed - server handles state

  // Clear floating prices on mount to remove any stale state with duplicate keys
  useEffect(() => {
    setFloatingPrices([]);
    setCashStackFloatingPrices([]);
  }, []);

  // Cash Stack Floating Prices State
  const [cashStackFloatingPrices, setCashStackFloatingPrices] = useState([]);

  const showCashStackFloatingPrice = (amount) => {
    const key = `cs_fp_${Date.now()}_${Math.random()}`;
    setCashStackFloatingPrices(prev => [...prev, { key, amount }]);

    // Remove after animation
    setTimeout(() => {
      setCashStackFloatingPrices(prev => prev.filter(item => item.key !== key));
    }, 3000);
  };

  // Helper to get property info by tile index
  const getPropertyByTileIndex = (tileIndex) => {
    // Corners and Robber are not properties
    if (tileIndex === 0 || tileIndex === 10 || tileIndex === 18 || tileIndex === 28 || tileIndex === 26) {
      return null;
    }
    
    let property = null;
    
    if (tileIndex > 0 && tileIndex < 10) {
      property = bottomRow[tileIndex - 1];
    } else if (tileIndex > 10 && tileIndex < 18) {
      property = leftColumn[tileIndex - 11];
    } else if (tileIndex > 18 && tileIndex < 28) {
      property = topRow[tileIndex - 19];
    } else if (tileIndex > 28 && tileIndex < 36) {
      property = rightColumn[tileIndex - 29];
    }
    
    // Only return buyable properties (not Chance, Tax, etc.)
    if (property && (property.type === SPACE_TYPES.PROPERTY || property.type === SPACE_TYPES.RAILROAD || property.type === SPACE_TYPES.UTILITY)) {
      // Calculate rent (simplified: 10% of price)
      const rent = property.price ? Math.round(property.price * 0.1) : 0;
      return { ...property, tileIndex, rent };
    }
    
    return null;
  };

  // Color groups for monopoly detection: color -> [tileIndices]
  const COLOR_GROUPS = {
    [PROPERTY_COLORS.yellow]: [1, 2, 5],      // Shop, Super market, Service station
    [PROPERTY_COLORS.red]: [6, 8, 9],          // Swim pool, Zoo, Ice-rink
    [PROPERTY_COLORS.pink]: [11, 12, 14],      // Pizzeria, Cinema, Night club
    [PROPERTY_COLORS.darkOrange]: [15, 16, 17], // Airport, Car salon, Harbor
    [PROPERTY_COLORS.lightGreen]: [19, 20, 22], // Newspaper, TV channel, Mobile op.
    [PROPERTY_COLORS.purple]: [24, 25, 27],     // Toy factory, Candy factory, Organic farm
    [PROPERTY_COLORS.darkGreen]: [29, 30],      // Oil well, Diamond mine (only 2)
    [PROPERTY_COLORS.limeGreen]: [34, 35],      // Hollywood, Electronics factory (only 2)
  };

  // Get all monopoly tile indices for a player (tiles where player owns ALL properties in color group)
  const getMonopolyTiles = (playerIdx) => {
    const monopolyTiles = [];
    
    Object.entries(COLOR_GROUPS).forEach(([color, tileIndices]) => {
      // Check if player owns ALL tiles in this color group
      const ownsAll = tileIndices.every(tileIdx => propertyOwnership[tileIdx] === playerIdx);
      if (ownsAll) {
        monopolyTiles.push(...tileIndices);
      }
    });
    
    return monopolyTiles;
  };

  // Get upgrade cost for a property at a given level (returns cost to upgrade TO next level)
  const getUpgradeCost = (tileIndex) => {
    const property = getPropertyByTileIndex(tileIndex);
    if (!property) return 0;
    // Upgrade cost is typically 50% of property price
    return Math.round(property.price * 0.5);
  };

  // Helper to get owner's color for a tile (returns null if unowned)
  // Returns { bgColor, textColor } for owned properties
  const getOwnerStyle = (tileIndex) => {
    const rawOwner = propertyOwnership[tileIndex];
    
    if (rawOwner !== undefined && rawOwner !== null) {
      const ownerIndex = Number(rawOwner);
      
      if (gamePlayers[ownerIndex]) {
        const bgColor = gamePlayers[ownerIndex].color;
        
        // Custom Glassy Style for Orange Avatar (#FF9800)
        if (bgColor === '#FF9800') {
            return {
                background: 'linear-gradient(135deg, #FF9800 0%, #FFCC80 100%)',
                color: '#FFF',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 2px 4px rgba(255, 152, 0, 0.3), inset 0 0 4px rgba(255,255,255,0.3)',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
            };
        }

        const isLightBg = bgColor === '#E0E0E0' || bgColor === '#FFFFFF';
        return { 
          background: bgColor,
          color: isLightBg ? '#333333' : '#FFFFFF',
        };
      }
    }
    return null;
  };

  // Helper: Check for Monopoly
  const hasMonopoly = (tileIndex, ownerIndex, ownershipOverride = null) => {
    const property = RENT_DATA[tileIndex];
    if (!property) return false;
    
    // Use override if provided, otherwise use current state
    const currentOwnership = ownershipOverride || propertyOwnership;
    
    const groupId = property.groupId;
    
    // Find all tiles in this group
    const groupTiles = Object.keys(RENT_DATA).filter(key => RENT_DATA[key].groupId === groupId);
    
    // Check if owner owns all of them
    return groupTiles.every(tIndex => currentOwnership[tIndex] === ownerIndex);
  };

  // Helper: Calculate Rent
  const calculateRent = (tileIndex, ownershipOverride = null) => {
    const currentOwnership = ownershipOverride || propertyOwnership;

    // 1. Check if it's a Train
    if (TRAIN_TILES.includes(tileIndex)) {
      const ownerIndex = currentOwnership[tileIndex];
      if (ownerIndex === undefined) return 0;
      
      // Count trains owned by this player
      const ownedTrains = TRAIN_TILES.filter(t => currentOwnership[t] === ownerIndex).length;
      const rent = TRAIN_RENT[ownedTrains - 1] || 0;
      console.log(`[calculateRent] Train tile ${tileIndex}: owner=${ownerIndex}, ownedTrains=${ownedTrains}, rent=${rent}`);
      return rent;
    }
    
    // 2. Regular Property
    const property = RENT_DATA[tileIndex];
    if (!property) return 0; // Should not happen for valid properties
    
    // START: Use Ref for latest levels to avoid stale closures in timeouts
    const currentLevels = gameStateRef.current?.propertyLevels || propertyLevels;
    const level = currentLevels[tileIndex] || 0;
    // END: Use Ref
    const ownerIndex = currentOwnership[tileIndex];
    
    // Check Monopoly (only relevant if level is 0)
    // Pass the ownershipOverride down to hasMonopoly
    if (level === 0 && hasMonopoly(tileIndex, ownerIndex, currentOwnership)) {
      return property.rentLevels[0] * 2;
    }
    
    return property.rentLevels[level];
  };

  // Helper to get tile name for history
  const getTileName = (index) => {
    if (index === 0) return 'START';
    if (index === 10) return 'PARKING';
    if (index === 18) return 'ROB BANK';
    if (index === 28) return 'JAIL';
    
    if (index > 0 && index < 10) return bottomRow[index - 1].name;
    if (index > 10 && index < 18) return leftColumn[index - 11].name;
    if (index > 18 && index < 28) return topRow[index - 19].name;
    if (index > 28 && index < 36) return rightColumn[index - 29].name;
    return 'Unknown';
  };

  // New helper for delay
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Audio context for sound effects
  const audioContextRef = useRef(null);
  
  // Initialize AudioContext lazily
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  
  // Modern "Tick" Sound for Hopping
  const playHopSound = () => {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      // Layer 1: High click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
      
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      
      osc.start(t);
      osc.stop(t + 0.05);
      
      // Layer 2: Noise burst (texture)
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000;
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      noiseGain.gain.setValueAtTime(0.05, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      
      noise.start(t);
    } catch (e) {}
  };
  
  // Modern Dice Roll (Softer Shuffling)
  const playDiceRollSound = () => {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      // Create noise buffer (Pinkish noise for softer sound)
      const bufferSize = ctx.sampleRate * 0.6;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Simple pinking filter (1/f)
      let b0, b1, b2, b3, b4, b5, b6;
      b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        data[i] *= 0.11; // Compensate for gain
        b6 = white * 0.115926;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      // Lowpass to remove harshness
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, t);
      
      const gain = ctx.createGain();
      
      // Rhythmic amplitude modulation
      gain.gain.setValueAtTime(0, t);
      for(let i=0; i<6; i++) {
        // Smoother ramps
        gain.gain.linearRampToValueAtTime(0.25, t + i*0.1 + 0.02);
        gain.gain.linearRampToValueAtTime(0.05, t + i*0.1 + 0.08);
      }
      gain.gain.linearRampToValueAtTime(0, t + 0.6);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(t);
    } catch (e) {}
  };
  
  // Custom Cash Register Sound (File)
  const playBuySound = () => {
    try {
      const audio = new Audio(cashRegisterSound);
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed', e));
    } catch (e) {}
  };
  
  // Custom Cash Register Sound (Rent/Deducting)
  const playPayRentSound = () => {
    try {
      const audio = new Audio(cashRegisterSound);
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed', e));
    } catch (e) {}
  };
  
  // Modern Collect Money (Cash Counter - Receiving)
  const playCollectMoneySound = () => {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      // Rapid "counting" sound (ascending pitch for receiving)
      for (let i = 0; i < 10; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        // Crisp "bill count" sound
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200 + (i * 50), t + i * 0.03);
        
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2000, t + i * 0.03);
        
        gain.gain.setValueAtTime(0, t + i * 0.03);
        gain.gain.linearRampToValueAtTime(0.08, t + i * 0.03 + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.03 + 0.025);
        
        osc.start(t + i * 0.03);
        osc.stop(t + i * 0.03 + 0.025);
      }
      
      // Final "Success" chime
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t + 0.35); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.4); // A6
        
        gain.gain.setValueAtTime(0.1, t + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        
        osc.start(t + 0.35);
        osc.stop(t + 0.8);
      }, 350);
      
    } catch (e) {}
  };
  
  // Modern Win (Ethereal Chord)
  const playWinSound = () => {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      // Major 9th chord
      const notes = [261.63, 329.63, 392.00, 493.88, 587.33]; // C4, E4, G4, B4, D5
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sawtooth'; // Richer tone
        osc.frequency.setValueAtTime(freq, t);
        
        // Filter sweep
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, t);
        filter.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5); // Long tail
        
        osc.start(t);
        osc.stop(t + 1.5);
      });
    } catch (e) {}
  };
  
  // Modern Click (Subtle Tap)
  const playClickSound = () => {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(600, t);
      
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      
      osc.start(t);
      osc.stop(t + 0.05);
    } catch (e) {}
  };
  
  // Modern Error (Low Buzz)
  const playErrorSound = () => {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.linearRampToValueAtTime(80, t + 0.2);
      
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) {}
  };

  // Async function to move pawn step-by-step
  const movePlayerToken = async (playerIdx, steps, delay = 300, startPosOverride = null) => {
    const startPos = startPosOverride ?? playerPositions[playerIdx];
    const direction = steps > 0 ? 1 : -1;
    const count = Math.abs(steps);
    
    const isAnimEnabled = playerAnimationEnabledRef.current;
    const speed = animationSpeedRef.current || 1;
    const stepDelay = isAnimEnabled ? Math.max(30, Math.round(delay / speed)) : 0;
    
    setPawnTransitionDuration(stepDelay); // Synchronize CSS transition duration with step delay!
    setIsLocalMoving(true); // Start movement lock
    if (isAnimEnabled) {
      setHoppingPlayer(playerIdx); // Enable hop animation
    }

    for (let i = 1; i <= count; i++) {
      // 1. Calculate and update position
      const currentNextPos = (startPos + (i * direction) + 36) % 36;
      
      setPlayerPositions(prev => {
        const result = [...prev];
        result[playerIdx] = currentNextPos;
        return result;
      });

      // --- Side Effects (Lap Logic & GO Reward) ---
      
      // A. LAP DETECTION (Visuals & History for everyone)
      // IMPORTANT: Access latest loans from ref to avoid stale closure in the hop loop
      const loan = gameStateRef.current.playerLoans[playerIdx];
      const currentPlayerList = gameStateRef.current.gamePlayers;

      if (loan && currentNextPos === loan.loanStartTile && direction > 0) {
        const remaining = loan.lapsRemaining - 1;
        if (remaining <= 0) {
          setHistory(histPrev => [`🏦 Bank debited $${loan.repayAmount.toLocaleString()} loan from ${currentPlayerList[playerIdx].name}`, ...histPrev.slice(0, 9)]);
          const debitKey = getUniqueKey();
          setFloatingPrices(fpPrev => [...fpPrev, { price: loan.repayAmount, tileIndex: currentNextPos, key: debitKey, isPositive: false }]);
          setTimeout(() => setFloatingPrices(fpPrev => fpPrev.filter(fp => fp.key !== debitKey)), 3000);
        } else {
          setHistory(histPrev => [`🏦 ${currentPlayerList[playerIdx].name} completed a lap! ${remaining} left for loan.`, ...histPrev.slice(0, 9)]);
        }
      }

      // B. GO Reward (Visuals & History for everyone)
      if (currentNextPos === 0 && direction > 0) {
        setHistory(histPrev => [`${currentPlayerList[playerIdx].name} passed GO! Collect $1000`, ...histPrev.slice(0, 9)]);
        setFloatingPrices(fpPrev => [...fpPrev, { price: 1000, tileIndex: 0, key: getUniqueKey(), isPositive: true }]);
        playCollectMoneySound();
      }

      // --- State Synchronization (Only token owner/local processes definitively) ---
      if (networkMode !== 'online' || playerIdx === myPlayerIndex) {
        if (loan && currentNextPos === loan.loanStartTile && direction > 0) {
          const remaining = loan.lapsRemaining - 1;
          if (remaining <= 0) {
            const repayAmount = loan.repayAmount;
            setShowBankDebitModal(true);
            setPlayerMoney(moneyPrev => {
              const nextMoney = [...moneyPrev];
              nextMoney[playerIdx] -= repayAmount;
              setPlayerLoans(loansPrev => {
                const nextLoans = { ...loansPrev };
                delete nextLoans[playerIdx];
                if (networkMode === 'online') {
                  sendGameAction('update_state', { playerMoney: nextMoney, playerLoans: nextLoans });
                }
                gameStateRef.current.playerLoans = nextLoans; // Sync ref immediately
                return nextLoans;
              });
              gameStateRef.current.playerMoney = nextMoney; // Sync ref immediately
              return nextMoney;
            });
          } else {
            setPlayerLoans(loansPrev => {
                const nextLoans = { ...loansPrev, [playerIdx]: { ...loansPrev[playerIdx], lapsRemaining: remaining } };
                if (networkMode === 'online') {
                    sendGameAction('update_state', { playerLoans: nextLoans });
                }
                gameStateRef.current.playerLoans = nextLoans; // Sync ref immediately
                return nextLoans;
            });
          }
        }

        if (currentNextPos === 0 && direction > 0 && networkMode !== 'online') {
          setPlayerMoney(moneyPrev => {
            const nextMoney = [...moneyPrev];
            nextMoney[playerIdx] += 1000;
            gameStateRef.current.playerMoney = nextMoney; // Sync ref immediately
            return nextMoney;
          });
        }
      }
      
      if (isAnimEnabled) {
        // 2. Play hop sound
        playHopSound();

        // 3. Wait for animation to complete
        await wait(stepDelay); 
      }
    }
    
    setHoppingPlayer(null); // Disable hop animation
    setIsLocalMoving(false); // End movement lock
    setPawnTransitionDuration(300); // Reset to default 300ms
  };

  // Auto-skip logic (Optimized)
  // We don't need this useEffect anymore if we handle skipping in endTurn/setCurrentPlayer
  // But we might need it for the *first* turn or if logic is complex.
  // Better to use a helper to find the next valid player.
  
  const getNextValidPlayer = (currentIdx) => {
    let nextIdx = (currentIdx + 1) % gamePlayers.length;
    let attempts = 0;
    while (skippedTurns[nextIdx] && attempts < gamePlayers.length) {
      // Decrement skipped turn counter if we had one, or just toggle flag
      // Here we just have a boolean.
      // We should probably clear the flag when they are skipped.
      // But we can't easily update state in a sync loop without side effects.
      // So we will just skip them and let a useEffect clear it? 
      // Or better: Update skippedTurns state when we determine who plays next.
      nextIdx = (nextIdx + 1) % gamePlayers.length;
      attempts++;
    }
    return nextIdx;
  };
  
  // We need to clear the skip flag for the gamePlayers we skipped over.
  // This is tricky in a pure function.
  // Let's do it when we set the current player.


  // Keyboard controls
  useEffect(() => {

  // Handle Key Down
  const handleKeyDown = (e) => {
      // Prevent default for common keys to avoid scrolling
      if (['Space', 'Enter', 'Escape'].includes(e.code)) {
        // We handle preventDefault inside specific blocks to avoid blocking unrelated interactions if needed,
        // but for these keys in a game context, it's usually safe to block globally when handled.
      }

      // --- Modals First (Priority) ---

      // 1. Buy Modal
      if (showBuyModal) {
        if (e.code === 'Enter') {
          e.preventDefault();
          handleBuyProperty();
        } else if (e.code === 'Escape') {
          e.preventDefault();
          handleCancelBuy();
        }
        return;
      }

      // 2. Rob Bank Modal
      if (showRobBankModal) {
        if (robStatus === 'idle') {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            handleRobBankAttempt();
          } else if (e.code === 'Escape') {
            e.preventDefault();
            // Cancel robbing: Close modal and allow turn end
            closeAllModals(() => {
              setIsProcessingTurn(false);
              setTurnFinished(true);
            });
          }
        } else if (robStatus === 'success' || robStatus === 'caught') {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            handleRobBankComplete();
          }
        }
        return;
      }

      // 3. Parking Modal
      if (showParkingModal) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleParkingConfirm();
        }
        return;
      }

      // 4. Property Detail Modal
      if (showPropertyModal) {
        if (e.code === 'Escape' || e.code === 'Space') {
          e.preventDefault();
          closeAllModals();
        }
        return;
      }

      // 5. Chance Modal
      if (showChanceModal) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleChanceCardAction(currentChanceCard);
        }
        return;
      }

      // 6. Chest Modal
      if (showChestModal) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleChestCardAction(currentChestCard);
        }
        return;
      }

      // 7. Property War Modal
      if (showWarModal) {
        if (warPhase === 'join') {
          // Enter or Space to start war
          if ((e.code === 'Enter' || e.code === 'Space') && warParticipants.length > 0) {
            e.preventDefault();
            handleWarStartProgress();
          }
          // Number keys 1-4 to toggle join/withdraw for each player
          if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
            e.preventDefault();
            const playerIdx = parseInt(e.code.replace('Digit', '')) - 1;
            if (warParticipants.includes(playerIdx)) {
              // Already joined, withdraw
              handleWarWithdraw(playerIdx);
            } else if (playerMoney[playerIdx] >= (warMode === 'A' ? 3000 : 2000)) {
              // Not joined, join
              handleWarJoin(playerIdx);
            }
          }
        } else if (warPhase === 'roll') {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            handleWarStartRolling();
          }
        } else if (warPhase === 'rolling' && !warIsRolling) {
          if (e.code === 'Space') {
            e.preventDefault();
            handleWarDoRoll();
          }
        } else if (warPhase === 'result') {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            handleWarComplete();
          }
        }
        return;
      }

      // --- General Game Actions (No Modals) ---
      
      // Space to Roll or Finish Turn (only if no war modal)
      if (e.code === 'Space' && !showWarModal) {
        e.preventDefault();
        if (turnFinished) {
          handleEndTurn();
        } else if (!isRolling && !isProcessingTurn && !skippedTurns[currentPlayer]) {
          rollDice();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showBuyModal, showParkingModal, isRolling, isProcessingTurn, skippedTurns, currentPlayer, buyingProperty, 
    showWarModal, warPhase, warParticipants, warIsRolling, warMode, playerMoney,
    showRobBankModal, robStatus, showChanceModal, showChestModal, showPropertyModal, currentChanceCard, currentChestCard
  ]);

  // Auction Bid Auto-Update
  useEffect(() => {
    if (auctionState && auctionState.status === 'active') {
        const minBid = (auctionState.currentBid || 0) + 10;
        setAuctionBidAmount(minBid);
    }
  }, [auctionState, auctionState?.currentBid, auctionState?.status]);

  // Trigger floating price animations when auction completes
  useEffect(() => {
    if (auctionState && auctionState.status === 'complete' && auctionState.winner !== null) {
      const finalAmount = auctionState.finalAmount || auctionState.currentBid;
      const winnerPos = playerPositions[auctionState.winner];
      const originalOwner = auctionState.originalOwner;
      
      // Show -amount on winner (they paid)
      setFloatingPrices(prev => [...prev, {
        tileIndex: winnerPos,
        price: finalAmount,
        isPositive: false,
        key: getUniqueKey()
      }]);
      
      // If different from original owner, show +amount on owner (they received)
      if (originalOwner !== undefined && originalOwner !== auctionState.winner) {
        const ownerPos = playerPositions[originalOwner];
        setTimeout(() => {
          setFloatingPrices(prev => [...prev, {
            tileIndex: ownerPos,
            price: finalAmount,
            isPositive: true,
            key: getUniqueKey()
          }]);
        }, 300);
      }
    }
  }, [auctionState?.status, auctionState?.winner]);

  // Helper to handle turn end (switch or stay for doubles)
  const endTurn = (movingPlayer, isDoubles) => {
    if (isDoubles) {
      setHistory(historyPrev => [
        `🎲 ${gamePlayers[movingPlayer].name} rolled doubles! Extra turn!`,
        ...historyPrev.slice(0, 9)
      ]);
      // Unlock turn for next roll
      setIsProcessingTurn(false);
    } else {
      // Manual Turn End: Show "Done" button
      setTurnFinished(true);
      setIsProcessingTurn(false);
    }
  };

  // Handle Manual Turn End (Done Button Click)
  const handleEndTurn = () => {
    // Online Mode: Send end_turn action to server
    if (networkMode === 'online') {
      setBuyingProperty(null);
      setShowBuyModal(false);
      // If we are currently skipped, we need to clear that state so we don't skip next time
      // BUT only if we didn't actually play a turn (turnFinished means we played).
      if (skippedTurns[currentPlayer] && !turnFinished) {
         const updatedSkipped = { ...skippedTurns, [currentPlayer]: false };
         setSkippedTurns(updatedSkipped);
         sendGameAction('update_state', { skippedTurns: updatedSkipped });
      }
      sendGameAction('end_turn');
      return;
    }
    
    // Offline Mode: Handle locally
    let nextIdx = (currentPlayer + 1) % gamePlayers.length;
    let skippedPlayers = [];
    let loopCount = 0;
    
    // Skip both skipped turns AND bankrupt players
    while ((skippedTurns[nextIdx] || bankruptPlayers[nextIdx]) && loopCount < gamePlayers.length) {
       if (skippedTurns[nextIdx]) skippedPlayers.push(nextIdx);
       nextIdx = (nextIdx + 1) % gamePlayers.length;
       loopCount++;
       if (nextIdx === currentPlayer) break; 
    }
    
    if (skippedPlayers.length > 0) {
      setSkippedTurns(prev => {
        const updated = { ...prev };
        skippedPlayers.forEach(idx => updated[idx] = false);
        return updated;
      });
      setHistory(prev => [
        `🚫 Skipped: ${skippedPlayers.map(idx => gamePlayers[idx].name).join(', ')}`, 
        ...prev.slice(0, 9)
      ]);
    }
    
    setCurrentPlayer(nextIdx);
    setTurnFinished(false);
    setBuyingProperty(null);
  };

  // Smart Chance Card Selection
  const getSmartChanceCard = (playerIndex) => {
    // Filter cards based on context
    const validCards = CHANCE_CARDS.filter(card => {
      // 1. Repairs: Only if player has buildings
      if (card.action === 'REPAIRS') {
        let hasBuildings = false;
        Object.entries(propertyOwnership).forEach(([tileIdx, ownerIdx]) => {
          if (parseInt(ownerIdx) === playerIndex) {
            if ((propertyLevels[tileIdx] || 0) > 0) hasBuildings = true;
          }
        });
        return hasBuildings;
      }
      return true;
    });
    
    let selectedCard = { ...validCards[Math.floor(Math.random() * validCards.length)] };
    
    // Pre-calculate random values for movement cards and update text
    if (selectedCard.action === 'MOVE_FORWARD_RANDOM') {
      const steps = Math.floor(Math.random() * 10) + 1;
      selectedCard.steps = steps;
      selectedCard.text = `Take a ride! Move forward ${steps} spaces.`;
    } else if (selectedCard.action === 'MOVE_BACKWARD_RANDOM') {
      const steps = Math.floor(Math.random() * 10) + 1;
      selectedCard.steps = -steps;
      selectedCard.text = `Go back ${steps} spaces.`;
    } else if (selectedCard.action === 'MOVE_TO_RANDOM') {
      const currentPos = playerPositions[playerIndex];
      let randomTarget;
      do {
        randomTarget = Math.floor(Math.random() * 36);
      } while (randomTarget === currentPos);
      selectedCard.targetIndex = randomTarget;
      selectedCard.text = `Teleport! Advance to ${getTileName(randomTarget)}.`;
    }
    
    return selectedCard;
  };

  // Smart Chest Card Selection
  const getSmartChestCard = (playerIndex) => {
    const validCards = CHEST_CARDS.filter(card => {
      // 1. Debt Forgiveness: Only if player has negative money (debt)
      if (card.action === 'CLEAR_DEBT' || card.action === 'EXTEND_DEBT') {
        return playerMoney[playerIndex] < 0;
      }
      return true;
    });
    
    // If no valid cards (e.g. no debt), fallback to non-debt cards
    if (validCards.length === 0) {
      return CHEST_CARDS.filter(c => c.action !== 'CLEAR_DEBT' && c.action !== 'EXTEND_DEBT')[0];
    }
    
    return validCards[Math.floor(Math.random() * validCards.length)];
  };



  // --- JAIL ACTION HANDLERS ---
  const handleJailPay = () => {
    const turnsLeft = jailStatus[currentPlayer];
    let bailAmount = 1000;
    if (turnsLeft === 2) bailAmount = 500;
    if (turnsLeft === 1) bailAmount = 200;
    
    if (playerMoney[currentPlayer] < bailAmount) {
       showToast("Not enough money to pay bail!");
       return;
    }
    
    setPlayerMoney(prev => {
        const newMoney = [...prev];
        newMoney[currentPlayer] -= bailAmount;
        return newMoney;
    });
    
    setJailStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[currentPlayer];
        return newStatus;
    });
    
    setShowJailActionModal(false);
    
    setHistory(prev => [`💰 ${gamePlayers[currentPlayer].name} paid $${bailAmount} bail and is free!`, ...prev.slice(0, 9)]);
    
    if (networkMode === 'online') {
        const newStatus = { ...jailStatus };
        delete newStatus[currentPlayer];
        const currentMoney = playerMoney[currentPlayer];
        const updatedMoneyArray = [...playerMoney];
        updatedMoneyArray[currentPlayer] = currentMoney - bailAmount;

        sendGameAction('update_state', { 
            playerMoney: updatedMoneyArray,
            jailStatus: newStatus
        });
    }
  };



  const handleJailSkip = () => {
      const turnsLeft = jailStatus[currentPlayer];
      const newTurns = turnsLeft - 1;
      let newStatusMap;
      
      if (newTurns <= 0) {
          setJailStatus(prev => {
              const s = { ...prev };
              delete s[currentPlayer];
              return s;
          });
          newStatusMap = { ...jailStatus };
          delete newStatusMap[currentPlayer];
           setHistory(prev => [`${gamePlayers[currentPlayer].name} served their jail time and will be free next turn!`, ...prev.slice(0, 9)]);
      } else {
          setJailStatus(prev => ({ ...prev, [currentPlayer]: newTurns }));
          newStatusMap = { ...jailStatus, [currentPlayer]: newTurns };
           setHistory(prev => [`${gamePlayers[currentPlayer].name} stays in jail (${newTurns} turns left).`, ...prev.slice(0, 9)]);
      }
      
      setShowJailActionModal(false);
      handleEndTurn();
      
      if (networkMode === 'online') {
          sendGameAction('update_state', { jailStatus: newStatusMap });
      }
  };

  // Helper to process tile arrival (Rent, Buy, Special Tiles)
  // ownershipOverride is used in online mode to pass fresh server ownership data
  // isOnlineOverride allows applyGameState to force online behavior even if closure state is stale
  const handleTileArrival = (playerIndex, tileIndex, isDoubles = false, ownershipOverride = null, diceValuesOverride = null, isOnlineOverride = null) => {
    console.log(`[handleTileArrival] Player ${playerIndex} arrived at tile ${tileIndex}. OnlineOverride: ${isOnlineOverride}`);
    // Use override if provided (online mode), otherwise use React state
    const effectiveOwnership = ownershipOverride || propertyOwnership;
    const effectiveDiceValues = diceValuesOverride || diceValues;
    const effectiveIsOnline = isOnlineOverride !== null ? isOnlineOverride : (networkMode === 'online');
    
    // Use ref for myPlayerIndex to avoid stale closure
    const effectiveMyPlayerIndex = gameStateRef.current.myPlayerIndex;
    console.log(`[handleTileArrival] effectiveIsOnline=${effectiveIsOnline}, playerIndex=${playerIndex}, effectiveMyPlayerIndex=${effectiveMyPlayerIndex}`);
    
    // Clear any previous buying state when arriving on any tile
    setBuyingProperty(null);
    setShowBuyModal(false);

    // 1. Check Special Tiles
    // Parking (Index 9 - bottom-left corner)
    // Parking (Index 10 - bottom-left corner)
    if (tileIndex === 10) {
      if (effectiveIsOnline) {
         if (playerIndex === effectiveMyPlayerIndex) {
            console.log('[handleTileArrival] Sending modal_open for PARKING');
            sendGameAction('modal_open', { type: 'PARKING' });
         }
         return; 
      }

      setShowParkingModal(true);
      return; 
    }

    // Rob Bank (Index 18) - Mini Game
    if (tileIndex === 18) {
      setRobStatus('idle');
      setRobProgress(0);
      setRobResult({ amount: 0, message: '' });
      setShowRobBankModal(true);
      return;
    }

    // Forced Auction (Index 31 - right column)
    if (tileIndex === 31) {
      // Check if any owned properties have buildings
      const allOwnedProperties = Object.keys(propertyOwnership).map(Number);
      const propertiesWithBuildings = allOwnedProperties.filter(idx => (propertyLevels[idx] || 0) > 0);
      
      if (propertiesWithBuildings.length === 0) {
        showToast("No properties with buildings to auction!");
        endTurn(playerIndex, false);
        return;
      }
      
      setShowAuctionLandingModal(true);
      return; 
    }




    // Go To Jail (Index 28)
    if (tileIndex === 28) {
      if (effectiveIsOnline) {
        // Server handles jail status and history.
        // We just show the local modal for visual feedback.
        // We don't even need to calculate duration here, but we can for UI.
        setArrestDuration(3); 
        setShowArrestModal(true);
        return;
      }

      // 1. Calculate random duration (2 or 3 turns)
      const duration = Math.floor(Math.random() * 2) + 2; 
      
      // 2. Set Jail Status
      const newJailStatus = { ...jailStatus, [playerIndex]: duration };
      setJailStatus(newJailStatus);
      
      // 4. Show Modal (Client Only)
      setArrestDuration(duration);
      setShowArrestModal(true);
      
      setHistory(prev => [`👮 ${gamePlayers[playerIndex].name} is arrested for ${duration} turns!`, ...prev.slice(0, 9)]);
      return;
    }

    // The Audit (Index 7) - Tax based on dice rolled to reach tile
    if (tileIndex === 7) {
      // Use the dice that were rolled to get here
      const die1 = effectiveDiceValues[0];
      const die2 = effectiveDiceValues[1];
      const total = die1 + die2;
      const tax = total * 300; // ×300 multiplier
      
      // Check Audit Immunity (Chest Card)
      if (activeEffects[playerIndex]?.audit_immunity) {
         setHistory(prev => [`🛡️ ${gamePlayers[playerIndex].name} used Audit Immunity! No tax paid.`, ...prev.slice(0, 9)]);
         setActiveEffects(prev => ({ ...prev, [playerIndex]: { ...prev[playerIndex], audit_immunity: false } }));
         endTurn(playerIndex, false);
         return;
      }

      if (effectiveIsOnline) {
        // Server handles the tax and broadcast.
        // Client just shows the modal if they want, but server processes it.
        // For now, we'll just let the server's state_update and floating_price handle it.
        return;
      }
      
      setAuditDiceValues([die1, die2]);
      setAuditAmount(tax);
      setAuditStatus('result');
      setShowAuditModal(true);
      return;
    }

    // Property War (Index 26) - Initiate War Event
    if (tileIndex === 26) {
      console.log('[handleTileArrival] Landed on Property War (26). effectiveIsOnline:', effectiveIsOnline);
      // Check if any properties are unowned using EFFECTIVE ownership
      const allPropertyTiles = Object.keys(RENT_DATA).map(Number);
      const unownedProperties = allPropertyTiles.filter(t => effectiveOwnership[t] === undefined);
      
      const mode = unownedProperties.length > 0 ? 'A' : 'B';
      
      if (effectiveIsOnline) {
        console.log('[Property War] Sending war_init action, mode:', mode);
        sendGameAction('war_init', { mode });
        return;
      }
      
      setWarMode(mode);
      setWarPhase('join');
      setWarParticipants([]);
      setWarRolls({});
      setWarProperty(null);
      setBattlePot(0);
      setShowWarModal(true);
      
      setHistory(prev => [`⚔️ ${gamePlayers[playerIndex].name} triggered PROPERTY WAR!`, ...prev.slice(0, 9)]);
      return;
    }
      


    // Chance Tiles (23 = top row)
    if (tileIndex === 23) {
      if (effectiveIsOnline) {
         if (playerIndex === effectiveMyPlayerIndex) {
            console.log('[handleTileArrival] Sending modal_open for CHANCE');
            const randomCard = getSmartChanceCard(playerIndex);
            sendGameAction('modal_open', { type: 'CHANCE', payload: { card: randomCard } });
         }
         return; 
      }
      
      const randomCard = getSmartChanceCard(playerIndex);
      setCurrentChanceCard(randomCard);
      setShowChanceModal(true);
      return;
    }
    
    // Community Chest (Index 33 - in rightColumn)
    if (tileIndex === 33) {
      if (effectiveIsOnline) {
         if (playerIndex === effectiveMyPlayerIndex) {
            console.log('[handleTileArrival] Sending modal_open for CHEST');
            const randomCard = getSmartChestCard(playerIndex);
            sendGameAction('modal_open', { type: 'CHEST', payload: { card: randomCard } });
         }
         return;
      }

      const randomCard = getSmartChestCard(playerIndex);
      setCurrentChestCard(randomCard);
      setShowChestModal(true);
      return;
    }
    
    // Cash Stack (Index 3) - Player wins the jackpot!
    if (tileIndex === 3) {
      setBuyingProperty(null);
      setShowBuyModal(false);
      // Online Mode: Send to server
      if (effectiveIsOnline) {
        console.log('[Cash Stack] Sending cash_stack_claim to server');
        sendGameAction('cash_stack_claim');
        // Server will broadcast the animation to all players (including us)
        setTurnFinished(true);
        setIsProcessingTurn(false);
        return;
      }

      // Offline Mode / Local Fallback
      const pot = cashStack;
      if (pot > 0) {
        // Award entire pot to player
        const updatedMoney = [...playerMoney];
        updatedMoney[playerIndex] += pot;
        setPlayerMoney(updatedMoney);
        setCashStack(0); // Reset pot
        
        // Floating animation
        const animKey = getUniqueKey();
        setFloatingPrices(prev => [...prev, { price: pot, tileIndex, key: animKey, isPositive: true }]);
        setTimeout(() => {
          setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey));
        }, 3000);
        
        // Cash register sound
        playBuySound();
        
        setHistory(prev => [`💰 ${gamePlayers[playerIndex].name} won the Cash Stack: $${pot}!`, ...prev.slice(0, 9)]);
      } else {
        setHistory(prev => [`${gamePlayers[playerIndex].name} landed on Cash Stack, but it's empty!`, ...prev.slice(0, 9)]);
      }
      endTurn(playerIndex, isDoubles);
      return;
    }
    
    // 2. Check Property
    const property = getPropertyByTileIndex(tileIndex);
    const ownerIndex = effectiveOwnership[tileIndex];
    
    if (property && ownerIndex === undefined) {
      // Unowned property - show buying modal only if player can afford it
      const rentData = RENT_DATA[tileIndex];
      const rent = rentData ? rentData.rentLevels[0] : (property.rent || Math.floor(property.price * 0.1));
      
      setBuyingProperty({ ...property, rent, buyerIndex: playerIndex, isDoubles });
      
      // Only auto-show modal if player can afford the property (Use Ref for latest money)
      const currentMoney = gameStateRef.current?.playerMoney || playerMoney;
      if (currentMoney[playerIndex] >= property.price) {
        setShowBuyModal(true);
      } else {
        showToast(`Can't afford ${property.name} ($${property.price})`);
      }
    } else if (property && ownerIndex !== undefined && Number(ownerIndex) !== playerIndex) {
      // Owned by another player - pay rent!
      if (effectiveIsOnline) {
        // SERVER AUTHORITY: We do nothing here.
        // The server received 'landed' and already processed rent.
        // It will broadcast state_update and floating_price.
        // We just end the turn visually if needed, but server usually handles turn flow too.
        console.log('[handleTileArrival] Online: Rent handled by server.');
      } else {
        // Offline mode: Full local logic
        // CHECK JAIL STATUS: If owner is in jail, skip rent
        if (jailStatus[ownerIndex] > 0) {
            console.log(`[Rent] Owner ${ownerIndex} is in Jail. Rent Skipped.`);
            setHistory(prev => [`${gamePlayers[playerIndex].name} pays NO rent - Owner is in Jail!`, ...prev.slice(0, 9)]);
            // End turn normally
            endTurn(playerIndex, isDoubles);
            return;
        }

        // FIXED: Pass effectiveOwnership via override to avoid stale closure state in online mode
        const rent = calculateRent(tileIndex, effectiveOwnership);
        const ownerPosition = playerPositions[ownerIndex];
        
        // Deduct rent from current player
        setPlayerMoney(prev => {
          const updated = [...prev];
          updated[playerIndex] -= rent;
          updated[ownerIndex] += rent;
          return updated;
        });

        // Local floating price animations (Offline only)
        const animKey1 = getUniqueKey();
        const animKey2 = getUniqueKey();
        setFloatingPrices(prev => [
          ...prev, 
          { price: rent, tileIndex: tileIndex, key: animKey1, isPositive: false },
          { price: rent, tileIndex: ownerPosition, key: animKey2, isPositive: true }
        ]);
        setTimeout(() => {
          setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey1 && fp.key !== animKey2));
        }, 3000);

        setHistory(historyPrev => [
          `${gamePlayers[playerIndex].name} paid $${rent} rent to ${gamePlayers[ownerIndex].name}`,
          ...historyPrev.slice(0, 9)
        ]);
      }
      playPayRentSound(); // Play sad rent payment sound
      
      // Handle turn end
      endTurn(playerIndex, isDoubles);
    } else if (property && ownerIndex !== undefined && Number(ownerIndex) === playerIndex) {
      // Player owns this property
      
      // Check for Train Travel
      const isTrain = TRAIN_TILES.includes(tileIndex);
      if (isTrain) {
        // Count owned trains
        const ownedTrains = TRAIN_TILES.filter(t => effectiveOwnership[t] === playerIndex).length;
        if (ownedTrains > 1) {
          setHistory(prev => [`🚅 ${gamePlayers[playerIndex].name} arrived at ${property.name}. Travel available?`, ...prev.slice(0, 9)]);
          // Offer Travel: Set state to show Travel button
          // We reuse buyingProperty with a flag to indicate this is a travel offer, not a buy offer
          setBuyingProperty({ ...property, isTravelOffer: true });
          setTurnFinished(true); // Allow ending turn if they don't want to travel
          setIsProcessingTurn(false); // Unlock buttons
          return;
        }
      }

      setHistory(prev => [`${gamePlayers[playerIndex].name} arrived at their own ${property.name}. Welcome back!`, ...prev.slice(0, 9)]);
      endTurn(playerIndex, isDoubles);
    } else {
      // No action needed (e.g. non-action tile)
      endTurn(playerIndex, isDoubles);
    }
  };



  // Handle Rob Bank Attempt
  const handleRobBankAttempt = () => {
    // Online Mode
    if (networkMode === 'online') {
      sendGameAction('attempt_robbery');
      return;
    }

    setRobStatus('processing');
    setRobProgress(0);
    
    // Use a ref to track if component is mounted/active to prevent stuck state
    // (Simplification: using window timer to ensure it runs even if react updates slow)
    // Actually, simply clearing interval inside is fine, but let's be robust about state updates
    
    // Animate progress bar
    const duration = 2000; // 2 seconds
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      const progress = Math.min((currentStep / steps) * 100, 100);
      setRobProgress(progress);
      
      if (currentStep >= steps) {
        clearInterval(timer);
        
        // Determine result (60% success)
        const isSuccess = Math.random() < 0.6;
        
        // Force state update in next tick to ensure progress render completes
        setTimeout(() => {
            if (isSuccess) {
            // Success: Gain $1000 - $10000
            const amount = Math.floor(Math.random() * 9001) + 1000; // 1000 to 10000
            setRobResult({ amount, message: 'Success!' });
            setRobStatus('success');
            } else {
            // Failure: Go to Jail
            setRobResult({ amount: 0, message: 'Caught!' });
            setRobStatus('caught');
            }
        }, 100);
      }
    }, interval);
  };

  // Handle Rob Bank Complete (Success or Failure)
  const handleRobBankComplete = async () => {
    const playerIndex = currentPlayer;
    
    if (networkMode === 'online') {
      sendGameAction('close_modal');
      endTurn(playerIndex, false);
      return;
    }
    
    if (robStatus === 'success') {
      // Add money
      setPlayerMoney(prev => {
        const updated = [...prev];
        updated[playerIndex] += robResult.amount;
        return updated;
      });
      
      const animKey = getUniqueKey();
      setFloatingPrices(prev => [
        ...prev, 
        { price: robResult.amount, tileIndex: 18, key: animKey, isPositive: true }
      ]);
      setTimeout(() => {
        setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey));
      }, 3000);
      
      playBuySound();
      setHistory(prev => [`💰 ${gamePlayers[playerIndex].name} robbed the bank for $${robResult.amount}!`, ...prev.slice(0, 9)]);
      closeAllModals(() => {
        endTurn(playerIndex, false); 
      });
      
    } else if (robStatus === 'caught') {
      // Player was caught - move to jail tile (28) and end turn
      const jailTileIndex = 28;
      
      setPlayerPositions(prev => {
        const newPos = [...prev];
        newPos[playerIndex] = jailTileIndex;
        return newPos;
      });
      lastKnownPositionsRef.current[playerIndex] = jailTileIndex;
      
      setHistory(prev => [`👮 ${gamePlayers[playerIndex].name} was caught and sent to jail!`, ...prev.slice(0, 9)]);
      closeAllModals(() => {
        endTurn(playerIndex, false);
      });
    } else {
      closeAllModals(() => endTurn(playerIndex, false));
    }
  };

  // Handle Audit Roll (Dice Gamble Mini-Game)
  const handleAuditRoll = async () => {
    if (auditStatus !== 'idle') return;
    
    setAuditStatus('rolling');
    playDiceRollSound();
    
    // Animate dice for 1 second
    const rollDuration = 1000;
    const intervalTime = 80;
    
    const rollInterval = setInterval(() => {
      setAuditDiceValues([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
    }, intervalTime);
    
    await wait(rollDuration);
    clearInterval(rollInterval);
    
    // Final dice values
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;
    const tax = total * 100;
    
    setAuditDiceValues([die1, die2]);
    setAuditAmount(tax);
    setAuditStatus('result');
  };
  
  // Handle Audit Complete (Pay Tax and End Turn)
  const handleAuditComplete = () => {
    const playerIndex = currentPlayer;
    const tax = auditAmount;
    
    if (networkMode === 'online') {
      sendGameAction('close_modal');
      closeAllModals(() => {
        endTurn(playerIndex, false);
      });
      return;
    }
    
    // Deduct tax from player (Offline)
    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[playerIndex] -= tax;
      return updated;
    });
    
    // Add to Cash Stack
    setCashStack(prev => {
      const newTotal = prev + tax;
      return newTotal;
    });
    
    showCashStackFloatingPrice(tax);
    
    // Floating price animation
    const animKey = getUniqueKey();
    setFloatingPrices(prev => [...prev, { price: tax, tileIndex: 7, key: animKey, isPositive: false }]);
    setTimeout(() => {
      setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey));
    }, 3000);
    
    // Cash register sound
    playBuySound();
    
    setHistory(prev => [`🧾 ${gamePlayers[currentPlayer].name} was audited! Paid $${tax} in taxes.`, ...prev.slice(0, 9)]);
    
    closeAllModals(() => {
      endTurn(playerIndex, false);
    });
  };



  // Handle Chance Card Action
  const handleChanceCardAction = (card) => {
    if (!card) return;
    
    // Close modal first, then execute action with animation
    if (networkMode === 'online') {
       sendGameAction('close_modal');
    }
    
    closeAllModals(async () => {
      const playerIndex = currentPlayer;
      const currentPos = playerPositions[playerIndex];
      
      switch (card.action) {
        case 'MONEY_ADD':
          setPlayerMoney(prev => {
            const updated = [...prev];
            console.log(`[DEBUG] Adding $${card.amount} to Player ${playerIndex}. Old: ${updated[playerIndex]}`);
            updated[playerIndex] += card.amount;
            console.log(`[DEBUG] New: ${updated[playerIndex]}`);
            
            // Online Sync
            if (networkMode === 'online') {
              sendGameAction('update_state', { playerMoney: updated });
            }
            
            return updated;
          });
          // Floating Price sync
          if (networkMode === 'online') {
            sendGameAction('floating_price', { 
               tileIndex: currentPos, 
               price: card.amount, 
               isPositive: true 
            });
          } else {
            const animKeyAdd = getUniqueKey();
            setFloatingPrices(prev => [
              ...prev, 
              { price: card.amount, tileIndex: currentPos, key: animKeyAdd, isPositive: true }
            ]);
            setTimeout(() => {
              setFloatingPrices(prev => prev.filter(fp => fp.key !== animKeyAdd));
            }, 3000);
          }
          setHistory(prev => [`${gamePlayers[playerIndex].name} gained $${card.amount}: ${card.text}`, ...prev.slice(0, 9)]);
          break;
          
        case 'MONEY_SUBTRACT':
          setPlayerMoney(prev => {
            const updated = [...prev];
            updated[playerIndex] -= card.amount;
            
            // Online Sync
            if (networkMode === 'online') {
              sendGameAction('update_state', { playerMoney: updated });
            }
            
            return updated;
          });
          // Floating Price sync
          if (networkMode === 'online') {
            sendGameAction('floating_price', { 
               tileIndex: currentPos, 
               price: card.amount, 
               isPositive: false 
            });
          } else {
            const animKeySub = getUniqueKey();
            setFloatingPrices(prev => [
              ...prev, 
              { price: card.amount, tileIndex: currentPos, key: animKeySub, isPositive: false }
            ]);
            setTimeout(() => {
              setFloatingPrices(prev => prev.filter(fp => fp.key !== animKeySub));
            }, 3000);
          }
          setHistory(prev => [`${gamePlayers[playerIndex].name} lost $${card.amount}: ${card.text}`, ...prev.slice(0, 9)]);
          break;
          
        case 'MOVE_TO':
          // Calculate steps
          const targetPos = card.targetIndex;
          let steps = (targetPos - currentPos + 36) % 36;
          if (steps === 0) steps = 36;
          if (targetPos === currentPos) steps = 0;
          
          if (networkMode === 'online') {
            sendGameAction('chance_move', {
              playerIndex,
              oldPos: currentPos,
              targetPos,
              steps,
              delay: 180,
              cardText: card.text,
              isJail: false
            });
            return;
          }
          
          if (steps > 0) {
            await movePlayerToken(playerIndex, steps, 180);
          }
          
          // Passing Start reward ($1000)
          if (currentPos + steps >= 36) {
             setPlayerMoney(prev => {
               const updated = [...prev];
               updated[playerIndex] += 1000;
               return updated;
             });

             setHistory(prev => [`${gamePlayers[playerIndex].name} collected $1000 for passing Start`, ...prev.slice(0, 9)]);
             const animKeyStart = getUniqueKey();
             setFloatingPrices(prev => [
                ...prev, 
                { price: 1000, tileIndex: 0, key: animKeyStart, isPositive: true }
             ]);
             setTimeout(() => {
               setFloatingPrices(prev => prev.filter(fp => fp.key !== animKeyStart));
             }, 3000);
          }
          
          setHistory(prev => [`${gamePlayers[playerIndex].name} moved to ${getTileName(targetPos)}`, ...prev.slice(0, 9)]);
          handleTileArrival(playerIndex, targetPos, false);
          break;
          
        case 'MOVE_STEPS':
          const newPosSteps2 = (currentPos + card.steps + 36) % 36;
          if (networkMode === 'online') {
            sendGameAction('chance_move', {
              playerIndex,
              oldPos: currentPos,
              targetPos: newPosSteps2,
              steps: card.steps,
              delay: 180,
              cardText: card.text,
              isJail: false
            });
            return;
          }
          await movePlayerToken(playerIndex, card.steps, 180);
          setHistory(prev => [`${gamePlayers[playerIndex].name} moved ${card.steps} steps`, ...prev.slice(0, 9)]);
          handleTileArrival(playerIndex, newPosSteps2, false);
          return;

        case 'MOVE_FORWARD_RANDOM':
          const newPosFwd = (currentPos + card.steps + 36) % 36;
          if (networkMode === 'online') {
            sendGameAction('chance_move', {
              playerIndex,
              oldPos: currentPos,
              targetPos: newPosFwd,
              steps: card.steps,
              delay: 180,
              cardText: card.text,
              isJail: false
            });
            return;
          }
          await movePlayerToken(playerIndex, card.steps, 180);
          setHistory(prev => [`${gamePlayers[playerIndex].name} moved forward ${card.steps} spaces`, ...prev.slice(0, 9)]);
          handleTileArrival(playerIndex, newPosFwd, false);
          return;

        case 'MOVE_BACKWARD_RANDOM':
          const newPosBack = (currentPos + card.steps + 36) % 36;
          if (networkMode === 'online') {
            sendGameAction('chance_move', {
              playerIndex,
              oldPos: currentPos,
              targetPos: newPosBack,
              steps: card.steps,
              delay: 180,
              cardText: card.text,
              isJail: false
            });
            return;
          }
          await movePlayerToken(playerIndex, card.steps, 180);
          setHistory(prev => [`${gamePlayers[playerIndex].name} moved back ${Math.abs(card.steps)} spaces`, ...prev.slice(0, 9)]);
          handleTileArrival(playerIndex, newPosBack, false);
          return;

        case 'MOVE_TO_RANDOM':
          const stepsToRandom = (card.targetIndex - currentPos + 36) % 36;
          if (networkMode === 'online') {
            sendGameAction('chance_move', {
              playerIndex,
              oldPos: currentPos,
              targetPos: card.targetIndex,
              steps: stepsToRandom,
              delay: 180,
              cardText: card.text,
              isJail: false
            });
            return;
          }
          await movePlayerToken(playerIndex, stepsToRandom, 180);
          setHistory(prev => [`${gamePlayers[playerIndex].name} teleported to ${getTileName(card.targetIndex)}`, ...prev.slice(0, 9)]);
          handleTileArrival(playerIndex, card.targetIndex, false);
          return;
          
        case 'GO_TO_JAIL':
          const jailIndex = 28;
          let stepsToJail = (jailIndex - currentPos + 36) % 36;
          if (stepsToJail === 0) stepsToJail = 0;
          if (networkMode === 'online') {
            sendGameAction('chance_move', {
              playerIndex,
              oldPos: currentPos,
              targetPos: jailIndex,
              steps: stepsToJail,
              delay: 150,
              cardText: card.text,
              isJail: true
            });
            return;
          }
          if (stepsToJail > 0) {
            await movePlayerToken(playerIndex, stepsToJail, 150);
          }
          setJailStatus(prev => ({ ...prev, [playerIndex]: 3 }));
          setHistory(prev => [`${gamePlayers[playerIndex].name} went to Jail!`, ...prev.slice(0, 9)]);
          setTurnFinished(true);
          break;
          
        case 'REPAIRS':
          // Calculate cost
          let totalCost = 0;
          Object.entries(propertyOwnership).forEach(([tileIdx, ownerIdx]) => {
            if (parseInt(ownerIdx) === playerIndex) {
              const level = propertyLevels[tileIdx] || 0;
              if (level === 5) {
                totalCost += card.hotelCost;
              } else {
                totalCost += level * card.houseCost;
              }
            }
          });
          
          if (totalCost > 0) {
            setPlayerMoney(prev => {
              const updated = [...prev];
              updated[playerIndex] -= totalCost;
              
              // Online Sync
              if (networkMode === 'online') {
                sendGameAction('update_state', { playerMoney: updated });
              }
              
              return updated;
            });
            const animKeyRepairs = getUniqueKey();
            setFloatingPrices(prev => [
              ...prev, 
              { price: totalCost, tileIndex: currentPos, key: animKeyRepairs, isPositive: false }
            ]);
            setTimeout(() => {
              setFloatingPrices(prev => prev.filter(fp => fp.key !== animKeyRepairs));
            }, 3000);
            setHistory(prev => [`${gamePlayers[playerIndex].name} paid $${totalCost} for repairs`, ...prev.slice(0, 9)]);
          } else {
             setHistory(prev => [`${gamePlayers[playerIndex].name} has no buildings to repair`, ...prev.slice(0, 9)]);
          }
          break;
          
        case 'PAY_ALL_PLAYERS':
          const amount = card.amount;
          const numOtherPlayers = gamePlayers.length - 1;
          const totalDeduction = amount * numOtherPlayers;
          
          setPlayerMoney(prev => {
            const updated = [...prev];
            updated[playerIndex] -= totalDeduction;
            gamePlayers.forEach((_, idx) => {
              if (idx !== playerIndex) {
                updated[idx] += amount;
              }
            });
            
            // Online Sync
            if (networkMode === 'online') {
              sendGameAction('update_state', { playerMoney: updated });
            }
            
            return updated;
          });
          const animKeyPayAll = getUniqueKey();
          setFloatingPrices(prev => [
            ...prev, 
            { price: totalDeduction, tileIndex: currentPos, key: animKeyPayAll, isPositive: false }
          ]);
          setTimeout(() => {
            setFloatingPrices(prev => prev.filter(fp => fp.key !== animKeyPayAll));
          }, 3000);
          setHistory(prev => [`${gamePlayers[playerIndex].name} paid $${amount} to each player`, ...prev.slice(0, 9)]);
          break;
          


        default:
          break;
      }
      
      // Use endTurn to handle skipping logic
      endTurn(currentPlayer, false); // Assume no doubles for chance movement end
    });
  };

  // Handle Chest Card Action
  const handleChestCardAction = (card) => {
    if (!card) return;
    
    // Close modal first, then execute action with animation
    if (networkMode === 'online') {
       sendGameAction('close_modal');
    }

    closeAllModals(async () => {
      const playerIndex = currentPlayer;
      const currentPos = playerPositions[playerIndex];
      
      switch (card.action) {
        case 'MONEY_ADD':
            setPlayerMoney(prev => {
              const updated = [...prev];
              updated[playerIndex] += card.amount;
              if (networkMode === 'online') sendGameAction('update_state', { playerMoney: updated });
              return updated;
            });
            // Floating Price Sync
            if (networkMode === 'online') {
              sendGameAction('floating_price', { 
                 tileIndex: currentPos, 
                 price: card.amount, 
                 isPositive: true 
              });
            } else {
              const animKeyAdd = getUniqueKey();
              setFloatingPrices(prev => [
                ...prev, 
                { price: card.amount, tileIndex: currentPos, key: animKeyAdd, isPositive: true }
              ]);
              setTimeout(() => {
                setFloatingPrices(prev => prev.filter(fp => fp.key !== animKeyAdd));
              }, 3000);
              
              // Cash register sound
              playBuySound();
            }
            setHistory(prev => [`${gamePlayers[playerIndex].name} received $${card.amount}: ${card.text}`, ...prev.slice(0, 9)]);
            break;

        case 'ADD_INVENTORY':
          setPlayerInventory(prev => ({
            ...prev,
            [playerIndex]: {
              ...prev[playerIndex],
              [card.type]: (prev[playerIndex]?.[card.type] || 0) + 1
            }
          }));
          setHistory(prev => [`${gamePlayers[playerIndex].name} got ${card.text}`, ...prev.slice(0, 9)]);
          break;
          
        case 'ADD_EFFECT':
          setActiveEffects(prev => ({
            ...prev,
            [playerIndex]: {
              ...prev[playerIndex],
              [card.type]: true
            }
          }));
          setHistory(prev => [`${gamePlayers[playerIndex].name} activated: ${card.text}`, ...prev.slice(0, 9)]);
          break;
          
        case 'CLEAR_DEBT':
          setPlayerMoney(prev => {
            const updated = [...prev];
            if (updated[playerIndex] < 0) {
              updated[playerIndex] = 0;
              setHistory(prev => [`${gamePlayers[playerIndex].name}'s debt was cleared!`, ...prev.slice(0, 9)]);
            } else {
               setHistory(prev => [`${gamePlayers[playerIndex].name} has no debt to clear`, ...prev.slice(0, 9)]);
            }
            // Online Sync
            if (networkMode === 'online') sendGameAction('update_state', { playerMoney: updated });
            return updated;
          });
          break;
          
        case 'EXTEND_DEBT':
           setHistory(prev => [`${gamePlayers[playerIndex].name} got Debt Extension (Not Implemented)`, ...prev.slice(0, 9)]);
           break;

        default:
          break;
      }
      
      endTurn(currentPlayer, false);
    });
  };



  // Debug: Test Chance Card
  const handleTestChance = () => {
    const randomCard = getSmartChanceCard(currentPlayer);
    setCurrentChanceCard(randomCard);
    setShowChanceModal(true);
  };
  
  // Debug: Test Chest Card
  const handleTestChest = () => {
    const randomCard = CHEST_CARDS[Math.floor(Math.random() * CHEST_CARDS.length)];
    setCurrentChestCard(randomCard);
    setShowChestModal(true);
  };

  // Handle dice roll
  const rollDice = async (overrideValue = null) => {
    if (isRolling || isProcessingTurn || skippedTurns[currentPlayer]) return;
    
    // Online mode: Only allow if it's my turn, send immediately to server
    if (networkMode === 'online') {
      if (myPlayerIndex !== currentPlayer) return;
      sendGameAction('roll_dice', overrideValue ? { forcedValue: overrideValue } : {});
      return;
    }
    
    setIsRolling(true);
    setIsProcessingTurn(true);
    playDiceRollSound();

    // Run dice animation locally (offline only)
    const rollDuration = 1000;
    const intervalTime = 80;
    
    const rollInterval = setInterval(() => {
      setDiceValues([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
    }, intervalTime);

    await wait(rollDuration);
    clearInterval(rollInterval);

    // Offline Mode: Calculate result locally
    let die1, die2;
    
    if (overrideValue) {
      die1 = Math.floor(overrideValue / 2);
      die2 = overrideValue - die1;
    } else {
      die1 = Math.floor(Math.random() * 6) + 1;
      die2 = Math.floor(Math.random() * 6) + 1;
    }

    const moveAmount = die1 + die2;
    setDiceValues([die1, die2]);
    
    const movingPlayer = currentPlayer;
    await movePlayerToken(movingPlayer, moveAmount);

    const finalPos = (playerPositions[movingPlayer] + moveAmount) % 36;
    const tileName = getTileName(finalPos);
    
    setHistory(historyPrev => [
      `${gamePlayers[movingPlayer].name} rolled ${moveAmount} → ${tileName}`, 
      ...historyPrev.slice(0, 9)
    ]);

    setIsRolling(false);
    
    const isDoubles = die1 === die2;
    handleTileArrival(movingPlayer, finalPos, isDoubles);
  };

  // Action Button Placeholders
  const handleBuild = () => {
    if (!validateTurn()) return;
    
    // Check if player has any monopoly properties
    const monopolyTiles = getMonopolyTiles(currentPlayer);
    
    if (monopolyTiles.length === 0) {
      // No monopolies - show small modal
      setBuildNoMonopolyModal(true);
      return;
    }
    
    // Has monopolies - open build modal and enable build mode
    setBuildTotalCost(0);
    setBuildMode(true);
    setShowBuildModal(true);
  };

  // Handle tap on a tile during build mode
  const handleBuildTileTap = (tileIndex) => {
    if (!buildMode) return;
    
    const monopolyTiles = getMonopolyTiles(currentPlayer);
    if (!monopolyTiles.includes(tileIndex)) {
      // Not a monopoly property - ignore
      return;
    }
    
    const currentLevel = propertyLevels[tileIndex] || 0;
    const upgradeCost = getUpgradeCost(tileIndex);
    
    // Level cycling: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 1
    let newLevel;
    if (currentLevel >= 5) {
      // Reset to level 1 (player tapped at max, they're cycling to fix mistakes)
      newLevel = 1;
      // Refund the difference (levels 2-5 cost back, minus level 1 cost)
      const refund = upgradeCost * 4; // 4 upgrades refunded (2,3,4,5)
      setBuildTotalCost(prev => Math.max(0, prev - refund + upgradeCost));
    } else {
      // Normal upgrade
      newLevel = currentLevel + 1;
      
      // Affordability check
      const newTotalCost = buildTotalCost + upgradeCost;
      if (playerMoney[currentPlayer] < newTotalCost) {
        showToast(`Can't afford! Need $${newTotalCost.toLocaleString()}`);
        return;
      }
      
      setBuildTotalCost(prev => prev + upgradeCost);
    }
    
    // Apply the build (staged locally until confirmed via BUILD button)
    setPropertyLevels(prev => {
      const updated = { ...prev, [tileIndex]: newLevel };
      return updated;
    });
  };

  // Close build mode
  const closeBuildMode = () => {
    // Deduct the total cost from player's money
    if (buildTotalCost > 0) {
      if (networkMode === 'online') {
        // Server handles money deduction and broadcasts floating price to all
        sendGameAction('build_complete', { 
          totalCost: buildTotalCost, 
          propertyLevels: propertyLevels 
        });
      } else {
        // Offline mode: local update with animation
        setPlayerMoney(prev => {
          const updated = [...prev];
          updated[currentPlayer] -= buildTotalCost;
          return updated;
        });
        
        setHistory(prev => [`🏗️ ${gamePlayers[currentPlayer].name} built upgrades for $${buildTotalCost.toLocaleString()}`, ...prev.slice(0, 9)]);
        
        // Show red floating price animation
        const animKey = getUniqueKey();
        const playerPos = playerPositions[currentPlayer];
        setFloatingPrices(prev => [...prev, { price: buildTotalCost, tileIndex: playerPos, key: animKey, isPositive: false }]);
        setTimeout(() => setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey)), 3000);
        
        // Play sound
        if (typeof Audio !== 'undefined') {
          playBuySound();
        }
      }
    }
    
    setBuildMode(false);
    setShowBuildModal(false);
    setBuildTotalCost(0);
  };

  // Sell System State (inline since user removed the separate state vars)
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellMode, setSellMode] = useState(false);
  const [sellTotalRefund, setSellTotalRefund] = useState(0);
  const [sellNoBuildingsModal, setSellNoBuildingsModal] = useState(false);
  const [sellPreviewLevels, setSellPreviewLevels] = useState({});

  const handleSell = () => {
    if (!validateTurn()) return;
    
    // Check if player owns any buildings
    const ownedProperties = Object.keys(propertyOwnership).map(Number).filter(idx => propertyOwnership[idx] === currentPlayer);
    const hasBuildings = ownedProperties.some(idx => (propertyLevels[idx] || 0) > 0);
    
    if (!hasBuildings) {
      setSellNoBuildingsModal(true);
      return;
    }
    
    // Has buildings - enter sell mode
    setSellTotalRefund(0);
    setSellPreviewLevels({ ...propertyLevels });
    setSellMode(true);
    setShowSellModal(true);
  };

  // Handle tap on a tile during sell mode
  const handleSellTileTap = (tileIndex) => {
    if (!sellMode) return;
    
    const owner = propertyOwnership[tileIndex];
    if (owner !== currentPlayer) return;
    
    const currentLevel = sellPreviewLevels[tileIndex] || 0;
    if (currentLevel <= 0) return;

    const upgradeCost = getUpgradeCost(tileIndex);
    const refund = Math.round(upgradeCost * 0.5);
    
    const newLevel = currentLevel - 1;
    
    // Apply building removal ONLY to local preview
    setSellPreviewLevels(prev => ({ ...prev, [tileIndex]: newLevel }));
    setSellTotalRefund(prev => prev + refund);
  };

  const cancelSellMode = () => {
    setSellMode(false);
    setShowSellModal(false);
    setSellTotalRefund(0);
    setSellPreviewLevels({});
  };

  const closeSellMode = () => {
    if (sellTotalRefund > 0) {
      if (networkMode === 'online') {
        // Server handles money addition and broadcasts floating price to all
        sendGameAction('sell_buildings', { 
          propertyLevels: sellPreviewLevels
        });
      } else {
        // Offline mode: local update with animation
        setPlayerMoney(prev => {
          const updated = [...prev];
          updated[currentPlayer] += sellTotalRefund;
          return updated;
        });
        
        setPropertyLevels({ ...sellPreviewLevels });
        
        setHistory(prev => [`💰 ${gamePlayers[currentPlayer].name} sold buildings for $${sellTotalRefund.toLocaleString()}`, ...prev.slice(0, 9)]);
        
        const animKey = getUniqueKey();
        const playerPos = playerPositions[currentPlayer];
        setFloatingPrices(prev => [...prev, { price: sellTotalRefund, tileIndex: playerPos, key: animKey, isPositive: true }]);
        setTimeout(() => setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey)), 3000);
        
        if (typeof Audio !== 'undefined') {
          try { new Audio('/sounds/cash.mp3').play(); } catch(e) {}
        }
      }
    }
    
    setSellMode(false);
    setShowSellModal(false);
    setSellTotalRefund(0);
    setSellPreviewLevels({});
  };

  // Menu System Handlers
  const openMenu = () => {
    setShowMenuModal(true);
  };
  
  const closeMenu = () => {
    setShowMenuModal(false);
  };
  
  const openSettings = () => {
    setShowMenuModal(false);
    setShowSettingsModal(true);
  };
  
  const closeSettings = () => {
    setShowSettingsModal(false);
    if (gameStage === 'playing') {
      setShowMenuModal(true);
    }
  };
  
  const handleExitGame = () => {
    // Send exit action to server (if online)
    if (networkMode === 'online') {
      sendGameAction('exit_game', {});
    }

    // Disconnect socket cleanly
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // Close modals
    setShowMenuModal(false);
    setShowExitConfirm(false);
    
    // FULL GAME STATE RESET - reset game players to default list
    setGamePlayers(players);
    setConnectedPlayers([]);
    setPlayerPositions([0, 0, 0, 0]);
    setPlayerMoney([10000, 10000, 10000, 10000]);
    setPropertyOwnership({});
    setPropertyLevels({});
    setCurrentPlayer(0);
    setMyPlayerIndex(0);
    setDiceValues([1, 1]);
    setIsRolling(false);
    setTurnFinished(false);
    setIsProcessingTurn(false);
    setHistory(['Game started!']);
    setBankruptPlayers({});
    setPlayerLoans({});
    setCashStack(0);
    setBattlePot(0);
    setNetworkMode('offline');
    setRoomCode('');
    
    // Go back to mode select
    setGameStage('mode_select');
  };

  const handleBank = () => {
    if (!validateTurn()) return;
    setBankPhase('entry');
    setLoanSliderValue(1000);
    setShowBankModal(true);
  };

  const handleConfirmLoan = () => {
    const principal = loanSliderValue;
    const repay = Math.round(principal * 1.3);
    const startTile = playerPositions[currentPlayer];
    
    const newLoan = {
      principalAmount: principal,
      repayAmount: repay,
      lapsRemaining: 3,
      loanStartTile: startTile
    };

    setPlayerLoans(prev => {
      const updated = { ...prev, [currentPlayer]: newLoan };
      if (networkMode === 'online') sendGameAction('update_state', { playerLoans: updated });
      return updated;
    });

    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[currentPlayer] += principal;
      if (networkMode === 'online') sendGameAction('update_state', { playerMoney: updated });
      return updated;
    });

    // Floating Green Money
    const loanKey = getUniqueKey();
    setFloatingPrices(prev => [...prev, { price: principal, tileIndex: startTile, key: loanKey, isPositive: true }]);
    setTimeout(() => {
      setFloatingPrices(prev => prev.filter(fp => fp.key !== loanKey));
    }, 3000);

    // Cash register sound
    playBuySound();

    setHistory(prev => [`🏦 ${gamePlayers[currentPlayer].name} took a $${principal.toLocaleString()} loan`, ...prev.slice(0, 9)]);
    setShowBankModal(false);
  };

  const handleRepayLoanManual = () => {
    const loan = playerLoans[currentPlayer];
    if (!loan) return;

    if (playerMoney[currentPlayer] < loan.repayAmount) {
      showToast("Not enough balance to repay the loan.");
      return;
    }

    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[currentPlayer] -= loan.repayAmount;
      if (networkMode === 'online') sendGameAction('update_state', { playerMoney: updated });
      return updated;
    });

    setPlayerLoans(prev => {
      const updated = { ...prev };
      delete updated[currentPlayer];
      if (networkMode === 'online') sendGameAction('update_state', { playerLoans: updated });
      return updated;
    });

    // Floating Red Money
    const repayKey = getUniqueKey();
    setFloatingPrices(prev => [...prev, { price: loan.repayAmount, tileIndex: playerPositions[currentPlayer], key: repayKey, isPositive: false }]);
    setTimeout(() => {
      setFloatingPrices(prev => prev.filter(fp => fp.key !== repayKey));
    }, 3000);

    // Cash register sound
    playBuySound();

    setHistory(prev => [`🏦 ${gamePlayers[currentPlayer].name} repaid their loan early`, ...prev.slice(0, 9)]);
    setShowBankModal(false);
  };

  // Handle player bankruptcy
  const handleBankrupt = () => {
    const playerIdx = currentPlayer;
    
    // Clear all properties owned by this player
    setPropertyOwnership(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(tileIdx => {
        if (updated[tileIdx] === playerIdx) {
          delete updated[tileIdx];
        }
      });
      if (networkMode === 'online') {
        sendGameAction('update_state', { propertyOwnership: updated });
      }
      return updated;
    });
    
    // Clear property levels for their properties
    setPropertyLevels(prev => {
      const updated = { ...prev };
      Object.keys(propertyOwnership).forEach(tileIdx => {
        if (propertyOwnership[tileIdx] === playerIdx) {
          delete updated[tileIdx];
        }
      });
      if (networkMode === 'online') {
        sendGameAction('update_state', { propertyLevels: updated });
      }
      return updated;
    });
    
    // Clear any active loan
    setPlayerLoans(prev => {
      const updated = { ...prev };
      delete updated[playerIdx];
      if (networkMode === 'online') {
        sendGameAction('update_state', { playerLoans: updated });
      }
      return updated;
    });
    
    // Mark player as bankrupt
    setBankruptPlayers(prev => {
      const updated = { ...prev, [playerIdx]: true };
      if (networkMode === 'online') {
        sendGameAction('update_state', { bankruptPlayers: updated });
      }
      return updated;
    });
    
    // Add history entry
    setHistory(prev => [`💀 ${gamePlayers[playerIdx].name} declared BANKRUPTCY!`, ...prev.slice(0, 9)]);
    
    // Close modal and end turn
    setShowBankruptcyModal(false);
    handleEndTurn();
  };

  // Handle buying a property
  const handleBuyProperty = () => {
    // Network Check
    if (networkMode === 'online') {
      if (!buyingProperty) return;
      const { tileIndex, price } = buyingProperty;
      
      // Check for 50% Discount (apply locally first? No, server needs to know)
      // For now, let's just send the basic buy action. 
      // If we want to support discounts, we need to send that in payload.
      // But wait, the server handles logic. 
      // If I have a discount, I should probably tell the server or the server should know.
      // The server doesn't track activeEffects yet. 
      // For now, let's just send the price we see (client authoritative for price?)
      // Or better: send the intent to buy, and let server handle money.
      // But server doesn't know about discounts.
      // Let's send the price we calculated locally.
      
      let finalPrice = price;
      if (activeEffects[myPlayerIndex]?.discount_50) {
        finalPrice = Math.floor(price / 2);
        
        // FIX: Consume the discount locally so it doesn't persist
        setActiveEffects(prev => ({
          ...prev,
          [myPlayerIndex]: { ...prev[myPlayerIndex], discount_50: false }
        }));
      }
      
      sendGameAction('buy_property', { tileIndex, price: finalPrice });
      playBuySound();
      
      const isDoubles = buyingProperty?.isDoubles;
      // Close modal locally and enable Done button
      closeAllModals(() => {
        if (isDoubles) {
          setIsProcessingTurn(false);
        } else {
          setTimeout(() => {
            setTurnFinished(true);
            setIsProcessingTurn(false);
          }, 300);
        }
      });
      return;
    }
    
    if (!buyingProperty) return;
    
    const { tileIndex, price, buyerIndex } = buyingProperty;
    
    // Check if player has enough money
    let finalPrice = price;
    
    // Check for 50% Discount
    if (activeEffects[buyerIndex]?.discount_50) {
      finalPrice = Math.floor(price / 2);
      setHistory(prev => [`🏷️ ${gamePlayers[buyerIndex].name} used 50% Discount!`, ...prev.slice(0, 9)]);
      
      // Consume discount
      setActiveEffects(prev => ({
        ...prev,
        [buyerIndex]: { ...prev[buyerIndex], discount_50: false }
      }));
    }

    if (playerMoney[buyerIndex] >= finalPrice) {
      // Deduct money
      setPlayerMoney(prev => {
        const updated = [...prev];
        updated[buyerIndex] -= finalPrice;
        return updated;
      });
      
      // Set ownership
      setPropertyOwnership(prev => ({
        ...prev,
        [tileIndex]: Number(buyerIndex)
      }));
      playBuySound(); // Play purchase sound
      
      // Trigger floating price animation (negative/red for buyer)
      const animKey = Date.now();
      setFloatingPrices(prev => [...prev, { price: finalPrice, tileIndex, key: animKey, isPositive: false }]);
      setTimeout(() => {
        setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey));
      }, 3000);
      
      // Add to history
      setHistory(historyPrev => [
        `${gamePlayers[buyerIndex].name} bought ${buyingProperty.name} for $${finalPrice}`,
        ...historyPrev.slice(0, 9)
      ]);
    }
    

    
    // Check if doubles - add extra turn message
    const isDoubles = buyingProperty?.isDoubles;
    
    // Close modal with animation
    closeAllModals(() => {
      if (isDoubles) {
        setHistory(historyPrev => [
          `🎲 ${gamePlayers[buyerIndex].name} rolled doubles! Extra turn!`,
          ...historyPrev.slice(0, 9)
        ]);
        // Unlock turn for next roll
        setIsProcessingTurn(false);
      } else {
        setTimeout(() => {
          endTurn(buyerIndex, false);
        }, 300);
      }
    });
  };

  // Handle canceling a purchase
  const handleCancelBuy = () => {
    const buyerIndex = buyingProperty?.buyerIndex;
    const isDoubles = buyingProperty?.isDoubles;
    
    // Pass true to keepBuyingState so the button remains available
    console.log('[DEBUG] handleCancelBuy called. Preserving buyingProperty.');
    closeAllModals(() => {
      if (isDoubles && buyerIndex !== undefined) {
        setHistory(historyPrev => [
          `🎲 ${gamePlayers[buyerIndex].name} rolled doubles! Extra turn!`,
          ...historyPrev.slice(0, 9)
        ]);
        // Unlock turn
        setIsProcessingTurn(false);
      } else {
        setTimeout(() => {
          // Do NOT end turn yet, let user decide via Done or Buy button
          // But we need to unlock processing so buttons work
          console.log('[DEBUG] handleCancelBuy timeout. Setting turnFinished=true');
          setIsProcessingTurn(false);
          setTurnFinished(true); // Show Done button
        }, 300);
      }
    }, true);
  };

  // Handle Deal Result (Helper to show proposer the outcome)
  const showDealResult = (accepted, deal) => {
    const currentPlayers = gamePlayers; // Use latest from closure if possible, or ref
    const recipientName = currentPlayers[deal.recipient]?.name || 'Player';
    const proposerName = currentPlayers[deal.proposer]?.name || 'Player';

    if (accepted) {
      setHistory(prev => [`✅ ${recipientName} accepted the deal!`, ...prev.slice(0, 9)]);
      setDealResultMessage(`✅ ${recipientName} accepted your deal!`);
    } else {
      setHistory(prev => [`❌ ${recipientName} denied your deal.`, ...prev.slice(0, 9)]);
      setDealResultMessage(`❌ ${recipientName} denied your deal.`);
    }
    setShowDealResultModal(true);
  };

  // Reset Deal State Helper
  const resetDealState = () => {
    setShowDealModal(false);
    setDealPhase('select');
    setSelectedDealPlayer(null);
    setDealGiveProperties([]);
    setDealReceiveProperties([]);
    setDealMoneyOffer(0);
    setDealSelectionMode(false);
    setIncomingDeal(null);
    setShowDealReviewModal(false);
    setActiveDeal(null);
    if (networkMode === 'online') {
      sendGameAction('deal_cancel');
    }
  };

  // Handle Deal Initiate
  const handleDeal = () => {
    if (!validateTurn()) return;
    
    // Check if player is allowed to deal
    if (showAuctionModal || isProcessingTurn || showWarModal || showBuyModal || isRolling) {
      return;
    }

    // Play interaction sound
    try {
      const audio = new Audio(cashRegisterSound);
      audio.volume = 0.5;
      audio.play();
    } catch (e) {}

    // Open deal modal in player selection phase
    setShowDealModal(true);
    setDealPhase('select');
  };

  // Handle Deal Player Selection
  const handleDealPlayerSelect = (playerIndex) => {
    setSelectedDealPlayer(playerIndex);
    setDealPhase('configure');
    setDealSelectionMode(true); // Enable board interaction mode
  };

  // Handle Deal Cancel
  const handleDealCancel = () => {
    resetDealState();
  };

  // Handle Deal Tile Click (in board interaction mode)
  const handleDealTileClick = (tileIndex) => {
    if (!dealSelectionMode) return;

    const owner = propertyOwnership[tileIndex];
    const proposerIndex = networkMode === 'online' ? myPlayerIndex : currentPlayer;
    
    // Check if it's active player's property
    if (owner === proposerIndex) {
      // Toggle in give list
      setDealGiveProperties(prev => {
        if (prev.includes(tileIndex)) {
          return prev.filter(t => t !== tileIndex);
        } else {
          return [...prev, tileIndex];
        }
      });
    }
    // Check if it's selected player's property
    else if (owner === selectedDealPlayer) {
      // Toggle in receive list
      setDealReceiveProperties(prev => {
        if (prev.includes(tileIndex)) {
          return prev.filter(t => t !== tileIndex);
        } else {
          return [...prev, tileIndex];
        }
      });
    }
  };

  // Handle Deal Offer Submit
  const handleDealOffer = () => {
    const proposerIndex = networkMode === 'online' ? myPlayerIndex : currentPlayer;
    const dealData = {
      proposer: proposerIndex,
      recipient: selectedDealPlayer,
      giveProperties: dealGiveProperties,
      receiveProperties: dealReceiveProperties,
      moneyOffer: dealMoneyOffer
    };

    if (networkMode === 'online') {
      sendGameAction('deal_offer', dealData);
    } else {
      // Offline mode: Show review modal for selected player
      setIncomingDeal(dealData);
      setShowDealReviewModal(true);
    }

    // Close proposer's modal
    setShowDealModal(false);
    setDealSelectionMode(false);
  };

  // Handle Deal Accept
  const handleDealAccept = () => {
    const deal = incomingDeal;
    if (!deal) return;

    // Transfer properties: proposer gives -> recipient receives
    setPropertyOwnership(prev => {
      const updated = { ...prev };
      deal.giveProperties.forEach(tile => {
        updated[tile] = deal.recipient;
      });
      deal.receiveProperties.forEach(tile => {
        updated[tile] = deal.proposer;
      });
      return updated;
    });

    // Transfer money (bidirectional: positive = proposer gives, negative = proposer receives)
    if (deal.moneyOffer !== 0) {
      setPlayerMoney(prev => {
        const updated = [...prev];
        updated[deal.proposer] -= deal.moneyOffer;
        updated[deal.recipient] += deal.moneyOffer;
        return updated;
      });

      // Floating prices are broadcast by server on deal_response - no need to call here
    }

    // Add history
    const proposerName = gamePlayers[deal.proposer]?.name || 'Player';
    const recipientName = gamePlayers[deal.recipient]?.name || 'Player';
    setHistory(prev => [`✅ ${proposerName} and ${recipientName} made a deal!`, ...prev.slice(0, 9)]);

    // Cash register sound (deal involves value transfer)
    playBuySound();

    if (networkMode === 'online') {
      sendGameAction('deal_response', { accepted: true, deal });
    } else {
      // Offline mode: Show result to proposer locally
      showDealResult(true, deal);
    }

    resetDealState();
  };

  // Handle Deal Deny
  const handleDealDeny = () => {
    const deal = incomingDeal;
    if (!deal) return;

    const recipientName = gamePlayers[deal.recipient]?.name || 'Player';
    setHistory(prev => [`❌ ${recipientName} denied the deal.`, ...prev.slice(0, 9)]);

    if (networkMode === 'online') {
      sendGameAction('deal_response', { accepted: false, deal });
    } else {
      // Offline mode: Show result to proposer locally
      showDealResult(false, deal);
    }

    resetDealState();
  };

  // Handle Parking Confirm
  const handleParkingConfirm = () => {
    // Mark player to skip next turn
    setSkippedTurns(prev => {
      const updated = { ...prev, [currentPlayer]: true };
      
      // Sync to server (server doesn't have skippedTurns yet, but we send via update_state)
      // Note: Server may need to be updated to handle this, for now client-side tracking
      if (networkMode === 'online') {
        // We'll sync this as part of general state - but server doesn't track skippedTurns
        // For now, just end turn and hope sync works via other mechanisms
        sendGameAction('close_modal');
      }
      
      return updated;
    });
    
    closeAllModals(() => {
      setTimeout(() => {
        endTurn(currentPlayer, false);
      }, 300);
    });
  };

  // --- Property War Handlers ---
  const handleWarJoin = (playerIdx) => {
    const fee = warMode === 'A' ? 3000 : 2000;
    
    // Check if player has enough money
    if (playerMoney[playerIdx] < fee) {
      showToast(`Not enough funds! Need $${fee.toLocaleString()} to join.`);
      return;
    }

    // Online Mode
    if (networkMode === 'online') {
      if (playerIdx !== myPlayerIndex) return; // Only I can join for myself
      sendGameAction('war_join');
      return;
    }

    
    // Deduct fee
    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[playerIdx] -= fee;
      
      if (networkMode === 'online') {
        sendGameAction('update_state', { playerMoney: updated });
      }
      
      return updated;
    });
    
    // Add fee to appropriate pot
    if (warMode === 'A') {
      setCashStack(prev => {
        const newVal = prev + fee;
        // Online Sync
        if (networkMode === 'online') {
           // We need to sync BOTH money and pot.
           // Since setPlayerMoney is called separately, we should probably sync there or here?
           // setPlayerMoney is async.
           // Let's sync here with the calculated money?
           // Actually, setPlayerMoney above updates money.
           // We can send ONE update with both.
           // But we don't have the new money array here easily without access to prev state of money.
           // Let's just send separate updates or rely on the last one?
           // If we send multiple update_state, they might race.
           // Better: Calculate everything and set/send once.
           // But the code is split.
           
           // Let's just send the pot update here. Money update was done in setPlayerMoney?
           // Wait, I didn't add sync to setPlayerMoney call in handleWarJoin.
           // I should do that.
           
           sendGameAction('update_state', { cashStack: newVal });
        }
        return newVal;
      });
      showCashStackFloatingPrice(fee); // Animate addition
    } else {
      setBattlePot(prev => {
        const newVal = prev + fee;
        if (networkMode === 'online') {
           sendGameAction('update_state', { battlePot: newVal });
        }
        return newVal;
      });
    }
    
    // Add to participants
    setWarParticipants(prev => [...prev, playerIdx]);
    setHistory(prev => [`${gamePlayers[playerIdx].name} joined the war! (-$${fee})`, ...prev.slice(0, 9)]);
  };
  
  const handleWarRetreat = (playerIdx) => {
    setHistory(prev => [`${gamePlayers[playerIdx].name} retreated from the war.`, ...prev.slice(0, 9)]);
  };
  
  const handleWarWithdraw = (playerIdx) => {
    // Online Mode
    if (networkMode === 'online') {
      if (playerIdx !== myPlayerIndex) return; // Only I can withdraw for myself
      sendGameAction('war_withdraw');
      return;
    }

    const fee = warMode === 'A' ? 3000 : 2000;
    
    // Refund fee
    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[playerIdx] += fee;
      if (networkMode === 'online') {
        sendGameAction('update_state', { playerMoney: updated });
      }
      return updated;
    });
    
    // Remove from pot
    if (warMode === 'A') {
      setCashStack(prev => {
        const newVal = prev - fee;
        if (networkMode === 'online') {
           sendGameAction('update_state', { cashStack: newVal });
        }
        return newVal;
      });
      showCashStackFloatingPrice(-fee); // Animate removal
    } else {
      setBattlePot(prev => {
        const newVal = prev - fee;
        if (networkMode === 'online') {
           sendGameAction('update_state', { battlePot: newVal });
        }
        return newVal;
      });
    }
    
    // Remove from participants
    setWarParticipants(prev => prev.filter(p => p !== playerIdx));
    setHistory(prev => [`${gamePlayers[playerIdx].name} withdrew from the war. (+$${fee} refund)`, ...prev.slice(0, 9)]);
  };
  
  const handleWarStartProgress = () => {
    console.log('[App] handleWarStartProgress called. Network:', networkMode);
    // Online Mode
    if (networkMode === 'online') {
      // Calculate available unowned properties to send to server
      const allPropertyTiles = Object.keys(RENT_DATA).map(Number);
      const availableIndices = allPropertyTiles.filter(t => {
        const owner = propertyOwnership[t];
        // Exclude Trains from Property War
        return (owner === undefined || owner === null) && !TRAIN_TILES.includes(t);
      });
      
      sendGameAction('war_start', { availableIndices });
      return;
    }

    if (warMode === 'A') {
      setWarPhase('progress');
      // Progress bar for 3 seconds, then reveal property
      setTimeout(() => {
        handleWarReveal();
      }, 3000);
    } else {
      // Mode B: Skip progress, go to roll
      setWarPhase('roll');
    }
  };
  

  
  const handleWarReveal = () => {
    // Select random unowned property - must check propertyOwnership properly
    const allPropertyTiles = Object.keys(RENT_DATA).map(Number);
    const unownedProperties = allPropertyTiles.filter(t => {
      const owner = propertyOwnership[t];
      return owner === undefined || owner === null;
    });
    
    if (unownedProperties.length === 0) {
      // No unowned properties, shouldn't happen in Mode A but safety check
      setHistory(prev => [`No unowned properties available!`, ...prev.slice(0, 9)]);
      setWarPhase('result');
      return;
    }
    
    const randomProperty = unownedProperties[Math.floor(Math.random() * unownedProperties.length)];
    const propertyData = RENT_DATA[randomProperty];
    
    setWarProperty({ ...propertyData, tileIndex: randomProperty });
    setWarPhase('reveal');
    setHistory(prev => [`⚔️ "${propertyData.name}" is chosen for war!`, ...prev.slice(0, 9)]);
    
    // Auto-advance to roll after 2 seconds
    setTimeout(() => {
      setWarPhase('roll');
    }, 2000);
  };
  
  // Start the rolling sequence
  const handleWarStartRolling = () => {
    if (warParticipants.length === 0) {
      setHistory(prev => [`No one joined the war. It fizzles out.`, ...prev.slice(0, 9)]);
      setWarPhase('result');
      return;
    }
    setWarCurrentRoller(0); // Start with first participant
    setWarRolls({});
    setWarPhase('rolling');
  };
  
  // Roll for current participant
  const handleWarDoRoll = () => {
    // Online Mode
    if (networkMode === 'online') {
      const currentRollerIdx = warParticipants[warCurrentRoller];
      if (currentRollerIdx !== myPlayerIndex) return; // Only current roller can roll
      sendGameAction('war_roll');
      return;
    }

    if (warCurrentRoller === null || warCurrentRoller >= warParticipants.length) return;
    
    const playerIdx = warParticipants[warCurrentRoller];
    setWarIsRolling(true);
    
    // Animate dice for 1 second
    const rollInterval = setInterval(() => {
      setWarDiceValues([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
    }, 100);
    
    setTimeout(() => {
      clearInterval(rollInterval);
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const total = die1 + die2;
      
      setWarDiceValues([die1, die2]);
      setWarIsRolling(false);
      
      // Build complete rolls object (include this roll)
      const updatedRolls = { ...warRolls, [playerIdx]: total };
      setWarRolls(updatedRolls);
      setHistory(prev => [`🎲 ${gamePlayers[playerIdx].name} rolled ${total}!`, ...prev.slice(0, 9)]);
      
      // Move to next roller or show results
      if (warCurrentRoller + 1 < warParticipants.length) {
        setWarCurrentRoller(warCurrentRoller + 1);
      } else {
        // All participants have rolled! Mark evaluating immediately so roll button is NEVER displayed again
        setWarCurrentRoller(null);
        setWarPhase('evaluating');
        // Wait 2.2s so players can see the last roll, then show results!
        setTimeout(() => {
          handleWarShowResults(updatedRolls);
        }, 2200);
      }
    }, 1000);
  };
  
  // Show results and determine winner (rolls passed directly to avoid stale state)
  const handleWarShowResults = (rolls) => {
    const maxRoll = Math.max(...Object.values(rolls));
    
    // Find all gamePlayers with max roll (for tie-breaking)
    const winners = Object.entries(rolls).filter(([_, roll]) => roll === maxRoll);
    
    if (winners.length > 1) {
      // TIE! Need to re-roll between tied gamePlayers
      const tiedPlayers = winners.map(([idx]) => parseInt(idx));
      const names = tiedPlayers.map(idx => gamePlayers[idx]?.name || `Player ${idx + 1}`).join(' & ');
      
      setWarWinner(null);
      setWarPhase('tie');
      setWarTiedPlayers(tiedPlayers);
      setWarTieRoll(maxRoll);
      setWarTieMessage(`${names} tied with ${maxRoll}!`);
      setHistory(prev => [`⚔️ TIE! ${names} tied with ${maxRoll}!`, ...prev.slice(0, 9)]);
      
      // Wait 2.8s showing the tie screen with highlighted tied players, then sudden-death rematch with ONLY tied players
      setTimeout(() => {
        setWarParticipants(tiedPlayers);
        setWarRolls({});
        setWarCurrentRoller(0);
        setWarPhase('roll');
        setWarTieMessage(null);
        setWarTiedPlayers(null);
        setWarTieRoll(null);
        setHistory(prev => [`⚔️ Sudden-death rematch between ${names}...`, ...prev.slice(0, 9)]);
      }, 2800);
      return;
    }
    
    // Single winner
    const winnerIdx = parseInt(winners[0][0]);
    setWarWinner(winnerIdx);
    
    if (warMode === 'A' && warProperty) {
      // Winner gets property for free
      const tileIdx = Number(warProperty.tileIndex);
      setPropertyOwnership(prev => {
        const updated = { ...prev, [tileIdx]: winnerIdx };
        if (networkMode === 'online') {
          sendGameAction('update_state', { propertyOwnership: updated });
        }
        return updated;
      });
      setHistory(prev => [`🏆 ${gamePlayers[winnerIdx].name} won "${warProperty.name}" in the Property War!`, ...prev.slice(0, 9)]);
      playWinSound(); // Play victory fanfare
    } else {
      // Mode B: Winner gets battlePot
      setPlayerMoney(prev => {
        const updated = [...prev];
        updated[winnerIdx] += battlePot;
        if (networkMode === 'online') {
          sendGameAction('update_state', { playerMoney: updated, battlePot: 0 });
        }
        return updated;
      });
      setHistory(prev => [`🏆 ${gamePlayers[winnerIdx].name} won the Cash Battle! (+$${battlePot})`, ...prev.slice(0, 9)]);
      playWinSound(); // Play victory fanfare
    }
    
    setWarPhase('result');
  };
  
  const handleWarComplete = () => {
    // Online Mode
    if (networkMode === 'online') {
      sendGameAction('war_close');
      endTurn(currentPlayer, false);
      return;
    }

    setShowWarModal(false);
    setWarPhase('idle');
    setWarTiedPlayers(null);
    setWarTieRoll(null);
    setWarTieMessage(null);
    endTurn(currentPlayer, false);
  };

  // Handle Travel Start
  const handleTravelStart = () => {
    setTravelMode(true);
    setTravelSourceIndex(playerPositions[currentPlayer]);
    setHistory(prev => [`Select a train station to travel to...`, ...prev.slice(0, 9)]);
    // Close any open modals (like the "Buy/Travel" prompt if it was a modal, or just the button state)
    setBuyingProperty(null); 
  };

  // Handle Travel Confirmation (Move and Pay)
  const handleTravelConfirm = async (targetIndex, cost) => {
    setTravelMode(false);
    setTravelSourceIndex(null);
    
    // Deduct cost
    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[currentPlayer] -= cost;
      
      // Sync money to server
      if (networkMode === 'online') {
        sendGameAction('update_state', { playerMoney: updated });
      }
      
      return updated;
    });
    
    // Animate cost
    const animKey = getUniqueKey();
    setFloatingPrices(prev => [...prev, { price: cost, tileIndex: playerPositions[currentPlayer], key: animKey, isPositive: false }]);
    setTimeout(() => setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey)), 3000);
    
    setHistory(prev => [`${gamePlayers[currentPlayer].name} traveled to ${getTileName(targetIndex)} for $${cost}`, ...prev.slice(0, 9)]);
    
    // Move player
    const currentPos = playerPositions[currentPlayer];
    const steps = (targetIndex - currentPos + 36) % 36;
    if (networkMode === 'online') {
      sendGameAction('chance_move', {
        playerIndex: currentPlayer,
        oldPos: currentPos,
        targetPos: targetIndex,
        steps,
        delay: 150,
        cardText: `Traveled to ${getTileName(targetIndex)}`,
        isJail: false
      });
      return;
    }
    await movePlayerToken(currentPlayer, steps, 150);
    handleTileArrival(currentPlayer, targetIndex, false);
  };

  // Handle Tile Click (Open Property Details OR Select Travel Destination OR Auction Selection OR Deal Selection)
  const handleTileClick = (tileIndex) => {
    // Build Mode - Tap to upgrade
    if (buildMode) {
      handleBuildTileTap(tileIndex);
      return;
    }

    // Sell Mode - Tap to sell
    if (sellMode) {
      handleSellTileTap(tileIndex);
      return;
    }

    // Deal Selection Mode - handle property selection for trades
    if (dealSelectionMode) {
      handleDealTileClick(tileIndex);
      return;
    }

    // Forced Auction Selection
    if (isSelectingAuctionProperty) {
      if (tileIndex === 31) return; // Ignore self (Forced Auction tile)
      
      const property = RENT_DATA[tileIndex];
      // Must be a valid property
      if (!property) return;
      
      // Must be owned by SOMEONE
      const owner = propertyOwnership[tileIndex];
      if (owner === undefined || owner === null) {
         // Optional: Alert user "Must be an owned property"
         return; 
      }
      
      // Must NOT be owned by me
      if (Number(owner) === myPlayerIndex) {
         // Optional: Alert user "You can't auction your own property!"
         return;
      }
      
      // Valid selection
      const uiProperty = getPropertyByTileIndex(tileIndex);
      const color = uiProperty ? uiProperty.color : '#ccc';
      setPendingAuctionProperty({ ...property, tileIndex, color });
      return;
    }

    // If in Travel Mode
    if (travelMode) {
      // Check if valid target (Train, Owned by player, Not current)
      const isTrain = TRAIN_TILES.includes(tileIndex);
      const isOwnedByMe = propertyOwnership[tileIndex] === currentPlayer;
      const isCurrent = tileIndex === travelSourceIndex;
      
      if (isTrain && isOwnedByMe && !isCurrent) {
        // Calculate Cost
        const sortedTrains = [...TRAIN_TILES].sort((a, b) => a - b);
        const srcIdx = sortedTrains.indexOf(travelSourceIndex);
        const tgtIdx = sortedTrains.indexOf(tileIndex);
        
        let stationDist = (tgtIdx - srcIdx + 4) % 4;
        const cost = stationDist * 50;
        
        if (playerMoney[currentPlayer] < cost) {
          alert(`Not enough money to travel! Cost: $${cost}`);
          return;
        }
        
        if (confirm(`Travel to ${getTileName(tileIndex)}? Cost: $${cost}`)) {
          handleTravelConfirm(tileIndex, cost);
        }
      } else if (!isTrain) {
         // Ignore
      }
      return;
    }

    if (tileIndex === 3) {
      showToast(`💵 Cash Stack Pot: $${(cashStack || 0).toLocaleString()}`);
      return;
    }

    const property = RENT_DATA[tileIndex];
    if (property) {
      setSelectedProperty({ ...property, tileIndex });
      setShowPropertyModal(true);
    }
  };


  // Helper: Check if tile is selectable for auction (opponent-owned property)
  const isAuctionSelectable = (tileIndex) => {
    if (!isSelectingAuctionProperty) return false;
    
    // Exclude Trains from Auction
    if (TRAIN_TILES.includes(tileIndex)) return false;

    const property = RENT_DATA[tileIndex];
    if (!property) return false; // Not a property
    const owner = propertyOwnership[tileIndex];
    if (owner === undefined || owner === null) return false; // Unowned
    if (Number(owner) === myPlayerIndex) return false; // My property
    return true; // Opponent's property - selectable!
  };
  
  // Helper: Get style for auction selection mode (greyscale non-selectable tiles)
  const getAuctionSelectionStyle = (tileIndex) => {
    // 1. Selector View (Local Player Selecting)
    if (isSelectingAuctionProperty) {
      const selectable = isAuctionSelectable(tileIndex);
      if (!selectable) {
        return { filter: 'grayscale(100%) brightness(0.6)', pointerEvents: 'none', transition: 'filter 0.3s' };
      }
      return { transition: 'filter 0.3s', cursor: 'pointer' }; 
    }

    // 2. Online Logic (Spectators & Announcement)
    if (networkMode === 'online') {
        // Spectator Waiting View (While someone else is selecting)
        if (auctionState.status === 'thinking') {
             // If NOT the initiator, see grayscale
             if (auctionState.initiator !== myPlayerIndex) {
                 const owner = propertyOwnership[tileIndex];
                 const initiator = auctionState.initiator;
                 const isOwnedByOther = (owner !== undefined && owner !== null && owner !== initiator);
                 
                 // If it's a valid target (Owned by Other), keep color
                 if (isOwnedByOther && !TRAIN_TILES.includes(tileIndex)) {
                     return { transition: 'filter 0.3s' }; 
                 } else {
                     return { filter: 'grayscale(100%) brightness(0.6)', transition: 'filter 0.3s' }; 
                 }
             }
        }
        
        // Selected Phase (The Reveal - 1 Second Glow)
        if (auctionState.status === 'selected') {
            if (Number(auctionState.propertyIndex) === Number(tileIndex)) {
                 // The Chosen One: Glow!
                 return { 
                     filter: 'brightness(1.2) drop-shadow(0 0 20px gold)', 
                     zIndex: 100, 
                     transform: 'scale(1.15)',
                     boxShadow: '0 0 15px gold',
                     border: '2px solid gold',
                     transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                 };
            } else {
                 return { filter: 'grayscale(100%) brightness(0.4)', transition: 'filter 0.5s' };
            }
        }
    }

    return {}; // Normal styling
  };

  // Helper: Get style for deal mode (greyscale non-eligible tiles, dim non-deal tiles during deal review)
  const getDealSelectionStyle = (tileIndex) => {
    // 1. If actively picking properties to trade
    if (dealSelectionMode) {
      const owner = propertyOwnership[tileIndex];
      const isCurrentPlayerProperty = owner === currentPlayer;
      const isSelectedPlayerProperty = owner === selectedDealPlayer;
      
      // Keep tile colored if owned by current player or selected player
      if (isCurrentPlayerProperty || isSelectedPlayerProperty) {
        return { transition: 'filter 0.3s', cursor: 'pointer' };
      }
      
      // Grayscale everything else
      return { filter: 'grayscale(100%) brightness(0.6)', pointerEvents: 'none', transition: 'filter 0.3s' };
    }

    // 2. If reviewing deal or active deal pending online (non-selection mode)
    const isDealReview = showDealReviewModal && incomingDeal;
    const isDealSpectating = activeDeal && networkMode === 'online' && !showDealModal;
    if (isDealReview || isDealSpectating) {
      const gList = isDealReview ? (incomingDeal.giveProperties || []) : (activeDeal.giveProperties || []);
      const rList = isDealReview ? (incomingDeal.receiveProperties || []) : (activeDeal.receiveProperties || []);
      if (gList.includes(tileIndex) || rList.includes(tileIndex)) {
        return {}; // Highlight handled by getModalHighlightStyle
      }
      return { filter: 'grayscale(60%) brightness(0.75)', transition: 'filter 0.3s' };
    }
    
    return {};
  };

  // Helper: Get style for build mode (greyscale non-monopoly tiles)
  const getBuildSelectionStyle = (tileIndex) => {
    if (!buildMode) return {};
    
    const monopolyTiles = getMonopolyTiles(currentPlayer);
    
    // Keep tile colored if it's one of the current player's monopoly properties
    if (monopolyTiles.includes(tileIndex)) {
      return { 
        transition: 'filter 0.3s', 
        cursor: 'pointer',
        boxShadow: '0 0 15px rgba(76, 175, 80, 0.6)', // Green glow for buildable tiles
        zIndex: 5
      };
    }
    
    // Grayscale everything else
    return { filter: 'grayscale(100%) brightness(0.6)', pointerEvents: 'none', transition: 'filter 0.3s' };
  };

  // Helper: Highlight property tile for all active modals (Property War, Deal, Buying, Property Details, Auction)
  const getModalHighlightStyle = (tileIndex) => {
    // 1. Property War: Chosen property
    if (showWarModal && warProperty?.tileIndex !== undefined && warProperty?.tileIndex !== null) {
      if (Number(warProperty.tileIndex) === Number(tileIndex)) {
        return {
          filter: 'brightness(1.25) drop-shadow(0 0 18px #FF3D00)',
          zIndex: 120,
          boxShadow: '0 0 22px #FF3D00, inset 0 0 12px #FFD700',
          border: '3px solid #FFD700',
          animation: 'warTilePulse 1.4s ease-in-out infinite',
          transition: 'all 0.3s ease'
        };
      }
    }

    // 2. Buying Modal: Property currently up for purchase
    if (showBuyModal && buyingProperty?.tileIndex !== undefined && buyingProperty?.tileIndex !== null) {
      if (Number(buyingProperty.tileIndex) === Number(tileIndex)) {
        return {
          filter: 'brightness(1.25) drop-shadow(0 0 18px #FFD700)',
          zIndex: 120,
          boxShadow: '0 0 22px #FFD700, inset 0 0 12px #FFF9C4',
          border: '3px solid #FFD700',
          animation: 'buyTilePulse 1.4s ease-in-out infinite',
          transition: 'all 0.3s ease'
        };
      }
    }

    // 3. Property Details Modal: Property being inspected
    if (showPropertyModal && selectedProperty?.tileIndex !== undefined && selectedProperty?.tileIndex !== null) {
      if (Number(selectedProperty.tileIndex) === Number(tileIndex)) {
        return {
          filter: 'brightness(1.25) drop-shadow(0 0 18px #29B6F6)',
          zIndex: 120,
          boxShadow: '0 0 22px #0288D1, inset 0 0 12px #81D4FA',
          border: '3px solid #29B6F6',
          animation: 'inspectTilePulse 1.4s ease-in-out infinite',
          transition: 'all 0.3s ease'
        };
      }
    }

    // 4. Deal System: Properties being given or received
    const isProposing = showDealModal || dealSelectionMode;
    const isReviewing = showDealReviewModal && incomingDeal;
    const isSpectating = activeDeal && networkMode === 'online';

    const giveList = isProposing 
      ? dealGiveProperties 
      : isReviewing 
        ? (incomingDeal.giveProperties || []) 
        : isSpectating 
          ? (activeDeal.giveProperties || []) 
          : [];

    const receiveList = isProposing 
      ? dealReceiveProperties 
      : isReviewing 
        ? (incomingDeal.receiveProperties || []) 
        : isSpectating 
          ? (activeDeal.receiveProperties || []) 
          : [];

    if (giveList.includes(tileIndex)) {
      return {
        filter: 'brightness(1.25) drop-shadow(0 0 16px #00E676)',
        zIndex: 115,
        boxShadow: '0 0 22px #00E676, inset 0 0 10px #B9F6CA',
        border: '3px solid #00E676',
        animation: 'dealGivePulse 1.4s ease-in-out infinite',
        transition: 'all 0.3s ease'
      };
    }

    if (receiveList.includes(tileIndex)) {
      return {
        filter: 'brightness(1.25) drop-shadow(0 0 16px #FF9100)',
        zIndex: 115,
        boxShadow: '0 0 22px #FF9100, inset 0 0 10px #FFE57F',
        border: '3px solid #FF9100',
        animation: 'dealGetPulse 1.4s ease-in-out infinite',
        transition: 'all 0.3s ease'
      };
    }

    // 5. Active Auction (Bidding phase)
    const auctionTile = pendingAuctionProperty?.tileIndex ?? auctionState?.propertyIndex;
    if ((showAuctionModal || (auctionState && auctionState.status === 'bidding')) && auctionTile !== undefined && auctionTile !== null) {
      if (Number(auctionTile) === Number(tileIndex)) {
        return {
          filter: 'brightness(1.25) drop-shadow(0 0 18px #FFC107)',
          zIndex: 120,
          boxShadow: '0 0 22px #FFC107, inset 0 0 12px #FFE082',
          border: '3px solid #FFC107',
          animation: 'auctionTilePulse 1.4s ease-in-out infinite',
          transition: 'all 0.3s ease'
        };
      }
    }

    return {};
  };

  // Helper: Delegate getWarSelectionStyle to getModalHighlightStyle
  const getWarSelectionStyle = (tileIndex) => getModalHighlightStyle(tileIndex);

  // Helper: Render deal indicator (+) or (-) on selected tiles
  const renderDealIndicator = (tileIndex) => {
    const isProposing = showDealModal || dealSelectionMode;
    const isReviewing = showDealReviewModal && incomingDeal;
    const isSpectating = activeDeal && networkMode === 'online';

    if (!isProposing && !isReviewing && !isSpectating) return null;

    const giveList = isProposing 
      ? dealGiveProperties 
      : isReviewing 
        ? (incomingDeal.giveProperties || []) 
        : isSpectating 
          ? (activeDeal.giveProperties || []) 
          : [];

    const receiveList = isProposing 
      ? dealReceiveProperties 
      : isReviewing 
        ? (incomingDeal.receiveProperties || []) 
        : isSpectating 
          ? (activeDeal.receiveProperties || []) 
          : [];

    if (giveList.includes(tileIndex)) {
      return (
        <div className="deal-tile-indicator give" title="Offering">−</div>
      );
    }
    if (receiveList.includes(tileIndex)) {
      return (
        <div className="deal-tile-indicator receive" title="Requesting">+</div>
      );
    }
    return null;
  };

  // Handle Auction Selection Confirmation
  const handleAuctionConfirm = () => {
      // Check funds
      if (playerMoney[myPlayerIndex] < 3000) {
          alert("Not enough money! You need $3,000 to start an auction.");
          return;
      }
      
      if (networkMode === 'online') {
           sendGameAction('auction_select_property', { propertyIndex: pendingAuctionProperty.tileIndex });
      }
      
      // Cleanup local state
      setPendingAuctionProperty(null);
      setIsSelectingAuctionProperty(false);
      setShowAuctionInstructionModal(false);
  };

  // Handle Auction Bid
  const handleAuctionBid = () => {
      const minBid = (auctionState.currentBid || 0) + 10;
      const balance = playerMoney[myPlayerIndex];
      
      if (auctionBidAmount < minBid) {
         // UI should prevent this, but safety check
         return;
      }
      if (auctionBidAmount > balance) {
         alert("You don't have enough funds!");
         return;
      }
      
      if (networkMode === 'online') {
          sendGameAction('auction_place_bid', { bidAmount: Number(auctionBidAmount) });
      }
  };
  
  // Handle Auction Fold
  const handleAuctionFold = () => {
      if (networkMode === 'online') {
          sendGameAction('auction_fold');
      }
  };

  // Handle Upgrade Property
  const handleUpgradeProperty = () => {
    if (!selectedProperty) return;
    
    const { tileIndex, upgradeCost } = selectedProperty;
    const ownerIndex = propertyOwnership[tileIndex];
    
    // Online Mode Check
    if (networkMode === 'online') {
      // Basic validation locally
      if (ownerIndex === undefined || ownerIndex !== myPlayerIndex) return;
      
      // Calculate cost (including discount logic if we want to be precise, but server handles money)
      // For now, let's just send the action.
      // Server doesn't know about discounts yet, so we should calculate price here.
      
      let currentLevel = propertyLevels[tileIndex] || 0;
      if (currentLevel >= 5) return;
      
      let currentUpgradeCost = currentLevel === 4 ? upgradeCost * 2 : upgradeCost;
      
      if (activeEffects[myPlayerIndex]?.discount_50) {
        currentUpgradeCost = Math.floor(currentUpgradeCost / 2);
      }
      
      sendGameAction('upgrade_property', { tileIndex, price: currentUpgradeCost });
      closeAllModals();
      return;
    }
    
    // Safety checks
    if (ownerIndex === undefined) return; // Not owned
    if (playerMoney[ownerIndex] < upgradeCost) return; // Not enough money
    
    const currentLevel = propertyLevels[tileIndex] || 0;
    if (currentLevel >= 5) return; // Max level
    
    // Determine cost (Hotel = 2 * House Cost)
    let currentUpgradeCost = currentLevel === 4 ? upgradeCost * 2 : upgradeCost;
    
    // Check for 50% Discount
    if (activeEffects[currentPlayer]?.discount_50) {
      currentUpgradeCost = Math.floor(currentUpgradeCost / 2);
      setHistory(prev => [`🏷️ ${gamePlayers[currentPlayer].name} used 50% Discount on Upgrade!`, ...prev.slice(0, 9)]);
      
      // Consume discount
      setActiveEffects(prev => ({
        ...prev,
        [currentPlayer]: { ...prev[currentPlayer], discount_50: false }
      }));
    }

    if (playerMoney[ownerIndex] < currentUpgradeCost) return; // Not enough money
    
    // Deduct money
    setPlayerMoney(prev => {
      const updated = [...prev];
      updated[ownerIndex] -= currentUpgradeCost;
      return updated;
    });
    
    // Trigger floating price animation
    const animKey = Date.now();
    setFloatingPrices(prev => [...prev, { price: currentUpgradeCost, tileIndex: selectedProperty.tileIndex, key: animKey, isPositive: false }]);
    setTimeout(() => {
      setFloatingPrices(prev => prev.filter(fp => fp.key !== animKey));
    }, 3000);

    // Increase level
    setPropertyLevels(prev => ({
      ...prev,
      [tileIndex]: currentLevel + 1
    }));
    
    setHistory(historyPrev => [
      `🔨 ${gamePlayers[ownerIndex].name} upgraded ${selectedProperty.name} to Level ${currentLevel + 1} for $${currentUpgradeCost}`,
      ...historyPrev.slice(0, 9)
    ]);
  };



  // Debug: Test Rob Bank
  const debugRobBank = () => {
    setPlayerPositions(prev => {
      const newPos = [...prev];
      newPos[currentPlayer] = 18;
      return newPos;
    });
    setShowRobBankModal(true);
  };

  // Calculate tile positions - using viewport-relative units
  // Board fills 100vh, corners are 13.5vh each
  const getTileThemeClass = (tileColor) => {
    const darkColors = [PROPERTY_COLORS.red, PROPERTY_COLORS.purple, PROPERTY_COLORS.darkGreen];
    return darkColors.includes(tileColor) ? 'tile-dark' : 'tile-light';
  };

  // Horizontal tiles: 8.111vh, Vertical tiles: 10.428vh (NO GAPS)
  const getTileStyle = (index, row, tileColor) => {
    const cornerSize = '13.5vh';
    const tileWidthHorizontal = 8.111;   // vh - exact for 9 tiles
    const tileHeightVertical = 10.428;   // vh - exact for 7 tiles
    
    const baseStyle = { background: tileColor };
    
    switch (row) {
      case 'bottom':
        return {
          ...baseStyle,
          bottom: 0,
          right: `calc(${cornerSize} + ${index * tileWidthHorizontal}vh)`,
        };
      case 'left':
        return {
          ...baseStyle,
          left: 0,
          bottom: `calc(${cornerSize} + ${index * tileHeightVertical}vh)`,
        };
      case 'top':
        return {
          ...baseStyle,
          top: 0,
          left: `calc(${cornerSize} + ${index * tileWidthHorizontal}vh)`,
        };
      case 'right':
        return {
          ...baseStyle,
          right: 0,
          top: `calc(${cornerSize} + ${index * tileHeightVertical}vh)`,
        };
      default:
        return baseStyle;
    }
  };

  // Get position for floating price animation (center of tile)
  const getFloatingPosition = (tileIndex) => {
    // Fallback for invalid indices
    if (tileIndex === undefined || tileIndex === null || tileIndex < 0 || tileIndex > 40) {
        return { top: 50, left: 50 };
    }

    const hTileW = 8.111;
    const vTileH = 10.428;
    
    // Corners
    if (tileIndex === 0) return { top: 93, left: 93 };
    if (tileIndex === 10) return { top: 93, left: 7 };
    if (tileIndex === 18) return { top: 7, left: 7 };
    if (tileIndex === 28) return { top: 7, left: 93 };
    
    // Bottom row (1-9)
    if (tileIndex <= 9) {
      const offset = tileIndex - 1;
      return { top: 93, left: 86.5 - (offset * hTileW) - (hTileW / 2) };
    }
    // Left column (11-17)
    if (tileIndex <= 17) {
      const offset = tileIndex - 11;
      return { top: 86.5 - (offset * vTileH) - (vTileH / 2), left: 7 };
    }
    // Top row (19-27)
    if (tileIndex <= 27) {
      const offset = tileIndex - 19;
      return { top: 7, left: 13.5 + (offset * hTileW) + (hTileW / 2) };
    }
    // Right column (29-35)
    const offset = tileIndex - 29;
    return { top: 13.5 + (offset * vTileH) + (vTileH / 2), left: 93 };
  };

  // Calculate generic tile position for any index (0-35)
  // ALL UNITS IN VH relative to 100vh board
  const getPawnStyle = (tileIndex, playerIndex) => {
    // Board Layout Constants
    const hTileW = 8.111;
    const vTileH = 10.428;
    const pawnSize = 5;
    const overlapAmount = 2; // How much pawns overlap each other (vh)
    
    // Depth alignment (Cross-axis) - "Upper/Inner" side of tiles (away from price)
    // Horizontal tiles: Prices at outer edge, so pawns go near inner edge
    const topVal_BottomRow = 87;  // Near 86.5 (inner edge)
    const topVal_TopRow = 1;      // Near 0 (outer edge, but above price which is at bottom for top row)
    
    // Vertical tiles: Prices often at outer edge. Pawns toward inner (board center).
    // Left Column (0-13.5 X): Inner side = RIGHT side = higher X values -> 9vh
    // Right Column (86.5-100 X): Inner side = LEFT side = lower X values -> 87vh
    const leftVal_LeftCol = 9;    // Inner (right) side of left column tiles
    const leftVal_RightCol = 87;  // Inner (left) side of right column tiles
    
    // --- Dynamic Group Centering ---
    // Find all gamePlayers on the same tile
    const gamePlayersOnThisTile = playerPositions.reduce((acc, pos, idx) => {
      if (pos === tileIndex) acc.push(idx);
      return acc;
    }, []);
    
    const numOnTile = gamePlayersOnThisTile.length;
    const myIndexInGroup = gamePlayersOnThisTile.indexOf(playerIndex);
    
    // Combined group width: First pawn is full width, subsequent pawns add (pawnSize - overlap)
    const effectiveAdd = pawnSize - overlapAmount; // 3vh per additional pawn
    const groupWidth = pawnSize + (numOnTile - 1) * effectiveAdd;
    
    // Offset of this pawn from the group's left edge
    const myOffsetInGroup = myIndexInGroup * effectiveAdd;
    
    // Offset to center the group on the tile center
    const groupCenterOffset = -groupWidth / 2;

    let pos = { top: 0, left: 0 };

    // 0: Start (Bottom Right) - 2x2 Grid
    if (tileIndex === 0) {
      pos.top = 90 + (Math.floor(myIndexInGroup / 2) * 3);
      pos.left = 90 + (myIndexInGroup % 2) * 3;
    }
    // 1-9: Bottom Row (Right to Left)
    else if (tileIndex <= 9) {
      const tileOffset = tileIndex - 1;
      const startRight = 86.5; 
      const trackCenter = startRight - (tileOffset * hTileW) - (hTileW / 2);
      
      pos.top = topVal_BottomRow;
      pos.left = trackCenter + groupCenterOffset + myOffsetInGroup;
    }
    // 10: Parking (Bottom Left) - 2x2 Grid
    else if (tileIndex === 10) {
      pos.top = 90 + (Math.floor(myIndexInGroup / 2) * 3);
      pos.left = 5 + (myIndexInGroup % 2) * 3;
    }
    // 11-17: Left Column (Bottom to Top)
    else if (tileIndex <= 17) {
      const tileOffset = tileIndex - 11;
      // Top edge of this tile (visually "upward" = lower Y value)
      const tileTopEdge = 86.5 - (tileOffset + 1) * vTileH;
      
      // Fixed top at upper edge of tile (like horizontal tiles)
      pos.top = tileTopEdge + 1;
      
      // Center group horizontally on depth axis (X: 0-13.5, center at ~7)
      const depthCenter = 7;
      pos.left = depthCenter + groupCenterOffset + myOffsetInGroup;
    }
    // 18: Rob Bank (Top Left) - 2x2 Grid
    else if (tileIndex === 18) {
      pos.top = 5 + (Math.floor(myIndexInGroup / 2) * 3);
      pos.left = 5 + (myIndexInGroup % 2) * 3;
    }
    // 19-27: Top Row (Left to Right)
    else if (tileIndex <= 27) {
      const tileOffset = tileIndex - 19;
      const startLeft = 13.5;
      const trackCenter = startLeft + (tileOffset * hTileW) + (hTileW / 2);
      
      pos.top = topVal_TopRow;
      pos.left = trackCenter + groupCenterOffset + myOffsetInGroup;
    }
    // 28: Jail (Top Right) - 2x2 Grid
    else if (tileIndex === 28) {
      pos.top = 5 + (Math.floor(myIndexInGroup / 2) * 3);
      pos.left = 90 + (myIndexInGroup % 2) * 3;
    }
    // 29-35: Right Column (Top to Bottom)
    else {
      const tileOffset = tileIndex - 29;
      // Top edge of this tile (first tile starts at 13.5)
      const tileTopEdge = 13.5 + tileOffset * vTileH;
      
      // Fixed top at upper edge of tile
      pos.top = tileTopEdge + 1;
      
      // Center group horizontally on depth axis (X: 86.5-100, center at ~93)
      const depthCenter = 93;
      pos.left = depthCenter + groupCenterOffset + myOffsetInGroup;
    }

    return {
      top: `${pos.top}vh`,
      left: `${pos.left}vh`,
      zIndex: 20 + playerIndex
    };
  };

  // Debug: Grant Monopoly
  const debugGrantMonopoly = () => {
    // Get current player's position
    const pos = playerPositions[currentPlayer];
    const property = RENT_DATA[pos];
    
    if (!property) {
      alert("Not on a valid property!");
      return;
    }
    
    const groupId = property.groupId;
    const groupTiles = Object.keys(RENT_DATA).filter(key => RENT_DATA[key].groupId === groupId);
    
    setPropertyOwnership(prev => {
      const updated = { ...prev };
      groupTiles.forEach(tIndex => {
        updated[tIndex] = currentPlayer;
      });
      return updated;
    });
    
    alert(`Granted Monopoly for Group ${groupId} to Player ${currentPlayer + 1}`);
  };

  // Render dice dots based on value
  const renderDiceDots = (value) => {
    const patterns = {
      1: [false, false, false, false, true, false, false, false, false],
      2: [true, false, false, false, false, false, false, false, true],
      3: [true, false, false, false, true, false, false, false, true],
      4: [true, false, true, false, false, false, true, false, true],
      5: [true, false, true, false, true, false, true, false, true],
      6: [true, false, true, true, false, true, true, false, true],
    };
    
    const pattern = patterns[value];
    if (!pattern) return null;

    return pattern.map((show, i) => (
      <div key={i} className={`dot ${show ? '' : 'hidden'}`}></div>
    ));
  };

  // Render Upgrades (Houses/Hotels) - DISABLED: Levels shown in modal only
  const renderUpgrades = (tileIndex, orientation) => {
    return null; // House icons removed - levels displayed in Build modal instead
  };

  // Handle landscape rotation request
  const handleRotateToLandscape = async () => {
    try {
      // Request fullscreen first (required for orientation lock)
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
      }

      // Lock orientation to landscape
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (err) {
      // Orientation lock may fail on some browsers, just let user rotate manually
      console.log('Orientation lock not supported:', err);
      alert('Please rotate your device manually to landscape mode 📱↔️');
    }
  };

  return (
    <>
      {/* Portrait Mode Overlay */}
      <div className="portrait-overlay">
        <div className="rotate-icon">📱</div>
        <div className="rotate-text">Rotate for the best experience!</div>
        <button className="rotate-btn" onClick={handleRotateToLandscape}>
          TAP TO GO LANDSCAPE
        </button>
        <div className="rotate-subtext">Or rotate your device manually</div>
      </div>

      {/* Revamped Matchmaking & Startup Screen */}
      {gameStage !== 'playing' && (
        <MatchmakingView
          gameStage={gameStage}
          setGameStage={setGameStage}
          setNetworkMode={setNetworkMode}
          myIdentity={myIdentity}
          setMyIdentity={setMyIdentity}
          players={players}
          AVATAR_COLORS={AVATAR_COLORS}
          initializeHost={initializeHost}
          joinRoom={joinGame}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          roomCode={roomCode}
          connectedPlayers={connectedPlayers}
          myPlayerIndex={myPlayerIndex}
          startGame={startGame}
          onLeaveRoom={() => {
            if (socketRef.current) {
              socketRef.current.disconnect();
              socketRef.current = null;
            }
            setRoomCode('');
            setConnectedPlayers([]);
            setMyPlayerIndex(null);
            setGameStage('online_menu');
            setNetworkMode('offline');
          }}
          showToast={showToast}
          startupBg={startupBg}
          devMode={devMode}
          onToggleDevMode={() => {
            const next = !devMode;
            setDevMode(next);
            try { localStorage.setItem('pseudopoly_devmode', String(next)); } catch {}
          }}
          onOpenSettings={() => setShowSettingsModal(true)}
          serverUrl={serverUrl}
          updateServerUrl={updateServerUrl}
          socketConnected={socketConnected}
          networkType={networkType}
          setNetworkType={setNetworkType}
          hotspotServerUrl={hotspotServerUrl}
          onlineServerUrl={onlineServerUrl}
        />
      )}

      {/* Game Board */}
      {gameStage === 'playing' && (
        <div className="game-container">
        {/* Game Board */}
      <div className={`board ${dealSelectionMode || buildMode ? 'deal-selection-active' : ''}`}>
        {/* Corner Spaces */}
        <div className="corner start" style={(isSelectingAuctionProperty || (networkMode==='online' && ['thinking', 'announcing'].includes(auctionState?.status))) ? {filter: 'grayscale(100%) brightness(0.6)', transition: 'filter 0.3s'} : {transition: 'filter 0.3s'}}>
          <img src={startIcon} alt="Start" className="corner-icon" />
        </div>
        
        <div className="corner parking" style={(isSelectingAuctionProperty || (networkMode==='online' && ['thinking', 'announcing'].includes(auctionState?.status))) ? {filter: 'grayscale(100%) brightness(0.6)', transition: 'filter 0.3s'} : {transition: 'filter 0.3s'}}>
          <img src={parkingIcon} alt="Free Parking" className="corner-icon" />
        </div>
        
        <div className="corner robbank" style={(isSelectingAuctionProperty || (networkMode==='online' && ['thinking', 'announcing'].includes(auctionState?.status))) ? {filter: 'grayscale(100%) brightness(0.6)', transition: 'filter 0.3s'} : {transition: 'filter 0.3s'}}>
          <span className="rob-text">ROB</span>
          <img src={robBankIcon} alt="Rob Bank" className="corner-icon-center" />
          <span className="bank-text">BANK</span>
        </div>
        
        <div className="corner jail" style={(isSelectingAuctionProperty || (networkMode==='online' && ['thinking', 'announcing'].includes(auctionState?.status))) ? {filter: 'grayscale(100%) brightness(0.6)', transition: 'filter 0.3s'} : {transition: 'filter 0.3s'}}>
          <span className="jail-text">JAIL</span>
          <img src={jailIcon} alt="Jail" className="corner-icon-center" />
        </div>

        {/* Bottom Row */}
        {bottomRow.map((tile, index) => {
          const tileIndex = index + 1;
          const ownerStyle = getOwnerStyle(tileIndex);
          const auctionStyle = getAuctionSelectionStyle(tileIndex);
          const dealStyle = getDealSelectionStyle(tileIndex);
          const buildStyle = getBuildSelectionStyle(tileIndex);
          const warStyle = getWarSelectionStyle(tileIndex);
          return (
            <div 
              key={tile.id}
              className={`tile horizontal ${tile.type} ${getTileThemeClass(tile.color)}`}
              style={{...getTileStyle(index, 'bottom', tile.color), ...auctionStyle, ...dealStyle, ...buildStyle, ...warStyle}}
              onClick={() => handleTileClick(tileIndex)}
            >
              {renderUpgrades(tileIndex, 'bottom')}
              <span className="tile-name">{tile.name}</span>
              {tile.icon && <span className="tile-icon"><BoardIcon type={tile.icon} /></span>}
              {tile.price && (
                <span 
                  className={`tile-price ${ownerStyle ? 'owned' : ''}`}
                  style={ownerStyle || {}}
                >
                  {ownerStyle ? calculateRent(tileIndex) : tile.price}
                </span>
              )}
              {/* Green Plus for Auction Selection */}
              {pendingAuctionProperty?.tileIndex === tileIndex && (
                <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'36px',color:'#4CAF50',textShadow:'0 0 8px #000',pointerEvents:'none'}}>+</div>
              )}
              {/* Deal Selection Indicator */}
              {renderDealIndicator(tileIndex)}
            </div>
          );
        })}

        {/* Left Column */}
        {leftColumn.map((tile, index) => {
          const tileIndex = index + 11;
          const ownerStyle = getOwnerStyle(tileIndex);
          const auctionStyle = getAuctionSelectionStyle(tileIndex);
          const dealStyle = getDealSelectionStyle(tileIndex);
          const buildStyle = getBuildSelectionStyle(tileIndex);
          const warStyle = getWarSelectionStyle(tileIndex);
          return (
            <div 
              key={tile.id}
              className={`tile vertical left ${tile.type} ${getTileThemeClass(tile.color)}`}
              style={{...getTileStyle(index, 'left', tile.color), ...auctionStyle, ...dealStyle, ...buildStyle, ...warStyle}}
              onClick={() => handleTileClick(tileIndex)}
            >
              {renderUpgrades(tileIndex, 'left')}
              <span className="tile-name">{tile.name}</span>
              {tile.icon && <span className="tile-icon"><BoardIcon type={tile.icon} /></span>}
              {tile.price && (
                <span 
                  className={`tile-price ${ownerStyle ? 'owned' : ''}`}
                  style={ownerStyle || {}}
                >
                  {ownerStyle ? calculateRent(tileIndex) : tile.price}
                </span>
              )}
              {pendingAuctionProperty?.tileIndex === tileIndex && (
                <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'36px',color:'#4CAF50',textShadow:'0 0 8px #000',pointerEvents:'none'}}>+</div>
              )}
              {renderDealIndicator(tileIndex)}
            </div>
          );
        })}

        {/* Top Row */}
        {topRow.map((tile, index) => {
          const tileIndex = index + 19;
          const ownerStyle = getOwnerStyle(tileIndex);
          const auctionStyle = getAuctionSelectionStyle(tileIndex);
          const dealStyle = getDealSelectionStyle(tileIndex);
          const buildStyle = getBuildSelectionStyle(tileIndex);
          const warStyle = getWarSelectionStyle(tileIndex);
          return (
            <div 
              key={tile.id}
              className={`tile horizontal ${tile.type} ${getTileThemeClass(tile.color)}`}
              style={{...getTileStyle(index, 'top', tile.color), ...auctionStyle, ...dealStyle, ...buildStyle, ...warStyle}}
              onClick={() => handleTileClick(tileIndex)}
            >
              {renderUpgrades(tileIndex, 'top')}
              <span className="tile-name">{tile.name}</span>
              {tile.icon && <span className="tile-icon"><BoardIcon type={tile.icon} /></span>}
              {tile.price && (
                <span 
                  className={`tile-price ${ownerStyle ? 'owned' : ''}`}
                  style={ownerStyle || {}}
                >
                  {ownerStyle ? calculateRent(tileIndex) : tile.price}
                </span>
              )}
              {pendingAuctionProperty?.tileIndex === tileIndex && (
                <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'36px',color:'#4CAF50',textShadow:'0 0 8px #000',pointerEvents:'none'}}>+</div>
              )}
              {renderDealIndicator(tileIndex)}
            </div>
          );
        })}

        {/* Right Column */}
        {rightColumn.map((tile, index) => {
          const tileIndex = index + 29;
          const ownerStyle = getOwnerStyle(tileIndex);
          const auctionStyle = getAuctionSelectionStyle(tileIndex);
          const dealStyle = getDealSelectionStyle(tileIndex);
          const buildStyle = getBuildSelectionStyle(tileIndex);
          const warStyle = getWarSelectionStyle(tileIndex);
          return (
            <div 
              key={tile.id}
              className={`tile vertical right ${tile.type} ${getTileThemeClass(tile.color)}`}
              style={{...getTileStyle(index, 'right', tile.color), ...auctionStyle, ...dealStyle, ...buildStyle, ...warStyle}}
              onClick={() => handleTileClick(tileIndex)}
            >
              {renderUpgrades(tileIndex, 'right')}
              <span className="tile-name">{tile.name}</span>
              {tile.icon && <span className="tile-icon"><BoardIcon type={tile.icon} /></span>}
              {tile.price && (
                <span 
                  className={`tile-price ${ownerStyle ? 'owned' : ''}`}
                  style={ownerStyle || {}}
                >
                  {ownerStyle ? calculateRent(tileIndex) : tile.price}
                </span>
              )}
              {pendingAuctionProperty?.tileIndex === tileIndex && (
                <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'36px',color:'#4CAF50',textShadow:'0 0 8px #000',pointerEvents:'none'}}>+</div>
              )}
              {renderDealIndicator(tileIndex)}
            </div>
          );
        })}

        {/* Center Area */}
        <div className="board-center">
          {/* Decorative Elements */}
          <div className="center-decorations">
            <div className="yacht"><YachtIcon size={36} /></div>
          </div>

          {/* Jail Arrest Modal (Placed in local center scope) */}
          {/* Jail Arrest Modal (Placed in local center scope) */}
          {showArrestModal && (
            <div style={{ 
              position: 'absolute', 
              inset: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 50,
              pointerEvents: 'none' // Allow clicks to pass through wrapper
            }}>
                <div className="buy-modal" style={{ 
                  border: '4px solid #D32F2F', 
                  maxWidth: '300px',
                  boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                  pointerEvents: 'auto', // Re-enable clicks
                  position: 'relative'
                }}>
                  <div className="modal-heading" style={{ background: '#D32F2F' }}>
                     <span className="modal-heading-text">ARRESTED!</span>
                  </div>
                  <div className="modal-body">
                     <div style={{ textAlign: 'center', margin: '15px 0' }}>
                        <div style={{ fontSize: '16px', marginBottom: '10px' }}>
                          You have been arrested for <span style={{ fontWeight: 'bold', color: '#D32F2F', fontSize: '18px' }}>{arrestDuration}</span> turns.
                        </div>
                        <div style={{ fontSize: '40px', margin: '10px 0' }}>👮‍♂️</div>
                        <div style={{ fontSize: '13px', color: '#5D4037', marginTop: '10px' }}>
                           You won't collect rent until jailed time is served.
                        </div>
                     </div>
                     
                     <div className="modal-buttons">
                        <button 
                          className="modal-btn buy" 
                          style={{ background: '#D32F2F', width: '100%' }}
                          onClick={() => {
                              setShowArrestModal(false);
                              handleEndTurn();
                          }}
                        >
                          I UNDERSTAND
                        </button>
                     </div>
                  </div>
                </div>
            </div>
          )}
          
          {/* Jail Action Modal (Bail / Skip) */}
          {showJailActionModal && (
             <div style={{ 
              position: 'absolute', 
              inset: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 60,
              pointerEvents: 'none'
            }}>
                <div className="buy-modal" style={{ 
                  border: '4px solid #2196F3', 
                  maxWidth: '300px',
                  boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                  pointerEvents: 'auto',
                  position: 'relative'
                }}>
                  <div className="modal-heading" style={{ background: 'linear-gradient(180deg, #FFB74D, #FF9800)' }}>
                     <span className="modal-heading-text">JAIL OPTIONS</span>
                  </div>
                  <div className="modal-body">
                     <div style={{ textAlign: 'center', margin: '15px 0' }}>
                        <div style={{ fontSize: '16px', marginBottom: '10px' }}>
                          Turns in Jail: <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{jailStatus[currentPlayer]}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#5D4037' }}>
                           Pay bail to leave now, or skip turn to serve time.
                        </div>
                     </div>
                     
                     <div className="modal-buttons" style={{ display: 'flex', gap: '10px' }}>
                        <button 
                          className="modal-btn" 
                          style={{ background: '#D32F2F', flex: 1, color: 'white' }}
                          onClick={handleJailSkip}
                        >
                          SKIP TURN
                        </button>
                        <button 
                          className="modal-btn" 
                          style={{ background: '#4CAF50', flex: 1, color: 'white' }}
                          onClick={handleJailPay}
                        >
                          GO OUT (${
                            jailStatus[currentPlayer] === 3 ? 1000 : 
                            jailStatus[currentPlayer] === 2 ? 500 : 200
                          })
                        </button>
                     </div>
                  </div>
                </div>
            </div>
          )}

          {/* Dice Area */}
          <div className="dice-area">
            <div className="dice-container">
              <div className={`dice ${isRolling ? 'rolling-left' : ''}`}>
                {renderDiceDots(diceValues[0])}
              </div>
              <div className={`dice ${isRolling ? 'rolling-right' : ''}`}>
                {renderDiceDots(diceValues[1])}
              </div>
            </div>
            <div className="button-group">
              {/* Only show buttons if offline OR it's this player's turn */}
              {(networkMode === 'offline' || myPlayerIndex === currentPlayer) && (
                <>
                  {/* Jail Controls */}
                  {jailStatus[currentPlayer] > 0 ? (
                    <>
                       <button 
                        className="buy-button" 
                        onClick={() => setShowJailActionModal(true)}
                        style={{ background: '#2196F3', gridColumn: 1 }} 
                      >
                        GO OUT
                      </button>
                      <button 
                        className="roll-button done" 
                        onClick={handleJailSkip} 
                        style={{ background: '#4CAF50', gridColumn: 2 }} 
                      >
                        DONE
                      </button>
                    </>
                  ) : (
                    /* Normal Controls */
                    <>
                      {/* Show buy button only when player can afford the property */}
                      {buyingProperty && !showBuyModal && !buyingProperty.isTravelOffer && (
                        playerMoney[currentPlayer] >= buyingProperty.price ? (
                          <button 
                            className="buy-button" 
                            onClick={() => setShowBuyModal(true)}
                          >
                            BUY
                          </button>
                        ) : (
                          <button 
                            className="buy-button" 
                            style={{ opacity: 0.5 }}
                            onClick={() => showToast(`Not enough money! Need $${buyingProperty.price.toLocaleString()}`)}
                          >
                            BUY
                          </button>
                        )
                      )}
    
                      {buyingProperty && buyingProperty.isTravelOffer && (
                        <button 
                          className="buy-button" 
                          onClick={handleTravelStart}
                          style={{ background: 'linear-gradient(to bottom, #2196F3, #1976D2)' }}
                        >
                          TRAVEL
                        </button>
                      )}
                      <button 
                        className={`roll-button ${turnFinished ? 'done' : ''} ${(!buyingProperty || showBuyModal) ? 'solo' : ''}`} 
                        onClick={() => {
                          if (turnFinished || skippedTurns[currentPlayer]) {
                            // If balance is negative, show bankruptcy modal instead of ending turn
                            if (playerMoney[currentPlayer] < 0) {
                              setShowBankruptcyModal(true);
                            } else {
                              handleEndTurn();
                            }
                          } else {
                            rollDice();
                          }
                        }} 
                        tabIndex="-1" 
                        disabled={isLocalMoving || (!turnFinished && !skippedTurns[currentPlayer] && (isRolling || isProcessingTurn))}
                      >
                        {isLocalMoving ? 'MOVING...' : skippedTurns[currentPlayer] ? 'SKIP TURN' : turnFinished ? 'DONE' : 'ROLL'}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action Buttons - Always visible so players with negative balance can take loans or sell properties */}
          <div className="action-buttons">
            <button className="action-btn build" onClick={handleBuild}>
              <img src={buildIcon} alt="Build" className="btn-icon-img" />
            </button>
            <button className="action-btn sell" onClick={handleSell}>
              <img src={sellIcon} alt="Sell" className="btn-icon-img" />
            </button>
            <button className="action-btn bank" onClick={handleBank}>
              <img src={bankIcon} alt="Bank" className="btn-icon-img" />
            </button>
            <button className="action-btn deal" onClick={handleDeal}>
              <img src={dealIcon} alt="Deal" className="btn-icon-img" />
            </button>
            {/* Debug Test Buttons Removed */}
          </div>

      {/* Deal Modal */}
      {showDealModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal">
            {/* Header */}
            <div className="modal-heading">
              <span className="modal-heading-text">
                {dealPhase === 'select' ? 'Choose Player' : 'Make a Deal'}
              </span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              {dealPhase === 'select' ? (
                /* Player Selection Phase */
                <div className="deal-player-grid">
                  {gamePlayers.map((player, idx) => {
                    if (idx === currentPlayer) return null; // Skip active player
                    return (
                      <div 
                        key={idx} 
                        className="deal-player-item"
                        onClick={() => handleDealPlayerSelect(idx)}
                      >
                        <img src={player.avatar} alt={player.name} className="deal-player-avatar" />
                        <span className="deal-player-name">{player.name}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Configuration Phase */
                <div className="deal-config-container">
                  {/* Left Column - Active Player (Giving) */}
                  <div className="deal-column deal-give-column">
                    <div className="deal-column-header">
                      <img src={gamePlayers[currentPlayer]?.avatar} alt="" className="deal-header-avatar" />
                      <span>{gamePlayers[currentPlayer]?.name}</span>
                      <span className="deal-subtitle">You Give</span>
                    </div>
                    <div className="deal-property-list">
                      {dealGiveProperties.map(tileIndex => {
                        const tile = getPropertyByTileIndex(tileIndex);
                        return (
                          <div 
                            key={tileIndex} 
                            className="deal-property-box"
                            style={{ background: tile?.color || '#888' }}
                          >
                            {tile?.name || `Tile ${tileIndex}`}
                          </div>
                        );
                      })}
                      {dealGiveProperties.length === 0 && (
                        <div className="deal-empty-hint">Tap your properties on the board</div>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="deal-divider"></div>

                  {/* Right Column - Selected Player (Receiving) */}
                  <div className="deal-column deal-receive-column">
                    <div className="deal-column-header">
                      <img src={gamePlayers[selectedDealPlayer]?.avatar} alt="" className="deal-header-avatar" />
                      <span>{gamePlayers[selectedDealPlayer]?.name}</span>
                      <span className="deal-subtitle">You Get</span>
                    </div>
                    <div className="deal-property-list">
                      {dealReceiveProperties.map(tileIndex => {
                        const tile = getPropertyByTileIndex(tileIndex);
                        return (
                          <div 
                            key={tileIndex} 
                            className="deal-property-box"
                            style={{ background: tile?.color || '#888' }}
                          >
                            {tile?.name || `Tile ${tileIndex}`}
                          </div>
                        );
                      })}
                      {dealReceiveProperties.length === 0 && (
                        <div className="deal-empty-hint">Tap their properties on the board</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Money Slider (only in configure phase) - Bidirectional */}
              {dealPhase === 'configure' && (
                <div className="deal-money-section">
                  <div className="deal-money-label">
                    {dealMoneyOffer === 0 ? (
                      <span>No money exchange</span>
                    ) : dealMoneyOffer > 0 ? (
                      <span style={{ color: '#f44336' }}>You give: ${dealMoneyOffer.toLocaleString()}</span>
                    ) : (
                      <span style={{ color: '#4CAF50' }}>You get: ${Math.abs(dealMoneyOffer).toLocaleString()}</span>
                    )}
                  </div>
                  <div className="deal-slider-row">
                    <button 
                      className="deal-slider-btn" 
                      onClick={() => setDealMoneyOffer(prev => Math.max(-(playerMoney[selectedDealPlayer] || 0), prev - 100))}
                      style={{ background: '#4CAF50' }}
                    >
                      −
                    </button>
                    <input 
                      type="range" 
                      min={-(playerMoney[selectedDealPlayer] || 0)}
                      max={playerMoney[currentPlayer] || 0}
                      step="100"
                      value={dealMoneyOffer}
                      onChange={(e) => setDealMoneyOffer(parseInt(e.target.value))}
                      className="deal-money-slider"
                      style={{ 
                        background: dealMoneyOffer === 0 
                          ? '#888' 
                          : dealMoneyOffer > 0 
                            ? `linear-gradient(to right, #888 50%, #f44336 50%)` 
                            : `linear-gradient(to left, #888 50%, #4CAF50 50%)` 
                      }}
                    />
                    <button 
                      className="deal-slider-btn" 
                      onClick={() => setDealMoneyOffer(prev => Math.min(playerMoney[currentPlayer] || 0, prev + 100))}
                      style={{ background: '#f44336' }}
                    >
                      +
                    </button>
                  </div>
                  <div className="deal-slider-labels">
                    <span style={{ color: '#4CAF50' }}>← Get</span>
                    <span style={{ color: '#f44336' }}>Give →</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="modal-buttons">
                <button className="modal-btn cancel" onClick={handleDealCancel}>
                  CANCEL
                </button>
                {dealPhase === 'configure' && (
                  <button 
                    className="modal-btn buy" 
                    onClick={handleDealOffer}
                    disabled={dealGiveProperties.length === 0 && dealReceiveProperties.length === 0 && dealMoneyOffer === 0}
                    style={{ opacity: (dealGiveProperties.length === 0 && dealReceiveProperties.length === 0 && dealMoneyOffer === 0) ? 0.5 : 1 }}
                  >
                    OFFER
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deal Review Modal (for recipient) */}
      {showDealReviewModal && incomingDeal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal deal-review-modal">
            <div className="modal-heading">
              <span className="modal-heading-text">Deal Offer</span>
            </div>
            <div className="modal-body">
              <div className="deal-review-header">
                {gamePlayers[incomingDeal.proposer]?.name} wants to trade!
              </div>
              
              <div className="deal-config-container">
                {/* What you give */}
                <div className="deal-column">
                  <div className="deal-column-header">
                    <span className="deal-subtitle" style={{ color: '#f44336' }}>You Give</span>
                  </div>
                  <div className="deal-property-list">
                    {incomingDeal.receiveProperties.map(tileIndex => {
                      const tile = getPropertyByTileIndex(tileIndex);
                      return (
                        <div key={tileIndex} className="deal-property-box" style={{ background: tile?.color || '#888' }}>
                          {tile?.name}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="deal-divider">
                  <span className="deal-arrow deal-arrow-give">→</span>
                  <span className="deal-arrow deal-arrow-receive">←</span>
                </div>

                {/* What you receive */}
                <div className="deal-column">
                  <div className="deal-column-header">
                    <span className="deal-subtitle" style={{ color: '#4CAF50' }}>You Get</span>
                  </div>
                  <div className="deal-property-list">
                    {incomingDeal.giveProperties.map(tileIndex => {
                      const tile = getPropertyByTileIndex(tileIndex);
                      return (
                        <div key={tileIndex} className="deal-property-box" style={{ background: tile?.color || '#888' }}>
                          {tile?.name}
                        </div>
                      );
                    })}
                    {incomingDeal.moneyOffer > 0 && (
                      <div className="deal-property-box" style={{ background: '#4CAF50' }}>
                        +${incomingDeal.moneyOffer.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-buttons">
                <button className="modal-btn cancel" onClick={handleDealDeny}>
                  DENY
                </button>
                <button className="modal-btn buy" onClick={handleDealAccept}>
                  ACCEPT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deal Result Modal */}
      {showDealResultModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal deal-result-modal">
            <div className="modal-heading">
              <span className="modal-heading-text">Deal Result</span>
            </div>
            <div className="modal-body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div 
                className="deal-result-text" 
                style={{ 
                  fontFamily: 'Junegull, sans-serif', 
                  fontSize: '20px', 
                  color: '#4a2c18',
                  marginBottom: '20px'
                }}
              >
                {dealResultMessage}
              </div>
              <div className="modal-buttons" style={{ justifyContent: 'center', marginTop: '10px', width: '100%' }}>
                <button 
                  className="modal-btn buy" 
                  style={{ flex: 'none', width: '140px', height: '45px', padding: '0' }}
                  onClick={() => {
                    setShowDealResultModal(false);
                    setDealResultMessage('');
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bank Modal */}
      {showBankModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal">
            <div className="modal-heading">
              <span className="modal-heading-text">Bank</span>
            </div>
            <div className="modal-body">
              {bankPhase === 'entry' ? (
                <>
                  <div className="modal-details" style={{ textAlign: 'center', marginBottom: '20px' }}>
                    {!playerLoans[currentPlayer] ? (
                      <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '24px', color: '#4a2c18' }}>
                        Need some extra cash?
                      </div>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
                        <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '20px', color: '#4a2c18', marginBottom: '10px' }}>
                          Active Loan Summary
                        </div>
                        <div className="modal-row" style={{ fontSize: '15px', marginBottom: '8px' }}>
                          <span>Repay Amount:</span>
                          <span className="modal-value" style={{ color: '#f44336' }}>${playerLoans[currentPlayer].repayAmount.toLocaleString()}</span>
                        </div>
                        <div className="modal-row" style={{ fontSize: '15px', marginBottom: '8px' }}>
                          <span>Laps Remaining:</span>
                          <span className="modal-value">{playerLoans[currentPlayer].lapsRemaining}</span>
                        </div>
                        <div className="modal-row" style={{ fontSize: '15px' }}>
                          <span>Repay Tile:</span>
                          <span className="modal-value">{getTileName(playerLoans[currentPlayer].loanStartTile)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="modal-buttons">
                    <button className="modal-btn cancel" onClick={() => setShowBankModal(false)}>
                      QUIT
                    </button>
                    {playerLoans[currentPlayer] ? (
                      <button className="modal-btn buy" onClick={handleRepayLoanManual}>
                        REPAY LOAN
                      </button>
                    ) : (
                      <button className="modal-btn buy" onClick={() => setBankPhase('loan')}>
                        TAKE LOAN
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="loan-config-section">
                    <div className="modal-details" style={{ background: 'rgba(255,255,255,0.1)', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
                      <div className="modal-row" style={{ fontSize: '16px' }}>
                        <span>Repay Term:</span>
                        <span className="modal-value">3 Laps</span>
                      </div>
                      <div className="modal-row" style={{ fontSize: '16px' }}>
                        <span>Interest Rate:</span>
                        <span className="modal-value">30%</span>
                      </div>
                      <div className="modal-divider"></div>
                      <div className="modal-row">
                        <span>Receive:</span>
                        <span className="modal-value" style={{ color: '#4CAF50' }}>${loanSliderValue.toLocaleString()}</span>
                      </div>
                      <div className="modal-row">
                        <span>Repay:</span>
                        <span className="modal-value" style={{ color: '#f44336' }}>${Math.round(loanSliderValue * 1.3).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="deal-money-section">
                      <div className="deal-slider-row">
                        <button 
                          className="deal-slider-btn" 
                          onClick={() => setLoanSliderValue(prev => Math.max(0, prev - 100))}
                          style={{ background: '#f44336' }}
                        >
                          −
                        </button>
                        <input 
                          type="range" 
                          min="0"
                          max="3000"
                          step="100"
                          value={loanSliderValue}
                          onChange={(e) => setLoanSliderValue(parseInt(e.target.value))}
                          className="deal-money-slider"
                          style={{ background: '#888' }}
                        />
                        <button 
                          className="deal-slider-btn" 
                          onClick={() => setLoanSliderValue(prev => Math.min(3000, prev + 100))}
                          style={{ background: '#4CAF50' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="modal-buttons" style={{ marginTop: '20px' }}>
                    <button className="modal-btn cancel" onClick={() => setBankPhase('entry')}>
                      BACK
                    </button>
                    <button className="modal-btn buy" onClick={handleConfirmLoan} disabled={loanSliderValue <= 0}>
                      TAKE
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bank Debit Modal */}
      {showBankDebitModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal">
            <div className="modal-heading">
              <span className="modal-heading-text">Bank Alert</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
               <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '18px', color: '#4a2c18', marginBottom: '20px' }}>
                 The bank has debited your loan.
               </div>
               <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                 <button className="modal-btn buy" style={{ flex: 'none', minWidth: '120px' }} onClick={() => setShowBankDebitModal(false)}>
                   OK
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Bankruptcy Modal */}
      {showBankruptcyModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal">
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #B71C1C 0%, #7f0000 100%)' }}>
              <span className="modal-heading-text">⚠️ BANKRUPTCY</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
               <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '18px', color: '#B71C1C', marginBottom: '10px' }}>
                 Your balance is below $0!
               </div>
               <div style={{ fontSize: '14px', color: '#5D4037', marginBottom: '20px', lineHeight: '1.5' }}>
                 You can take a loan from the Bank, or sell property upgrades to recover.
               </div>
               <div className="modal-buttons" style={{ gap: '10px' }}>
                 <button 
                   className="modal-btn" 
                   style={{ background: '#4CAF50', color: 'white', flex: 1 }}
                   onClick={() => setShowBankruptcyModal(false)}
                 >
                   NO
                 </button>
                 <button 
                   className="modal-btn" 
                   style={{ background: '#D32F2F', color: 'white', flex: 1 }}
                   onClick={handleBankrupt}
                 >
                   BANKRUPT
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Build No Monopoly Modal */}
      {buildNoMonopolyModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal">
            <div className="modal-heading" style={{ background: '#757575' }}>
              <span className="modal-heading-text">Build</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
               <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '18px', color: '#4a2c18', marginBottom: '20px' }}>
                 You have no monopoly properties to build on.
               </div>
               <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                 <button 
                    className="modal-btn cancel" 
                    style={{ flex: 'none', minWidth: '120px' }} 
                    onClick={() => setBuildNoMonopolyModal(false)}
                 >
                   CLOSE
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Build Modal (Main) */}
      {showBuildModal && (
        <div className="modal-overlay modal-overlay-inline" style={{ pointerEvents: 'none', background: 'transparent' }}>
          <div className="buy-modal deal-modal bank-modal" style={{ pointerEvents: 'auto', marginTop: '5vh', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', maxHeight: '80vh', overflow: 'hidden' }}>
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #4CAF50 0%, #2E7D32 100%)' }}>
              <span className="modal-heading-text">🏗️ BUILD MODE</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '10px' }}>
               <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '24px', color: '#2E7D32', marginBottom: '8px' }}>
                 Cost: ${buildTotalCost.toLocaleString()}
               </div>
               
               {/* Compact Property List with Levels */}
               <div style={{ 
                 maxHeight: '100px', 
                 overflowY: 'auto', 
                 marginBottom: '8px',
                 background: 'rgba(255,255,255,0.5)',
                 borderRadius: '6px',
                 padding: '4px',
                 fontSize: '10px'
               }}>
                 {getMonopolyTiles(currentPlayer).map(tileIdx => {
                   const prop = RENT_DATA[tileIdx];
                   const level = propertyLevels[tileIdx] || 0;
                   const levelText = level === 0 ? '-' : level === 5 ? '🏨' : `🏠${level}`;
                   return (
                     <div 
                       key={tileIdx} 
                       style={{ 
                         display: 'flex', 
                         justifyContent: 'space-between', 
                         padding: '2px 5px',
                         borderBottom: '1px solid rgba(0,0,0,0.05)',
                         cursor: 'pointer'
                       }}
                       onClick={() => handleBuildTileTap(tileIdx)}
                     >
                       <span style={{ color: '#333' }}>{prop?.name || `Tile ${tileIdx}`}</span>
                       <span style={{ 
                         color: level > 0 ? '#2E7D32' : '#aaa',
                         fontWeight: level > 0 ? 'bold' : 'normal'
                       }}>{levelText}</span>
                     </div>
                   );
                 })}
               </div>
               
               <div style={{ fontSize: '10px', color: '#5D4037', marginBottom: '8px' }}>
                 Tap property above or on board to build.
               </div>
               <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                 <button 
                    className="modal-btn buy" 
                    style={{ flex: 'none', minWidth: '100px', background: 'linear-gradient(to bottom, #4CAF50 0%, #2E7D32 100%)' }} 
                    onClick={closeBuildMode}
                 >
                   BUILD
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Sell No Buildings Modal */}
      {sellNoBuildingsModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal" style={{ pointerEvents: 'auto', marginTop: '15vh' }}>
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #FF9800 0%, #F57C00 100%)' }}>
              <span className="modal-heading-text">⚠️ SELL BUILDINGS</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
               <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '18px', color: '#4a2c18', marginBottom: '20px' }}>
                 You don't have any buildings to sell.
               </div>
               <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                 <button 
                    className="modal-btn cancel" 
                    style={{ flex: 'none', minWidth: '120px' }} 
                    onClick={() => setSellNoBuildingsModal(false)}
                 >
                   CLOSE
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Sell Modal (Main) */}
      {showSellModal && (
        <div className="modal-overlay modal-overlay-inline" style={{ pointerEvents: 'none', background: 'transparent' }}>
          <div className="buy-modal deal-modal bank-modal" style={{ pointerEvents: 'auto', marginTop: '5vh', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', maxHeight: '80vh', overflow: 'hidden' }}>
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #FF9800 0%, #F57C00 100%)' }}>
              <span className="modal-heading-text">💰 SELL MODE</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '10px' }}>
               <div style={{ fontFamily: 'Junegull, sans-serif', fontSize: '24px', color: '#F57C00', marginBottom: '8px' }}>
                 Refund: ${sellTotalRefund.toLocaleString()}
               </div>
               
               {/* Compact Property List */}
               <div style={{ 
                 maxHeight: '100px', 
                 overflowY: 'auto', 
                 marginBottom: '8px',
                 background: 'rgba(255,255,255,0.5)',
                 borderRadius: '6px',
                 padding: '4px',
                 fontSize: '10px'
               }}>
                 {Object.keys(propertyOwnership).map(Number).filter(idx => propertyOwnership[idx] === currentPlayer && (sellPreviewLevels[idx] || 0) > 0).map(tileIdx => {
                   const prop = RENT_DATA[tileIdx];
                   const level = sellPreviewLevels[tileIdx] || 0;
                   const levelText = level === 5 ? '🏨' : `🏠${level}`;
                   return (
                     <div 
                       key={tileIdx} 
                       style={{ 
                         display: 'flex', 
                         justifyContent: 'space-between', 
                         padding: '2px 5px',
                         borderBottom: '1px solid rgba(0,0,0,0.05)',
                         cursor: 'pointer'
                       }}
                       onClick={() => handleSellTileTap(tileIdx)}
                     >
                       <span style={{ color: '#333' }}>{prop?.name || `Tile ${tileIdx}`}</span>
                       <span style={{ color: '#F57C00', fontWeight: 'bold' }}>{levelText}</span>
                     </div>
                   );
                 })}
               </div>
               
               <div style={{ fontSize: '10px', color: '#5D4037', marginBottom: '8px' }}>
                 Tap property to sell (50% refund).
               </div>
               <div className="modal-buttons" style={{ justifyContent: 'center', gap: '10px' }}>
                 <button 
                    className="modal-btn cancel" 
                    style={{ flex: 'none', minWidth: '80px', background: '#e0e0e0', color: '#333' }} 
                    onClick={cancelSellMode}
                 >
                   CANCEL
                 </button>
                 <button 
                    className="modal-btn buy" 
                    style={{ flex: 'none', minWidth: '80px', background: 'linear-gradient(to bottom, #FF9800 0%, #F57C00 100%)' }} 
                    onClick={closeSellMode}
                 >
                   SELL
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu Modal */}
      {showMenuModal && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal" style={{ pointerEvents: 'auto', marginTop: '15vh', minWidth: '280px' }}>
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #607D8B 0%, #455A64 100%)' }}>
              <span className="modal-heading-text">☰ MENU</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px' }}>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 <button 
                    className="modal-btn buy" 
                    style={{ width: '100%', background: 'linear-gradient(to bottom, #4CAF50 0%, #2E7D32 100%)' }} 
                    onClick={closeMenu}
                 >
                   ▶️ RESUME
                 </button>
                 <button 
                    className="modal-btn" 
                    style={{ width: '100%', background: 'linear-gradient(to bottom, #2196F3 0%, #1565C0 100%)', color: 'white' }} 
                    onClick={openSettings}
                 >
                   ⚙️ SETTINGS
                 </button>
                 <button 
                    className="modal-btn cancel" 
                    style={{ width: '100%', background: 'linear-gradient(to bottom, #f44336 0%, #c62828 100%)', color: 'white' }} 
                    onClick={handleExitGame}
                 >
                   🚪 EXIT GAME
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="modal-overlay">
          <div className="buy-modal deal-modal bank-modal" style={{ pointerEvents: 'auto', marginTop: '20vh' }}>
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #f44336 0%, #c62828 100%)' }}>
              <span className="modal-heading-text">⚠️ EXIT GAME</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '14px', color: '#4a2c18', marginBottom: '15px' }}>
                 Are you sure you want to exit?<br/>
                  <span style={{ fontSize: '12px', color: '#5D4037' }}>Your properties will be released and you cannot rejoin.</span>
                </div>
                <div className="modal-buttons" style={{ justifyContent: 'center', gap: '15px' }}>
                  <button 
                     className="modal-btn" 
                     style={{ flex: 'none', minWidth: '100px', background: '#e0e0e0', color: '#333' }} 
                     onClick={() => setShowExitConfirm(false)}
                  >
                    CANCEL
                  </button>
                  <button 
                     className="modal-btn cancel" 
                     style={{ flex: 'none', minWidth: '100px', background: 'linear-gradient(to bottom, #f44336 0%, #c62828 100%)', color: 'white' }} 
                     onClick={handleExitGame}
                  >
                    EXIT
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}



      {/* Buying Modal */}
      {(showBuyModal || (isModalClosing && closingModal === 'buy')) && buyingProperty && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
            {/* Header */}
            <div className="modal-heading">
              <span className="modal-heading-text">Buying</span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              <div className="modal-city-name">{buyingProperty.name}</div>
              <div className="modal-divider"></div>
              <div className="modal-details">
                <div className="modal-row">
                  <span>cost</span>
                  <span className="modal-value">
                    {activeEffects[buyingProperty.buyerIndex]?.discount_50 ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '8px', fontSize: '0.8em' }}>
                          ${buyingProperty.price?.toLocaleString()}
                        </span>
                        <span style={{ color: '#4CAF50' }}>
                          ${Math.floor(buyingProperty.price / 2)?.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      `$${buyingProperty.price?.toLocaleString()}`
                    )}
                  </span>
                </div>
                <div className="modal-row">
                  <span>rent</span>
                  <span className="modal-value">${buyingProperty.rent?.toLocaleString()}</span>
                </div>
              </div>
              <div className="modal-buttons">
                <button className="modal-btn cancel" onClick={handleCancelBuy}>Cancel</button>
                <button className="modal-btn buy" onClick={handleBuyProperty}>Buy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rob Bank Modal */}
      {(showRobBankModal || (isModalClosing && closingModal === 'robbank')) && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
            {/* Header */}
            <div className="modal-heading" style={{ 
              background: robStatus === 'caught' 
                ? 'linear-gradient(to bottom, #C62828 0%, #B71C1C 100%)' 
                : robStatus === 'success'
                  ? 'linear-gradient(to bottom, #2E7D32 0%, #1B5E20 100%)'
                  : 'linear-gradient(to bottom, #1A237E 0%, #0D47A1 100%)' 
            }}>
              <span className="modal-heading-text">
                {robStatus === 'processing' ? 'ROBBING...' : 
                 robStatus === 'success' ? 'SUCCESS!' : 
                 robStatus === 'caught' ? 'BUSTED!' : 'ROB BANK'}
              </span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              {robStatus === 'idle' && (
                <>
                  <div className="modal-city-name">RISK IT ALL?</div>
                  <div className="modal-divider"></div>
                  <div className="modal-details" style={{ textAlign: 'center' }}>
                    <div className="modal-row" style={{ justifyContent: 'center', color: '#2E7D32' }}>
                      <span>WIN $1k - $10k</span>
                    </div>
                    <div className="modal-row" style={{ justifyContent: 'center', fontSize: '14px', margin: '5px 0' }}>
                      <span>OR</span>
                    </div>
                    <div className="modal-row" style={{ justifyContent: 'center', color: '#C62828' }}>
                      <span>GO TO JAIL</span>
                    </div>
                  </div>
                  
                  {/* Buttons - Only show for active player */}
                  {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                    <div className="modal-buttons">
                      <button className="modal-btn cancel" onClick={handleCancelBuy}>LEAVE</button>
                      <button className="modal-btn buy" onClick={handleRobBankAttempt}>ROB!</button>
                    </div>
                  ) : (
                    <div className="modal-buttons">
                      <div style={{ color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>Waiting for player...</div>
                    </div>
                  )}
                </>
              )}

              {robStatus === 'processing' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="modal-city-name" style={{ fontSize: '24px', marginBottom: '20px' }}>CRACKING SAFE...</div>
                  
                  <div className="cracking-progress">
                    <div className="cracking-bar" style={{ width: `${robProgress}%` }}></div>
                  </div>
                </div>
              )}

              {robStatus === 'success' && (
                <>
                  <div className="modal-city-name" style={{ color: '#2E7D32' }}>YOU STOLE</div>
                  <div className="modal-city-name" style={{ fontSize: '40px', color: '#2E7D32', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                    ${robResult.amount.toLocaleString()}
                  </div>
                  <div className="modal-buttons" style={{ marginTop: '20px' }}>
                    {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                      <button className="modal-btn buy" onClick={handleRobBankComplete} style={{ width: '100%' }}>COLLECT</button>
                    ) : (
                      <div style={{ color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>Waiting for player to collect...</div>
                    )}
                  </div>
                </>
              )}

              {robStatus === 'caught' && (
                <>
                  <div className="modal-city-name" style={{ color: '#C62828' }}>POLICE CAUGHT YOU!</div>
                  <div style={{ fontSize: '50px', textAlign: 'center', margin: '10px 0' }}>👮‍♂️</div>
                  <div className="modal-buttons" style={{ marginTop: '20px' }}>
                    {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                      <button className="modal-btn cancel" onClick={handleRobBankComplete} style={{ width: '100%' }}>GO TO JAIL</button>
                    ) : (
                      <div style={{ color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>Waiting for player...</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}



      {/* The Audit Modal (Dice Gamble) */}
      {(showAuditModal || (isModalClosing && closingModal === 'audit')) && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
            {/* Header */}
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #5D4037 0%, #3E2723 100%)' }}>
              <span className="modal-heading-text">🧾 THE AUDIT</span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              <div className="modal-city-name" style={{ fontSize: '18px', marginBottom: '15px' }}>
                {gamePlayers[currentPlayer]?.name || 'Player'} is being audited!
              </div>
              
              {/* Show dice that were rolled */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '15px' }}>
                <div className="dice" style={{ width: '50px', height: '50px' }}>
                  {renderDiceDots(auditDiceValues[0])}
                </div>
                <div className="dice" style={{ width: '50px', height: '50px' }}>
                  {renderDiceDots(auditDiceValues[1])}
                </div>
              </div>
              
              <div style={{ textAlign: 'center', fontSize: '15px', color: '#4A2C18', fontWeight: 'bold', marginBottom: '10px' }}>
                Rolled {auditDiceValues[0] + auditDiceValues[1]} × $300
              </div>
              
              <div className="modal-city-name" style={{ fontSize: '32px', color: '#C62828', marginTop: '10px' }}>
                TAX BILL: ${auditAmount.toLocaleString()}
              </div>
              
              <div className="modal-buttons" style={{ marginTop: '20px' }}>
                {(networkMode === 'offline' || myPlayerIndex === null || currentPlayer === myPlayerIndex) ? (
                  <button className="modal-btn cancel" onClick={handleAuditComplete} style={{ width: '100%' }}>
                    💸 PAY TAXES
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>
                    Waiting for {gamePlayers[currentPlayer]?.name || 'player'} to pay taxes...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Property War Modal */}
      {showWarModal && (
        <div className="modal-overlay">
          <div className="buy-modal war-modal">
            {/* Header */}
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #E91E63 0%, #C2185B 100%)' }}>
              <span className="modal-heading-text">⚔️ PROPERTY WAR ⚔️</span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              {/* Join Phase */}
              {warPhase === 'join' && (
                <>
                  <div className="modal-city-name" style={{ fontSize: '18px', marginBottom: '10px' }}>
                    {warMode === 'A' ? '🏠 STANDARD WAR' : '💰 CASH BATTLE'}
                  </div>
                  <div style={{ fontSize: '14px', marginBottom: '15px', color: '#5D4037', fontWeight: 'bold' }}>
                    {warMode === 'A' 
                      ? 'Pay $3,000 to compete for a random property!' 
                      : 'All properties sold! Pay $2,000 to compete for the Battle Pot!'}
                  </div>
                  
                  {/* Player Join Buttons */}
                  <div className="war-join-list" style={{ marginBottom: '15px' }}>
                    {gamePlayers.map((player, idx) => (
                      <div key={idx} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: '8px',
                        marginBottom: '6px',
                        background: warParticipants.includes(idx) ? '#e8f5e9' : '#f5f5f5',
                        borderRadius: '6px',
                        border: warParticipants.includes(idx) ? '2px solid #4CAF50' : '1px solid #ddd'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img src={player.avatar} alt={player.name} style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                          <span style={{ fontWeight: 'bold' }}>{player.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {/* Join/Withdraw Button Logic */}
                          {(networkMode !== 'online' || idx === myPlayerIndex) ? (
                            !warParticipants.includes(idx) ? (
                              <button 
                                className="modal-btn buy" 
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => handleWarJoin(idx)}
                                disabled={playerMoney[idx] < (warMode === 'A' ? 3000 : 2000)}
                              >
                                JOIN (${warMode === 'A' ? '3,000' : '2,000'})
                              </button>
                            ) : (
                              <button 
                                className="modal-btn cancel" 
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => handleWarWithdraw(idx)}
                              >
                                WITHDRAW
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: '12px', color: '#5D4037', fontWeight: 'bold', fontStyle: 'italic' }}>
                              {warParticipants.includes(idx) ? 'Joined' : 'Thinking...'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="modal-buttons" style={{ gap: '10px' }}>
                    {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                      <>
                        <button 
                          className="modal-btn cancel" 
                          onClick={() => {
                            sendGameAction('war_close', {});
                            setShowWarModal(false);
                            setWarPhase('idle');
                          }}
                          style={{ flex: 1 }}
                        >
                          CANCEL
                        </button>
                        <button 
                          className="modal-btn buy" 
                          onClick={handleWarStartProgress}
                          disabled={warParticipants.length < 2}
                          style={{ flex: 2, background: warParticipants.length >= 2 ? '#8B0000' : '#ccc' }}
                        >
                          START WAR ({warParticipants.length})
                        </button>
                      </>
                    ) : (
                      <div style={{ color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic', textAlign: 'center', width: '100%' }}>
                        Waiting for {gamePlayers[currentPlayer]?.name} to start...
                      </div>
                    )}
                  </div>
                </>
              )}
              
              {/* Progress Phase (Mode A only) */}
              {warPhase === 'progress' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="modal-city-name" style={{ fontSize: '20px', marginBottom: '20px' }}>SELECTING PROPERTY...</div>
                  <div style={{ 
                    width: '100%', 
                    height: '20px', 
                    backgroundColor: '#eee', 
                    borderRadius: '10px', 
                    overflow: 'hidden'
                  }}>
                    <div 
                      className="war-progress-bar"
                      style={{ 
                        width: '0%',
                        height: '100%', 
                        backgroundColor: '#E91E63',
                        borderRadius: '10px',
                        animation: 'warProgressFill 3s ease-out forwards'
                      }}
                    ></div>
                  </div>
                  <style>{`
                    @keyframes warProgressFill {
                      from { width: 0%; }
                      to { width: 100%; }
                    }
                  `}</style>
                </div>
              )}
              
              {/* Reveal Phase */}
              {warPhase === 'reveal' && warProperty && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '16px', color: '#5D4037', fontWeight: 'bold', marginBottom: '10px' }}>The war is for...</div>
                  <div className="modal-city-name" style={{ fontSize: '28px', color: '#8B0000' }}>
                    {warProperty.name}
                  </div>
                  <div style={{ fontSize: '14px', color: '#5D4037', fontWeight: 'bold', marginTop: '10px' }}>
                    (Worth ${warProperty.price?.toLocaleString()})
                  </div>
                </div>
              )}
              
              {/* Roll Phase - Ready to start */}
              {/* Tie Phase */}
              {warPhase === 'tie' && (
                <div className="war-tie-container">
                  <div style={{ fontSize: '32px', marginBottom: '2px' }}>⚔️</div>
                  <div className="war-tie-banner">
                    {warTieMessage || "IT'S A TIE!"}
                  </div>
                  
                  {/* Highlighted Tied Players Cards */}
                  {(() => {
                    const tiedList = (warTiedPlayers && warTiedPlayers.length > 0)
                      ? warTiedPlayers
                      : (() => {
                          if (!warRolls || Object.keys(warRolls).length === 0) return [];
                          const max = Math.max(...Object.values(warRolls));
                          return Object.entries(warRolls).filter(([_, r]) => r === max).map(([p]) => parseInt(p));
                        })();
                    return (
                      <div className="war-tied-players-row">
                        {tiedList.map((pIdx, index) => {
                          const player = gamePlayers[pIdx];
                          if (!player) return null;
                          const score = warTieRoll || warRolls[pIdx];
                          return (
                            <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {index > 0 && <span className="war-tie-vs">VS</span>}
                              <div className="war-tied-player-card">
                                <img src={player.avatar} alt={player.name} className="avatar-ring" />
                                <span className="player-name">{player.name}</span>
                                {score !== undefined && score !== null && (
                                  <span className="tied-score">🎲 {score}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div className="war-tie-subtitle" style={{ marginTop: '4px' }}>
                    ⚡ Sudden-death rematch starting...
                  </div>
                </div>
              )}

              {/* Roll Phase & Evaluating Phase (Combined) */}
              {(warPhase === 'roll' || warPhase === 'rolling' || warPhase === 'evaluating') && (
                <div style={{ textAlign: 'center', padding: '4px 0' }}>
                  <div className="modal-city-name" style={{ fontSize: '16px', marginBottom: '6px' }}>
                    {warPhase === 'evaluating'
                      ? '⏳ Calculating Result...'
                      : (warCurrentRoller !== null && gamePlayers[warParticipants[warCurrentRoller]])
                        ? `${gamePlayers[warParticipants[warCurrentRoller]]?.name}'s Turn`
                        : '🎲 Roll Dice'}
                  </div>
                  
                  {/* Dice Display */}
                  <div className="dice-container" style={{ margin: '4px 0', justifyContent: 'center' }}>
                    <div className={`dice ${warIsRolling ? 'rolling-left' : ''}`}>
                      {renderDiceDots(warDiceValues[0])}
                    </div>
                    <div className={`dice ${warIsRolling ? 'rolling-right' : ''}`}>
                      {renderDiceDots(warDiceValues[1])}
                    </div>
                  </div>
                  
                  {/* Previous Rolls */}
                  {Object.keys(warRolls).length > 0 && (
                    <div className="war-rolling-list" style={{ margin: '4px 0' }}>
                      {Object.entries(warRolls).map(([idx, roll]) => (
                        <div key={idx} style={{ 
                          padding: '4px 8px', 
                          marginBottom: '3px',
                          background: '#f0f0f0',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontWeight: 'bold',
                          fontSize: '13px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <img src={gamePlayers[parseInt(idx)]?.avatar} alt={gamePlayers[parseInt(idx)]?.name} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                            <span>{gamePlayers[parseInt(idx)]?.name}</span>
                          </div>
                          <span>🎲 {roll}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="modal-buttons" style={{ marginTop: '4px' }}>
                    {warPhase === 'evaluating' ? (
                      <div className="war-evaluating-notice">
                        ⏳ All rolls in! Determining winner...
                      </div>
                    ) : warCurrentRoller !== null ? (
                      <button 
                        className="modal-btn buy" 
                        onClick={handleWarDoRoll}
                        disabled={warIsRolling || (networkMode === 'online' && warParticipants[warCurrentRoller] !== myPlayerIndex)}
                        style={{ 
                          width: '100%', 
                          background: (warIsRolling || (networkMode === 'online' && warParticipants[warCurrentRoller] !== myPlayerIndex)) ? '#ccc' : '#8B0000',
                          cursor: (warIsRolling || (networkMode === 'online' && warParticipants[warCurrentRoller] !== myPlayerIndex)) ? 'not-allowed' : 'pointer',
                          padding: '8px 12px',
                          fontSize: '14px'
                        }}
                      >
                        {warIsRolling ? 'ROLLING...' : (networkMode === 'online' && warParticipants[warCurrentRoller] !== myPlayerIndex) ? `Waiting for ${gamePlayers[warParticipants[warCurrentRoller]]?.name}...` : '🎲 ROLL!'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
              
              {/* Result Phase */}
              {warPhase === 'result' && (
                <div className="war-result-container">
                  {/* Winner Announcement */}
                  {(() => {
                    const calculatedWinner = (warWinner !== null && warWinner !== undefined)
                      ? warWinner
                      : (Object.keys(warRolls).length > 0 ? parseInt(Object.entries(warRolls).reduce((a, b) => b[1] > a[1] ? b : a)[0]) : null);
                    if (calculatedWinner === null || calculatedWinner === undefined || !gamePlayers[calculatedWinner]) return null;
                    const winnerPlayer = gamePlayers[calculatedWinner];
                    return (
                      <div className="war-winner-section">
                        <div style={{ fontSize: '32px', marginBottom: '4px' }}>🏆</div>
                        <div className="modal-city-name" style={{ 
                          fontSize: '18px', 
                          color: '#E91E63', 
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}>
                          {winnerPlayer.avatar && (
                            <img 
                              src={winnerPlayer.avatar} 
                              alt={winnerPlayer.name} 
                              style={{ 
                                width: '32px', 
                                height: '32px', 
                                borderRadius: '50%',
                                border: '2px solid #FFD700',
                                boxShadow: '0 0 10px rgba(255, 215, 0, 0.7)'
                              }} 
                            />
                          )}
                          <span>{winnerPlayer.name} WINS!</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#5D4037', fontWeight: 'bold', marginBottom: '8px' }}>
                          {warMode === 'A' && warProperty 
                            ? `Won "${warProperty.name}"` 
                            : `Won $${battlePot.toLocaleString()}`}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Show all rolls */}
                  <div className="war-roll-list">
                    {Object.entries(warRolls).map(([playerIdx, roll]) => {
                      const isWinner = roll === Math.max(...Object.values(warRolls));
                      return (
                        <div key={playerIdx} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          marginBottom: '3px',
                          background: isWinner 
                            ? 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)' 
                            : 'linear-gradient(135deg, #FFB74D 0%, #FF9800 100%)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontWeight: 'bold',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                          fontSize: '13px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <img src={gamePlayers[parseInt(playerIdx)]?.avatar} alt={gamePlayers[parseInt(playerIdx)]?.name} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                            <span>
                              {gamePlayers[parseInt(playerIdx)]?.name}{isWinner && ' 👑'}
                            </span>
                          </div>
                          <span>
                            🎲 {roll}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="modal-buttons" style={{ marginTop: '6px' }}>
                    <button 
                      className="modal-btn buy" 
                      onClick={handleWarComplete}
                      style={{ width: '100%', background: '#4CAF50', padding: '8px 12px', fontSize: '14px' }}
                    >
                      CONFIRM
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chance Modal */}
      {(showChanceModal || (isModalClosing && closingModal === 'chance')) && currentChanceCard && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
            {/* Header */}
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #FF9800 0%, #F57C00 100%)' }}>
              <span className="modal-heading-text">CHANCE</span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              <div className="modal-city-name" style={{ fontSize: '20px', marginBottom: '20px', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentChanceCard.text}
              </div>
              
              <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                  <button 
                    className="modal-btn buy" 
                    onClick={() => handleChanceCardAction(currentChanceCard)}
                    style={{ width: '120px', background: '#FF9800' }}
                  >
                    OK
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>
                    Waiting for {gamePlayers[currentPlayer]?.name || 'player'}...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chest Modal */}
      {(showChestModal || (isModalClosing && closingModal === 'chest')) && currentChestCard && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
            {/* Header */}
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #795548 0%, #5D4037 100%)' }}>
              <span className="modal-heading-text">TREASURE CHEST</span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              <div className="modal-city-name" style={{ fontSize: '20px', marginBottom: '20px', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentChestCard.text}
              </div>
              
              <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                  <button 
                    className="modal-btn buy" 
                    onClick={() => handleChestCardAction(currentChestCard)}
                    style={{ width: '120px', background: '#795548' }}
                  >
                    OK
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>
                    Waiting for {gamePlayers[currentPlayer]?.name || 'player'}...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Parking Modal */}
      {(showParkingModal || (isModalClosing && closingModal === 'parking')) && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
             <div className="modal-heading" style={{ background: '#2196F3' }}>
               <span className="modal-heading-text">FREE PARKING</span>
             </div>
             <div className="modal-body">
               <div className="modal-city-name" style={{ fontSize: '20px', marginBottom: '20px', textAlign: 'center' }}>
                 Take a rest for a turn. Nothing happens.
               </div>
               <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                 {(networkMode !== 'online' || myPlayerIndex === currentPlayer) ? (
                   <button 
                     className="modal-btn buy" 
                     onClick={handleParkingConfirm}
                     style={{ width: '120px', background: '#2196F3' }}
                   >
                     OK
                   </button>
                 ) : (
                   <div style={{ textAlign: 'center', color: '#4A2C18', fontWeight: 'bold', fontStyle: 'italic' }}>
                     Waiting for {gamePlayers[currentPlayer]?.name || 'player'}...
                   </div>
                 )}
               </div>
             </div>
          </div>
        </div>
      )}

      {/* 1. Landing Choice Modal */}
      {showAuctionLandingModal && (
        <div className="modal-overlay">
          <div className="buy-modal">
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #FFD700 0%, #FFA500 100%)' }}>
              <span className="modal-heading-text">OPPORTUNITY</span>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', margin: '20px 0', fontSize: '18px' }}>
                Opportunity Knocks! Force an opponent to sell a property? <br/> 
                <span style={{ fontWeight: 'bold' }}>Cost: $3,000</span>
              </div>
              <div className="modal-buttons">
                <button 
                  className="modal-btn cancel" 
                  onClick={() => {
                    setShowAuctionLandingModal(false);
                    // Pass means 'End Turn' for this tile logic
                    if (networkMode === 'online') sendGameAction('end_turn'); 
                    else handleEndTurn();
                  }}
                >
                  PASS
                </button>
                <button 
                  className="modal-btn buy" 
                  style={{ background: '#4CAF50' }}
                  onClick={() => {
                    setShowAuctionLandingModal(false);
                    if (networkMode === 'online') {
                      sendGameAction('auction_start_selection');
                    }
                    setIsSelectingAuctionProperty(true);
                    setShowAuctionInstructionModal(true);
                  }}
                >
                  START
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Instruction Overlay */}
      {showAuctionInstructionModal && !pendingAuctionProperty && (
        <div className="modal-overlay modal-overlay-inline" style={{ background: 'transparent', pointerEvents: 'none' }}>
           <div className="buy-modal" style={{ pointerEvents: 'auto', marginTop: '10vh' }}>
             <div className="modal-heading" style={{ background: 'linear-gradient(135deg, #FFC107 0%, #FF9800 100%)' }}>
               <span className="modal-heading-text">INSTRUCTION</span>
             </div>
             <div className="modal-body">
               <div style={{ textAlign: 'center', margin: '20px 0', fontSize: '16px' }}>
                 Tap any opponent's property to auction it!
               </div>
               <div className="modal-buttons">
                 <button 
                   className="modal-btn cancel"
                    onClick={() => {
                     setIsSelectingAuctionProperty(false);
                     setShowAuctionInstructionModal(false);
                     if (networkMode === 'online') {
                        sendGameAction('auction_cancel'); // Clear B&W state
                        sendGameAction('end_turn');
                     } else {
                        handleEndTurn();
                     }
                   }}
                 >
                   CANCEL
                 </button>
               </div>
             </div>
           </div>
        </div>
      )}

      {/* 3. Selection Confirmation Modal */}
      {pendingAuctionProperty && (
        <div className="modal-overlay">
          <div className="buy-modal">
            <div className="modal-heading" style={{ background: '#D32F2F' }}>
              <span className="modal-heading-text">AUCTION?</span>
            </div>
            <div className="modal-body">
              <div className="modal-city-name" style={{ 
                background: pendingAuctionProperty.color,
                color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                width: '140px',
                height: '60px',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '10px auto',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                border: '3px solid white',
                fontSize: '11px',
                textAlign: 'center',
                lineHeight: '1.2'
              }}>
                {pendingAuctionProperty.name}
              </div>
              <div style={{ textAlign: 'center', margin: '20px 0', fontSize: '18px' }}>
                Force this property into auction? <br/>
                <span style={{ fontWeight: 'bold', color: '#D32F2F' }}>Fee: $3,000</span>
              </div>
              <div className="modal-buttons">
                <button 
                  className="modal-btn cancel" 
                  onClick={() => setPendingAuctionProperty(null)}
                >
                  BACK
                </button>
                <button 
                  className="modal-btn buy" 
                  style={{ background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)', fontSize: '11px' }}
                  onClick={handleAuctionConfirm}
                >
                  PAY $3000
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3b. Announcement Modal (New Phase) */}
      {auctionState.status === 'announcing' && (
        <div className="modal-overlay">
          <div className="buy-modal">
             <div className="modal-heading" style={{ background: '#FF9800' }}>
               <span className="modal-heading-text">AUCTION STARTING!</span>
             </div>
             <div className="modal-body">
               <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <div style={{ fontSize: '16px', marginBottom: '10px' }}>
                     <span style={{ fontWeight: 'bold' }}>{gamePlayers[auctionState.initiator]?.name}</span> chose:
                  </div>
                     <div className="modal-city-name" style={{ 
                        background: getPropertyByTileIndex(auctionState.propertyIndex)?.color || '#ccc',
                        color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                        width: '140px',
                        height: '60px',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        margin: '10px auto',
                        borderRadius: '8px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                        border: '3px solid white',
                        fontSize: '11px',
                        textAlign: 'center',
                        lineHeight: '1.2'
                     }}>
                        {getTileName(auctionState.propertyIndex)}
                     </div>
                  <div style={{ fontSize: '14px', color: '#4A2C18', fontWeight: 'bold' }}>
                     Owner: {gamePlayers[auctionState.originalOwner]?.name || gamePlayers[propertyOwnership[auctionState.propertyIndex]]?.name}
                  </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* 4. Active Bidding Interface */}
      {auctionState.status === 'active' && (
        <div className="modal-overlay">
          <div className="buy-modal auction-modal" style={{ maxHeight: '85vh', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-heading" style={{ background: '#FF9800', padding: '10px' }}>
              <span className="modal-heading-text" style={{ fontSize: '18px' }}>AUCTION: {getTileName(auctionState.propertyIndex)}</span>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '10px', justifyContent: 'space-between' }}>
              
              {/* Current High Bid */}
              <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                <div style={{ fontSize: '13px', color: '#4A2C18', fontWeight: 'bold' }}>Current High Bid</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2E7D32', lineHeight: '1.2' }}>${auctionState.currentBid}</div>
                
                {/* Last Bidder Info */}
                <div style={{ fontSize: '13px', fontWeight: 'bold', minHeight: '20px', color: '#333' }}>
                   {auctionState.bids && auctionState.bids.length > 0 ? (
                      <span>{gamePlayers[auctionState.bids[0].player]?.name} bid ${auctionState.bids[0].amount}</span>
                   ) : (
                      <span style={{ color: '#5D4037', fontWeight: 'normal', fontStyle: 'italic' }}>No Bids Yet</span>
                   )}
                </div>
              </div>

              {/* Controls */}
              <div className="modal-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                
                {/* Status Label */}
                <div style={{ textAlign: 'center', fontSize: '13px', color: '#4A2C18', fontStyle: 'italic' }}>
                   {auctionState.currentBidder === myPlayerIndex 
                      ? <span style={{ color: '#2E7D32', fontWeight: 'bold' }}>YOUR TURN!</span>
                      : `${gamePlayers[auctionState.currentBidder]?.name} is bidding...`}
                </div>

                {/* Range Slider for Bid */}
                {auctionState.participants?.includes(myPlayerIndex) && ( 
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#4A2C18', fontWeight: 'bold' }}>Min: ${(auctionState.currentBid || 0) + 10}</span>
                        <span style={{ fontWeight: 'bold', color: '#2E7D32', fontSize: '16px' }}>${auctionBidAmount}</span>
                    </div>
                    <input 
                       type="range" 
                       min={(auctionState.currentBid || 0) + 10} 
                       max={playerMoney[myPlayerIndex]} 
                       step={10}
                       value={auctionBidAmount} 
                       onChange={(e) => setAuctionBidAmount(Number(e.target.value))}
                       disabled={auctionState.currentBidder !== myPlayerIndex}
                       style={{ width: '100%', cursor: auctionState.currentBidder === myPlayerIndex ? 'pointer' : 'not-allowed', opacity: auctionState.currentBidder === myPlayerIndex ? 1 : 0.6 }}
                    />
                 </div>
                )}
                 
                 <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="modal-btn cancel" 
                      onClick={handleAuctionFold}
                      disabled={auctionState.currentBidder !== myPlayerIndex} 
                      style={{ opacity: auctionState.currentBidder !== myPlayerIndex ? 0.5 : 1, padding: '10px', fontSize: '14px' }}
                    >
                      FOLD
                    </button>
                    <button 
                      className="modal-btn buy" 
                      style={{ background: '#4CAF50', flex: 2, opacity: (auctionState.currentBidder !== myPlayerIndex || playerMoney[myPlayerIndex] < auctionBidAmount) ? 0.5 : 1, padding: '10px', fontSize: '14px' }}
                      onClick={handleAuctionBid}
                      disabled={auctionState.currentBidder !== myPlayerIndex || playerMoney[myPlayerIndex] < auctionBidAmount}
                    >
                      BID
                    </button>
                 </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 5. Result / Winner Modal */}
      {auctionState.status === 'complete' && (
        <div className="modal-overlay">
          <div className="buy-modal">
             <div className="modal-heading" style={{ background: '#4CAF50' }}>
               <span className="modal-heading-text">SOLD!</span>
             </div>
             <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px' }}>
               <div style={{ textAlign: 'center', margin: '10px 0' }}>
                  <div style={{ fontSize: '18px', marginBottom: '5px', color: '#4A2C18', fontWeight: 'bold' }}>Winner:</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2E7D32', marginBottom: '10px' }}>
                     {gamePlayers[auctionState.winner]?.name}
                  </div>
                  
                  {/* Property Won Display */}
                  <div className="modal-city-name" style={{ 
                        background: getPropertyByTileIndex(auctionState.propertyIndex)?.color || '#ccc',
                        color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                        width: '140px',
                        height: '60px',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        margin: '10px auto',
                        borderRadius: '8px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                        border: '3px solid white',
                        fontSize: '16px',
                        textAlign: 'center',
                        lineHeight: '1.2'
                     }}>
                        {getTileName(auctionState.propertyIndex)}
                   </div>
                  <div style={{ fontSize: '16px', marginTop: '10px' }}>
                     Final Price: <span style={{ fontWeight: 'bold' }}>${auctionState.finalAmount || auctionState.currentBid}</span>
                  </div>
               </div>
               <div className="modal-buttons" style={{ marginTop: 'auto' }}>
                  <button 
                    className="modal-btn buy" 
                    style={{ width: '100%' }}
                    onClick={() => {
                        setAuctionState(prev => ({ ...prev, status: 'idle' }));
                    }}
                  >
                    CONTINUE
                  </button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Property Details Modal */}
      {(showPropertyModal || (isModalClosing && closingModal === 'property')) && selectedProperty && (
        <div className={`modal-overlay ${isModalClosing ? 'closing' : ''}`}>
          <div className="buy-modal">
            {/* Header */}
            <div className="modal-heading">
              <span className="modal-heading-text">PROPERTY</span>
            </div>
            
            {/* Body */}
            <div className="modal-body">
              <div className="modal-city-name">{selectedProperty.name}</div>
              <div className="modal-divider"></div>
              
              <div className="modal-details">
                {/* Rent Schedule */}
                <div style={{ marginBottom: '15px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '4px' }}>
                    <span>Level</span>
                    <span>Rent</span>
                  </div>
                  {selectedProperty.rentLevels.map((rent, index) => {
                     const currentLevel = propertyLevels[selectedProperty.tileIndex] || 0;
                     const isCurrent = currentLevel === index;
                     const label = index === 0 ? 'Base' : index === 5 ? 'Hotel' : `${index} House${index > 1 ? 's' : ''}`;
                     return (
                       <div key={index} style={{ 
                         display: 'flex', 
                         justifyContent: 'space-between', 
                         padding: '4px 8px',
                         backgroundColor: isCurrent ? 'rgba(33, 150, 243, 0.15)' : 'transparent',
                         borderRadius: '4px',
                         fontWeight: isCurrent ? 'bold' : 'normal',
                         color: isCurrent ? '#1565C0' : 'inherit'
                       }}>
                         <span>{label}</span>
                         <span>${rent.toLocaleString()}</span>
                       </div>
                     );
                  })}
                </div>
                
                <div className="modal-divider"></div>
                
                <div className="modal-row" style={{ marginTop: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Cost per House</span>
                  <span className="modal-value" style={{ fontSize: '14px', fontWeight: 'bold' }}>${selectedProperty.upgradeCost?.toLocaleString()}</span>
                </div>
                <div className="modal-row">
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Cost for Hotel</span>
                  <span className="modal-value" style={{ fontSize: '14px', fontWeight: 'bold' }}>${(selectedProperty.upgradeCost * 2)?.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="modal-buttons">
                <button className="modal-btn cancel" onClick={() => closeAllModals()}>CLOSE</button>
                
                {/* Upgrade Button - DISABLED GLOBALLY AS PER REQUEST */}
                {false && propertyOwnership[selectedProperty.tileIndex] !== undefined && 
                 !TRAIN_TILES.includes(selectedProperty.tileIndex) &&
                 hasMonopoly(selectedProperty.tileIndex, propertyOwnership[selectedProperty.tileIndex]) && 
                 (
                   <button 
                     className="modal-btn buy" 
                     onClick={handleUpgradeProperty}
                     disabled={
                       propertyLevels[selectedProperty.tileIndex] >= 5 || 
                       playerMoney[currentPlayer] < (propertyLevels[selectedProperty.tileIndex] === 4 ? selectedProperty.upgradeCost * 2 : selectedProperty.upgradeCost)
                     }
                     style={{ 
                       background: '#4CAF50', 
                       opacity: (propertyLevels[selectedProperty.tileIndex] >= 5 || playerMoney[currentPlayer] < (propertyLevels[selectedProperty.tileIndex] === 4 ? selectedProperty.upgradeCost * 2 : selectedProperty.upgradeCost)) ? 0.5 : 1 
                     }}
                   >
                     {propertyLevels[selectedProperty.tileIndex] === 4 ? 'BUY HOTEL' : 'UPGRADE'}
                   </button>
                 )
                }
              </div>
            </div>
          </div>
        </div>
      )}
        </div>

        {/* Player Pawns */}
        <div className="pawns-container">
          {gamePlayers.map((player, index) => (
            <div 
              key={player.id} 
              className={`player-pawn ${playerAnimationEnabled && hoppingPlayer === index ? 'pawn-hopping' : ''}`}
              style={{
                ...getPawnStyle(playerPositions[index], index),
                transition: playerAnimationEnabled ? `top ${pawnTransitionDuration}ms linear, left ${pawnTransitionDuration}ms linear` : 'none',
                animationDuration: `${pawnTransitionDuration}ms`
              }}
            >
              <img src={player.avatar} alt={player.name} className="pawn-img" />
            </div>
          ))}
        </div>

        {/* Floating Price Animations */}
        {floatingPrices.map((fp, index) => (
          <div 
            key={`${fp.key}-${index}`}
            className={`floating-price ${fp.isPositive ? 'positive' : 'negative'}`}
            style={{
              top: `${getFloatingPosition(fp.tileIndex).top}vh`,
              left: `${getFloatingPosition(fp.tileIndex).left}vh`
            }}
          >
            {fp.isPositive ? '+' : '-'}{(fp.price || 0).toLocaleString()}
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        {/* Unified Top Section (Orange) */}
        <div className="sidebar-top-section">
          {/* Top Controls (Blue Icons) */}
          <div className="top-controls">
            <button className="control-btn sound">🔊</button>
            <button className="control-btn help">❓</button>
            <button className="control-btn menu" onClick={openMenu}>☰</button>
          </div>

          {/* Player Panel (Blue) */}
          <div className="player-panel">
            {gamePlayers.map((player, index) => (
              <div 
                key={player.id}
                className={`player-item ${index === currentPlayer ? 'active' : ''} ${bankruptPlayers[index] || player.kicked ? 'bankrupt' : ''}`}
                style={bankruptPlayers[index] || player.kicked ? { filter: 'grayscale(100%)', opacity: 0.6 } : (!player.connected && networkMode === 'online') ? { opacity: 0.75 } : undefined}
              >
                <div className="player-avatar">
                  <img src={player.avatar} alt={player.name} className="avatar-img" />
                </div>
                <div className="player-info" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <div className="player-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
                    {bankruptPlayers[index] && <span>💀</span>}
                    {player.kicked && <span style={{ fontSize: '9px', background: '#e11d48', color: '#fff', padding: '1px 3px', borderRadius: '3px' }}>Kicked</span>}
                    {networkMode === 'online' && !player.connected && !player.kicked && (
                      <span style={{ fontSize: '8px', background: '#ea580c', color: '#fff', padding: '1px 3px', borderRadius: '3px' }}>Offline</span>
                    )}
                  </div>
                  {/* Host Kick Option for Disconnected Players */}
                  {networkMode === 'online' && myPlayerIndex === 0 && index !== 0 && !player.kicked && !player.connected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Kick ${player.name} from the game?`)) {
                          sendGameAction('kick_player', { targetIndex: index });
                        }
                      }}
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: '2px',
                        background: '#dc2626',
                        border: 'none',
                        color: 'white',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                      title={player.canBeKicked ? "1 minute elapsed. Host can kick this player." : "Player offline. Host can kick."}
                    >
                      Kick {player.canBeKicked ? '(1m+)' : ''}
                    </button>
                  )}
                </div>
                <div className="player-money" style={{ color: playerMoney[index] < 0 ? '#ff4444' : undefined }}>${playerMoney[index].toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cash Stack (The Pot) */}
        <div className="cash-stack-panel">
          <div className="cash-stack-title">💵 CASH STACK</div>
          <div className="cash-stack-amount">${cashStack.toLocaleString()}</div>
          
          {/* Floating Prices for Cash Stack */}
          {cashStackFloatingPrices.map(fp => (
            <div 
              key={fp.key} 
              className="floating-price-stack"
              style={{ color: fp.amount >= 0 ? '#00FF00' : '#FF5252' }}
            >
              {fp.amount >= 0 ? '+' : ''}{fp.amount.toLocaleString()}
            </div>
          ))}
        </div>

        {/* History Panel */}
        <div className="history-panel">
          <div className="history-header">
            <h2>HISTORY</h2>
          </div>
          <div className="history-content">
            {history.map((item, index) => (
              <div key={index} className="history-item">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className="toast-container">
          <div className="toast-message">
            {toast.message}
          </div>
        </div>
      )}

      {/* Debug Panel - only visible when Developer Options enabled */}
      {devMode && (
      <div className="debug-panel">
        <input 
          type="number" 
          min="2" 
          max="12" 
          value={debugDiceValue} 
          onChange={(e) => setDebugDiceValue(parseInt(e.target.value))}
          style={{ width: '50px', marginRight: '5px', padding: '5px' }}
        />
        <button onClick={() => rollDice(debugDiceValue)} disabled={isRolling || isProcessingTurn}>
          Force Roll
        </button>
      </div>
      )}


      


    </div>
      )}

      {/* Universal Settings Modal (Accessible both in Welcome Screen and during Game) */}
      {showSettingsModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="buy-modal deal-modal bank-modal" style={{ pointerEvents: 'auto', marginTop: '6vh', minWidth: '320px', maxWidth: '420px', boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}>
            <div className="modal-heading" style={{ background: 'linear-gradient(to bottom, #2196F3 0%, #1565C0 100%)' }}>
              <span className="modal-heading-text">⚙️ GAME SETTINGS</span>
            </div>
            <div className="modal-body" style={{ textAlign: 'left', padding: '18px 20px' }}>
               
               {/* 1. Player Movement Animation Toggle */}
               <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #e0d7c6' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                   <div style={{ fontSize: '14px', color: '#4a2c18', fontWeight: 'bold' }}>
                     Player Animation
                   </div>
                   <button
                     type="button"
                     onClick={() => togglePlayerAnimation(!playerAnimationEnabled)}
                     style={{
                       padding: '6px 14px',
                       borderRadius: '20px',
                       fontWeight: 'bold',
                       fontSize: '12px',
                       cursor: 'pointer',
                       border: 'none',
                       backgroundColor: playerAnimationEnabled ? '#4CAF50' : '#757575',
                       color: '#fff',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                     }}
                   >
                     {playerAnimationEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
                   </button>
                 </div>
                 <div style={{ fontSize: '11px', color: '#795548', lineHeight: 1.3 }}>
                   {playerAnimationEnabled 
                     ? 'Pawns hop tile-by-tile smoothly during movement.' 
                     : 'Instant movement: Pawns jump directly to destination tile without hopping.'}
                 </div>
               </div>

               {/* 2. Animation Speed Slider */}
               {playerAnimationEnabled && (
                 <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #e0d7c6' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                     <div style={{ fontSize: '14px', color: '#4a2c18', fontWeight: 'bold' }}>
                       Hopping Speed
                     </div>
                     <span style={{ fontSize: '13px', color: '#1565C0', fontWeight: 'bold' }}>
                       {animationSpeed.toFixed(1)}x
                     </span>
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <span style={{ fontSize: '11px', color: '#795548' }}>0.5x</span>
                     <input 
                       type="range" 
                       min="0.5" 
                       max="2.5" 
                       step="0.1" 
                       value={animationSpeed}
                       onChange={(e) => updateAnimationSpeed(e.target.value)}
                       style={{ flex: 1, accentColor: '#2196F3' }}
                     />
                     <span style={{ fontSize: '11px', color: '#795548' }}>2.5x</span>
                   </div>
                 </div>
               )}

               {/* 3. Developer Mode Toggle */}
               <div style={{ marginBottom: '14px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                   <div style={{ fontSize: '14px', color: '#4a2c18', fontWeight: 'bold' }}>
                     Developer Mode
                   </div>
                   <button
                     type="button"
                     onClick={() => {
                       const next = !devMode;
                       setDevMode(next);
                       try { localStorage.setItem('pseudopoly_devmode', String(next)); } catch {}
                     }}
                     style={{
                       padding: '6px 14px',
                       borderRadius: '20px',
                       fontWeight: 'bold',
                       fontSize: '12px',
                       cursor: 'pointer',
                       border: 'none',
                       backgroundColor: devMode ? '#4CAF50' : '#757575',
                       color: '#fff',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                     }}
                   >
                     {devMode ? 'ACTIVE (ON)' : 'OFF'}
                   </button>
                 </div>
                 <div style={{ fontSize: '11px', color: '#795548', lineHeight: 1.3 }}>
                   Enables manual Force Roll test panel on your turn.
                 </div>
               </div>

               <div className="modal-buttons" style={{ justifyContent: 'center', marginTop: '15px' }}>
                 <button 
                    className="modal-btn buy" 
                    style={{ flex: 'none', minWidth: '120px', background: 'linear-gradient(to bottom, #2196F3 0%, #1565C0 100%)' }} 
                    onClick={closeSettings}
                 >
                   DONE
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
