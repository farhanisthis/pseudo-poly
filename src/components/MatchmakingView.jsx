import React, { useState, useRef, useEffect } from 'react';

// --- UI SVG Icons ---
function UsersIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function WifiIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="2.5" />
    </svg>
  );
}

function GlobeIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function HomeIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function LinkIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function KeyIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 1-5-5l3.5 3.5m4 4L22 17l-3 3-2-2-2 2-3-3" />
    </svg>
  );
}

function LightningIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CrownIcon({ size = 16, color = "#FFD700" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="#B26A00" strokeWidth="1">
      <path d="M2 4l3 12h14l3-12-6 7-4-8-4 8-6-7z" />
    </svg>
  );
}

function DiceIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ClockIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SettingsIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function MatchmakingView({
  gameStage,
  setGameStage,
  setNetworkMode,
  myIdentity,
  setMyIdentity,
  players = [],
  AVATAR_COLORS = {},
  initializeHost,
  joinRoom,
  joinCode,
  setJoinCode,
  roomCode,
  connectedPlayers = [],
  myPlayerIndex,
  startGame,
  onLeaveRoom,
  showToast,
  startupBg,
  devMode,
  onToggleDevMode,
  onOpenSettings,
  serverUrl,
  updateServerUrl,
  socketConnected,
  networkType = 'wifi',
  setNetworkType = () => {},
  hotspotServerUrl,
  onlineServerUrl,
  joinError = '',
  setJoinError = () => {},
}) {
  const [onlineTab, setOnlineTab] = useState('host');
  const [isCopied, setIsCopied] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [ipInput, setIpInput] = useState(serverUrl || '');
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (serverUrl) setIpInput(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (gameStage === 'online_menu' && onlineTab === 'join') {
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    }
  }, [gameStage, onlineTab]);

  const handlePinChange = (e) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, 4);
    setJoinCode(rawVal);
    if (joinError && setJoinError) setJoinError('');
  };

  const handlePasteCode = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const digits = text.replace(/\D/g, '').slice(0, 4);
        if (digits.length > 0) {
          setJoinCode(digits);
          showToast(`Pasted code: ${digits}`);
        } else {
          showToast('No 4-digit code found in clipboard');
        }
      }
    } catch {
      showToast('Clipboard access unavailable');
    }
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(roomCode));
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = String(roomCode);
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      showToast(`Copied Room Code: ${roomCode}`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      showToast(`Room Code: ${roomCode}`);
    }
  };

  const handleSaveServerIp = () => {
    if (!ipInput.trim()) {
      showToast('Please enter a valid IP address');
      return;
    }
    updateServerUrl(ipInput.trim());
    setShowServerModal(false);
    showToast(`Connecting to ${ipInput.trim()}...`);
  };

  const TOTAL_SLOTS = 4;
  const lobbySlots = Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
    const player = connectedPlayers[index] || null;
    return {
      slotIndex: index,
      player,
      isHost: player ? player.isHost === true : index === 0,
      isMe: index === myPlayerIndex,
    };
  });

  const isHost = (connectedPlayers[myPlayerIndex]?.isHost || myPlayerIndex === 0);
  const canStartGame = connectedPlayers.length >= 2;
  const activeHaloColor = AVATAR_COLORS[myIdentity.avatar] || '#ffd700';

  return (
    <div className="mm-overlay">
      <div 
        className="mm-backdrop" 
        style={{ backgroundImage: startupBg ? `url(${startupBg})` : 'none' }} 
      />

      <div className="mm-container">
        {/* =========================================================
            SCREEN 1: WELCOME SCREEN (gameStage === 'menu')
            ========================================================= */}
        {gameStage === 'menu' && (
          <div className="mm-menu-view">
            <button
              className={`mm-dev-toggle ${devMode ? 'active' : ''}`}
              onClick={onOpenSettings || onToggleDevMode}
              title="Game Settings"
            >
              <SettingsIcon size={18} color={devMode ? "#4CAF50" : "#ffffff"} />
              {devMode && <span className="mm-dev-dot" />}
            </button>

            <div className="mm-logo-badge">MULTIPLAYER BOARD GAME</div>
            <h1 className="mm-game-title">PSEUDOPOLY</h1>
            <p className="mm-game-subtitle">Fast-paced, high-stakes real estate trading</p>

            <button 
              className="mm-primary-btn pulse"
              onClick={() => setGameStage('mode_select')}
            >
              <span>PLAY NOW</span>
              <span>▶</span>
            </button>

            {devMode && (
              <div className="mm-dev-notice">🔧 Developer Mode Active — Force Roll Enabled</div>
            )}
          </div>
        )}

        {/* =========================================================
            SCREEN 2: MODE SELECTION (gameStage === 'mode_select')
            ========================================================= */}
        {gameStage === 'mode_select' && (
          <div>
            <div className="mm-header">
              <button 
                className="mm-back-btn" 
                onClick={() => setGameStage('menu')}
                title="Back to title"
              >
                ←
              </button>
              <h2 className="mm-header-title">SELECT MODE</h2>
              <div className="mm-header-spacer" />
            </div>

            <div className="mm-mode-grid">
              {/* Pass & Play (Local Offline) */}
              <div 
                className="mm-mode-card offline"
                onClick={() => {
                  setNetworkMode('offline');
                  setGameStage('playing');
                }}
              >
                <div className="mm-mode-icon-wrap">
                  <UsersIcon size={28} color="#34d399" />
                </div>
                <div className="mm-mode-info">
                  <span className="mm-mode-badge">OFFLINE</span>
                  <div className="mm-mode-title">Pass & Play</div>
                  <p className="mm-mode-desc">Play locally with friends on this device. No connection needed.</p>
                </div>
                <div className="mm-mode-arrow">→</div>
              </div>

              {/* Local Wi-Fi / Hotspot Multiplayer */}
              <div 
                className="mm-mode-card wifi"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
                    if (showToast) showToast("Note: Local Wi-Fi requires HTTP. Switched to Online Rooms.");
                    setNetworkType('online');
                    setNetworkMode('online');
                    setGameStage('online_menu');
                    return;
                  }
                  setNetworkType('wifi');
                  setNetworkMode('online');
                  setGameStage('online_menu');
                }}
              >
                <div className="mm-mode-icon-wrap">
                  <WifiIcon size={28} color="#fbbf24" />
                </div>
                <div className="mm-mode-info">
                  <span className="mm-mode-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>
                    HOTSPOT / LAN
                  </span>
                  <div className="mm-mode-title">Hotspot & Local Wi-Fi</div>
                  <p className="mm-mode-desc">Mini Militia style: Host turns on phone hotspot, friends connect to host's Wi-Fi.</p>
                </div>
                <div className="mm-mode-arrow">→</div>
              </div>

              {/* Online Multiplayer */}
              <div 
                className="mm-mode-card online"
                onClick={() => {
                  setNetworkType('online');
                  setNetworkMode('online');
                  setGameStage('online_menu');
                }}
              >
                <div className="mm-mode-icon-wrap">
                  <GlobeIcon size={28} color="#60a5fa" />
                </div>
                <div className="mm-mode-info">
                  <span className="mm-mode-badge">ONLINE ROOMS</span>
                  <div className="mm-mode-title">Play with Friends Online</div>
                  <p className="mm-mode-desc">Create or join private rooms over the Internet with a 4-digit numeric code.</p>
                </div>
                <div className="mm-mode-arrow">→</div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            SCREEN 3: ONLINE / WI-FI MENU (gameStage === 'online_menu')
            ========================================================= */}
        {gameStage === 'online_menu' && (
          <div>
            <div className="mm-header">
              <button 
                className="mm-back-btn" 
                onClick={() => setGameStage('mode_select')}
                title="Back to mode select"
              >
                ←
              </button>
              <h2 className="mm-header-title">
                {networkType === 'wifi' ? 'HOTSPOT & WI-FI ROOMS' : 'ONLINE MULTIPLAYER'}
              </h2>
              <div className="mm-header-spacer" />
            </div>

            {/* Wi-Fi / Server Status & Config Bar */}
            <div className="mm-wifi-bar">
              <div className="mm-wifi-status">
                <span className={`mm-wifi-dot ${socketConnected ? 'connected' : 'disconnected'}`} />
                <span className="mm-wifi-label">
                  {networkType === 'online'
                    ? (socketConnected ? 'Cloud Online:' : 'Cloud Server:')
                    : (socketConnected ? 'Host Connected:' : 'Host Address:')
                  }
                </span>
                <span className="mm-wifi-host">
                  {serverUrl || (networkType === 'online' ? 'Cloud Server' : '192.168.43.1:3001')}
                </span>
              </div>
              <button 
                className="mm-wifi-cfg-btn"
                onClick={() => setShowServerModal(!showServerModal)}
              >
                <SettingsIcon size={14} />
                <span>{showServerModal ? 'Close' : (networkType === 'online' ? 'Server URL' : 'Configure IP')}</span>
              </button>
            </div>

            {/* Inline Host IP Config Card */}
            {showServerModal && (
              <div className="mm-wifi-card">
                <div className="mm-wifi-card-title">
                  {networkType === 'wifi' ? '📱 Hotspot & Local Wi-Fi Host' : '☁️ Cloud Game Server'}
                </div>
                <p className="mm-wifi-card-desc">
                  {networkType === 'wifi'
                    ? "Mini Militia Hotspot: Host enables Mobile Hotspot. Friends connect to host's Wi-Fi. Default Host IP is 192.168.43.1:3001. If running server on PC, enter PC's Wi-Fi IP."
                    : "Enter your hosted cloud backend URL (e.g. on Render or Railway). Once connected, players anywhere with internet can join via 4-digit code."
                  }
                </p>
                <div className="mm-wifi-input-row">
                  <input
                    type="text"
                    className="mm-wifi-input"
                    placeholder={networkType === 'wifi' ? "e.g. 192.168.43.1:3001" : "e.g. https://pseudopoly-server.onrender.com"}
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                  />
                  <button className="mm-wifi-save-btn" onClick={handleSaveServerIp}>
                    Save & Connect
                  </button>
                </div>
                <div className="mm-wifi-presets">
                  <span className="mm-wifi-preset-label">Presets:</span>
                  {networkType === 'wifi' ? (
                    <>
                      <button 
                        type="button"
                        className="mm-wifi-preset-chip" 
                        onClick={() => { setIpInput('192.168.43.1:3001'); updateServerUrl('192.168.43.1:3001'); setShowServerModal(false); }}
                      >
                        📱 192.168.43.1:3001 (Android Hotspot)
                      </button>
                      <button 
                        type="button"
                        className="mm-wifi-preset-chip" 
                        onClick={() => { setIpInput('localhost:3001'); updateServerUrl('localhost:3001'); setShowServerModal(false); }}
                      >
                        💻 localhost:3001
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        type="button"
                        className="mm-wifi-preset-chip" 
                        style={{ background: 'rgba(76, 175, 80, 0.25)', borderColor: '#4CAF50' }}
                        onClick={() => { setIpInput('https://pseudo-poly.onrender.com'); updateServerUrl('https://pseudo-poly.onrender.com'); setShowServerModal(false); }}
                      >
                        ☁️ pseudo-poly.onrender.com
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Persistent Identity Card */}
            <div className="mm-identity-card">
              <div className="mm-identity-profile">
                <div 
                  className="mm-identity-avatar-wrap"
                  style={{ border: `3px solid ${activeHaloColor}`, boxShadow: `0 0 16px ${activeHaloColor}88` }}
                >
                  <img 
                    src={myIdentity.avatar} 
                    alt="Player Avatar" 
                    className="mm-identity-avatar-img" 
                  />
                </div>
                <div className="mm-identity-input-wrap">
                  <label className="mm-input-label">YOUR NICKNAME</label>
                  <input 
                    type="text" 
                    className="mm-name-input" 
                    placeholder="Enter Name"
                    maxLength={14}
                    value={myIdentity.name}
                    onChange={(e) => setMyIdentity(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>

              {/* Avatar Selector Strip */}
              <div className="mm-avatar-strip">
                {(players || []).map((p, idx) => {
                  const isSelected = myIdentity.avatar === p.avatar;
                  const pColor = AVATAR_COLORS[p.avatar] || '#ffd700';
                  return (
                    <div 
                      key={idx} 
                      className={`mm-avatar-opt ${isSelected ? 'selected' : ''}`}
                      style={{ 
                        borderColor: isSelected ? pColor : 'transparent',
                        color: pColor
                      }}
                      onClick={() => setMyIdentity(prev => ({ ...prev, avatar: p.avatar }))}
                    >
                      <img src={p.avatar} alt={`Avatar ${idx + 1}`} />
                      {isSelected && <span className="mm-avatar-check">✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Segmented Action Tabs */}
            <div className="mm-tabs">
              <button 
                className={`mm-tab-btn ${onlineTab === 'host' ? 'active' : ''}`}
                onClick={() => setOnlineTab('host')}
              >
                <HomeIcon size={16} />
                <span>Host Room</span>
              </button>
              <button 
                className={`mm-tab-btn ${onlineTab === 'join' ? 'active' : ''}`}
                onClick={() => setOnlineTab('join')}
              >
                <LinkIcon size={16} />
                <span>Join with Code</span>
              </button>
            </div>

            {/* Tab Panel: Host View */}
            {onlineTab === 'host' && (
              <div className="mm-host-panel">
                <div className="mm-perks-list">
                  <div className="mm-perk-item">
                    <span className="mm-perk-icon"><KeyIcon size={16} color="#fbbf24" /></span>
                    <span>Get a private 4-digit code to share with friends on Wi-Fi</span>
                  </div>
                  <div className="mm-perk-item">
                    <span className="mm-perk-icon"><UsersIcon size={16} color="#34d399" /></span>
                    <span>Supports 2 to 4 players simultaneously</span>
                  </div>
                  <div className="mm-perk-item">
                    <span className="mm-perk-icon"><LightningIcon size={16} color="#60a5fa" /></span>
                    <span>Host controls when to start the game from the lobby</span>
                  </div>
                </div>

                <button 
                  className="mm-primary-btn pulse"
                  onClick={initializeHost}
                >
                  <span>CREATE ROOM</span>
                  <span>✨</span>
                </button>
              </div>
            )}

            {/* Tab Panel: Join View */}
            {onlineTab === 'join' && (
              <div className="mm-join-panel">
                <label className="mm-input-label">ENTER 4-DIGIT INVITE CODE</label>
                
                <div 
                  className="mm-pin-container"
                  onClick={() => pinInputRef.current?.focus()}
                >
                  <input 
                    ref={pinInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    className="mm-pin-hidden-input"
                    value={joinCode}
                    onChange={handlePinChange}
                    maxLength={4}
                  />
                  {[0, 1, 2, 3].map((i) => {
                    const char = joinCode[i] || '';
                    const isCurrent = joinCode.length === i;
                    return (
                      <div 
                        key={i} 
                        className={`mm-pin-box ${isCurrent ? 'active' : ''} ${char ? 'filled' : ''}`}
                      >
                        {char || (isCurrent ? '·' : '')}
                      </div>
                    );
                  })}
                </div>

                <div className="mm-join-actions">
                  <button 
                    type="button" 
                    className="mm-paste-btn"
                    onClick={handlePasteCode}
                    title="Paste from clipboard"
                  >
                    Paste
                  </button>
                  <button 
                    className="mm-primary-btn"
                    style={{ flex: 1 }}
                    disabled={joinCode.length !== 4}
                    onClick={() => {
                      if (joinCode.length === 4) {
                        joinRoom();
                      } else {
                        showToast('Please enter a complete 4-digit code');
                      }
                    }}
                  >
                    <span>JOIN ROOM</span>
                    <span>→</span>
                  </button>
                </div>

                {joinError && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    fontSize: '13px',
                    fontWeight: '600',
                    textAlign: 'center',
                    lineHeight: '1.4'
                  }}>
                    ⚠️ {joinError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            SCREEN 4: GAME LOBBY (gameStage === 'lobby')
            ========================================================= */}
        {gameStage === 'lobby' && (
          <div className="mm-lobby-view">
            <div className="mm-header">
              <div className="mm-header-spacer" />
              <h2 className="mm-header-title">GAME LOBBY</h2>
              <div className="mm-header-spacer" />
            </div>

            {roomCode && (
              <div className="mm-code-card">
                <div className="mm-code-info">
                  <span className="mm-code-label">INVITE CODE</span>
                  <div className="mm-code-digits">
                    {String(roomCode).split('').map((digit, i) => (
                      <span key={i} className="mm-code-digit">{digit}</span>
                    ))}
                  </div>
                </div>

                <button 
                  className={`mm-copy-btn ${isCopied ? 'copied' : ''}`}
                  onClick={handleCopyCode}
                  title="Copy code to clipboard"
                >
                  <span>{isCopied ? '✓' : ''}</span>
                  <span>{isCopied ? 'COPIED!' : 'COPY CODE'}</span>
                </button>
              </div>
            )}

            <div className="mm-slots-header">
              <span className="mm-input-label">PLAYERS IN LOBBY</span>
              <span className="mm-slots-count">{connectedPlayers.length} / {TOTAL_SLOTS}</span>
            </div>

            <div className="mm-slots-grid">
              {lobbySlots.map(({ slotIndex, player, isHost: isSlotHost, isMe }) => {
                if (player) {
                  const pColor = AVATAR_COLORS[player.avatar] || '#3b82f6';
                  return (
                    <div 
                      key={slotIndex} 
                      className={`mm-player-slot filled ${isMe ? 'is-me' : ''}`}
                    >
                      {isSlotHost && (
                        <span className="mm-slot-crown">
                          <CrownIcon size={18} />
                        </span>
                      )}
                      
                      <div 
                        className="mm-slot-avatar-wrap"
                        style={{ border: `2.5px solid ${pColor}`, boxShadow: `0 0 10px ${pColor}88` }}
                      >
                        <img 
                          src={player.avatar} 
                          alt={player.name} 
                          className="mm-slot-avatar-img" 
                        />
                      </div>

                      <div className="mm-slot-name" title={player.name}>
                        {player.name}
                      </div>

                      {!player.connected ? (
                        <span className="mm-slot-badge disconnected" style={{ background: '#ea580c', color: '#fff' }}>
                          OFFLINE
                        </span>
                      ) : (
                        <span className={`mm-slot-badge ${isSlotHost ? 'host' : 'ready'}`}>
                          {isSlotHost ? (isMe ? 'YOU (HOST)' : 'HOST') : (isMe ? 'YOU' : 'READY')}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={slotIndex} className="mm-player-slot empty">
                    <div className="mm-empty-radar">
                      <ClockIcon size={24} color="#94a3b8" />
                    </div>
                    <div className="mm-empty-label">Slot {slotIndex + 1}</div>
                    <span className="mm-mode-desc" style={{ fontSize: '10px' }}>Waiting...</span>
                  </div>
                );
              })}
            </div>

            {!canStartGame ? (
              <div className="mm-lobby-alert warning">
                Need at least 2 players to start the game. Share the 4-digit code above!
              </div>
            ) : (
              <div className="mm-lobby-alert ready">
                ✓ Ready to roll! {isHost ? 'You can start the game now.' : 'Waiting for host to start...'}
              </div>
            )}

            <div className="mm-lobby-actions">
              {isHost ? (
                <button 
                  className={`mm-primary-btn ${canStartGame ? 'pulse' : ''}`}
                  style={{ 
                    width: '100%', 
                    maxWidth: 'none',
                    opacity: canStartGame ? 1 : 0.5,
                    cursor: canStartGame ? 'pointer' : 'not-allowed',
                    background: canStartGame ? 'linear-gradient(135deg, #10b981, #059669)' : '#475569'
                  }}
                  disabled={!canStartGame}
                  onClick={startGame}
                >
                  <span>START GAME</span>
                  <DiceIcon size={18} />
                </button>
              ) : (
                <div className="mm-waiting-host-msg">
                  <ClockIcon size={18} />
                  <span>Waiting for host to launch the game...</span>
                </div>
              )}

              <button 
                type="button" 
                className="mm-leave-btn"
                onClick={onLeaveRoom}
              >
                Leave Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
