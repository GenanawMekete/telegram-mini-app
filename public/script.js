class BingoGame {
    constructor() {
        this.cells = [];
        this.calledNumbers = [];
        this.isGameActive = false;
        this.gamesWon = 0;
        this.markedCells = new Set(); // Track marked cell indices
        this.winConditions = {
            rows: [false, false, false, false, false],
            columns: [false, false, false, false, false],
            diagonals: [false, false], // [mainDiagonal, antiDiagonal]
            fourCorners: false
        };
        this.init();
    }

    init() {
        this.initializeTelegramApp();
        this.createBingoCard();
        this.setupEventListeners();
        this.loadGameState();
        this.updateDisplay();
    }

    initializeTelegramApp() {
        this.tg = window.Telegram.WebApp;
        this.tg.expand();
        this.tg.ready();
        
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            document.getElementById('playerName').textContent = 
                user.first_name || user.username || 'Player';
        }
    }

    createBingoCard() {
        const grid = document.getElementById('bingoGrid');
        grid.innerHTML = '';
        this.cells = [];
        this.markedCells.clear();

        // Bingo number ranges for each column
        const ranges = [
            { min: 1, max: 15 },   // B
            { min: 16, max: 30 },  // I
            { min: 31, max: 45 },  // N
            { min: 46, max: 60 },  // G
            { min: 61, max: 75 }   // O
        ];

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const cell = document.createElement('div');
                cell.className = 'bingo-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                if (row === 2 && col === 2) {
                    // Center cell - FREE SPACE (automatically marked)
                    cell.textContent = 'FREE';
                    cell.classList.add('free', 'marked');
                    cell.dataset.number = 'FREE';
                    this.markedCells.add(this.getCellIndex(row, col));
                } else {
                    // Generate unique numbers for each column
                    const numbers = this.generateColumnNumbers(ranges[col].min, ranges[col].max);
                    const number = numbers[row];
                    cell.textContent = number;
                    cell.dataset.number = number;
                    
                    cell.addEventListener('click', () => this.markCell(cell));
                }
                
                grid.appendChild(cell);
                this.cells.push(cell);
            }
        }

        // Initialize win conditions
        this.resetWinConditions();
    }

    generateColumnNumbers(min, max) {
        const numbers = [];
        while (numbers.length < 5) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
        }
        return numbers;
    }

    getCellIndex(row, col) {
        return row * 5 + col;
    }

    setupEventListeners() {
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetGame());
        document.getElementById('celebrateBtn').addEventListener('click', () => this.celebrate());
        
        // Remove auto-mark button since we're doing manual marking only
        const autoMarkBtn = document.getElementById('autoMarkBtn');
        if (autoMarkBtn) {
            autoMarkBtn.style.display = 'none';
        }
    }

    newGame() {
        this.isGameActive = true;
        this.calledNumbers = [];
        this.markedCells.clear();
        this.createBingoCard();
        this.hideWinMessage();
        this.resetWinConditions();
        this.updateDisplay();
        this.saveGameState();
        
        // Start number calling
        this.startNumberCalling();
    }

    startNumberCalling() {
        if (this.numberCallingInterval) {
            clearInterval(this.numberCallingInterval);
        }
        
        this.numberCallingInterval = setInterval(() => {
            if (this.isGameActive && this.calledNumbers.length < 75) {
                this.callRandomNumber();
            }
        }, 3000);
    }

    callRandomNumber() {
        let number;
        do {
            number = Math.floor(Math.random() * 75) + 1;
        } while (this.calledNumbers.includes(number));
        
        this.calledNumbers.push(number);
        this.updateCalledNumbersDisplay();
        this.updateDisplay();
        this.saveGameState();
        
        // Haptic feedback for new number
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('light');
        }
    }

    markCell(cell) {
        if (!this.isGameActive || 
            cell.classList.contains('free') || 
            cell.classList.contains('marked')) {
            return;
        }

        const number = parseInt(cell.dataset.number);
        if (!this.calledNumbers.includes(number)) {
            this.showMessage(`Number ${number} hasn't been called yet!`);
            return;
        }

        cell.classList.add('marked');
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const cellIndex = this.getCellIndex(row, col);
        
        this.markedCells.add(cellIndex);
        
        // Haptic feedback
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('medium');
        }

        this.checkWinCondition();
        this.updateDisplay();
        this.saveGameState();
    }

    checkWinCondition() {
        this.updateWinConditions();
        
        // Check Condition 1: Any row OR any column
        const hasCompleteRow = this.winConditions.rows.some(complete => complete);
        const hasCompleteColumn = this.winConditions.columns.some(complete => complete);
        const condition1 = hasCompleteRow || hasCompleteColumn;

        // Check Condition 2: Both diagonals
        const condition2 = this.winConditions.diagonals.every(complete => complete);

        // Check Condition 3: Four corners
        const condition3 = this.winConditions.fourCorners;

        if (condition1 || condition2 || condition3) {
            this.handleWin(condition1, condition2, condition3);
        }
    }

    updateWinConditions() {
        // Reset win conditions
        this.resetWinConditions();

        // Check rows
        for (let row = 0; row < 5; row++) {
            let rowComplete = true;
            for (let col = 0; col < 5; col++) {
                const cellIndex = this.getCellIndex(row, col);
                if (!this.markedCells.has(cellIndex)) {
                    rowComplete = false;
                    break;
                }
            }
            this.winConditions.rows[row] = rowComplete;
        }

        // Check columns
        for (let col = 0; col < 5; col++) {
            let colComplete = true;
            for (let row = 0; row < 5; row++) {
                const cellIndex = this.getCellIndex(row, col);
                if (!this.markedCells.has(cellIndex)) {
                    colComplete = false;
                    break;
                }
            }
            this.winConditions.columns[col] = colComplete;
        }

        // Check diagonals
        let mainDiagonalComplete = true;
        let antiDiagonalComplete = true;
        
        for (let i = 0; i < 5; i++) {
            // Main diagonal (0,0; 1,1; 2,2; 3,3; 4,4)
            const mainIndex = this.getCellIndex(i, i);
            if (!this.markedCells.has(mainIndex)) {
                mainDiagonalComplete = false;
            }
            
            // Anti-diagonal (0,4; 1,3; 2,2; 3,1; 4,0)
            const antiIndex = this.getCellIndex(i, 4 - i);
            if (!this.markedCells.has(antiIndex)) {
                antiDiagonalComplete = false;
            }
        }
        
        this.winConditions.diagonals[0] = mainDiagonalComplete;
        this.winConditions.diagonals[1] = antiDiagonalComplete;

        // Check four corners
        const topLeft = this.getCellIndex(0, 0);
        const topRight = this.getCellIndex(0, 4);
        const bottomLeft = this.getCellIndex(4, 0);
        const bottomRight = this.getCellIndex(4, 4);
        
        this.winConditions.fourCorners = 
            this.markedCells.has(topLeft) &&
            this.markedCells.has(topRight) &&
            this.markedCells.has(bottomLeft) &&
            this.markedCells.has(bottomRight);
    }

    resetWinConditions() {
        this.winConditions = {
            rows: [false, false, false, false, false],
            columns: [false, false, false, false, false],
            diagonals: [false, false],
            fourCorners: false
        };
    }

    handleWin(condition1, condition2, condition3) {
        this.isGameActive = false;
        this.gamesWon++;
        
        let winMessage = '🎉 BINGO! 🎉\n';
        if (condition1) winMessage += 'Complete Row or Column!';
        if (condition2) winMessage += 'Both Diagonals Complete!';
        if (condition3) winMessage += 'Four Corners!';
        
        this.showWinMessage(winMessage);
        
        if (this.numberCallingInterval) {
            clearInterval(this.numberCallingInterval);
        }

        // Highlight winning pattern
        this.highlightWinningPattern(condition1, condition2, condition3);

        // Haptic feedback for win
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('heavy');
        }

        this.saveGameState();
    }

    highlightWinningPattern(condition1, condition2, condition3) {
        // Remove previous highlights
        this.cells.forEach(cell => {
            cell.classList.remove('winning-pattern');
        });

        if (condition1) {
            // Highlight completed rows and columns
            this.winConditions.rows.forEach((complete, row) => {
                if (complete) {
                    for (let col = 0; col < 5; col++) {
                        const cell = this.cells[this.getCellIndex(row, col)];
                        cell.classList.add('winning-pattern');
                    }
                }
            });
            
            this.winConditions.columns.forEach((complete, col) => {
                if (complete) {
                    for (let row = 0; row < 5; row++) {
                        const cell = this.cells[this.getCellIndex(row, col)];
                        cell.classList.add('winning-pattern');
                    }
                }
            });
        }

        if (condition2) {
            // Highlight both diagonals
            for (let i = 0; i < 5; i++) {
                // Main diagonal
                const mainCell = this.cells[this.getCellIndex(i, i)];
                mainCell.classList.add('winning-pattern');
                
                // Anti-diagonal
                const antiCell = this.cells[this.getCellIndex(i, 4 - i)];
                antiCell.classList.add('winning-pattern');
            }
        }

        if (condition3) {
            // Highlight four corners
            const corners = [
                this.getCellIndex(0, 0),
                this.getCellIndex(0, 4),
                this.getCellIndex(4, 0),
                this.getCellIndex(4, 4)
            ];
            
            corners.forEach(index => {
                this.cells[index].classList.add('winning-pattern');
            });
        }
    }

    showWinMessage(message) {
        const winMessage = document.getElementById('winMessage');
        const winText = document.getElementById('winText');
        
        winText.textContent = message;
        winMessage.classList.remove('hidden');
    }

    hideWinMessage() {
        const winMessage = document.getElementById('winMessage');
        winMessage.classList.add('hidden');
        
        // Remove winning pattern highlights
        this.cells.forEach(cell => {
            cell.classList.remove('winning-pattern');
        });
    }

    celebrate() {
        document.body.classList.add('celebrating');
        setTimeout(() => {
            document.body.classList.remove('celebrating');
        }, 2000);
    }

    resetGame() {
        this.isGameActive = false;
        this.calledNumbers = [];
        this.markedCells.clear();
        this.createBingoCard();
        this.hideWinMessage();
        this.resetWinConditions();
        
        if (this.numberCallingInterval) {
            clearInterval(this.numberCallingInterval);
        }
        
        this.updateDisplay();
        this.saveGameState();
    }

    updateCalledNumbersDisplay() {
        const container = document.getElementById('calledNumbers');
        container.innerHTML = '';
        
        this.calledNumbers.forEach(number => {
            const chip = document.createElement('div');
            chip.className = 'number-chip';
            chip.textContent = number;
            container.appendChild(chip);
        });
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    updateDisplay() {
        document.getElementById('numbersCalled').textContent = this.calledNumbers.length;
        document.getElementById('markedCount').textContent = this.markedCells.size;
        document.getElementById('gamesWon').textContent = this.gamesWon;
        
        // Update win condition indicators
        this.updateWinConditionDisplay();
    }

    updateWinConditionDisplay() {
        // Create or update win condition indicators
        let indicators = document.getElementById('winConditionIndicators');
        if (!indicators) {
            indicators = document.createElement('div');
            indicators.id = 'winConditionIndicators';
            indicators.className = 'win-condition-indicators';
            document.querySelector('.game-controls').after(indicators);
        }

        indicators.innerHTML = `
            <div class="condition-indicator ${this.winConditions.rows.some(r => r) || this.winConditions.columns.some(c => c) ? 'active' : ''}">
                <span>📊 Row/Column</span>
            </div>
            <div class="condition-indicator ${this.winConditions.diagonals.every(d => d) ? 'active' : ''}">
                <span>❌ Both Diagonals</span>
            </div>
            <div class="condition-indicator ${this.winConditions.fourCorners ? 'active' : ''}">
                <span>🔲 Four Corners</span>
            </div>
        `;
    }

    showMessage(message) {
        // Simple message display
        const messageEl = document.createElement('div');
        messageEl.className = 'temp-message';
        messageEl.textContent = message;
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.remove();
        }, 2000);
    }

    saveGameState() {
        const gameState = {
            cells: this.cells.map(cell => ({
                number: cell.dataset.number,
                marked: cell.classList.contains('marked')
            })),
            calledNumbers: this.calledNumbers,
            gamesWon: this.gamesWon,
            isGameActive: this.isGameActive,
            markedCells: Array.from(this.markedCells)
        };
        localStorage.setItem('bingoGameState', JSON.stringify(gameState));
    }

    loadGameState() {
        const saved = localStorage.getItem('bingoGameState');
        if (saved) {
            const gameState = JSON.parse(saved);
            this.calledNumbers = gameState.calledNumbers || [];
            this.gamesWon = gameState.gamesWon || 0;
            this.isGameActive = gameState.isGameActive || false;
            this.markedCells = new Set(gameState.markedCells || []);
            
            this.updateCalledNumbersDisplay();
            
            // Restore cell states
            if (gameState.cells) {
                setTimeout(() => {
                    gameState.cells.forEach((cellState, index) => {
                        if (cellState.marked && this.cells[index]) {
                            this.cells[index].classList.add('marked');
                        }
                    });
                    this.updateWinConditions();
                    this.updateDisplay();
                }, 100);
            }
            
            if (this.isGameActive) {
                this.startNumberCalling();
            }
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new BingoGame();
});
