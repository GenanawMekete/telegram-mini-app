// Multiplayer Bingo Frontend
class MultiplayerBingoGame {
    constructor() {
        // Backend URL - Replace with your actual Render URL
        this.backendUrl = window.BACKEND_URL || 
                         import.meta.env?.VITE_BACKEND_URL || 
                         'https://telegram-mini-app-gamma-sandy.vercel.app/';
        
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
        this.currentView = 'lobby';
        
        this.init();
    }

    async init() {
        this.initializeTelegramApp();
        await this.initializeSocketConnection();
        this.showLobby();
        this.setupGlobalEventListeners();
        
        console.log('Frontend initialized with backend:', this.backendUrl);
    }

    initializeTelegramApp() {
        this.tg = window.Telegram.WebApp;
        this.tg.expand();
        this.tg.ready();
        
        const user = this.tg.initDataUnsafe?.user;
        this.playerId = user?.id || this.generatePlayerId();
        this.playerName = user?.first_name || user?.username || 'Player';
        
        if (document.getElementById('playerName')) {
            document.getElementById('playerName').textContent = this.playerName;
        }
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    async initializeSocketConnection() {
        return new Promise((resolve, reject) => {
            console.log('Connecting to backend:', this.backendUrl);
            
            this.socket = io(this.backendUrl, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5
            });
            
            this.socket.on('connect', () => {
                console.log('✅ Connected to backend successfully');
                this.showMessage('Connected to game server!', 'success');
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Connection failed:', error);
                this.showMessage('Failed to connect to game server. Please refresh.', 'error');
                reject(error);
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected from server:', reason);
                if (reason === 'io server disconnect') {
                    // Server forced disconnect, need to manually reconnect
                    this.socket.connect();
                }
            });

            this.socket.on('reconnecting', (attemptNumber) => {
                console.log('Reconnecting to server... Attempt:', attemptNumber);
            });

            // Game event handlers
            this.socket.on('game-created', (data) => {
                this.gameId = data.gameId;
                this.isHost = true;
                this.showMessage(data.message, 'success');
                this.showGameRoom();
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

            this.socket.on('player-won', (data) => {
                this.handlePlayerWon(data);
            });

            this.socket.on('chat-message', (data) => {
                this.displayChatMessage(data);
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

    // ... rest of your methods (createGame, joinGame, showLobby, etc.)
    // Make sure all API calls use this.backendUrl

    async loadServerStats() {
        try {
            const response = await fetch(`${this.backendUrl}/api/stats`);
            if (!response.ok) throw new Error('Stats endpoint not available');
            
            const data = await response.json();
            if (document.getElementById('activeGames')) {
                document.getElementById('activeGames').textContent = data.activeGames || 0;
            }
            if (document.getElementById('totalPlayers')) {
                document.getElementById('totalPlayers').textContent = data.totalPlayers || 0;
            }
        } catch (error) {
            console.log('Could not load server stats from:', this.backendUrl);
            // Set default values
            if (document.getElementById('activeGames')) {
                document.getElementById('activeGames').textContent = '0';
            }
            if (document.getElementById('totalPlayers')) {
                document.getElementById('totalPlayers').textContent = '0';
            }
        }
    }

    async testBackendConnection() {
        try {
            const response = await fetch(`${this.backendUrl}/health`);
            if (response.ok) {
                console.log('✅ Backend health check passed');
                return true;
            }
        } catch (error) {
            console.error('❌ Backend health check failed:', error);
        }
        return false;
    }

    showMessage(message, type = 'info') {
        // Your message display implementation
        console.log(`[${type}] ${message}`);
        
        // Simple message display
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            max-width: 300px;
            font-weight: 500;
            ${type === 'success' ? 'background: #4CAF50;' : ''}
            ${type === 'error' ? 'background: #f44336;' : ''}
            ${type === 'warning' ? 'background: #ff9800;' : ''}
            ${type === 'info' ? 'background: #2196F3;' : ''}
        `;
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.style.opacity = '0';
            messageEl.style.transition = 'opacity 0.5s ease';
            setTimeout(() => messageEl.remove(), 500);
        }, 3000);
    }

    // ... continue with all your other methods
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Test backend connection on startup
    const game = new MultiplayerBingoGame();
    
    // Expose game instance for debugging
    window.bingoGame = game;
    
    console.log('Bingo game initialized with backend URL:', game.backendUrl);
});
