document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const raceTrack = document.getElementById('race-track');
    const controlsContainer = document.getElementById('controls');
    const winnerAnnEl = document.getElementById('winner-announcement');
    const newGameButton = document.getElementById('new-game-button');
    const logList = document.getElementById('log-list');
    const logContainer = document.getElementById('log-container');
    const countdownDisplay = document.getElementById('countdown-display');

    // Player Management
    const playerSelect = document.getElementById('player-select');
    const addPlayerButton = document.getElementById('add-player-button');
    
    // Modals & Customization
    const customizeToggleButton = document.getElementById('customize-toggle-button');
    const modalOverlay = document.getElementById('modal-overlay');
    const customizeModal = document.getElementById('customize-modal');
    const closeCustomizeModalButton = document.getElementById('close-modal-button');
    const customizePlayerList = document.getElementById('customize-player-list');
    
    // Help Screen
    const helpModal = document.getElementById('help-modal');
    const closeHelpButton = document.getElementById('close-help-button');
    const helpControlsList = document.getElementById('help-controls-list');
    const helpPrompt = document.getElementById('help-prompt');

    // Difficulty
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
    const availablePlayers = [
        { id: 'p1', name: 'Player 1', key: 'w', keyDisplay: 'W', color: '#ff8a65' },
        { id: 'p2', name: 'Player 2', key: 'arrowup', keyDisplay: 'Up Arrow', color: '#64b5f6' },
        { id: 'p3', name: 'Player 3', key: 'g', keyDisplay: 'G', color: '#81c784' },
        { id: 'p4', name: 'Player 4', key: 'l', keyDisplay: 'L', color: '#ffd54f' }
    ];
    const vehicleOptions = ['🏇', '🏎', '🎠', '🏃‍♂️', '🚴‍♀️'];

    // --- Game State ---
    let drainRate, incrementPerTap;
    let activePlayers = [];
    let gameActive = false;
    let lastTime = 0;
    let currentDifficulty = 'hard';
    let countdownInterval;
    let playerBeingRebound = null;

    // --- Player Management & UI Generation ---
    function formatKeyDisplay(key) {
        if (key === 'arrowup') return 'Up Arrow';
        if (key === 'arrowdown') return 'Down Arrow';
        if (key === 'arrowleft') return 'Left Arrow';
        if (key === 'arrowright') return 'Right Arrow';
        if (key === ' ') return 'Space';
        return key.length === 1 ? key.toUpperCase() : key;
    }

    function populatePlayerDropdown() {
        playerSelect.innerHTML = '';
        const unselectedPlayers = availablePlayers.filter(ap => !activePlayers.some(p => p.id === ap.id));
        unselectedPlayers.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            playerSelect.appendChild(option);
        });
        addPlayerButton.disabled = unselectedPlayers.length === 0 || activePlayers.length >= 4;
    }

    function addPlayer() {
        if (playerSelect.value) {
            const playerData = availablePlayers.find(p => p.id === playerSelect.value);
            if (!playerData) return;
            createPlayer(playerData);
            populatePlayerDropdown();
            updateGridLayout();
            updateGameReadyState();
        }
    }

    function removePlayer(playerId) {
        if (playerBeingRebound && playerBeingRebound.id === playerId) {
            playerBeingRebound = null;
        }
        const playerIndex = activePlayers.findIndex(p => p.id === playerId);
        if (playerIndex > -1) {
            const player = activePlayers[playerIndex];
            player.laneElement.remove();
            player.controlsElement.remove();
            player.customizeElement.remove();
            activePlayers.splice(playerIndex, 1);
            populatePlayerDropdown();
            updateGridLayout();
            updateGameReadyState();
            updateAllPlayerKeyDisplays();
        }
    }

    function createPlayer(playerData) {
        // Create Lane
        const laneContainer = document.createElement('div');
        laneContainer.className = 'lane-container';
        laneContainer.innerHTML = `
            <div class="lane-label" style="color: ${playerData.color};">${playerData.name}</div>
            <div class="lane" id="${playerData.id}-lane">
                <div id="${playerData.id}-horse" class="horse" style="color: ${playerData.color};">🏇</div>
                <div class="finish-line">🏁</div>
            </div>
            <button class="remove-player-btn" data-player-id="${playerData.id}" title="Remove Player">×</button>
        `;
        raceTrack.appendChild(laneContainer);

        // Create Controls
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';
        controlGroup.innerHTML = `
            <p class="score" id="${playerData.id}-score">Score: 0</p>
            <h3 style="color: ${playerData.color};" data-player-id="${playerData.id}">${playerData.name} (${playerData.keyDisplay})</h3>
            <div class="force-container">
                <div id="${playerData.id}-force-bar" class="force-bar" style="background-color: ${playerData.color};"></div>
            </div>
        `;
        controlsContainer.appendChild(controlGroup);

        // Create Customization UI
        const customizeSection = document.createElement('div');
        customizeSection.className = 'customize-player-section';
        customizeSection.dataset.playerId = playerData.id;
        customizeSection.innerHTML = `
            <h4 style="color: ${playerData.color};">${playerData.name} Vehicle: <span class="current-vehicle">🏇</span></h4>
            <div class="vehicle-selector">
                ${vehicleOptions.map(v => `<button class="vehicle-btn" data-vehicle="${v}">${v}</button>`).join('')}
            </div>
            <div class="key-config-area">
                Control Key: 
                <span class="current-key-display">${playerData.keyDisplay}</span>
                <button class="change-key-btn" data-player-id="${playerData.id}">Change</button>
            </div>
        `;
        customizePlayerList.appendChild(customizeSection);

        // Create Player Object and add to active list
        const playerObject = {
            ...playerData,
            sprite: '🏇',
            force: 0,
            position: 0,
            isKeyDown: false,
            score: 0,
            laneElement: laneContainer,
            horseElement: laneContainer.querySelector('.horse'),
            forceBarElement: controlGroup.querySelector('.force-bar'),
            scoreElement: controlGroup.querySelector('.score'),
            controlsElement: controlGroup,
            customizeElement: customizeSection,
            currentVehicleElement: customizeSection.querySelector('.current-vehicle'),
            keyDisplayElement: customizeSection.querySelector('.current-key-display'),
            changeKeyButton: customizeSection.querySelector('.change-key-btn'),
            titleElement: controlGroup.querySelector('h3')
        };
        activePlayers.push(playerObject);
        laneContainer.querySelector('.remove-player-btn').addEventListener('click', () => removePlayer(playerData.id));
    }
    
    function updateAllPlayerKeyDisplays() {
        activePlayers.forEach(p => {
            p.keyDisplayElement.textContent = p.keyDisplay;
            p.titleElement.textContent = `${p.name} (${p.keyDisplay})`;
            p.changeKeyButton.textContent = 'Change';
            p.changeKeyButton.classList.remove('is-listening');
        });
        if (playerBeingRebound) {
            playerBeingRebound.changeKeyButton.textContent = 'Press a key...';
            playerBeingRebound.changeKeyButton.classList.add('is-listening');
        }
    }

    function updateGridLayout() {
        const numPlayers = activePlayers.length > 0 ? activePlayers.length : 1;
        const gridTemplate = `repeat(${numPlayers}, 1fr)`;
        controlsContainer.style.gridTemplateColumns = gridTemplate;
    }

    function updateGameReadyState() {
        const canStart = activePlayers.length > 0;
        newGameButton.disabled = !canStart;
        if (!canStart) {
            countdownDisplay.textContent = 'Add a player to begin!';
        } else if (!gameActive) {
            countdownDisplay.textContent = 'Press New Game to start';
        }
    }

    // --- Game Core ---
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
    
    function prepareGameBoard() {
        gameActive = false;
        updateGameParameters();

        logList.innerHTML = '';
        winnerAnnEl.innerHTML = '';
        winnerAnnEl.className = '';
        updateGameReadyState();
        
        activePlayers.forEach(p => {
            p.horseElement.innerHTML = p.sprite;
            p.horseElement.style.transform = `translateX(0px) scaleX(-1)`;
            p.forceBarElement.style.height = '0%';
            p.position = 0;
            p.force = 0;
        });
    }

    function initGame() {
        if (activePlayers.length === 0) {
            logMessage("⚠️ Add at least one player to start a game.");
            return;
        }
        if (countdownInterval) clearInterval(countdownInterval);
        prepareGameBoard();
        startCountdown(3, 'Game starting in:');
    }

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
        logMessage(`📣🏁 The race has begun! ${activePlayers.length} player(s) are off!`);
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

        activePlayers.forEach(p => {
            if (p.force > 0) {
                p.force -= drainRate;
                if (p.force < 0) p.force = 0;
            }
            let currentSpeed = (p.force / 100) * MAX_SPEED;
            p.position += currentSpeed * deltaTime;
            p.horseElement.style.transform = `translateX(${p.position}px) scaleX(-1)`;
            p.forceBarElement.style.height = `${p.force}%`;
        });

        checkWinCondition();
        requestAnimationFrame(gameLoop);
    }

    function checkWinCondition() {
        if (activePlayers.length === 0) return;
        const firstLane = activePlayers[0].laneElement.querySelector('.lane');
        const firstHorse = activePlayers[0].horseElement;
        const finishLine = firstLane.querySelector('.finish-line');
        const finishLineOffset = 10;
        const trackWidth = firstLane.clientWidth - firstHorse.clientWidth - finishLine.offsetWidth - finishLineOffset;
        
        const winner = activePlayers.find(p => p.position >= trackWidth);
        if (winner) endGame(winner);
    }

    function endGame(winner) {
        gameActive = false;
        logMessage(`📣🏆 The race is over! The winner is: ${winner.name}!`);
        winnerAnnEl.textContent = `${winner.name} Wins!`;
        winnerAnnEl.style.color = winner.color;
        
        winner.score++;
        updateScoreDisplay();
        updateGameReadyState();
    }
    
    // --- Event Handlers ---
    function handleKeyDown(e) {
        const key = e.key.toLowerCase();
        
        if (playerBeingRebound) {
            e.preventDefault();
            const isKeyInUse = activePlayers.some(p => p.key === key && p.id !== playerBeingRebound.id);
            if (isKeyInUse) {
                logMessage(`⚠️ Key "${formatKeyDisplay(key)}" is already in use!`);
                return;
            }
            if (['escape', 'h'].includes(key)) {
                logMessage(`⚠️ Key "${formatKeyDisplay(key)}" is reserved!`);
                return;
            }

            playerBeingRebound.key = key;
            playerBeingRebound.keyDisplay = formatKeyDisplay(key);
            playerBeingRebound = null;
            updateAllPlayerKeyDisplays();
            logMessage(`✅ Key assigned successfully!`);
            return;
        }

        if (key === 'h') {
            e.preventDefault();
            toggleHelpModal();
            return;
        }
        if (key === 'escape') {
            closeAllModals();
            return;
        }
        if (!gameActive) return;

        const player = activePlayers.find(p => p.key === key);
        if (player && !player.isKeyDown) {
            e.preventDefault();
            player.isKeyDown = true;
            player.force += incrementPerTap;
            if (player.force > 100) player.force = 100;
        }
    }

    function handleKeyUp(e) {
        if (activePlayers.length === 0) return;
        const key = e.key.toLowerCase();
        const player = activePlayers.find(p => p.key === key);
        if (player) {
            player.isKeyDown = false;
        }
    }
    
    function handleCustomizeInteraction(e) {
        const vehicleBtn = e.target.closest('.vehicle-btn');
        const changeKeyBtn = e.target.closest('.change-key-btn');

        if (vehicleBtn) {
            const vehicle = vehicleBtn.dataset.vehicle;
            const section = e.target.closest('.customize-player-section');
            const playerId = section.dataset.playerId;
            const player = activePlayers.find(p => p.id === playerId);
            if(player) {
                player.sprite = vehicle;
                player.currentVehicleElement.textContent = vehicle;
                player.horseElement.innerHTML = vehicle;
            }
        }
        
        if (changeKeyBtn) {
            const playerId = changeKeyBtn.dataset.playerId;
            playerBeingRebound = activePlayers.find(p => p.id === playerId) || null;
            updateAllPlayerKeyDisplays();
        }
    }

    // --- Modals and UI ---
    function openModal(modal) {
        modalOverlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    }
    
    function closeAllModals() {
        modalOverlay.classList.add('hidden');
        customizeModal.classList.add('hidden');
        helpModal.classList.add('hidden');
        if (playerBeingRebound) {
            playerBeingRebound = null;
            updateAllPlayerKeyDisplays();
        }
    }

    function openCustomizeModal() {
        openModal(customizeModal);
    }

    function toggleHelpModal() {
        if (helpModal.classList.contains('hidden')) {
            helpControlsList.innerHTML = '';
            if (activePlayers.length > 0) {
                activePlayers.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'help-control-item';
                    item.innerHTML = `<p>${p.name}: <span class="key">${p.keyDisplay}</span></p>`;
                    item.style.borderColor = p.color;
                    helpControlsList.appendChild(item);
                });
            } else {
                helpControlsList.innerHTML = '<p>No players have been added yet.</p>';
            }
            openModal(helpModal);
        } else {
            closeAllModals();
        }
    }

    // --- Utility Functions ---
    function logMessage(message) {
        const li = document.createElement('li');
        li.textContent = message;
        logList.appendChild(li);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    function updateScoreDisplay() {
        activePlayers.forEach(p => {
            p.scoreElement.textContent = `Score: ${p.score}`;
        });
    }
    
    // --- Event Listeners ---
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    newGameButton.addEventListener('click', initGame);
    addPlayerButton.addEventListener('click', addPlayer);
    helpPrompt.addEventListener('click', toggleHelpModal);

    customizeToggleButton.addEventListener('click', openCustomizeModal);
    closeCustomizeModalButton.addEventListener('click', closeAllModals);
    customizeModal.addEventListener('click', handleCustomizeInteraction);

    closeHelpButton.addEventListener('click', closeAllModals);
    modalOverlay.addEventListener('click', closeAllModals);
    
    difficultyRadios.forEach(radio => radio.addEventListener('change', (e) => {
        currentDifficulty = e.target.value;
        manualControlsArea.classList.toggle('hidden', currentDifficulty !== 'manual');
        updateGameParameters();
    }));
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
    populatePlayerDropdown();
    updateGridLayout();
    updateGameReadyState();
    logMessage("Welcome! Add players and click 'New Game' to begin.");
});
