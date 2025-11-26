class MultiplayerBingoGame {
    constructor() {
        this.backendUrl = window.BACKEND_URL || 'https://your-bingo-backend.onrender.com';
        this.socket = null;
        this.gameId = null;
        this.playerId = null;
        this.playerName = null;
        this.isHost = false;
        this.cells = [];
        this.markedCells = new Set([12]); // FREE space
        this.calledNumbers = [];
        this.players = [];
        this.isGameActive = false;
        this.currentView = 'loading';
        this.availableCards = [];
        this.selectedCard = null;
        this.hasClaimedBingo = false;
        this.canClaimBingo = false;
        this.pendingBingoClaims = [];
        
        this.init();
    }

    async init() {
        this.updateUI('Backend: ' + this.backendUrl, 'backendUrl');
        this.initializeTelegramApp();
        await this.initializeSocketConnection();
        this.showLobby();
    }

    initializeTelegramApp() {
        try {
            this.tg = window.Telegram.WebApp;
            if (this.tg) {
                this.tg.expand();
                this.tg.ready();
                
                const user = this.tg.initDataUnsafe?.user;
                this.playerId = user?.id || this.generatePlayerId();
                this.playerName = user?.first_name || user?.username || 'Player';
                
                this.updateUI(this.playerName, 'playerName');
            } else {
                // Fallback for testing outside Telegram
                this.playerId = this.generatePlayerId();
                this.playerName = 'Player';
                this.updateUI(this.playerName, 'playerName');
            }
        } catch (error) {
            console.log('Telegram Web App not available, using fallback');
            this.playerId = this.generatePlayerId();
            this.playerName = 'Player';
            this.updateUI(this.playerName, 'playerName');
        }
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    async initializeSocketConnection() {
        return new Promise((resolve) => {
            this.updateUI('Connecting...', 'connectionStatus');
            
            this.socket = io(this.backendUrl, {
                timeout: 10000,
                reconnectionAttempts: 3
            });
            
            this.socket.on('connect', () => {
                console.log('Connected to backend');
                this.updateUI('Connected ✅', 'connectionStatus');
                this.showMessage('Connected to game server!', 'success');
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection failed:', error);
                this.updateUI('Disconnected ❌', 'connectionStatus');
                this.showMessage('Failed to connect to server', 'error');
                resolve(); // Resolve anyway to continue
            });

            // Card selection events
            this.socket.on('card-pool', (data) => {
                this.availableCards = data.cards;
                if (this.currentView === 'game-room') {
                    this.showCardSelection();
                }
            });

            this.socket.on('card-selected', (data) => {
                if (data.success) {
                    this.selectedCard = data.card;
                    this.showMessage('Card selected successfully!', 'success');
                    this.showGameRoom();
                }
            });

            this.socket.on('player-card-selected', (data) => {
                this.showMessage(`${data.playerName} has selected a card`, 'info');
                this.updatePlayersList(this.players.map(p => 
                    p.id === data.playerId ? { ...p, hasSelectedCard: true } : p
                ));
            });

            this.socket.on('all-players-ready', () => {
                if (this.isHost) {
                    this.showMessage('All players have selected cards! You can start the game.', 'success');
                    const startBtn = document.getElementById('startGameBtn');
                    if (startBtn) startBtn.disabled = false;
                }
            });

            // Bingo claim events
            this.socket.on('can-claim-bingo', (data) => {
                this.canClaimBingo = true;
                this.updateBingoButton();
                this.showMessage('🎉 You have a winning pattern! Click BINGO! to claim victory.', 'success');
            });

            this.socket.on('bingo-claimed', (data) => {
                this.pendingBingoClaims.push(data);
                this.showBingoClaim(data);
            });

            this.socket.on('bingo-verified', (data) => {
                this.handleBingoVerification(data);
            });

            // Game events
            this.socket.on('game-created', (data) => {
                this.gameId = data.gameId;
                this.isHost = true;
                this.showMessage(data.message, 'success');
            });

            this.socket.on('game-joined', (data) => {
                this.handleGameJoined(data);
            });

            this.socket.on('player-joined', (data) => {
                this.updatePlayersList(data.players);
                this.showMessage(`${data.player.name} joined the game!`, 'info');
            });

            this.socket.on('player-left', (data) => {
                this.updatePlayersList(data.players);
                if (data.playerName) {
                    this.showMessage(`${data.playerName} left the game`, 'warning');
                }
            });

            this.socket.on('game-started', (data) => {
                this.handleGameStart(data);
            });

            this.socket.on('number-called', (data) => {
                this.handleNumberCalled(data);
            });

            this.socket.on('player-marked-cell', (data) => {
                this.updatePlayerMarkedCount(data.playerId, data.markedCount);
            });

            this.socket.on('cell-marked', (data) => {
                this.canClaimBingo = data.canClaimBingo || this.canClaimBingo;
                this.updateBingoButton();
            });

            this.socket.on('new-host', (data) => {
                this.isHost = data.hostId === this.playerId;
                this.showMessage(`${data.hostName} is now the host`, 'info');
                this.updateGameControls();
            });

            this.socket.on('error', (data) => {
                this.showMessage(data.message, 'error');
            });
        });
    }

    showLobby() {
        this.updateMainContent(`
            <div class="multiplayer-lobby">
                <div class="lobby-header">
                    <h2>🎮 Multiplayer Bingo</h2>
                    <p>Play real-time Bingo with card selection and manual Bingo claims!</p>
                </div>

                <div class="lobby-actions">
                    <div class="action-card">
                        <h3>Create Game</h3>
                        <p>Start a new game and invite friends</p>
                        <button id="createGameBtn" class="btn primary">Create New Game</button>
                    </div>

                    <div class="action-card">
                        <h3>Join Game</h3>
                        <p>Enter a game code to join</p>
                        <div class="join-form">
                            <input type="text" id="gameCodeInput" placeholder="Enter Game Code" maxlength="8" class="game-code-input">
                            <button id="joinGameBtn" class="btn secondary">Join Game</button>
                        </div>
                    </div>
                </div>

                <div class="game-instructions">
                    <h3>🎯 New Features:</h3>
                    <ul>
                        <li><strong>Card Selection:</strong> Choose from 20 unique Bingo cards</li>
                        <li><strong>Manual Bingo Claim:</strong> Click BINGO! when you win</li>
                        <li><strong>Host Verification:</strong> Host verifies all Bingo claims</li>
                        <li><strong>Three Win Conditions:</strong> Rows/Columns, Diagonals, or Four Corners</li>
                    </ul>
                </div>

                <div class="connection-status">
                    <p>Status: <span id="lobbyConnectionStatus">${document.getElementById('connectionStatus').textContent}</span></p>
                </div>
            </div>
        `);

        this.setupLobbyEvents();
        this.currentView = 'lobby';
    }

    setupLobbyEvents() {
        document.getElementById('createGameBtn')?.addEventListener('click', () => {
            this.createGame();
        });

        document.getElementById('joinGameBtn')?.addEventListener('click', () => {
            this.joinGame();
        });

        document.getElementById('gameCodeInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
    }

    createGame() {
        this.socket.emit('create-game', {
            playerName: this.playerName,
            playerId: this.playerId
        });
    }

    joinGame() {
        const gameCode = document.getElementById('gameCodeInput')?.value.trim().toUpperCase();
        if (gameCode && gameCode.length === 8) {
            this.socket.emit('join-game', {
                gameId: gameCode,
                playerId: this.playerId,
                playerName: this.playerName
            });
        } else {
            this.showMessage('Please enter a valid 8-character game code', 'error');
        }
    }

    handleGameJoined(data) {
        this.gameId = data.game.id;
        this.isHost = data.player.isHost;
        this.players = data.game.players;
        this.calledNumbers = data.game.calledNumbers;
        this.isGameActive = data.game.isGameActive;
        
        if (this.isGameActive) {
            // If game is already active, we need to get our card from server
            // For now, show a message
            this.showMessage('Game has already started. Please wait for the next game.', 'info');
            this.showGameRoom();
        } else {
            this.showCardSelection();
        }
    }

    showCardSelection() {
        this.updateMainContent(`
            <div class="card-selection">
                <div class="selection-header">
                    <h2>🎴 Choose Your Bingo Card</h2>
                    <p>Select one card from the available pool. Each card is unique!</p>
                    <div class="game-code-display">
                        Game Code: <strong>${this.gameId}</strong>
                        <button id="copyGameCodeBtn" class="btn small">📋 Copy</button>
                    </div>
                </div>

                <div class="cards-grid">
                    ${this.availableCards.map((card, index) => `
                        <div class="card-option" data-card-id="${index}">
                            <div class="card-preview">
                                <div class="preview-header">
                                    <span class="card-id">Card #${index + 1}</span>
                                    <span class="card-unique">Unique</span>
                                </div>
                                <div class="preview-numbers">
                                    <div class="preview-col">
                                        <span class="letter">B</span>
                                        <span class="numbers">${card.preview.B.join(', ')}</span>
                                    </div>
                                    <div class="preview-col">
                                        <span class="letter">I</span>
                                        <span class="numbers">${card.preview.I.join(', ')}</span>
                                    </div>
                                    <div class="preview-col">
                                        <span class="letter">N</span>
                                        <span class="numbers">${card.preview.N.join(', ')}</span>
                                    </div>
                                    <div class="preview-col">
                                        <span class="letter">G</span>
                                        <span class="numbers">${card.preview.G.join(', ')}</span>
                                    </div>
                                    <div class="preview-col">
                                        <span class="letter">O</span>
                                        <span class="numbers">${card.preview.O.join(', ')}</span>
                                    </div>
                                </div>
                            </div>
                            <button class="btn primary select-card-btn" data-card-id="${index}">
                                Select This Card
                            </button>
                        </div>
                    `).join('')}
                </div>

                <div class="selection-info">
                    <h3>ℹ️ Important</h3>
                    <ul>
                        <li>Choose carefully - you cannot change your card later</li>
                        <li>All cards are randomly generated and unique</li>
                        <li>Once all players select cards, the host can start the game</li>
                        <li>When you complete a winning pattern, click "BINGO!" to claim victory</li>
                    </ul>
                </div>
            </div>
        `);

        this.setupCardSelectionEvents();
        this.currentView = 'card-selection';
    }

    setupCardSelectionEvents() {
        document.querySelectorAll('.select-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cardId = parseInt(e.target.dataset.cardId);
                this.selectCard(cardId);
            });
        });

        document.getElementById('copyGameCodeBtn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(this.gameId);
            this.showMessage('Game code copied to clipboard!', 'success');
        });

        // Add hover effects
        document.querySelectorAll('.card-option').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.classList.add('hover');
            });
            card.addEventListener('mouseleave', () => {
                card.classList.remove('hover');
            });
        });
    }

    selectCard(cardId) {
        this.socket.emit('select-card', {
            gameId: this.gameId,
            cardId: cardId
        });
    }

    showGameRoom() {
        const playersWithCards = this.players.filter(p =>
