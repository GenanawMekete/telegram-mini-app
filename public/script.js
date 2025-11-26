class MultiplayerBingo {
    constructor() {
        this.players = [];
        this.availableCards = this.generateCardPool(50); // Pool of 50 cards
        this.selectedCards = new Set();
        this.gameState = 'waiting'; // waiting, selecting, playing
        this.countdown = 30;
        this.currentPlayer = 'Abush'; // or get from user
    }

    generateCardPool(count) {
        const cards = [];
        for (let i = 0; i < count; i++) {
            cards.push(this.generateBingoCard());
        }
        return cards;
    }

    generateBingoCard() {
        // Generate random bingo card following standard rules
        const ranges = {
            'B': [1, 15], 'I': [16, 30], 'N': [31, 45], 
            'G': [46, 60], 'O': [61, 75]
        };
        
        const card = [];
        Object.keys(ranges).forEach(letter => {
            const [min, max] = ranges[letter];
            const column = [];
            while (column.length < 5) {
                const num = Math.floor(Math.random() * (max - min + 1)) + min;
                if (!column.includes(num)) column.push(num);
            }
            card.push(column);
        });
        
        // Set FREE space
        card[2][2] = 'FREE';
        return card;
    }

    startNewGame() {
        this.gameState = 'selecting';
        this.startCountdown();
        this.displayCardSelection();
    }

    startCountdown() {
        const timer = setInterval(() => {
            this.countdown--;
            this.updateCountdownDisplay();
            
            if (this.countdown <= 0) {
                clearInterval(timer);
                this.startGameplay();
            }
        }, 1000);
    }

    displayCardSelection() {
        // Show card selection interface
        const selectionContainer = document.createElement('div');
        selectionContainer.id = 'card-selection';
        selectionContainer.innerHTML = `
            <h3>Select Your Bingo Card (${this.countdown}s remaining)</h3>
            <div class="card-grid">
                ${this.availableCards.map((card, index) => `
                    <div class="bingo-card-option" onclick="multiplayer.selectCard(${index})">
                        Card ${index + 1}
                        <div class="card-preview">
                            ${this.renderCardPreview(card)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        document.body.appendChild(selectionContainer);
    }

    selectCard(cardIndex) {
        if (this.selectedCards.has(cardIndex)) {
            alert('Card already selected by another player!');
            return;
        }
        
        this.selectedCards.add(cardIndex);
        this.players.push({
            name: this.currentPlayer,
            card: this.availableCards[cardIndex],
            gems: 1 // Starting gems
        });
        
        // Hide selection and show waiting message
        document.getElementById('card-selection').style.display = 'none';
        this.showWaitingMessage();
    }

    startGameplay() {
        this.gameState = 'playing';
        // Initialize multiplayer connection
        this.initializeMultiplayer();
        // Start number calling
        this.startNumberCalling();
    }

    initializeMultiplayer() {
        // WebSocket or Socket.io connection for real-time updates
        console.log('Multiplayer game starting...');
        // Implement real-time player synchronization
    }
}

// Initialize multiplayer
const multiplayer = new MultiplayerBingo();
