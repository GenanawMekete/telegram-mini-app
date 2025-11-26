class MultiplayerBingoGame {
    constructor() {
        this.backendUrl = window.BACKEND_URL || 'https://final-bingo.onrender.com';
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
        const playersWithCards = this.players.filter(p => p.hasSelectedCard).length;
        const totalPlayers = this.players.length;
        
        this.updateMainContent(`
            <div class="game-room">
                <div class="room-header">
                    <h2>Game Room: <span id="roomCode">${this.gameId}</span></h2>
                    <div class="room-actions">
                        <button id="copyCodeBtn" class="btn small">📋 Copy Code</button>
                        <button id="leaveRoomBtn" class="btn small danger">🚪 Leave</button>
                    </div>
                </div>

                <div class="players-panel">
                    <h3>👥 Players (${totalPlayers})</h3>
                    <div class="players-list" id="playersList">
                        ${this.players.map(player => this.renderPlayerItem(player)).join('')}
                    </div>
                </div>

                ${this.selectedCard ? this.renderCardPreview(this.selectedCard) : ''}

                <div class="room-controls">
                    ${this.isHost ? `
                        <button id="startGameBtn" class="btn primary" 
                                ${playersWithCards === totalPlayers && totalPlayers > 0 ? '' : 'disabled'}>
                            🎮 Start Game 
                            ${playersWithCards === totalPlayers && totalPlayers > 0 ? 
                              '(Ready!)' : 
                              `(${playersWithCards}/${totalPlayers} cards selected)`}
                        </button>
                    ` : `
                        <div class="waiting-host">
                            <p>⏳ Waiting for host to start the game...</p>
                            <div class="progress-status">
                                Cards selected: ${playersWithCards}/${totalPlayers}
                                ${this.selectedCard ? '✓ Your card is ready' : 'Please select a card'}
                            </div>
                        </div>
                    `}
                </div>

                <div class="game-instructions">
                    <h3>🎯 Win Conditions:</h3>
                    <ul>
                        <li>Complete any <strong>Row OR Column</strong></li>
                        <li>Complete <strong>Both Diagonals</strong></li>
                        <li>Mark all <strong>Four Corners</strong></li>
                    </ul>
                    <p><em>When you complete a pattern, click "BINGO!" to claim victory</em></p>
                </div>
            </div>
        `);

        this.setupGameRoomEvents();
        this.currentView = 'game-room';
    }

    renderPlayerItem(player) {
        return `
            <div class="player-item ${player.id === this.playerId ? 'current-player' : ''}">
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
                    ${player.id === this.playerId ? '<span class="you-badge">You</span>' : ''}
                </div>
                <div class="player-status">
                    ${player.hasSelectedCard ? 
                      '<span class="status-badge ready">✓ Ready</span>' : 
                      '<span class="status-badge waiting">Choosing Card</span>'}
                    ${player.markedCount > 0 ? `<span class="marked-count">${player.markedCount}/24</span>` : ''}
                </div>
            </div>
        `;
    }

    renderCardPreview(card) {
        return `
            <div class="selected-card-preview">
                <h3>✅ Your Selected Card</h3>
                <div class="preview-grid">
                    ${card.map(cell => `
                        <div class="preview-cell ${cell.isFree ? 'free' : ''}">
                            ${cell.isFree ? 'FREE' : cell.number}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    setupGameRoomEvents() {
        document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(this.gameId);
            this.showMessage('Game code copied to clipboard!', 'success');
        });

        document.getElementById('leaveRoomBtn')?.addEventListener('click', () => {
            this.leaveGame();
        });

        document.getElementById('startGameBtn')?.addEventListener('click', () => {
            this.startGame();
        });
    }

    startGame() {
        this.socket.emit('start-game', { gameId: this.gameId });
    }

    handleGameStart(data) {
        this.isGameActive = true;
        this.calledNumbers = data.calledNumbers;
        this.showGameBoard();
    }

    showGameBoard() {
        this.updateMainContent(`
            <div class="multiplayer-game">
                <div class="game-header">
                    <div class="game-info">
                        <h2>🎯 Bingo Game: ${this.gameId}</h2>
                        <div class="game-stats">
                            <span>Players: ${this.players.length}</span>
                            <span>Numbers Called: <span id="numbersCount">${this.calledNumbers.length}</span></span>
                            <span>Marked: <span id="markedCount">${this.markedCells.size}</span>/24</span>
                        </div>
                    </div>
                    <div class="game-actions">
                        <button id="bingoBtn" class="btn celebration" disabled>
                            🎯 BINGO!
                        </button>
                        <button id="leaveGameBtn" class="btn danger">Leave Game</button>
                    </div>
                </div>

                <div class="game-content">
                    <div class="bingo-section">
                        <div class="bingo-card">
                            <div class="bingo-header">
                                <div class="bingo-letter">B</div>
                                <div class="bingo-letter">I</div>
                                <div class="bingo-letter">N</div>
                                <div class="bingo-letter">G</div>
                                <div class="bingo-letter">O</div>
                            </div>
                            <div class="bingo-grid" id="bingoGrid">
                                ${this.selectedCard ? this.selectedCard.map(cell => `
                                    <div class="bingo-cell ${cell.isFree ? 'free marked' : ''} 
                                         ${this.markedCells.has(cell.index) ? 'marked' : ''}"
                                         data-index="${cell.index}" 
                                         data-number="${cell.number}">
                                        ${cell.isFree ? 'FREE' : cell.number}
                                    </div>
                                `).join('') : 'Loading card...'}
                            </div>
                        </div>

                        <div class="win-conditions">
                            <h3>🏆 Winning Patterns:</h3>
                            <div class="win-condition-indicators">
                                <div class="condition-indicator" id="indicatorRowColumn">
                                    <span>📊 Row or Column</span>
                                </div>
                                <div class="condition-indicator" id="indicatorDiagonals">
                                    <span>❌ Both Diagonals</span>
                                </div>
                                <div class="condition-indicator" id="indicatorCorners">
                                    <span>🔲 Four Corners</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="game-sidebar">
                        <div class="bingo-claims-panel" id="bingoClaimsPanel">
                            <h3>⏳ Bingo Claims</h3>
                            <div class="claims-list" id="claimsList">
                                <!-- Claims will appear here -->
                            </div>
                        </div>

                        <div class="players-board">
                            <h3>📈 Player Progress</h3>
                            <div class="players-ranking" id="playersRanking">
                                ${this.players.map(player => `
                                    <div class="player-rank ${player.id === this.playerId ? 'current-player' : ''}">
                                        <span class="player-name">${player.name}</span>
                                        <span class="player-progress">
                                            <span class="progress-bar">
                                                <span class="progress-fill" style="width: ${(player.markedCount || 0) / 24 * 100}%"></span>
                                            </span>
                                            <span class="progress-text">${player.markedCount || 0}/24</span>
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="called-numbers-panel">
                            <h3>🔢 Called Numbers</h3>
                            <div class="numbers-grid" id="calledNumbers">
                                ${this.calledNumbers.map(number => `
                                    <div class="number-chip">${number}</div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="win-message hidden" id="winMessage">
                    <div class="win-content">
                        <h2 id="winTitle">🎉 BINGO! 🎉</h2>
                        <p id="winText"></p>
                        <div class="win-actions">
                            <button id="celebrateBtn" class="btn celebration">Celebrate!</button>
                            <button id="backToLobbyBtn" class="btn primary">Back to Lobby</button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this.setupGameEvents();
        this.updateBingoButton();
        this.currentView = 'game';
    }

    setupGameEvents() {
        // Cell clicking
        document.querySelectorAll('.bingo-cell:not(.free):not(.marked)').forEach(cell => {
            cell.addEventListener('click', () => {
                const cellIndex = parseInt(cell.dataset.index);
                this.markCell(cellIndex, cell);
            });
        });

        // Bingo button
        document.getElementById('bingoBtn')?.addEventListener('click', () => {
            this.claimBingo();
        });

        // Other buttons
        document.getElementById('leaveGameBtn')?.addEventListener('click', () => this.leaveGame());
        document.getElementById('celebrateBtn')?.addEventListener('click', () => this.celebrate());
        document.getElementById('backToLobbyBtn')?.addEventListener('click', () => {
            this.leaveGame();
            this.hideWinMessage();
        });
    }

    markCell(cellIndex, cellElement) {
        if (!this.isGameActive || this.markedCells.has(cellIndex)) {
            return;
        }

        const cell = this.selectedCard.find(c => c.index === cellIndex);
        if (cell && this.calledNumbers.includes(cell.number)) {
            this.socket.emit('mark-cell', {
                gameId: this.gameId,
                cellIndex: cellIndex
            });

            cellElement.classList.add('marked');
            this.markedCells.add(cellIndex);
            
            // Update marked count display
            this.updateUI(this.markedCells.size, 'markedCount');
            
            // Update Bingo button state
            this.updateBingoButton();
            
            // Haptic feedback
            if (this.tg && this.tg.HapticFeedback) {
                this.tg.HapticFeedback.impactOccurred('medium');
            }
        } else if (cell && !this.calledNumbers.includes(cell.number)) {
            this.showMessage(`Number ${cell.number} hasn't been called yet!`, 'warning');
        }
    }

    updateBingoButton() {
        const bingoBtn = document.getElementById('bingoBtn');
        if (bingoBtn) {
            bingoBtn.disabled = !this.canClaimBingo || this.hasClaimedBingo;
            
            if (this.canClaimBingo && !this.hasClaimedBingo) {
                bingoBtn.classList.add('pulse');
                bingoBtn.title = 'Click to claim Bingo victory!';
                bingoBtn.innerHTML = '🎯 BINGO! 🎉';
            } else if (this.hasClaimedBingo) {
                bingoBtn.classList.remove('pulse');
                bingoBtn.title = 'Waiting for host verification...';
                bingoBtn.innerHTML = '⏳ Bingo Claimed';
            } else {
                bingoBtn.classList.remove('pulse');
                bingoBtn.title = 'Complete a winning pattern first';
                bingoBtn.innerHTML = '🎯 BINGO!';
            }
        }
    }

    claimBingo() {
        if (this.canClaimBingo && !this.hasClaimedBingo) {
            this.socket.emit('claim-bingo', {
                gameId: this.gameId
            });
            this.hasClaimedBingo = true;
            this.updateBingoButton();
            this.showMessage('Bingo claimed! Waiting for host verification...', 'info');
        }
    }

    showBingoClaim(claim) {
        const claimsList = document.getElementById('claimsList');
        if (claimsList) {
            const claimElement = document.createElement('div');
            claimElement.className = 'bingo-claim';
            claimElement.innerHTML = `
                <div class="claim-header">
                    <strong>${claim.playerName}</strong>
                    <span class="claim-time">${new Date(claim.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="claim-message">claims BINGO! (${claim.markedCount}/24 marked)</div>
                ${this.isHost ? `
                    <div class="claim-actions">
                        <button class="btn small success verify-btn" data-player-id="${claim.playerId}" data-valid="true">
                            ✅ Validate
                        </button>
                        <button class="btn small danger verify-btn" data-player-id="${claim.playerId}" data-valid="false">
                            ❌ Reject
                        </button>
                    </div>
                ` : `
                    <div class="claim-pending">Waiting for host verification...</div>
                `}
            `;
            claimsList.appendChild(claimElement);

            // Setup verification buttons for host
            if (this.isHost) {
                claimElement.querySelectorAll('.verify-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const playerId = e.target.dataset.playerId;
                        const isValid = e.target.dataset.valid === 'true';
                        this.verifyBingoClaim(playerId, isValid);
                    });
                });
            }
        }
    }

    verifyBingoClaim(playerId, isValid) {
        this.socket.emit('verify-bingo', {
            gameId: this.gameId,
            playerId: playerId,
            isValid: isValid
        });
    }

    handleBingoVerification(data) {
        if (data.isValid) {
            this.showWinMessage(data.message, data.winner.id === this.playerId);
            if (data.winner.id === this.playerId) {
                // Highlight winning pattern for the winner
                this.highlightWinningPattern(data.winner.winningPattern);
            }
        } else {
            this.showMessage(data.message, 'warning');
            if (data.winner && data.winner.id === this.playerId) {
                this.hasClaimedBingo = false;
                this.updateBingoButton();
            }
        }

        // Clear claims list
        const claimsList = document.getElementById('claimsList');
        if (claimsList) {
            claimsList.innerHTML = '';
        }
    }

    handleNumberCalled(data) {
        this.calledNumbers = data.calledNumbers;
        this.updateCalledNumbersDisplay();
        this.updateUI(data.totalCalled, 'numbersCount');
        
        // Haptic feedback for new number
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('light');
        }
    }

    updateCalledNumbersDisplay() {
        const container = document.getElementById('calledNumbers');
        if (container) {
            container.innerHTML = this.calledNumbers.map(number => 
                `<div class="number-chip">${number}</div>`
            ).join('');
            container.scrollTop = container.scrollHeight;
        }
    }

    updatePlayersList(players) {
        this.players = players;
        
        const playersList = document.getElementById('playersList');
        const playersRanking = document.getElementById('playersRanking');
        
        if (playersList) {
            playersList.innerHTML = players.map(player => this.renderPlayerItem(player)).join('');
        }
        
        if (playersRanking) {
            playersRanking.innerHTML = players.map(player => `
                <div class="player-rank ${player.id === this.playerId ? 'current-player' : ''}">
                    <span class="player-name">${player.name}</span>
                    <span class="player-progress">
                        <span class="progress-bar">
                            <span class="progress-fill" style="width: ${(player.markedCount || 0) / 24 * 100}%"></span>
                        </span>
                        <span class="progress-text">${player.markedCount || 0}/24</span>
                    </span>
                </div>
            `).join('');
        }
    }

    updatePlayerMarkedCount(playerId, markedCount) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.markedCount = markedCount;
            this.updatePlayersList(this.players);
        }
    }

    updateGameControls() {
        // Update UI based on host status
        if (this.currentView === 'game-room') {
            this.showGameRoom();
        }
    }

    showWinMessage(message, isWinner) {
        const winMessage = document.getElementById('winMessage');
        const winText = document.getElementById('winText');
        
        if (winMessage && winText) {
            winText.textContent = message;
            winMessage.classList.remove('hidden');
            
            if (isWinner) {
                document.getElementById('winTitle').textContent = '🎉 YOU WIN! 🎉';
                // Haptic feedback for win
                if (this.tg && this.tg.HapticFeedback) {
                    this.tg.HapticFeedback.impactOccurred('heavy');
                }
            }
        }
    }

    hideWinMessage() {
        const winMessage = document.getElementById('winMessage');
        if (winMessage) {
            winMessage.classList.add('hidden');
        }
    }

    highlightWinningPattern(winningPattern) {
        winningPattern.forEach(pattern => {
            pattern.cells.forEach(cellIndex => {
                const cell = document.querySelector(`.bingo-cell[data-index="${cellIndex}"]`);
                if (cell) {
                    cell.classList.add('winning-pattern');
                }
            });
        });
    }

    celebrate() {
        document.body.classList.add('celebrating');
        setTimeout(() => {
            document.body.classList.remove('celebrating');
        }, 2000);
    }

    leaveGame() {
        if (this.socket) {
            this.socket.emit('leave-game');
        }
        this.resetGameState();
        this.showLobby();
    }

    resetGameState() {
        this.gameId = null;
        this.isHost = false;
        this.cells = [];
        this.markedCells = new Set([12]);
        this.calledNumbers = [];
        this.players = [];
        this.isGameActive = false;
        this.selectedCard = null;
        this.hasClaimedBingo = false;
        this.canClaimBingo = false;
        this.pendingBingoClaims = [];
    }

    updateMainContent(html) {
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.innerHTML = html;
        }
    }

    updateUI(content, elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = content;
        }
    }

    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.remove();
        }, 4000);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerBingoGame();
});
