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
    const p1Title = document.getElementById('p1-title');
    const p2Title = document.getElementById('p2-title');

    // Countdown Element
    const countdownDisplay = document.getElementById('countdown-display');

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

    // --- Game Settings & Configs ---
    const MAX_SPEED = 200;
    const difficultySettings = {
        easy:   { increment: 18, drainRate: 0.2, drainSlider: 2 },
        medium: { increment: 12, drainRate: 0.4, drainSlider: 4 },
        hard:   { increment: 8,  drainRate: 0.7, drainSlider: 7 }
    };
    const controlConfigs = {
        'wasd-arrow': { player1: 'w', player2: 'arrowup', p1Display: 'W Key', p2Display: 'Up Arrow' },
        'shift-num': { player1: 'shift', player2: 'numpadenter', p1Display: 'Shift', p2Display: 'Numpad Enter' }
    };

    // --- Game State ---
    let p1Sprite = '🏇', p2Sprite = '🏇';
    let drainRate, incrementPerTap;
    let p1, p2, players;
    let gameActive = false;
    let lastTime = 0;
    let p1Score = 0, p2Score = 0;
    let currentDifficulty = 'hard';
    let currentControlScheme = 'wasd-arrow';
    let countdownInterval;
    let isFirstGame = true; // NEW: Flag for the initial automatic game

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

    function updatePlayerTitles() {
        const config = controlConfigs[currentControlScheme];
        p1Title.textContent = `Player 1 (${config.p1Display})`;
        p2Title.textContent = `Player 2 (${config.p2Display})`;
    }

    function handleDifficultyChange(event) {
        currentDifficulty = event.target.value;
        manualControlsArea.classList.toggle('hidden', currentDifficulty !== 'manual');
        updateGameParameters();
    }

    function createPlayer(id, name, horseEl, laneEl, forceBarEl, sprite) {
        return { id, name, horseEl, laneEl, forceBarEl, sprite, force: 0, position: 0, isKeyDown: false };
    }
    
    // NEW: Separated game board setup from starting the game
    function prepareGameBoard() {
        gameActive = false;
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
    }

    // UPDATED: This is now the main function for the "New Game" button
    function initGame() {
        if (countdownInterval) clearInterval(countdownInterval);
        prepareGameBoard();
        startCountdown(3, 'Game starting in:');
    }

    // UPDATED: This function is now generic for any countdown duration
    function startCountdown(duration, textPrefix) {
        newGameButton.disabled = true;
        let count = duration;
        countdownDisplay.textContent = `${textPrefix} ${count}`;

        countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownDisplay.textContent = `${textPrefix} ${count}`;
            } else {
                clearInterval(countdownInterval);
                countdownDisplay.textContent = 'GO!';
                setTimeout(() => {
                    countdownDisplay.textContent = '';
                }, 800);
                startGame();
            }
        }, 1000);
    }

    function startGame() {
        logMessage("📣🏁 The race has begun! Tap to run!");
        gameActive = true;
        lastTime = 0;
        newGameButton.disabled = false;
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
        const finishLine = player1Lane.querySelector('.finish-line');
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
    
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            closeCustomizeModal();
            return;
        }
        if (!gameActive) return;

        const config = controlConfigs[currentControlScheme];
        const key = e.key.toLowerCase();

        if (key === config.player1) {
            e.preventDefault();
            if (p1.isKeyDown) return;
            p1.isKeyDown = true;
            p1.force += incrementPerTap;
            if (p1.force > 100) p1.force = 100;
        } else if (key === config.player2 || (config.player2 === 'numpadenter' && key === 'enter')) {
            e.preventDefault();
            if (p2.isKeyDown) return;
            p2.isKeyDown = true;
            p2.force += incrementPerTap;
            if (p2.force > 100) p2.force = 100;
        }
    }

    function handleKeyUp(e) {
        if (!p1 || !p2) return;
        const config = controlConfigs[currentControlScheme];
        const key = e.key.toLowerCase();

        if (key === config.player1) {
            p1.isKeyDown = false;
        } else if (key === config.player2 || (config.player2 === 'numpadenter' && key === 'enter')) {
            p2.isKeyDown = false;
        }
    }

    function handleModalInteraction(e) {
        const vehicleBtn = e.target.closest('.vehicle-btn');
        const controlRadio = e.target.closest('input[name="controls"]');

        if (vehicleBtn) {
            const vehicle = vehicleBtn.dataset.vehicle;
            const selectorId = vehicleBtn.parentElement.id;
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
        
        if (controlRadio) {
            currentControlScheme = controlRadio.value;
            updatePlayerTitles();
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
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    newGameButton.addEventListener('click', initGame);
    customizeToggleButton.addEventListener('click', openCustomizeModal);
    closeModalButton.addEventListener('click', closeCustomizeModal);
    modalOverlay.addEventListener('click', closeCustomizeModal);
    customizeModal.addEventListener('click', handleModalInteraction);
    
    difficultyRadios.forEach(radio => radio.addEventListener('change', handleDifficultyChange));
    incrementSlider.addEventListener('input', () => {
        incrementValueDisplay.textContent = incrementSlider.value;
        if (currentDifficulty === 'manual') updateGameParameters();
    });
    drainRateSlider.addEventListener('input', () => {
        drainRateValueDisplay.textContent = (parseFloat(drainRateSlider.value) / 10).toFixed(1);
        if (currentDifficulty === 'manual') updateGameParameters();
    });

    // NEW: Listener for the initial game start
    window.addEventListener('focus', () => {
        if (isFirstGame) {
            isFirstGame = false; // Ensure this only runs once
            prepareGameBoard();
            startCountdown(5, 'First race starts in:');
        }
    }, { once: true }); // The { once: true } option is a clean way to auto-remove the listener after it runs.


    // --- Initializations ---
    updatePlayerTitles();
    updateGameParameters();
    p1 = createPlayer('p1', 'Player 1', player1Horse, player1Lane, p1ForceBar, p1Sprite);
    p2 = createPlayer('p2', 'Player 2', player2Horse, player2Lane, p2ForceBar, p2Sprite);
    logMessage("Welcome! The first race will start automatically.");
});
