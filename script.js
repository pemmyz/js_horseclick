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

    // --- Audio ---
    // Create the AudioContext. It's best practice to create it once.
    // Some browsers require a user interaction (like a click) to start the audio context.
    // Our game structure (clicking "New Game") handles this naturally.
    let audioContext;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn("Web Audio API is not supported in this browser.");
    }

    /**
     * Plays a synthesized sound using the Web Audio API.
     * @param {object} options - The sound options.
     * @param {number} [options.frequency=440] - The pitch of the sound in Hz.
     * @param {number} [options.duration=0.1] - The duration of the sound in seconds.
     * @param {number} [options.volume=0.3] - The volume (0 to 1).
     * @param {string} [options.type='sine'] - The oscillator type ('sine', 'square', 'sawtooth', 'triangle').
     */
    function playSound({ frequency = 440, duration = 0.1, volume = 0.3, type = 'sine' }) {
        if (!audioContext) return; // Don't play sound if the context couldn't be created.

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // Connect the nodes: oscillator -> gain -> speakers
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Set sound properties
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

        // Set volume envelope to prevent harsh clicks
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01); // Quick fade-in
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime + duration - 0.02); // Hold volume
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration); // Quick fade-out

        // Start and stop the sound
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    }

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
        { id: 'p3', name: 'Player 3', key: 'l', keyDisplay: 'L', color: '#81c784' },
        { id: 'p4', name: 'Player 4', key: 'p', keyDisplay: 'P', color: '#ffd54f' }
    ];
    const vehicleOptions = ['🏇', '🏎', '🎠', '🏃‍♂️', '🚴‍♀️'];

    // --- Game State ---
    let drainRate, incrementPerTap;
    let activePlayers = [];
    let gameActive = false;
    let lastTime = 0;
    let currentDifficulty = 'hard';
    let countdownInterval;
    let playerToChangeKey = null;

    // --- Player Management ---
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
            <h3 style="color: ${playerData.color};">${playerData.name} (${playerData.keyDisplay})</h3>
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
                <div class="current-key-display">${playerData.keyDisplay}</div>
                <button class="change-key-btn" data-player-id="${playerData.id}">Change Key</button>
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
            controlsTitleElement: controlGroup.querySelector('h3'),
            customizeElement: customizeSection,
            currentVehicleElement: customizeSection.querySelector('.current-vehicle'),
            keyDisplayElement: customizeSection.querySelector('.current-key-display')
        };
        activePlayers.push(playerObject);
        
        const pressAction = (e) => {
            e.preventDefault();
            if (!gameActive || playerObject.isKeyDown) return;
            playerObject.isKeyDown = true;
            playerObject.force += incrementPerTap;
            if (playerObject.force > 100) playerObject.force = 100;
        };
        const releaseAction = () => {
            playerObject.isKeyDown = false;
        };

        playerObject.controlsElement.addEventListener('mousedown', pressAction);
        playerObject.controlsElement.addEventListener('touchstart', pressAction, { passive: false });

        playerObject.controlsElement.addEventListener('mouseup', releaseAction);
        playerObject.controlsElement.addEventListener('mouseleave', releaseAction);
        playerObject.controlsElement.addEventListener('touchend', releaseAction);

        laneContainer.querySelector('.remove-player-btn').addEventListener('click', () => removePlayer(playerData.id));
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
        // Resume AudioContext if it was suspended
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        if (countdownInterval) clearInterval(countdownInterval);
        prepareGameBoard();
        startCountdown(3, 'Game starting in:');
    }

    function startCountdown(duration, textPrefix) {
        newGameButton.disabled = true;
        let count = duration;
        
        countdownDisplay.textContent = `${textPrefix} ${count}`;
        playSound({ frequency: 330, duration: 0.15, type: 'sine' }); // Play "3" sound

        countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownDisplay.textContent = `${textPrefix} ${count}`;
                playSound({ frequency: 330, duration: 0.15, type: 'sine' }); // Play "2" and "1" sound
            } else {
                clearInterval(countdownInterval);
                countdownDisplay.textContent = 'GO!';
                // Play a higher, more distinct "GO" sound
                playSound({ frequency: 523, duration: 0.3, type: 'square' }); 
                
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
        if (playerToChangeKey) return;
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            toggleHelpModal();
            return;
        }
        if (e.key === 'Escape') {
            closeAllModals();
            return;
        }
        if (!gameActive) return;

        const key = e.key.toLowerCase();
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
        const keyBtn = e.target.closest('.change-key-btn');

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
        } else if (keyBtn && !playerToChangeKey) {
            startKeyChange(keyBtn);
        }
    }

    function startKeyChange(button) {
        const playerId = button.dataset.playerId;
        playerToChangeKey = activePlayers.find(p => p.id === playerId);
        button.textContent = 'Press any key...';
        button.classList.add('is-listening');
        document.addEventListener('keydown', handleKeySelection, { once: true });
    }
    
    function getKeyDisplay(e) {
        if (e.key === ' ') return 'Space';
        if (e.key.includes('Arrow')) return e.key.replace('Arrow', '') + ' Arrow';
        return e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }

    function handleKeySelection(e) {
        e.preventDefault();
        const newKey = e.key.toLowerCase();
        const newKeyDisplay = getKeyDisplay(e);

        if (activePlayers.some(p => p.key === newKey && p.id !== playerToChangeKey.id)) {
            alert(`Key "${newKeyDisplay}" is already in use. Please choose another.`);
        } else {
            playerToChangeKey.key = newKey;
            playerToChangeKey.keyDisplay = newKeyDisplay;
            playerToChangeKey.keyDisplayElement.textContent = newKeyDisplay;
            playerToChangeKey.controlsTitleElement.textContent = `${playerToChangeKey.name} (${newKeyDisplay})`;
        }
        
        const button = playerToChangeKey.customizeElement.querySelector('.change-key-btn');
        button.textContent = 'Change Key';
        button.classList.remove('is-listening');
        playerToChangeKey = null;
    }

    // --- Modals and UI ---
    function openModal(modal) {
        modalOverlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    }
    
    function closeAllModals() {
        if (playerToChangeKey) {
            const button = playerToChangeKey.customizeElement.querySelector('.change-key-btn');
            button.textContent = 'Change Key';
            button.classList.remove('is-listening');
            playerToChangeKey = null;
            document.removeEventListener('keydown', handleKeySelection);
        }
        modalOverlay.classList.add('hidden');
        customizeModal.classList.add('hidden');
        helpModal.classList.add('hidden');
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

    customizeToggleButton.addEventListener('click', openCustomizeModal);
    closeCustomizeModalButton.addEventListener('click', closeAllModals);
    customizeModal.addEventListener('click', handleCustomizeInteraction);

    closeHelpButton.addEventListener('click', closeAllModals);
    modalOverlay.addEventListener('click', closeAllModals);
    helpPrompt.addEventListener('click', toggleHelpModal);
    
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
    function initializeDefaultPlayers() {
        if (availablePlayers.length >= 2) {
            createPlayer(availablePlayers[0]);
            createPlayer(availablePlayers[1]);
        }
    }

    initializeDefaultPlayers();
    updateGameParameters();
    populatePlayerDropdown();
    updateGridLayout();
    updateGameReadyState();
    logMessage("Welcome! Two players are ready. Click 'New Game' to begin.");
});
