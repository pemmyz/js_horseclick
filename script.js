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
    const MAX_PLAYERS = 4;
    const difficultySettings = {
        easy:   { increment: 18, drainRate: 0.2, drainSlider: 2 },
        medium: { increment: 12, drainRate: 0.4, drainSlider: 4 },
        hard:   { increment: 8,  drainRate: 0.7, drainSlider: 7 }
    };
    const availablePlayers = [
        { id: 'p1', name: 'Player 1', key: 'a', keyDisplay: 'A', key2: 'd', key2Display: 'D', color: '#ff8a65' },
        { id: 'p2', name: 'Player 2', key: 'arrowleft', keyDisplay: 'Left Arrow', key2: 'arrowright', key2Display: 'Right Arrow', color: '#64b5f6' },
        { id: 'p3', name: 'Player 3', key: 'l', keyDisplay: 'L', key2: 'k', key2Display: 'K', color: '#81c784' },
        { id: 'p4', name: 'Player 4', key: 'p', keyDisplay: 'P', key2: 'o', key2Display: 'O', color: '#ffd54f' }
    ];
    const vehicleOptions = ['🏇', '🏎', '🎠', '🏃‍♂️', '🚴‍♀️', '🚙'];
    const PERFECT_START_WINDOW_MS = 250;
    const FALSE_START_STALL_MS = 1500;
    const CPS_UPDATE_INTERVAL_MS = 500;
    const AUTO_START_DELAY_MS = 5000;

    // --- Game State ---
    let drainRate, incrementPerTap;
    let activePlayers = [];
    let gameActive = false;
    let lastTime = 0;
    let goTime = 0;
    let currentDifficulty = 'hard';
    let countdownInterval;
    let playerToChangeKey = null;
    let keyToChangeIndex = 1;
    let startMode = 'single';
    let startBoostMultiplier = 1.0;
    let falseStartPenalty = 'stall';
    let preGameListenersActive = false;
    let preCountdownTimeout = null;
    let preCountdownEndTime = 0;
    let gamepads = {};
    let assignedInputs = new Set();
    let lastGamepadButtonStates = {};
    let autoStartCountdownId = null;
    let autoStartUpdateIntervalId = null;
    let autoStartEndTime = 0;


    // --- Audio Functions ---
    function initAudio() { try { if (!audioContext) { audioContext = new (window.AudioContext || window.webkitAudioContext)(); masterGainNode = audioContext.createGain(); masterGainNode.connect(audioContext.destination); masterGainNode.gain.setValueAtTime(masterVolume, audioContext.currentTime); } } catch (e) { console.warn("Web Audio API is not supported."); document.getElementById('audio-controls').style.display = 'none'; } }
    function playSound({ frequency = 440, duration = 0.1, volume = 0.15, type = 'sine' }) { if (!audioContext || !masterGainNode) return; const oscillator = audioContext.createOscillator(); const gainNode = audioContext.createGain(); oscillator.connect(gainNode); gainNode.connect(masterGainNode); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime); gainNode.gain.setValueAtTime(0, audioContext.currentTime); gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01); gainNode.gain.setValueAtTime(volume, audioContext.currentTime + duration - 0.02); gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration); oscillator.start(audioContext.currentTime); oscillator.stop(audioContext.currentTime + duration); }
    function updateMuteButtonUI() { muteButton.textContent = isMuted ? '🔇' : '🔊'; }
    volumeSlider.addEventListener('input', (e) => { masterVolume = parseFloat(e.target.value); if (masterGainNode) masterGainNode.gain.setValueAtTime(masterVolume, audioContext.currentTime); isMuted = false; updateMuteButtonUI(); });
    muteButton.addEventListener('click', () => { isMuted = !isMuted; if (masterGainNode) masterGainNode.gain.setValueAtTime(isMuted ? 0 : masterVolume, audioContext.currentTime); updateMuteButtonUI(); });

    
    // --- Auto-start Countdown Logic ---
    function cancelAutoCountdown() {
        if (autoStartCountdownId) {
            clearTimeout(autoStartCountdownId);
            clearInterval(autoStartUpdateIntervalId);
            autoStartCountdownId = null;
            autoStartUpdateIntervalId = null;
            autoStartEndTime = 0;
            logMessage("⏱️ Automatic start cancelled.");
            updateGameReadyState();
        }
    }

    function updateAutoCountdownDisplay() {
        if (!autoStartEndTime) return;
        const remainingSeconds = Math.ceil((autoStartEndTime - Date.now()) / 1000);
        if (remainingSeconds > 0) {
            countdownDisplay.classList.remove('message-mode');
            countdownDisplay.textContent = `Game starting in ${remainingSeconds}...`;
        }
    }

    function startOrResetAutoCountdown() {
        cancelAutoCountdown();

        if (gameActive || activePlayers.length < 2) {
            if (!gameActive) updateGameReadyState();
            return;
        }

        logMessage(`⏱️ Game will start in ${AUTO_START_DELAY_MS / 1000} seconds... New players can still join!`);
        autoStartEndTime = Date.now() + AUTO_START_DELAY_MS;
        autoStartCountdownId = setTimeout(initGame, AUTO_START_DELAY_MS);
        autoStartUpdateIntervalId = setInterval(updateAutoCountdownDisplay, 200);
        updateAutoCountdownDisplay();
    }

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
        addPlayerButton.disabled = unselectedPlayers.length === 0 || activePlayers.length >= MAX_PLAYERS;
    }

    function addPlayer() {
        if (gameActive || activePlayers.length >= MAX_PLAYERS) return;
        if (playerSelect.value) {
            const playerData = availablePlayers.find(p => p.id === playerSelect.value);
            if (!playerData) return;
            createPlayer(playerData, { controllerType: 'none' });
            logMessage(`👍 ${playerData.name} slot added manually. Configure as AI or connect a gamepad.`);
            populatePlayerDropdown();
            updateGridLayout();
            startOrResetAutoCountdown();
        }
    }

    function handleJoinAttempt(inputType, details) {
        if (gameActive || activePlayers.length >= MAX_PLAYERS) return;
        
        let playerConfigToJoin;
        
        if (inputType === 'keyboard') {
            const key = details.key;
            const configForKey = availablePlayers.find(p => p.key === key || p.key2 === key);
            if (!configForKey || activePlayers.some(p => p.id === configForKey.id)) return;
            playerConfigToJoin = availablePlayers[activePlayers.length];
            if (!playerConfigToJoin || playerConfigToJoin.id !== configForKey.id) {
                 logMessage(`⚠️ Please join in order. Player ${activePlayers.length + 1} is next.`);
                 return;
            }
        } else { // gamepad
            const playerToConnect = activePlayers.find(p => !p.isBot && p.controllerType === 'none');
            if (playerToConnect) {
                playerToConnect.gamepadIndex = details.index;
                playerToConnect.controllerType = 'gamepad';
                assignedInputs.add(`gamepad_${details.index}`);
                logMessage(`🎮 Gamepad ${details.index} connected to ${playerToConnect.name}.`);
                updatePlayerControlTitle(playerToConnect);
                startOrResetAutoCountdown();
                return;
            }
            playerConfigToJoin = availablePlayers[activePlayers.length];
        }

        if (!playerConfigToJoin || activePlayers.some(p => p.id === playerConfigToJoin.id)) return;

        let newPlayer;
        if (inputType === 'gamepad') {
            newPlayer = createPlayer(playerConfigToJoin, { controllerType: 'gamepad' });
            newPlayer.gamepadIndex = details.index;
            assignedInputs.add(`gamepad_${details.index}`);
        } else {
            newPlayer = createPlayer(playerConfigToJoin, { controllerType: 'keyboard' });
            assignedInputs.add(`keyboard_${newPlayer.key}`);
            assignedInputs.add(`keyboard_${newPlayer.key2}`);
        }
        
        updatePlayerControlTitle(newPlayer);
        logMessage(`👍 ${newPlayer.name} has joined via ${inputType}!`);
        populatePlayerDropdown();
        updateGridLayout();
        startOrResetAutoCountdown();
    }
    
    function removePlayer(playerId) {
        const playerIndex = activePlayers.findIndex(p => p.id === playerId);
        if (playerIndex > -1) {
            const player = activePlayers[playerIndex];

            assignedInputs.delete(`keyboard_${player.key}`);
            assignedInputs.delete(`keyboard_${player.key2}`);
            if (player.gamepadIndex !== null) {
                assignedInputs.delete(`gamepad_${player.gamepadIndex}`);
                logMessage(`🎮 Gamepad ${player.gamepadIndex} is now available.`);
            }

            player.laneElement.remove();
            player.controlsElement.remove();
            player.customizeElement.remove();
            activePlayers.splice(playerIndex, 1);
            
            populatePlayerDropdown();
            updateGridLayout();
            startOrResetAutoCountdown();
        }
    }
    
    function createPlayer(playerData, options = {}) {
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
            <span class="cps-display">CPS: 0.0</span>
            <p class="wins" id="${playerData.id}-wins">Wins: 0</p>
            <h3 style="color: ${playerData.color};"></h3>
            <div class="force-container">
                <div id="${playerData.id}-force-bar" class="force-bar" style="background-color: ${playerData.color};"></div>
            </div>
        `;
        controlsContainer.appendChild(controlGroup);
        const customizeSection = document.createElement('div');
        customizeSection.className = 'customize-player-section';
        customizeSection.dataset.playerId = playerData.id;
        customizeSection.innerHTML = `
            <h4 style="color: ${playerData.color};">${playerData.name}</h4>
            <div class="vehicle-selector">
                ${vehicleOptions.map(v => `<button class="vehicle-btn" data-vehicle="${v}">${v}</button>`).join('')}
            </div>
            <div class="player-type-controls">
                <label>
                    <input type="checkbox" class="enable-bot-checkbox"> Enable Bot AI
                </label>
            </div>
            <div class="bot-settings-container hidden">
                <h4>Bot Settings</h4>
                <div class="settings-group">
                    <label for="ai-mode-select-${playerData.id}">AI Mode:</label>
                    <select class="ai-mode-select" id="ai-mode-select-${playerData.id}">
                        <option value="static">Static</option>
                        <option value="rubberband">Rubberband</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label for="bot-cps-input-${playerData.id}">Clicks/Sec:</label>
                    <input type="number" class="bot-cps-input" id="bot-cps-input-${playerData.id}" min="1" max="20" step="0.1" value="8.8">
                    <input type="range" class="bot-cps-slider" min="1" max="20" step="0.1" value="8.8">
                </div>
                <div class="settings-group">
                    <label>Perfect Start (<span class="perfect-start-chance-display">50</span>%):</label>
                    <input type="range" class="perfect-start-chance-slider" min="0" max="100" value="50">
                </div>
            </div>
            <div class="key-config-container">
                <div class="key-config-area" data-key-index="1">
                    <span class="key-label">Key 1:</span>
                    <div class="current-key-display">${playerData.keyDisplay}</div>
                    <button class="change-key-btn" data-player-id="${playerData.id}" data-key-index="1">Change</button>
                </div>
                <div class="key-config-area" data-key-index="2">
                    <span class="key-label">Key 2:</span>
                    <div class="current-key-display">${playerData.key2Display}</div>
                    <button class="change-key-btn" data-player-id="${playerData.id}" data-key-index="2">Change</button>
                </div>
            </div>
        `;
        customizePlayerList.appendChild(customizeSection);
        const playerObject = {
            ...playerData, sprite: '🏇', force: 0, position: 0, isKeyDown: false,
            lastKeyTapped: null,
            laneElement: laneContainer,
            horseElement: laneContainer.querySelector('.horse'),
            forceBarElement: controlGroup.querySelector('.force-bar'),
            winsElement: controlGroup.querySelector('.wins'),
            controlsElement: controlGroup,
            controlsTitleElement: controlGroup.querySelector('h3'),
            customizeElement: customizeSection,
            keyDisplayElement1: customizeSection.querySelector('[data-key-index="1"] .current-key-display'),
            keyDisplayElement2: customizeSection.querySelector('[data-key-index="2"] .current-key-display'),
            cpsDisplayElement: controlGroup.querySelector('.cps-display'),
            clicks: 0, lastCpsUpdateTime: 0,
            startState: 'waiting', isStalled: false,
            goKey1Pressed: false, goKey2Pressed: false,
            isBot: false,
            botSettings: { mode: 'static', cps: 8.8, perfectStartChance: 50 },
            keyConfigContainer: customizeSection.querySelector('.key-config-container'),
            botSettingsContainer: customizeSection.querySelector('.bot-settings-container'),
            raceStats: { startTime: 0, totalClicks: 0, startReactionTime: -1, forceSum: 0, frameCount: 0 },
            sessionStats: { wins: 0, racesPlayed: 0, bestRaceTime: Infinity, bestReactionTime: Infinity, bestAvgCPS: 0, winningStreak: 0, longestWinningStreak: 0, allReactionTimes: [] },
            gamepadIndex: null,
            controllerType: options.controllerType || 'none',
        };
        activePlayers.push(playerObject);
        updatePlayerControlTitle(playerObject);
        updateKeyConfigVisibility();
        const pressAction = (e) => { e.preventDefault(); triggerPlayerTap(playerObject); };
        const releaseAction = () => { playerObject.isKeyDown = false; };
        playerObject.controlsElement.addEventListener('mousedown', pressAction);
        playerObject.controlsElement.addEventListener('touchstart', pressAction, { passive: false });
        playerObject.controlsElement.addEventListener('mouseup', releaseAction);
        playerObject.controlsElement.addEventListener('mouseleave', releaseAction);
        playerObject.controlsElement.addEventListener('touchend', releaseAction);
        laneContainer.querySelector('.remove-player-btn').addEventListener('click', () => removePlayer(playerData.id));
        return playerObject;
    }
    
    function triggerPlayerTap(player, keyPressed = null) {
        // keyPressed can be a string ('a') for keyboard, or a number (0) for gamepad button index.
        if (player.isBot || !gameActive || player.isStalled) return;

        if (startMode === 'two' && keyPressed !== null) {
             if (player.lastKeyTapped === keyPressed) {
                return; // Same key/button pressed again, do nothing.
            }
        } else {
            if (player.isKeyDown) return;
            player.isKeyDown = true;
        }

        player.force += incrementPerTap;
        player.clicks++;
        player.raceStats.totalClicks++;
        if (player.force > 100) player.force = 100;

        if (startMode === 'two' && keyPressed !== null) {
            player.lastKeyTapped = keyPressed;
        }
    }

    function updateGridLayout() {
        const numPlayers = activePlayers.length > 0 ? activePlayers.length : 1;
        controlsContainer.style.gridTemplateColumns = `repeat(${numPlayers}, 1fr)`;
    }

    function updateGameReadyState() {
        if (autoStartCountdownId || gameActive || preCountdownEndTime > 0 || countdownInterval) return;
        
        countdownDisplay.classList.add('message-mode');
        if (activePlayers.length === 0) {
            countdownDisplay.textContent = 'Add a player or press a key to Join!';
            newGameButton.disabled = true;
        } else if (activePlayers.length < 2) {
            countdownDisplay.textContent = 'Waiting for one more player...';
            newGameButton.disabled = true;
        } else {
            countdownDisplay.textContent = 'Press New Game to start';
            newGameButton.disabled = false;
        }
    }

    function computeReactionStats(reactionTimes) { if (reactionTimes.length === 0) return null; const fastest = Math.min(...reactionTimes); const slowest = Math.max(...reactionTimes); const average = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length; let stdev = 0; if (reactionTimes.length > 1) { const mean = average; const diffs = reactionTimes.map(rt => (rt - mean) ** 2); stdev = Math.sqrt(diffs.reduce((a, b) => a + b, 0) / (reactionTimes.length - 1)); } return { fastest, slowest, average, stdev }; }
    
    function resetAllTimersAndLoops() { gameActive = false; clearTimeout(preCountdownTimeout); preCountdownTimeout = null; preCountdownEndTime = 0; clearInterval(countdownInterval); countdownInterval = null; document.removeEventListener('keydown', handlePreGameKeyDown); document.removeEventListener('keydown', handleGoKeyDown); preGameListenersActive = false; }
    function updateGameParameters() { if (currentDifficulty === 'manual') { incrementPerTap = parseInt(incrementSlider.value); drainRate = parseFloat(drainRateSlider.value) / 10; } else { const settings = difficultySettings[currentDifficulty]; incrementPerTap = settings.increment; drainRate = settings.drainRate; incrementSlider.value = incrementPerTap; drainRateSlider.value = settings.drainSlider; } incrementValueDisplay.textContent = incrementSlider.value; drainRateValueDisplay.textContent = (parseFloat(drainRateSlider.value) / 10).toFixed(1); startMode = startModeSelect.value; startBoostMultiplier = parseFloat(boostSlider.value) / 10; boostValueDisplay.textContent = startBoostMultiplier.toFixed(1); falseStartPenalty = falseStartPenaltySelect.value; const startSystemDisabled = startMode === 'disabled'; boostSliderGroup.classList.toggle('hidden', startSystemDisabled); falseStartPenaltyGroup.classList.toggle('hidden', startSystemDisabled); updateKeyConfigVisibility(); }
    
    function prepareGameBoard() { updateGameParameters(); winnerAnnEl.innerHTML = ''; winnerAnnEl.className = ''; activePlayers.forEach(p => { p.horseElement.innerHTML = p.sprite; p.horseElement.style.transform = `translateX(0px) scaleX(-1)`; p.horseElement.style.opacity = '1'; p.horseElement.classList.remove('perfect-start-highlight'); p.forceBarElement.style.height = '0%'; p.position = 0; p.force = 0; p.startState = 'waiting'; p.isStalled = false; p.goKey1Pressed = false; p.goKey2Pressed = false; p.lastKeyTapped = null; if (p.cpsDisplayElement) p.cpsDisplayElement.textContent = 'CPS: 0.0'; p.raceStats = { startTime: 0, totalClicks: 0, startReactionTime: -1, forceSum: 0, frameCount: 0 }; }); updateGameReadyState(); }
    
    function startRaceSequence() { prepareGameBoard(); if (startMode !== 'disabled') { document.addEventListener('keydown', handlePreGameKeyDown); preGameListenersActive = true; } startCountdown(3, 'Get Ready...'); }
    function updatePreCountdownDisplay() { clearTimeout(preCountdownTimeout); const remaining = preCountdownEndTime - Date.now(); if (remaining <= 0) { countdownDisplay.textContent = 'Starting...'; preCountdownEndTime = 0; startRaceSequence(); } else { countdownDisplay.textContent = `Next race in ${Math.ceil(remaining / 1000)}...`; preCountdownTimeout = setTimeout(updatePreCountdownDisplay, 200); } }
    function startAutomaticRematchCountdown() { if(document.hidden) return; logMessage("⏱️ Next race starts automatically in 5 seconds... Press 'New Game' to start sooner."); preCountdownEndTime = Date.now() + 5000; updatePreCountdownDisplay(); }
    function cancelPreCountdown() { if (preCountdownEndTime > 0) { resetAllTimersAndLoops(); logMessage("🚦 Automatic rematch cancelled."); updateGameReadyState(); } }
    function initGame() {
        cancelAutoCountdown();
        if (activePlayers.length < 2) { logMessage("⚠️ At least two players must join to start a game."); return; }
        resetAllTimersAndLoops();
        logList.innerHTML = '<li>🚀 New race started...</li>';
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        startRaceSequence();
    }
    function startCountdown(duration, textPrefix) {
        countdownDisplay.classList.remove('message-mode');
        let count = duration;
        countdownDisplay.textContent = `${textPrefix} ${count}`;
        playSound({ frequency: 330, duration: 0.15, type: 'sine' });
        countdownInterval = setInterval(() => { count--; if (count > 0) { countdownDisplay.textContent = `${textPrefix} ${count}`; playSound({ frequency: 330, duration: 0.15, type: 'sine' }); } else { clearInterval(countdownInterval); countdownInterval = null; document.removeEventListener('keydown', handlePreGameKeyDown); preGameListenersActive = false; countdownDisplay.textContent = 'GO!'; playSound({ frequency: 523, duration: 0.3, type: 'square' }); goTime = performance.now(); if (startMode !== 'disabled') { document.addEventListener('keydown', handleGoKeyDown); setTimeout(() => { document.removeEventListener('keydown', handleGoKeyDown); startGame(); }, PERFECT_START_WINDOW_MS); } else { startGame(); } } }, 1000);
    }
    function startGame() { if (startMode === 'two') { activePlayers.forEach(p => { if (p.startState === 'waiting' && p.goKey1Pressed && p.goKey2Pressed) { p.startState = 'boosted'; } }); } activePlayers.forEach(p => { p.raceStats.startTime = goTime; if (p.isBot && p.startState === 'waiting') { if (Math.random() * 100 < p.botSettings.perfectStartChance) { p.startState = 'boosted'; } } if (p.startState === 'boosted') { logMessage(`🚀 ${p.name} gets a PERFECT START!`); playSound({ frequency: 660, duration: 0.2, type: 'triangle', volume: 0.2 }); p.horseElement.classList.add('perfect-start-highlight'); const boostPixels = p.horseElement.clientWidth * startBoostMultiplier; p.position += boostPixels; } else if (p.startState === 'false_start') { p.isStalled = true; setTimeout(() => { p.isStalled = false; p.horseElement.style.opacity = '1'; logMessage(`👍 ${p.name} can now move!`); }, FALSE_START_STALL_MS); } }); logMessage(`📣🏁 The race has begun!`); gameActive = true; lastTime = 0; updateGameReadyState(); requestAnimationFrame(gameLoop); }
    function updateBots(deltaTime) { let leadHumanPosition = -1; const humanPlayers = activePlayers.filter(p => !p.isBot); if (humanPlayers.length > 0) { leadHumanPosition = Math.max(...humanPlayers.map(p => p.position)); } activePlayers.forEach(bot => { if (!bot.isBot || !gameActive || bot.isStalled) return; const baseCPS = bot.botSettings.cps; let finalCPS = baseCPS; if (bot.botSettings.mode === 'rubberband' && leadHumanPosition !== -1) { const trackWidth = raceTrack.querySelector('.lane').clientWidth - 60; const distanceToLead = leadHumanPosition - bot.position; const adjustmentMultiplier = 1 - (distanceToLead / trackWidth) * 0.8; finalCPS = baseCPS * Math.max(0.5, Math.min(1.5, adjustmentMultiplier)); } const pressesThisFrame = finalCPS * deltaTime; const clicksForStats = Math.round(pressesThisFrame); bot.raceStats.totalClicks += clicksForStats; bot.force += pressesThisFrame * incrementPerTap; if (bot.force > 100) bot.force = 100; }); }
    function gameLoop(currentTime) { if (!lastTime) lastTime = currentTime; const deltaTime = (currentTime - lastTime) / 1000; lastTime = currentTime; handleGamepadInput(currentTime); if (!gameActive) { requestAnimationFrame(gameLoop); return; } updateBots(deltaTime); activePlayers.forEach(p => { if (!p.isBot) { if (!p.lastCpsUpdateTime) p.lastCpsUpdateTime = currentTime; const timeSinceLastUpdate = currentTime - p.lastCpsUpdateTime; if (timeSinceLastUpdate >= CPS_UPDATE_INTERVAL_MS) { const timeDeltaSeconds = timeSinceLastUpdate / 1000; const cps = (p.clicks / timeDeltaSeconds).toFixed(1); p.cpsDisplayElement.textContent = `CPS: ${cps}`; p.clicks = 0; p.lastCpsUpdateTime = currentTime; } } p.raceStats.forceSum += p.force; p.raceStats.frameCount++; if (p.force > 0) { p.force -= drainRate * (deltaTime * 60); if (p.force < 0) p.force = 0; } if (!p.isStalled) { let currentSpeed = (p.force / 100) * MAX_SPEED; p.position += currentSpeed * deltaTime; } p.horseElement.style.transform = `translateX(${p.position}px) scaleX(-1)`; p.forceBarElement.style.height = `${p.force}%`; }); checkWinCondition(); requestAnimationFrame(gameLoop); }
    function checkWinCondition() { if (!gameActive) return; if (activePlayers.length === 0) return; const trackWidth = raceTrack.querySelector('.lane').clientWidth - 60; const winner = activePlayers.find(p => p.position >= trackWidth); if (winner) endGame(winner); }
    function endGame(winner) { resetAllTimersAndLoops(); winnerAnnEl.textContent = `${winner.name} Wins!`; winnerAnnEl.style.color = winner.color; logRaceStats(winner); updateWinsDisplay(); updateGameReadyState(); setTimeout(() => { if (!gameActive && preCountdownEndTime === 0 && !countdownInterval) { startAutomaticRematchCountdown(); } }, 3000); }
    function logRaceStats(winner) { const endTime = performance.now(); const raceDuration = goTime > 0 ? (endTime - goTime) / 1000 : 0; let statsLogContent = `<strong>--- Race Over (Duration: ${raceDuration.toFixed(2)}s) ---</strong>\n`; const rankedPlayers = [...activePlayers].sort((a, b) => b.position - a.position); const rankEmojis = ['🏆', '🥈', '🥉', '4️⃣']; statsLogContent += `<strong>Rankings:</strong>\n`; rankedPlayers.forEach((p, index) => { statsLogContent += `${rankEmojis[index] || (index + 1) + '.'} ${p.name}\n`; }); statsLogContent += `\n<strong>=== Race Performance ===</strong>\n`; rankedPlayers.forEach((p, index) => { const isWinner = p.id === winner.id; const avgCPS = raceDuration > 0.1 ? (p.raceStats.totalClicks / raceDuration).toFixed(1) : '0.0'; const avgForce = p.raceStats.frameCount > 0 ? (p.raceStats.forceSum / p.raceStats.frameCount).toFixed(1) : '0.0'; p.sessionStats.racesPlayed++; if (isWinner) { p.sessionStats.wins++; p.sessionStats.winningStreak++; p.sessionStats.longestWinningStreak = Math.max(p.sessionStats.longestWinningStreak, p.sessionStats.winningStreak); p.sessionStats.bestRaceTime = Math.min(p.sessionStats.bestRaceTime, raceDuration); } else { p.sessionStats.winningStreak = 0; } p.sessionStats.bestAvgCPS = Math.max(p.sessionStats.bestAvgCPS, parseFloat(avgCPS) || 0); let reactionText; if (p.isBot) { reactionText = 'N/A (Bot)'; } else if (p.raceStats.startReactionTime === -2) { reactionText = 'False Start'; } else if (p.raceStats.startReactionTime === -1) { reactionText = 'No start detected'; } else { const reactionMs = p.raceStats.startReactionTime.toFixed(0); reactionText = `${reactionMs}ms`; p.sessionStats.bestReactionTime = Math.min(p.sessionStats.bestReactionTime, p.raceStats.startReactionTime); } statsLogContent += `\n<strong>${p.name} (#${index + 1}${isWinner ? ', WINNER' : ''})</strong>\n`; statsLogContent += `  - Avg CPS: ${avgCPS}\n`; statsLogContent += `  - Total Clicks: ${p.raceStats.totalClicks}\n`; statsLogContent += `  - Avg Force: ${avgForce}%\n`; statsLogContent += `  - Start Reaction: ${reactionText}\n`; }); statsLogContent += `\n<strong>=== Session Stats Summary ===</strong>\n`; activePlayers.forEach(p => { statsLogContent += `\n<strong>${p.name}</strong>\n`; statsLogContent += `  - Wins: ${p.sessionStats.wins} / ${p.sessionStats.racesPlayed} | Win Streak: ${p.sessionStats.winningStreak} (Best: ${p.sessionStats.longestWinningStreak})\n`; statsLogContent += `  - Best Race Time: ${p.sessionStats.bestRaceTime === Infinity ? 'N/A' : p.sessionStats.bestRaceTime.toFixed(2) + 's'}\n`; statsLogContent += `  - Best Avg CPS: ${p.sessionStats.bestAvgCPS.toFixed(1)}\n`; if (!p.isBot && p.sessionStats.allReactionTimes.length > 0) { const reactionStats = computeReactionStats(p.sessionStats.allReactionTimes); if (reactionStats) { statsLogContent += `  - Reactions (ms): Avg: ${reactionStats.average.toFixed(0)}, Best: ${reactionStats.fastest.toFixed(0)}, Worst: ${reactionStats.slowest.toFixed(0)}, SD: ${reactionStats.stdev.toFixed(1)}\n`; } } }); const li = document.createElement('li'); const pre = document.createElement('pre'); pre.style.margin = '0'; pre.style.whiteSpace = 'pre-wrap';  pre.style.fontFamily = 'inherit'; pre.innerHTML = statsLogContent; li.appendChild(pre); logList.appendChild(li); logContainer.scrollTop = logContainer.scrollHeight; }

    // --- Input Handling ---
    function handleKeyDown(e) {
        if (playerToChangeKey) return;
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHelpModal(); return; }
        if (e.key === 'Escape') { closeAllModals(); return; }
        
        const key = e.key.toLowerCase();
        const player = activePlayers.find(p => !p.isBot && p.controllerType === 'keyboard' && (p.key === key || p.key2 === key));
        
        if (player) {
            if (!gameActive) return;
            e.preventDefault();
            triggerPlayerTap(player, key);
        } else {
            handleJoinAttempt('keyboard', { key });
        }
    }
    
    function handleKeyUp(e) { const key = e.key.toLowerCase(); const player = activePlayers.find(p => !p.isBot && p.controllerType === 'keyboard' && (p.key === key || p.key2 === key)); if (player) player.isKeyDown = false; }
    function handlePreGameKeyDown(e) { const key = e.key.toLowerCase(); const player = activePlayers.find(p => !p.isBot && p.controllerType === 'keyboard' && (p.key === key || p.key2 === key)); if (player && player.startState === 'waiting') { if (falseStartPenalty === 'stall') { player.startState = 'false_start'; player.raceStats.startReactionTime = -2; logMessage(`💥 ${player.name} jumped the gun! (FALSE START)`); playSound({ frequency: 220, duration: 0.3, type: 'sawtooth' }); player.horseElement.style.opacity = '0.4'; } } }
    function handleGoKeyDown(e) { const key = e.key.toLowerCase(); const player = activePlayers.find(p => !p.isBot && p.controllerType === 'keyboard' && (p.key === key || p.key2 === key)); if (!player || player.startState !== 'waiting') return; if (player.raceStats.startReactionTime === -1) { const reaction = performance.now() - goTime; player.raceStats.startReactionTime = reaction; player.sessionStats.allReactionTimes.push(reaction); } if (startMode === 'single' && key === player.key) { player.startState = 'boosted'; } else if (startMode === 'two') { if (key === player.key) player.goKey1Pressed = true; if (key === player.key2) player.goKey2Pressed = true; } }
    
    // [MODIFIED] Major refactor to handle individual button presses for sequential logic
    function handleGamepadInput(currentTime) {
        const polledPads = navigator.getGamepads ? navigator.getGamepads() : [];

        for (let i = 0; i < polledPads.length; i++) {
            const pad = polledPads[i];
            if (!pad) continue;

            const inputId = `gamepad_${i}`;
            const anyFaceButtonPressed = pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[2]?.pressed || pad.buttons[3]?.pressed;

            if (assignedInputs.has(inputId)) {
                // Gamepad is ASSIGNED
                const player = activePlayers.find(p => p.gamepadIndex === i);
                if (!player || player.isBot) continue;

                // Iterate through the face buttons (0-3: A,B,X,Y or X,O,□,△)
                for (let j = 0; j < 4; j++) {
                    const buttonIsPressed = pad.buttons[j]?.pressed;
                    const buttonWasPressed = lastGamepadButtonStates[i]?.[j];

                    // Check for a new press (rising edge)
                    if (buttonIsPressed && !buttonWasPressed) {
                        // False Start Check
                        if (preGameListenersActive && player.startState === 'waiting') {
                            if (falseStartPenalty === 'stall') {
                                player.startState = 'false_start';
                                player.raceStats.startReactionTime = -2;
                                logMessage(`💥 ${player.name} jumped the gun! (GAMEPAD)`);
                                playSound({ frequency: 220, duration: 0.3, type: 'sawtooth' });
                                player.horseElement.style.opacity = '0.4';
                            }
                        } 
                        // Perfect Start Check
                        else if (goTime > 0 && currentTime - goTime < PERFECT_START_WINDOW_MS && player.startState === 'waiting') {
                            if (player.raceStats.startReactionTime === -1) {
                                const reaction = currentTime - goTime;
                                player.raceStats.startReactionTime = reaction;
                                player.sessionStats.allReactionTimes.push(reaction);
                            }
                            player.startState = 'boosted';
                        } 
                        // Regular Gameplay Tap
                        else if (gameActive) {
                            triggerPlayerTap(player, j); // Pass button index for sequential logic
                        }
                    }
                }

            } else {
                // Gamepad is UNASSIGNED - Check for join attempt
                const wasPressedLastFrame = lastGamepadButtonStates[i] && (lastGamepadButtonStates[i][0] || lastGamepadButtonStates[i][1] || lastGamepadButtonStates[i][2] || lastGamepadButtonStates[i][3]);
                if (anyFaceButtonPressed && !wasPressedLastFrame) {
                    handleJoinAttempt('gamepad', { index: i });
                }
            }
            // Store the current state of all buttons for the next frame
            lastGamepadButtonStates[i] = pad.buttons.map(b => b.pressed);
        }
    }

    // --- UI & Modals ---
    function updatePlayerControlTitle(player) {
        if (!player || !player.controlsTitleElement) return;
        let controlInfo;
        switch (player.controllerType) {
            case 'keyboard':
                controlInfo = `(${player.keyDisplay}`;
                if (startMode === 'two') {
                    controlInfo += ` / ${player.key2Display}`;
                }
                controlInfo += ')';
                break;
            case 'gamepad':
                controlInfo = `(GP ${player.gamepadIndex})`;
                break;
            case 'bot':
                controlInfo = '(BOT)';
                break;
            case 'none':
            default:
                controlInfo = '(No Controller)';
                break;
        }
        player.controlsTitleElement.innerHTML = `${player.name} ${controlInfo}`;
    }
    
    function updatePlayerBotStateUI(player) {
        player.keyConfigContainer.classList.toggle('hidden', player.isBot || player.controllerType === 'gamepad');
        player.botSettingsContainer.classList.toggle('hidden', !player.isBot);
        player.controlsElement.classList.toggle('is-bot', player.isBot);
        player.cpsDisplayElement.classList.toggle('hidden', player.isBot);
        updatePlayerControlTitle(player);
    }

    function handleCustomizeInteraction(e) {
        const target = e.target;
        const playerSection = target.closest('.customize-player-section');
        if (!playerSection) return;
        const player = activePlayers.find(p => p.id === playerSection.dataset.playerId);
        if (!player) return;

        if (target.matches('.vehicle-btn')) {
            player.sprite = target.dataset.vehicle;
            player.horseElement.innerHTML = target.dataset.vehicle;
        } else if (target.matches('.change-key-btn') && !playerToChangeKey) {
            startKeyChange(target);
        } else if (target.matches('.enable-bot-checkbox')) {
            player.isBot = target.checked;
            if (player.isBot) {
                player.controllerType = 'bot';
                assignedInputs.delete(`keyboard_${player.key}`);
                assignedInputs.delete(`keyboard_${player.key2}`);
                if (player.gamepadIndex !== null) {
                    assignedInputs.delete(`gamepad_${player.gamepadIndex}`);
                    logMessage(`🎮 Gamepad ${player.gamepadIndex} freed from Bot ${player.name}.`);
                    player.gamepadIndex = null;
                }
            } else {
                player.controllerType = 'none';
            }
            updatePlayerBotStateUI(player);
        } else if (target.matches('.ai-mode-select')) {
            player.botSettings.mode = target.value;
        }
    }
    function startKeyChange(button) { playerToChangeKey = activePlayers.find(p => p.id === button.dataset.playerId); keyToChangeIndex = parseInt(button.dataset.keyIndex); button.textContent = 'Press key...'; button.classList.add('is-listening'); document.addEventListener('keydown', handleKeySelection, { once: true }); }
    function getKeyDisplay(e) { if (e.key === ' ') return 'Space'; if (e.key.includes('Arrow')) return e.key.replace('Arrow', '') + ' Arrow'; return e.key.length === 1 ? e.key.toUpperCase() : e.key; }
    function handleKeySelection(e) { e.preventDefault(); const newKey = e.key.toLowerCase(); const newKeyDisplay = getKeyDisplay(e); const isKeyInUse = activePlayers.some(p => (p.key === newKey || p.key2 === newKey) && p.id !== playerToChangeKey.id); if (isKeyInUse) { alert(`Key "${newKeyDisplay}" is already in use.`); } else { if (keyToChangeIndex === 1) { playerToChangeKey.key = newKey; playerToChangeKey.keyDisplay = newKeyDisplay; playerToChangeKey.keyDisplayElement1.textContent = newKeyDisplay; } else { playerToChangeKey.key2 = newKey; playerToChangeKey.key2Display = newKeyDisplay; playerToChangeKey.keyDisplayElement2.textContent = newKeyDisplay; } updatePlayerControlTitle(playerToChangeKey); } const button = playerToChangeKey.customizeElement.querySelector(`.change-key-btn[data-key-index="${keyToChangeIndex}"]`); button.textContent = 'Change'; button.classList.remove('is-listening'); playerToChangeKey = null; }
    function openModal(modal) {
        cancelAutoCountdown();
        cancelPreCountdown();
        modalOverlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    }
    function closeAllModals() {
        if (playerToChangeKey) { const button = playerToChangeKey.customizeElement.querySelector('.is-listening'); if (button) { button.textContent = 'Change'; button.classList.remove('is-listening'); } playerToChangeKey = null; document.removeEventListener('keydown', handleKeySelection); }
        modalOverlay.classList.add('hidden');
        customizeModal.classList.add('hidden');
        helpModal.classList.add('hidden');
        startOrResetAutoCountdown();
    }
    
    function toggleHelpModal() { if (helpModal.classList.contains('hidden')) { helpControlsList.innerHTML = ''; if (activePlayers.length > 0) { activePlayers.forEach(p => { const item = document.createElement('div'); item.className = 'help-control-item'; let controlText; switch(p.controllerType) { case 'keyboard': controlText = `<span class="key">${p.keyDisplay}</span>`; if (startMode === 'two') { controlText += ` & <span class="key">${p.key2Display}</span>`; } break; case 'gamepad': controlText = `<span class="key">GP ${p.gamepadIndex}</span>`; break; case 'bot': controlText = `<span class="key">BOT</span>`; break; default: controlText = `<span class="key">Not Connected</span>`; break; } item.innerHTML = `<p>${p.name}: ${controlText}</p>`; item.style.borderColor = p.color; helpControlsList.appendChild(item); }); } else { helpControlsList.innerHTML = '<p>No players have been added yet.</p>'; } openModal(helpModal); } else { closeAllModals(); } }
    
    function updateKeyConfigVisibility() { document.querySelectorAll('.key-config-area[data-key-index="2"]').forEach(el => { el.classList.toggle('hidden', startMode !== 'two'); }); }
    
    function logMessage(message) { const li = document.createElement('li'); li.textContent = message; logList.appendChild(li); logContainer.scrollTop = logContainer.scrollHeight; }
    function updateWinsDisplay() { activePlayers.forEach(p => { p.winsElement.textContent = `Wins: ${p.sessionStats.wins}`; }); }

    // --- Event Listeners ---
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    newGameButton.addEventListener('click', initGame);
    addPlayerButton.addEventListener('click', addPlayer);
    customizeToggleButton.addEventListener('click', () => openModal(customizeModal));
    closeCustomizeModalButton.addEventListener('click', closeAllModals);
    customizeModal.addEventListener('click', handleCustomizeInteraction);
    customizeModal.addEventListener('input', (e) => { const target = e.target; const playerSection = target.closest('.customize-player-section'); if (!playerSection) return; const player = activePlayers.find(p => p.id === playerSection.dataset.playerId); if (!player) return; const parentGroup = target.closest('.settings-group'); if (!parentGroup) return; if (target.matches('.bot-cps-slider')) { const newValue = parseFloat(target.value); player.botSettings.cps = newValue; const inputField = parentGroup.querySelector('.bot-cps-input'); if (inputField) inputField.value = newValue.toFixed(1); } else if (target.matches('.bot-cps-input')) { const newValue = parseFloat(target.value); const slider = parentGroup.querySelector('.bot-cps-slider'); if (slider) slider.value = newValue; } else if (target.matches('.perfect-start-chance-slider')) { player.botSettings.perfectStartChance = parseInt(target.value); player.customizeElement.querySelector('.perfect-start-chance-display').textContent = target.value; } });
    function applyBotCpsValue(inputElement) { const playerSection = inputElement.closest('.customize-player-section'); if (!playerSection) return; const player = activePlayers.find(p => p.id === playerSection.dataset.playerId); if (!player) return; let newValue = parseFloat(inputElement.value); const min = parseFloat(inputElement.min); const max = parseFloat(inputElement.max); if (isNaN(newValue)) newValue = player.botSettings.cps; newValue = Math.max(min, Math.min(max, newValue)); player.botSettings.cps = newValue; inputElement.value = newValue.toFixed(1); const slider = inputElement.closest('.settings-group').querySelector('.bot-cps-slider'); if (slider) slider.value = newValue; }
    customizeModal.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.bot-cps-input')) { e.preventDefault(); applyBotCpsValue(e.target); e.target.blur(); } });
    customizeModal.addEventListener('focusout', (e) => { if (e.target.matches('.bot-cps-input')) { applyBotCpsValue(e.target); } });
    closeHelpButton.addEventListener('click', closeAllModals);
    modalOverlay.addEventListener('click', closeAllModals);
    helpPrompt.addEventListener('click', toggleHelpModal);
    difficultyRadios.forEach(radio => radio.addEventListener('change', (e) => { currentDifficulty = e.target.value; updateGameParameters(); }));
    function handleManualControlChange() { const manualRadio = document.querySelector('input[name="difficulty"][value="manual"]'); if (manualRadio && !manualRadio.checked) { manualRadio.checked = true; currentDifficulty = 'manual'; } updateGameParameters(); }
    incrementSlider.addEventListener('input', handleManualControlChange);
    drainRateSlider.addEventListener('input', handleManualControlChange);
    startModeSelect.addEventListener('change', handleManualControlChange);
    boostSlider.addEventListener('input', handleManualControlChange);
    falseStartPenaltySelect.addEventListener('change', handleManualControlChange);
    window.addEventListener("gamepadconnected", (e) => { console.log(`Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}.`); gamepads[e.gamepad.index] = e.gamepad; });
    window.addEventListener("gamepaddisconnected", (e) => {
        const disconnectedIndex = e.gamepad.index;
        console.log(`Gamepad disconnected from index ${disconnectedIndex}: ${e.gamepad.id}.`);
        delete gamepads[disconnectedIndex];
        const player = activePlayers.find(p => p.gamepadIndex === disconnectedIndex);
        if (player) {
            logMessage(`🎮 Gamepad ${disconnectedIndex} disconnected from ${player.name}. Player is now uncontrolled.`);
            player.gamepadIndex = null;
            player.controllerType = 'none';
            updatePlayerControlTitle(player);
        }
        assignedInputs.delete(`gamepad_${disconnectedIndex}`);
    });

    // --- Initializations ---
    initAudio();
    volumeSlider.value = masterVolume;
    updateMuteButtonUI();
    updateGameParameters();
    populatePlayerDropdown();
    updateGridLayout();
    updateGameReadyState();
    logMessage("Welcome! Add players manually or press a key/gamepad button to join.");
    requestAnimationFrame(gameLoop);
});
