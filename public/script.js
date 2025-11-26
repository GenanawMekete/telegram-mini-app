class BingoGame {
    constructor() {
        this.cells = [];
        this.calledNumbers = [];
        this.isGameActive = false;
        this.gamesWon = 0;
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
        
        // Set user info if available
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
                
                if (row === 2 && col === 2) {
                    // Center cell - FREE SPACE
                    cell.textContent = 'FREE';
                    cell.classList.add('free');
                    cell.dataset.number = 'FREE';
                    cell.dataset.row = row;
                    cell.dataset.col = col;
                } else {
                    // Generate unique numbers for each column
                    const numbers = this.generateColumnNumbers(ranges[col].min, ranges[col].max);
                    const number = numbers[row];
                    cell.textContent = number;
                    cell.dataset.number = number;
                    cell.dataset.row = row;
                    cell.dataset.col = col;
                    
                    cell.addEventListener('click', () => this.markCell(cell));
                }
                
                grid.appendChild(cell);
                this.cells.push(cell);
            }
        }
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

    setupEventListeners() {
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());
        document.getElementById('autoMarkBtn').addEventListener('click', () => this.autoMark());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetGame());
        document.getElementById('celebrateBtn').addEventListener('click', () => this.celebrate());
    }

    newGame() {
        this.isGameActive = true;
        this.calledNumbers = [];
        this.createBingoCard();
        this.hideWinMessage();
        this.updateDisplay();
        this.saveGameState();
        
        // Simulate calling numbers automatically
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
        }, 3000); // Call a number every 3 seconds
    }

    callRandomNumber() {
        let number;
        do {
            number = Math.floor(Math.random() * 75) + 1;
        } while (this.calledNumbers.includes(number));
        
        this.calledNumbers.push(number);
        this.updateCalledNumbersDisplay();
        this.autoMarkCalledNumbers();
        this.updateDisplay();
        this.saveGameState();
        
        // Haptic feedback
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('light');
        }
    }

    markCell(cell) {
        if (!this.isGameActive || cell.classList.contains('free') || cell.classList.contains('marked')) {
            return;
        }

        cell.classList.add('marked');
        
        // Haptic feedback
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('medium');
        }

        this.checkWinCondition();
        this.updateDisplay();
        this.saveGameState();
    }

    autoMark() {
        if (!this.isGameActive) return;
        
        this.cells.forEach(cell => {
            const number = parseInt(cell.dataset.number);
            if (!isNaN(number) && this.calledNumbers.includes(number) && !cell.classList.contains('marked')) {
                cell.classList.add('marked');
            }
        });
        
        this.checkWinCondition();
        this.updateDisplay();
        this.saveGameState();
    }

    autoMarkCalledNumbers() {
        this.cells.forEach(cell => {
            const number = parseInt(cell.dataset.number);
            if (!isNaN(number) && this.calledNumbers.includes(number) && !cell.classList.contains('marked')) {
                cell.classList.add('marked');
            }
        });
        
        this.checkWinCondition();
    }

    checkWinCondition() {
        // Check rows
        for (let row = 0; row < 5; row++) {
            if (this.checkRow(row)) {
                this.handleWin();
                return;
            }
        }

        // Check columns
        for (let col = 0; col < 5; col++) {
            if (this.checkColumn(col)) {
                this.handleWin();
                return;
            }
        }

        // Check diagonals
        if (this.checkDiagonal(true) || this.checkDiagonal(false)) {
            this.handleWin();
            return;
        }
    }

    checkRow(row) {
        for (let col = 0; col < 5; col++) {
            const cell = this.getCell(row, col);
            if (!cell.classList.contains('marked') && !cell.classList.contains('free')) {
                return false;
            }
        }
        return true;
    }

    checkColumn(col) {
        for (let row = 0; row < 5; row++) {
            const cell = this.getCell(row, col);
            if (!cell.classList.contains('marked') && !cell.classList.contains('free')) {
                return false;
            }
        }
        return true;
    }

    checkDiagonal(isMain) {
        for (let i = 0; i < 5; i++) {
            const row = i;
            const col = isMain ? i : 4 - i;
            const cell = this.getCell(row, col);
            if (!cell.classList.contains('marked') && !cell.classList.contains('free')) {
                return false;
            }
        }
        return true;
    }

    getCell(row, col) {
        return document.querySelector(`.bingo-cell[data-row="${row}"][data-col="${col}"]`);
    }

    handleWin() {
        this.isGameActive = false;
        this.gamesWon++;
        this.showWinMessage();
        
        if (this.numberCallingInterval) {
            clearInterval(this.numberCallingInterval);
        }

        // Haptic feedback for win
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('heavy');
        }

        this.saveGameState();
    }

    showWinMessage() {
        const winMessage = document.getElementById('winMessage');
        winMessage.classList.remove('hidden');
    }

    hideWinMessage() {
        const winMessage = document.getElementById('winMessage');
        winMessage.classList.add('hidden');
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
        this.createBingoCard();
        this.hideWinMessage();
        
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
        document.getElementById('markedCount').textContent = 
            this.cells.filter(cell => cell.classList.contains('marked')).length;
        document.getElementById('gamesWon').textContent = this.gamesWon;
    }

    saveGameState() {
        const gameState = {
            cells: this.cells.map(cell => ({
                number: cell.dataset.number,
                marked: cell.classList.contains('marked')
            })),
            calledNumbers: this.calledNumbers,
            gamesWon: this.gamesWon,
            isGameActive: this.isGameActive
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
            
            this.updateCalledNumbersDisplay();
            
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
