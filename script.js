document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const player1Horse = document.getElementById('player1-horse');
    const player2Horse = document.getElementById('player2-horse');
    const player1Lane = document.getElementById('player1-lane');
    const player2Lane = document.getElementById('player2-lane');
    const p1ForceBar = document.getElementById('player1-force-bar');
    const p2ForceBar = document.getElementById('player2-force-bar');
    const winnerAnnEl = document.getElementById('winner-announcement');
    const newGameButton = document.getElementById('new-game-button');
    const logList = document.getElementById('log-list');
    const logContainer = document.getElementById('log-container');
    const p1ScoreDisplay = document.getElementById('p1-score');
    const p2ScoreDisplay = document.getElementById('p2-score');

    // Modal & Customization Elements
    const customizeToggleButton = document.getElementById('customize-toggle-button');
    const modalOverlay = document.getElementById('modal-overlay');
    const customizeModal = document.getElementById('customize-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const p1CurrentVehicle = document.getElementById('p1-current-vehicle');
    const p2CurrentVehicle = document.getElementById('p2-current-vehicle');
    
    // Difficulty Elements
    const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
    const manualControlsArea = document.getElementById('manual-controls');
    const incrementSlider = document.getElementById('increment-slider');
    const incrementValueDisplay = document.getElementById('increment-value-display');
    const drainRateSlider = document.getElementById('drain-rate-slider');
    const drainRateValueDisplay = document.getElementById('drain-rate-value-display');

    // --- Game Settings ---
    const MAX_SPEED = 200;
    const PRESS_COOLDOWN = 50;
    const difficultySettings = {
        easy:   { increment: 18, drainRate: 0.2, drainSlider: 2 },
        medium: { increment: 12, drainRate: 0.4, drainSlider: 4 },
        hard:   { increment: 8,  drainRate: 0.7, drainSlider: 7 }
    };

    // --- Game State ---
    let p1Sprite = '🏇', p2Sprite = '🏇';
    let drainRate, incrementPerTap;
    let p1, p2, players;
    let gameActive = false;
    let lastTime = 0;
    let p1Score = 0, p2Score = 0;
    let currentDifficulty = 'medium';

    function updateGameParameters() {
        if (currentDifficulty === 'manual') {
            incrementPerTap = parseInt(incrementSlider.value);
            drainRate = parseFloat(drainRateSlider.value) / 10;
        } else {
            const settings = difficultySettings[currentDifficulty];
            incrementPerTap = settings.increment;
            drainRate = settings.drainRate;
            incrementSlider.value = incrementPerTap;
            drainRateSlider.value = settings.drainSlider;
        }
        incrementValueDisplay.textContent = incrementSlider.value;
        drainRateValueDisplay.textContent = (parseFloat(drainRateSlider.value) / 10).toFixed(1);
    }

    function handleDifficultyChange(event) {
        currentDifficulty = event.target.value;
        manualControlsArea.classList.toggle('hidden', currentDifficulty !== 'manual');
        updateGameParameters();
    }

    function createPlayer(id, name, horseEl, laneEl, forceBarEl, sprite) {
        return {
            id, name, horseEl, laneEl, forceBarEl, sprite,
            force: 0, position: 0, lastPressTime: 0
        };
    }
    
    function initGame() {
        updateGameParameters();

        p1 = createPlayer('p1', 'Player 1', player1Horse, player1Lane, p1ForceBar, p1Sprite);
        p2 = createPlayer('p2', 'Player 2', player2Horse, player2Lane, p2ForceBar, p2Sprite);
        players = [p1, p2];

        logList.innerHTML = '';
        winnerAnnEl.innerHTML = '';
        winnerAnnEl.className = '';
        updateScoreDisplay();
        
        players.forEach(p => {
            p.horseEl.innerHTML = p.sprite;
            p.horseEl.style.transform = `translateX(0px) scaleX(-1)`;
            p.forceBarEl.style.height = '0%';
        });

        logMessage("📣🏁 The race has begun! Tap to run!");
        gameActive = true;
        lastTime = 0;
        requestAnimationFrame(gameLoop);
    }

    function gameLoop(currentTime) {
        if (!gameActive) return;

        if (!lastTime) lastTime = currentTime;
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        players.forEach(p => {
            if (p.force > 0) {
                p.force -= drainRate;
                if (p.force < 0) p.force = 0;
            }

            let currentSpeed = (p.force / 100) * MAX_SPEED;
            p.position += currentSpeed * deltaTime;
            
            p.horseEl.style.transform = `translateX(${p.position}px) scaleX(-1)`;
            p.forceBarEl.style.height = `${p.force}%`;
        });

        checkWinCondition();
        requestAnimationFrame(gameLoop);
    }

    function checkWinCondition() {
        // UPDATED: Dynamically calculate the finish line's position
        // This makes it robust even if CSS for the finish line changes.
        const finishLine = player1Lane.querySelector('.finish-line');
        // The '10' should match the 'right' property value in the CSS for .finish-line
        const finishLineOffset = 10; 
        const trackWidth = player1Lane.clientWidth - player1Horse.clientWidth - finishLine.offsetWidth - finishLineOffset;

        const winner = players.find(p => p.position >= trackWidth);
        if (winner) endGame(winner);
    }

    function endGame(winner) {
        gameActive = false;
        logMessage(`📣🏆 The race is over! The winner is: ${winner.name}!`);
        winnerAnnEl.textContent = `${winner.name} Wins!`;
        winnerAnnEl.className = `${winner.id}-win`;
        
        if (winner.id === 'p1') p1Score++;
        else p2Score++;
        
        updateScoreDisplay();
    }
    
    function handleKeyPress(e) {
        if (!gameActive && e.key !== 'Escape') return;

        if (e.key === 'Escape') {
            closeCustomizeModal();
            return;
        }

        const currentTime = Date.now();
        if (e.key === 'w' || e.key === 'W') {
            if (currentTime - p1.lastPressTime > PRESS_COOLDOWN) {
                p1.force += incrementPerTap;
                if (p1.force > 100) p1.force = 100;
                p1.lastPressTime = currentTime;
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentTime - p2.lastPressTime > PRESS_COOLDOWN) {
                p2.force += incrementPerTap;
                if (p2.force > 100) p2.force = 100;
                p2.lastPressTime = currentTime;
            }
        }
    }

    function handleVehicleSelection(e) {
        const btn = e.target.closest('.vehicle-btn');
        if (!btn) return;

        const vehicle = btn.dataset.vehicle;
        const selectorId = btn.parentElement.id;

        if (selectorId === 'p1-vehicle-selector') {
            p1Sprite = vehicle;
            p1CurrentVehicle.textContent = vehicle;
            if (p1) p1.horseEl.innerHTML = vehicle;
        } else if (selectorId === 'p2-vehicle-selector') {
            p2Sprite = vehicle;
            p2CurrentVehicle.textContent = vehicle;
            if (p2) p2.horseEl.innerHTML = vehicle;
        }
    }
    
    function openCustomizeModal() {
        modalOverlay.classList.remove('hidden');
        customizeModal.classList.remove('hidden');
    }

    function closeCustomizeModal() {
        modalOverlay.classList.add('hidden');
        customizeModal.classList.add('hidden');
    }

    function logMessage(message) {
        const li = document.createElement('li');
        li.textContent = message;
        logList.appendChild(li);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    function updateScoreDisplay() {
        p1ScoreDisplay.textContent = `Score: ${p1Score}`;
        p2ScoreDisplay.textContent = `Score: ${p2Score}`;
    }
    
    // --- Event Listeners ---
    document.addEventListener('keydown', handleKeyPress);
    newGameButton.addEventListener('click', initGame);
    
    customizeToggleButton.addEventListener('click', openCustomizeModal);
    closeModalButton.addEventListener('click', closeCustomizeModal);
    modalOverlay.addEventListener('click', closeCustomizeModal);
    customizeModal.addEventListener('click', handleVehicleSelection);
    
    difficultyRadios.forEach(radio => radio.addEventListener('change', handleDifficultyChange));
    incrementSlider.addEventListener('input', () => {
        incrementValueDisplay.textContent = incrementSlider.value;
        if (currentDifficulty === 'manual') updateGameParameters();
    });
    drainRateSlider.addEventListener('input', () => {
        drainRateValueDisplay.textContent = (parseFloat(drainRateSlider.value) / 10).toFixed(1);
        if (currentDifficulty === 'manual') updateGameParameters();
    });

    // --- Initializations ---
    updateGameParameters();
    initGame();
});
