class MultiplayerBingoGame {
    constructor() {
        this.backendUrl = window.BACKEND_URL || 'https://your-bingo-backend.onrender.com';
        this.socket = null;
        this.gameId = null;
        this.playerId = null;
        this.playerName = null;
        this.isHost = false;
        this.cells = [];
        this.markedCells = new Set([12]);
        this.calledNumbers = [];
        this.players = [];
        this.isGameActive = false;
        this.currentView = 'lobby';
        this.availableCards = [];
        this.selectedCard = null;
        this.hasClaimedBingo = false;
        this.pendingBingoClaims = []; // Track other players' claims
        
        this.init();
    }

    async init() {
        this.initializeTelegramApp();
        await this.initializeSocketConnection();
        this.showLobby();
    }

    initializeTelegramApp() {
        this.tg = window.Telegram.WebApp;
        this.tg.expand();
        this.tg.ready();
        
        const user = this.tg.initDataUnsafe?.user;
        this.playerId = user?.id || this.generatePlayerId();
        this.playerName = user?.first_name || user?.username || 'Player';
    }

    async initializeSocketConnection() {
        return new Promise((resolve) => {
            this.socket = io(this.backendUrl);
            
            this.socket.on('connect', () => {
                console.log('Connected to backend');
                resolve();
            });

            // New event: Receive card pool
            this.socket.on('card-pool', (data) => {
                this.availableCards = data.cards;
                this.showCardSelection();
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
                    document.getElementById('startGameBtn').disabled = false;
                }
            });

            // Bingo claim events
            this.socket.on('bingo-claimed', (data) => {
                this.pendingBingoClaims.push(data);
                this.showBingoClaim(data);
            });

            this.socket.on('bingo-verified', (data) => {
                this.handleBingoVerification(data);
            });

            // Existing events
            this.socket.on('game-created', (data) => {
                this.gameId = data.gameId;
                this.isHost = true;
                this.showMessage('Game created! Share the code with friends.', 'success');
            });

            this.socket.on('game-joined', (data) => {
                this.handleGameJoined(data);
            });

            this.socket.on('player-joined', (data) => {
                this.updatePlayersList(data.players);
                this.showMessage(`${data.player.name} joined the game!`, 'info');
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

            this.socket.on('error', (data) => {
                this.showMessage(data.message, 'error');
            });
        });
    }

    showCardSelection() {
        const mainContent = document.querySelector('main');
        mainContent.innerHTML = `
            <div class="card-selection">
                <div class="selection-header">
                    <h2>🎴 Choose Your Bingo Card</h2>
                    <p>Select one card from the available pool. Choose wisely!</p>
                </div>

                <div class="cards-grid">
                    ${this.availableCards.map((card, index) => `
                        <div class="card-option" data-card-id="${index}">
                            <div class="card-preview">
                                <div class="preview-header">
                                    <span class="card-id">Card #${index + 1}</span>
                                </div>
                                <div class="preview-numbers">
                                    <div class="preview-col">
                                        <strong>B:</strong> ${card.preview.B.join(', ')}
                                    </div>
                                    <div class="preview-col">
                                        <strong>I:</strong> ${card.preview.I.join(', ')}
                                    </div>
                                    <div class="preview-col">
                                        <strong>N:</strong> ${card.preview.N.join(', ')}
                                    </div>
                                    <div class="preview-col">
                                        <strong>G:</strong> ${card.preview.G.join(', ')}
                                    </div>
                                    <div class="preview-col">
                                        <strong>O:</strong> ${card.preview.O.join(', ')}
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
                    <h3>ℹ️ How to Play</h3>
                    <ul>
                        <li>Choose one card from the available options</li>
                        <li>Once selected, you cannot change your card</li>
                        <li>When you complete a winning pattern, click "BINGO!" to claim victory</li>
                        <li>The host will verify your Bingo claim</li>
                    </ul>
                </div>
            </div>
        `;

        this.setupCardSelectionEvents();
    }

    setupCardSelectionEvents() {
        document.querySelectorAll('.select-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cardId = parseInt(e.target.dataset.cardId);
                this.selectCard(cardId);
            });
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
        const mainContent = document.querySelector('main');
        mainContent.innerHTML = `
            <div class="game-room">
                <div class="room-header">
                    <h2>Game Room: <span id="roomCode">${this.gameId}</span></h2>
                    <div class="room-actions">
                        <button id="copyCodeBtn" class="btn small">Copy Code</button>
                        <button id="leaveRoomBtn" class="btn small danger">Leave</button>
                    </div>
                </div>

                <div class="players-panel">
                    <h3>Players (${this.players.length})</h3>
                    <div class="players-list" id="playersList">
                        ${this.players.map(player => this.renderPlayerItem(player)).join('')}
                    </div>
                </div>

                ${this.selectedCard ? this.renderCardPreview(this.selectedCard) : ''}

                <div class="room-controls">
                    ${this.isHost ? `
                        <button id="startGameBtn" class="btn primary" 
                                ${this.players.every(p => p.hasSelectedCard) ? '' : 'disabled'}>
                            Start Game 
                            ${this.players.every(p => p.hasSelectedCard) ? 
                              '(Ready!)' : 
                              `(${this.players.filter(p => p.hasSelectedCard).length}/${this.players.length} cards selected)`}
                        </button>
                    ` : `
                        <div class="waiting-host">
                            <p>Waiting for host to start the game...</p>
                            <div class="progress-status">
                                Cards selected: ${this.players.filter(p => p.hasSelectedCard).length}/${this.players.length}
                            </div>
                        </div>
                    `}
                </div>

                <div class="chat-panel">
                    <h3>Chat</h3>
                    <div class="chat-messages" id="chatMessages"></div>
                    <div class="chat-input">
                        <input type="text" id="chatInput" placeholder="Type a message..." maxlength="200">
                        <button id="sendChatBtn" class="btn small">Send</button>
                    </div>
                </div>
            </div>
        `;

        this.setupGameRoomEvents();
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
                      '<span class="status-badge ready">Card Selected</span>' : 
                      '<span class="status-badge waiting">Choosing Card</span>'}
                </div>
            </div>
        `;
    }

    renderCardPreview(card) {
        return `
            <div class="selected-card-preview">
                <h3>Your Selected Card</h3>
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

    renderGameBoard() {
        const mainContent = document.querySelector('main');
        mainContent.innerHTML = `
            <div class="multiplayer-game">
                <div class="game-header">
                    <div class="game-info">
                        <h2>Game: ${this.gameId}</h2>
                        <div class="game-stats">
                            <span>Players: ${this.players.length}</span>
                            <span>Numbers Called: <span id="numbersCount">${this.calledNumbers.length}</span></span>
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
                                ${this.selectedCard.map(cell => `
                                    <div class="bingo-cell ${cell.isFree ? 'free marked' : ''}" 
                                         data-index="${cell.index}" 
                                         data-number="${cell.number}">
                                        ${cell.isFree ? 'FREE' : cell.number}
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="win-conditions">
                            <h3>🎯 Win Conditions:</h3>
                            <ul>
                                <li>Complete any <strong>Row OR Column</strong></li>
                                <li>Complete <strong>Both Diagonals</strong></li>
                                <li>Mark all <strong>Four Corners</strong></li>
                            </ul>
                            <p><em>Click "BINGO!" when you complete a pattern</em></p>
                        </div>
                    </div>

                    <div class="game-sidebar">
                        <div class="bingo-claims-panel" id="bingoClaimsPanel">
                            <h3>⏳ Bingo Claims</h3>
                            <div class="claims-list" id="claimsList">
                                <!-- Pending claims will appear here -->
                            </div>
                        </div>

                        <div class="players-board">
                            <h3>Players</h3>
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
                            <h3>Called Numbers</h3>
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
        `;

        this.setupGameEvents();
        this.updateBingoButton();
    }

    setupGameEvents() {
        // Cell clicking
        document.querySelectorAll('.bingo-cell:not(.free)').forEach(cell => {
            cell.addEventListener('click', () => {
                const cellIndex = parseInt(cell.dataset.index);
                this.markCell(cellIndex, cell);
            });
        });

        // Bingo button
        document.getElementById('bingoBtn').addEventListener('click', () => {
            this.claimBingo();
        });

        // Other buttons
        document.getElementById('leaveGameBtn').addEventListener('click', () => this.leaveGame());
        document.getElementById('celebrateBtn').addEventListener('click', () => this.celebrate());
        document.getElementById('backToLobbyBtn').addEventListener('click', () => {
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
            
            // Update Bingo button state
            this.updateBingoButton();
            
            // Haptic feedback
            if (this.tg && this.tg.HapticFeedback) {
                this.tg.HapticFeedback.impactOccurred('medium');
            }
        }
    }

    updateBingoButton() {
        const bingoBtn = document.getElementById('bingoBtn');
        if (bingoBtn) {
            const hasWinningPattern = this.checkWinCondition();
            bingoBtn.disabled = !hasWinningPattern || this.hasClaimedBingo;
            
            if (hasWinningPattern && !this.hasClaimedBingo) {
                bingoBtn.classList.add('pulse');
                bingoBtn.title = 'Click to claim Bingo!';
            } else {
                bingoBtn.classList.remove('pulse');
                bingoBtn.title = this.hasClaimedBingo ? 
                    'You have already claimed Bingo' : 
                    'Complete a winning pattern first';
            }
        }
    }

    checkWinCondition() {
        // Condition 1: Any row OR any column
        let hasCompleteRow = false;
        let hasCompleteColumn = false;

        // Check rows
        for (let row = 0; row < 5; row++) {
            let rowComplete = true;
            for (let col = 0; col < 5; col++) {
                const index = row * 5 + col;
                if (index !== 12 && !this.markedCells.has(index)) {
                    rowComplete = false;
                    break;
                }
            }
            if (rowComplete) hasCompleteRow = true;
        }

        // Check columns
        for (let col = 0; col < 5; col++) {
            let colComplete = true;
            for (let row = 0; row < 5; row++) {
                const index = row * 5 + col;
                if (index !== 12 && !this.markedCells.has(index)) {
                    colComplete = false;
                    break;
                }
            }
            if (colComplete) hasCompleteColumn = true;
        }

        const condition1 = hasCompleteRow || hasCompleteColumn;

        // Condition 2: Both diagonals
        let mainDiagonalComplete = true;
        let antiDiagonalComplete = true;
        
        for (let i = 0; i < 5; i++) {
            const mainIndex = i * 5 + i;
            const antiIndex = i * 5 + (4 - i);
            if (mainIndex !== 12 && !this.markedCells.has(mainIndex)) mainDiagonalComplete = false;
            if (antiIndex !== 12 && !this.markedCells.has(antiIndex)) antiDiagonalComplete = false;
        }
        
        const condition2 = mainDiagonalComplete && antiDiagonalComplete;

        // Condition 3: Four corners
        const corners = [0, 4, 20, 24];
        const condition3 = corners.every(index => this.markedCells.has(index));

        return condition1 || condition2 || condition3;
    }

    claimBingo() {
        if (!this.hasClaimedBingo && this.checkWinCondition()) {
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
                <div class="claim-message">claims BINGO!</div>
                ${this.isHost ? `
                    <div class="claim-actions">
                        <button class="btn small success verify-btn" data-player-id="${claim.playerId}" data-valid="true">
                            ✅ Valid
                        </button>
                        <button class="btn small danger verify-btn" data-player-id="${claim.playerId}" data-valid="false">
                            ❌ Invalid
                        </button>
                    </div>
                ` : ''}
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
            // Highlight winning pattern
            if (data.winner.id === this.playerId) {
                this.highlightWinningPattern(data.winner.winningPattern);
            }
        } else {
            this.showMessage(data.message, 'warning');
        }

        // Clear claims list
        const claimsList = document.getElementById('claimsList');
        if (claimsList) {
            claimsList.innerHTML = '';
        }
    }

    // ... rest of your existing methods (handleGameStart, handleNumberCalled, etc.)
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerBingoGame();
});
