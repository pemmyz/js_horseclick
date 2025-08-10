document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const raceTrack = document.getElementById('race-track');
    const controlsContainer = document.getElementById('controls');
    const winnerAnnEl = document.getElementById('winner-announcement');
    const newGameButton = document.getElementById('new-game-button');
    const logList = document.getElementById('log-list');
    const logContainer = document.getElementById('log-container');
    const countdownDisplay = document.getElementById('countdown-display');
    const playerSelect = document.getElementById('player-select');
    const addPlayerButton = document.getElementById('add-player-button');
    const customizeToggleButton = document.getElementById('customize-toggle-button');
    const modalOverlay = document.getElementById('modal-overlay');
    const customizeModal = document.getElementById('customize-modal');
    const closeCustomizeModalButton = document.getElementById('close-modal-button');
    const customizePlayerList = document.getElementById('customize-player-list');
    const helpModal = document.getElementById('help-modal');
    const closeHelpButton = document.getElementById('close-help-button');
    const helpControlsList = document.getElementById('help-controls-list');
    const helpPrompt = document.getElementById('help-prompt');
    const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
    const incrementSlider = document.getElementById('increment-slider');
    const incrementValueDisplay = document.getElementById('increment-value-display');
    const drainRateSlider = document.getElementById('drain-rate-slider');
    const drainRateValueDisplay = document.getElementById('drain-rate-value-display');
    const volumeSlider = document.getElementById('volume-slider');
    const muteButton = document.getElementById('mute-button');
    const startModeSelect = document.getElementById('start-mode-select');
    const boostSlider = document.getElementById('boost-slider');
    const boostValueDisplay = document.getElementById('boost-value-display');
    const boostSliderGroup = document.getElementById('boost-slider-group');
    const falseStartPenaltySelect = document.getElementById('false-start-penalty-select');
    const falseStartPenaltyGroup = document.getElementById('false-start-penalty-group');


    // --- Audio Setup ---
    let audioContext;
    let masterGainNode;
    let masterVolume = 0.5;
    let isMuted = false;

    // --- Game Settings & Configs ---
    const MAX_SPEED = 200;
    const difficultySettings = {
        easy:   { increment: 18, drainRate: 0.2, drainSlider: 2 },
        medium: { increment: 12, drainRate: 0.4, drainSlider: 4 },
        hard:   { increment: 8,  drainRate: 0.7, drainSlider: 7 }
    };
    const availablePlayers = [
        { id: 'p1', name: 'Player 1', key: 'w', keyDisplay: 'W', key2: 'e', key2Display: 'E', color: '#ff8a65' },
        { id: 'p2', name: 'Player 2', key: 'arrowup', keyDisplay: 'Up Arrow', key2: 'arrowdown', key2Display: 'Down Arrow', color: '#64b5f6' },
        { id: 'p3', name: 'Player 3', key: 'l', keyDisplay: 'L', key2: 'k', key2Display: 'K', color: '#81c784' },
        { id: 'p4', name: 'Player 4', key: 'p', keyDisplay: 'P', key2: 'o', key2Display: 'O', color: '#ffd54f' }
    ];
    const vehicleOptions = ['🏇', '🏎', '🎠', '🏃‍♂️', '🚴‍♀️'];
    const PERFECT_START_WINDOW_MS = 250;
    const FALSE_START_STALL_MS = 1500;
    
    // --- Game State ---
    let drainRate, incrementPerTap;
    let activePlayers = [];
    let gameActive = false;
    let lastTime = 0;
    let currentDifficulty = 'hard';
    let countdownInterval;
    let playerToChangeKey = null;
    let keyToChangeIndex = 1; 
    let startMode = 'single';
    let startBoostMultiplier = 1.0;
    let falseStartPenalty = 'stall';
    let preGameListenersActive = false;


    // --- Audio Functions ---
    function initAudio() {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                masterGainNode = audioContext.createGain();
                masterGainNode.connect(audioContext.destination);
                masterGainNode.gain.setValueAtTime(masterVolume, audioContext.currentTime);
            }
        } catch (e) { console.warn("Web Audio API is not supported."); document.getElementById('audio-controls').style.display = 'none'; }
    }
    function playSound({ frequency = 440, duration = 0.1, volume = 0.15, type = 'sine' }) {
        if (!audioContext || !masterGainNode) return;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(masterGainNode);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime + duration - 0.02);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    }
    function updateMuteButtonUI() { muteButton.textContent = isMuted ? '🔇' : '🔊'; }
    volumeSlider.addEventListener('input', (e) => {
        masterVolume = parseFloat(e.target.value);
        if (masterGainNode) masterGainNode.gain.setValueAtTime(masterVolume, audioContext.currentTime);
        isMuted = false;
        updateMuteButtonUI();
    });
    muteButton.addEventListener('click', () => {
        isMuted = !isMuted;
        if (masterGainNode) masterGainNode.gain.setValueAtTime(isMuted ? 0 : masterVolume, audioContext.currentTime);
        updateMuteButtonUI();
    });

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
        const customizeSection = document.createElement('div');
        customizeSection.className = 'customize-player-section';
        customizeSection.dataset.playerId = playerData.id;
        customizeSection.innerHTML = `
            <h4 style="color: ${playerData.color};">${playerData.name} Controls & Vehicle</h4>
            <div class="vehicle-selector">
                ${vehicleOptions.map(v => `<button class="vehicle-btn" data-vehicle="${v}">${v}</button>`).join('')}
            </div>
            <div class="key-config-container">
                <div class="key-config-area" data-key-index="1">
                    <span class="key-label">Key 1:</span>
                    <div class="current-key-display">${playerData.keyDisplay}</div>
                    <button class="change-key-btn" data-player-id="${playerData.id}" data-key-index="1">Change Key</button>
                </div>
                <div class="key-config-area" data-key-index="2">
                    <span class="key-label">Key 2:</span>
                    <div class="current-key-display">${playerData.key2Display}</div>
                    <button class="change-key-btn" data-player-id="${playerData.id}" data-key-index="2">Change Key</button>
                </div>
            </div>
        `;
        customizePlayerList.appendChild(customizeSection);
        const playerObject = {
            ...playerData, sprite: '🏇', force: 0, position: 0, isKeyDown: false, score: 0,
            laneElement: laneContainer,
            horseElement: laneContainer.querySelector('.horse'),
            forceBarElement: controlGroup.querySelector('.force-bar'),
            scoreElement: controlGroup.querySelector('.score'),
            controlsElement: controlGroup,
            controlsTitleElement: controlGroup.querySelector('h3'),
            customizeElement: customizeSection,
            keyDisplayElement1: customizeSection.querySelector('[data-key-index="1"] .current-key-display'),
            keyDisplayElement2: customizeSection.querySelector('[data-key-index="2"] .current-key-display'),
            startState: 'waiting',
            isStalled: false,
            goKey1Pressed: false,
            goKey2Pressed: false,
        };
        activePlayers.push(playerObject);
        updateKeyConfigVisibility();
        const pressAction = (e) => {
            e.preventDefault();
            if (!gameActive || playerObject.isKeyDown || playerObject.isStalled) return;
            playerObject.isKeyDown = true;
            playerObject.force += incrementPerTap;
            if (playerObject.force > 100) playerObject.force = 100;
        };
        const releaseAction = () => { playerObject.isKeyDown = false; };
        playerObject.controlsElement.addEventListener('mousedown', pressAction);
        playerObject.controlsElement.addEventListener('touchstart', pressAction, { passive: false });
        playerObject.controlsElement.addEventListener('mouseup', releaseAction);
        playerObject.controlsElement.addEventListener('mouseleave', releaseAction);
        playerObject.controlsElement.addEventListener('touchend', releaseAction);
        laneContainer.querySelector('.remove-player-btn').addEventListener('click', () => removePlayer(playerData.id));
    }
    function updateGridLayout() {
        const numPlayers = activePlayers.length > 0 ? activePlayers.length : 1;
        controlsContainer.style.gridTemplateColumns = `repeat(${numPlayers}, 1fr)`;
    }
    function updateGameReadyState() {
        const canStart = activePlayers.length > 0;
        newGameButton.disabled = !canStart || preGameListenersActive;
        if (!canStart) {
            countdownDisplay.textContent = 'Add a player to begin!';
        } else if (!gameActive && !preGameListenersActive) {
            countdownDisplay.textContent = 'Press New Game to start';
        }
    }

    // --- Game Logic & Flow ---
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

        startMode = startModeSelect.value;
        startBoostMultiplier = parseFloat(boostSlider.value) / 10;
        boostValueDisplay.textContent = startBoostMultiplier.toFixed(1);
        
        falseStartPenalty = falseStartPenaltySelect.value;

        const startSystemDisabled = startMode === 'disabled';
        boostSliderGroup.classList.toggle('hidden', startSystemDisabled);
        falseStartPenaltyGroup.classList.toggle('hidden', startSystemDisabled);
        
        updateKeyConfigVisibility();
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
            p.horseElement.style.opacity = '1';
            // UPDATED: Remove the highlight class on new game
            p.horseElement.classList.remove('perfect-start-highlight');
            p.forceBarElement.style.height = '0%';
            p.position = 0;
            p.force = 0;
            p.startState = 'waiting';
            p.isStalled = false;
            p.goKey1Pressed = false;
            p.goKey2Pressed = false;
        });
    }

    function initGame() {
        if (activePlayers.length === 0) return logMessage("⚠️ Add at least one player to start a game.");
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        if (countdownInterval) clearInterval(countdownInterval);
        prepareGameBoard();
        if (startMode !== 'disabled') {
            document.addEventListener('keydown', handlePreGameKeyDown);
            preGameListenersActive = true;
        }
        updateGameReadyState();
        startCountdown(3, 'Get Ready...');
    }
    
    function startCountdown(duration, textPrefix) {
        let count = duration;
        countdownDisplay.textContent = `${textPrefix} ${count}`;
        playSound({ frequency: 330, duration: 0.15, type: 'sine' });
        countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownDisplay.textContent = `${textPrefix} ${count}`;
                playSound({ frequency: 330, duration: 0.15, type: 'sine' });
            } else {
                clearInterval(countdownInterval);
                document.removeEventListener('keydown', handlePreGameKeyDown);
                countdownDisplay.textContent = 'GO!';
                playSound({ frequency: 523, duration: 0.3, type: 'square' });
                if (startMode !== 'disabled') {
                    document.addEventListener('keydown', handleGoKeyDown);
                    setTimeout(() => {
                        document.removeEventListener('keydown', handleGoKeyDown);
                        startGame();
                    }, PERFECT_START_WINDOW_MS);
                } else {
                    startGame();
                }
            }
        }, 1000);
    }

    function startGame() {
        preGameListenersActive = false;
        if (startMode === 'two') {
            activePlayers.forEach(p => {
                if (p.startState === 'waiting' && p.goKey1Pressed && p.goKey2Pressed) {
                    p.startState = 'boosted';
                }
            });
        }
        activePlayers.forEach(p => {
            if (p.startState === 'boosted') {
                logMessage(`🚀 ${p.name} gets a PERFECT START!`);
                playSound({ frequency: 660, duration: 0.2, type: 'triangle', volume: 0.2 });
                // UPDATED: Add highlight class instead of direct style
                p.horseElement.classList.add('perfect-start-highlight');
                const boostPixels = p.horseElement.clientWidth * startBoostMultiplier;
                p.position += boostPixels;
            } else if (p.startState === 'false_start') {
                p.isStalled = true;
                setTimeout(() => {
                    p.isStalled = false;
                    p.horseElement.style.opacity = '1';
                    logMessage(`👍 ${p.name} can now move!`);
                }, FALSE_START_STALL_MS);
            }
        });
        logMessage(`📣🏁 The race has begun!`);
        gameActive = true;
        lastTime = 0;
        updateGameReadyState();
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
            if (!p.isStalled) {
                let currentSpeed = (p.force / 100) * MAX_SPEED;
                p.position += currentSpeed * deltaTime;
            }
            p.horseElement.style.transform = `translateX(${p.position}px) scaleX(-1)`;
            p.forceBarElement.style.height = `${p.force}%`;
        });
        checkWinCondition();
        requestAnimationFrame(gameLoop);
    }

    function checkWinCondition() {
        if (activePlayers.length === 0) return;
        const trackWidth = raceTrack.querySelector('.lane').clientWidth - 60;
        const winner = activePlayers.find(p => p.position >= trackWidth);
        if (winner) endGame(winner);
    }

    function endGame(winner) {
        gameActive = false;
        logMessage(`📣🏆 Winner: ${winner.name}!`);
        winnerAnnEl.textContent = `${winner.name} Wins!`;
        winnerAnnEl.style.color = winner.color;
        winner.score++;
        updateScoreDisplay();
        updateGameReadyState();
    }
    
    // --- Input Handling ---
    function handleKeyDown(e) {
        if (playerToChangeKey) return;
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHelpModal(); return; }
        if (e.key === 'Escape') { closeAllModals(); return; }
        if (!gameActive) return;
        const key = e.key.toLowerCase();
        const player = activePlayers.find(p => p.key === key);
        if (player && !player.isKeyDown && !player.isStalled) {
            e.preventDefault();
            player.isKeyDown = true;
            player.force += incrementPerTap;
            if (player.force > 100) player.force = 100;
        }
    }
    function handleKeyUp(e) {
        const key = e.key.toLowerCase();
        const player = activePlayers.find(p => p.key === key);
        if (player) player.isKeyDown = false;
    }

    function handlePreGameKeyDown(e) {
        const key = e.key.toLowerCase();
        const player = activePlayers.find(p => p.key === key || p.key2 === key);
        if (player && player.startState === 'waiting') {
            if (falseStartPenalty === 'stall') {
                player.startState = 'false_start';
                logMessage(`💥 ${player.name} jumped the gun! (FALSE START)`);
                playSound({ frequency: 220, duration: 0.3, type: 'sawtooth' });
                player.horseElement.style.opacity = '0.4';
            }
        }
    }

    function handleGoKeyDown(e) {
        const key = e.key.toLowerCase();
        const player = activePlayers.find(p => p.key === key || p.key2 === key);
        if (!player || player.startState !== 'waiting') return;
        if (startMode === 'single' && key === player.key) {
            player.startState = 'boosted';
        } else if (startMode === 'two') {
            if (key === player.key) player.goKey1Pressed = true;
            if (key === player.key2) player.goKey2Pressed = true;
        }
    }
    
    // --- UI & Modals ---
    function handleCustomizeInteraction(e) {
        const vehicleBtn = e.target.closest('.vehicle-btn');
        const keyBtn = e.target.closest('.change-key-btn');
        if (vehicleBtn) {
            const player = activePlayers.find(p => p.id === vehicleBtn.closest('.customize-player-section').dataset.playerId);
            if (player) {
                player.sprite = vehicleBtn.dataset.vehicle;
                player.horseElement.innerHTML = vehicleBtn.dataset.vehicle;
            }
        } else if (keyBtn && !playerToChangeKey) {
            startKeyChange(keyBtn);
        }
    }
    function startKeyChange(button) {
        playerToChangeKey = activePlayers.find(p => p.id === button.dataset.playerId);
        keyToChangeIndex = parseInt(button.dataset.keyIndex);
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
        const isKeyInUse = activePlayers.some(p => (p.key === newKey || p.key2 === newKey) && p.id !== playerToChangeKey.id);
        if (isKeyInUse) {
            alert(`Key "${newKeyDisplay}" is already in use.`);
        } else {
            if (keyToChangeIndex === 1) {
                playerToChangeKey.key = newKey;
                playerToChangeKey.keyDisplay = newKeyDisplay;
                playerToChangeKey.keyDisplayElement1.textContent = newKeyDisplay;
            } else {
                playerToChangeKey.key2 = newKey;
                playerToChangeKey.key2Display = newKeyDisplay;
                playerToChangeKey.keyDisplayElement2.textContent = newKeyDisplay;
            }
            playerToChangeKey.controlsTitleElement.textContent = `${playerToChangeKey.name} (${playerToChangeKey.keyDisplay})`;
        }
        const button = playerToChangeKey.customizeElement.querySelector(`.change-key-btn[data-key-index="${keyToChangeIndex}"]`);
        button.textContent = 'Change Key';
        button.classList.remove('is-listening');
        playerToChangeKey = null;
    }
    function openModal(modal) {
        modalOverlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    }
    function closeAllModals() {
        if (playerToChangeKey) {
            const button = playerToChangeKey.customizeElement.querySelector('.is-listening');
            if (button) { button.textContent = 'Change Key'; button.classList.remove('is-listening'); }
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
                    let keysHTML = `<p>${p.name}: <span class="key">${p.keyDisplay}</span>`;
                    if (startMode === 'two') {
                        keysHTML += `<span class="key">${p.key2Display}</span></p>`;
                    } else {
                        keysHTML += `</p>`;
                    }
                    item.innerHTML = keysHTML;
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
    function updateKeyConfigVisibility() {
        document.querySelectorAll('.key-config-area[data-key-index="2"]').forEach(el => {
            el.classList.toggle('hidden', startMode !== 'two');
        });
    }
    function logMessage(message) {
        const li = document.createElement('li');
        li.textContent = message;
        logList.appendChild(li);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    function updateScoreDisplay() {
        activePlayers.forEach(p => { p.scoreElement.textContent = `Score: ${p.score}`; });
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
        updateGameParameters();
    }));

    function handleManualControlChange() {
        const manualRadio = document.querySelector('input[name="difficulty"][value="manual"]');
        if (manualRadio && !manualRadio.checked) {
            manualRadio.checked = true;
            currentDifficulty = 'manual';
        }
        updateGameParameters();
    }
    
    incrementSlider.addEventListener('input', handleManualControlChange);
    drainRateSlider.addEventListener('input', handleManualControlChange);
    startModeSelect.addEventListener('change', handleManualControlChange);
    boostSlider.addEventListener('input', handleManualControlChange);
    falseStartPenaltySelect.addEventListener('change', handleManualControlChange);

    // --- Initializations ---
    function initializeDefaultPlayers() {
        if (availablePlayers.length >= 2) {
            createPlayer(availablePlayers[0]);
            createPlayer(availablePlayers[1]);
        }
    }
    
    initAudio();
    volumeSlider.value = masterVolume;
    updateMuteButtonUI();
    initializeDefaultPlayers();
    updateGameParameters();
    populatePlayerDropdown();
    updateGridLayout();
    updateGameReadyState();
    logMessage("Welcome! Customize settings or click 'New Game' to begin.");
});
