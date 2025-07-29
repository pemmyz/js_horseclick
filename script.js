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
    const p1SabotagePanel = document.getElementById('p1-sabotage-panel');
    const p2SabotagePanel = document.getElementById('p2-sabotage-panel');

    // --- Game Settings ---
    const DRAIN_RATE = 0.4; // How fast the force bar drains per frame
    const INCREMENT_PER_TAP = 12; // How much force a single tap adds
    const MAX_SPEED = 400; // Pixels per second at 100% force
    const PRESS_COOLDOWN = 50; // Milliseconds between taps
    const OBSTACLE_OFFSET_PX = 150; // How far ahead obstacles are placed
    const ITEM_DESCRIPTIONS = {
        'syringe': '💉 Super Boost', 'carousel': '🎠 Carousel Glitch', 'poop': '💩 Poop',
        'bomb': '💣 Bomb', 'gun': '🔫 Laser Gun'
    };

    // --- Game State ---
    let p1, p2;
    let players;
    let obstacles = { p1: [], p2: [] };
    let gameActive = false;
    let lastTime = 0;
    let p1Score = 0;
    let p2Score = 0;

    function createPlayer(id, name, horseEl, laneEl, forceBarEl) {
        return {
            id: id, name: name,
            force: 0, position: 0,
            horseEl: horseEl, laneEl: laneEl, forceBarEl: forceBarEl,
            effects: { stunned: 0, slowed: 0 },
            isRaceCar: false,
            usedItems: new Set(),
            lastPressTime: 0
        };
    }
    
    function initGame() {
        // Reset players
        p1 = createPlayer('p1', 'Player 1', player1Horse, player1Lane, p1ForceBar);
        p2 = createPlayer('p2', 'Player 2', player2Horse, player2Lane, p2ForceBar);
        players = [p1, p2];

        // Reset obstacles
        obstacles.p1.forEach(obs => obs.el.remove());
        obstacles.p2.forEach(obs => obs.el.remove());
        obstacles = { p1: [], p2: [] };

        // Reset UI
        logList.innerHTML = '';
        winnerAnnEl.innerHTML = '';
        winnerAnnEl.className = '';
        updateScoreDisplay();
        
        players.forEach(p => {
            p.horseEl.style.transform = `translateX(0px)`;
            p.horseEl.style.opacity = 1;
            p.horseEl.innerHTML = '🏇';
            p.forceBarEl.style.height = '0%';
            document.getElementById(`${p.id}-sabotage-panel`).querySelectorAll('button').forEach(btn => {
                btn.disabled = false;
            });
        });

        logMessage("📣🏁 The race has begun! Tap to run!");
        gameActive = true;
        lastTime = 0;
        requestAnimationFrame(gameLoop);
    }

    function gameLoop(currentTime) {
        if (!gameActive) return;

        if (!lastTime) lastTime = currentTime;
        const deltaTime = (currentTime - lastTime) / 1000; // Time in seconds
        lastTime = currentTime;

        players.forEach(p => {
            // 1. Drain force
            if (p.force > 0) {
                p.force -= DRAIN_RATE;
                if (p.force < 0) p.force = 0;
            }

            // 2. Calculate speed based on force and effects
            let currentSpeed = (p.force / 100) * MAX_SPEED;
            if (p.isRaceCar) currentSpeed *= 1.5;
            if (p.effects.slowed > 0) currentSpeed *= 0.3;
            if (p.effects.stunned > 0) currentSpeed = 0;
            
            // 3. Update position
            p.position += currentSpeed * deltaTime;
            
            // 4. Check for collisions
            checkCollisions(p);

            // 5. Update UI
            p.horseEl.style.transform = `translateX(${p.position}px)`;
            p.forceBarEl.style.height = `${p.force}%`;
        });

        // 6. Check for winner
        checkWinCondition();
        
        // 7. Process effects (decrement counters)
        processEffects(deltaTime);

        requestAnimationFrame(gameLoop);
    }

    function checkWinCondition() {
        const trackWidth = player1Lane.clientWidth - player1Horse.clientWidth - 20; // -20 for finish line
        const winner = players.find(p => p.position >= trackWidth);
        if (winner) {
            endGame(winner);
        }
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

    function processEffects(deltaTime) {
        players.forEach(p => {
            if (p.effects.stunned > 0) {
                p.effects.stunned -= deltaTime;
                if(p.effects.stunned < 0) p.effects.stunned = 0;
            }
            if (p.effects.slowed > 0) {
                p.effects.slowed -= deltaTime;
                if(p.effects.slowed < 0) {
                    p.effects.slowed = 0;
                    p.horseEl.innerHTML = p.isRaceCar ? '🏎️' : '🏇';
                    logMessage(`📣✨ ${p.name} has returned to normal speed!`);
                }
            }
        });
    }
    
    function handleKeyPress(e) {
        if (!gameActive) return;
        const currentTime = Date.now();

        if (e.key === 'w' || e.key === 'W') {
            if (currentTime - p1.lastPressTime > PRESS_COOLDOWN) {
                p1.force += INCREMENT_PER_TAP;
                if (p1.force > 100) p1.force = 100;
                p1.lastPressTime = currentTime;
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentTime - p2.lastPressTime > PRESS_COOLDOWN) {
                p2.force += INCREMENT_PER_TAP;
                if (p2.force > 100) p2.force = 100;
                p2.lastPressTime = currentTime;
            }
        }
    }
    
    function useSabotageItem(attackerIndex, itemType) {
        if (!gameActive) return;
        const attacker = players[attackerIndex];
        const target = players[(attackerIndex + 1) % 2];

        if (attacker.usedItems.has(itemType)) return;
        attacker.usedItems.add(itemType);
        document.querySelector(`#${attacker.id}-sabotage-panel .sabotage-item[data-item="${itemType}"]`).disabled = true;

        const itemName = ITEM_DESCRIPTIONS[itemType] || itemType;
        logMessage(`🔧 ${attacker.name} uses the ${itemName}!`);

        switch(itemType) {
            case 'syringe':
                logMessage(`📣👀💨🏎 ${attacker.name} used a super-steroid and turned into a race car!`);
                attacker.horseEl.innerHTML = '🏎️';
                attacker.isRaceCar = true;
                break;
            case 'carousel':
                logMessage(`📣👀🎠 The Carousel Glitch has slowed ${target.name}!`);
                target.horseEl.innerHTML = '🎠';
                target.effects.slowed = 5; // 5 seconds
                break;
            case 'poop':
                logMessage(`📣👀💩 ${attacker.name} threw poop onto ${target.name}'s track!`);
                placeObstacle(target, '💩', 'stun');
                break;
            case 'bomb':
                logMessage(`📣👀💣 A bomb was thrown onto ${target.name}'s track!`);
                placeObstacle(target, '💣', 'bomb');
                break;
            case 'gun':
                const obstaclesAhead = obstacles[attacker.id].filter(obs => obs.position > attacker.position);
                if (obstaclesAhead.length > 0) {
                    const firstObstacle = obstaclesAhead.sort((a,b) => a.position - b.position)[0];
                    firstObstacle.el.remove();
                    obstacles[attacker.id] = obstacles[attacker.id].filter(obs => obs !== firstObstacle);
                    logMessage(`📣👀🔫 The laser successfully cleared an obstacle!`);
                } else {
                    logMessage(`📣👀🔫 Tried to use a laser, but there were no obstacles ahead!`);
                }
                break;
        }
    }
    
    function placeObstacle(targetPlayer, emoji, type) {
        const obstacleEl = document.createElement('div');
        obstacleEl.className = 'obstacle';
        obstacleEl.textContent = emoji;
        
        const position = targetPlayer.position + OBSTACLE_OFFSET_PX + (Math.random() * 50);
        obstacleEl.style.left = `${position}px`;
        
        targetPlayer.laneEl.appendChild(obstacleEl);
        obstacles[targetPlayer.id].push({ el: obstacleEl, position: position, type: type });
    }

    function checkCollisions(player) {
        const playerFront = player.position + player.horseEl.clientWidth;
        const obstaclesInLane = obstacles[player.id];

        for (let i = obstaclesInLane.length - 1; i >= 0; i--) {
            const obs = obstaclesInLane[i];
            if (playerFront >= obs.position) {
                // Collision detected!
                triggerObstacleEffect(player, obs);
                obs.el.remove();
                obstaclesInLane.splice(i, 1);
            }
        }
    }

    function triggerObstacleEffect(player, obstacle) {
        if (obstacle.type === 'stun') {
            logMessage(`📣👀🤭💩 Oh no! ${player.name} slipped on poop and is stunned!`);
            player.effects.stunned = 2; // 2 seconds
        } else if (obstacle.type === 'bomb') {
            logMessage(`💥 KABOOM! ${player.name} hit a bomb and was blown away!`);
            player.horseEl.style.opacity = 0;
            endGame(players.find(p => p.id !== player.id));
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
        p1ScoreDisplay.textContent = `Score: ${p1Score}`;
        p2ScoreDisplay.textContent = `Score: ${p2Score}`;
    }
    
    // --- Event Listeners ---
    document.addEventListener('keydown', handleKeyPress);
    newGameButton.addEventListener('click', initGame);
    p1SabotagePanel.addEventListener('click', (e) => {
        if (e.target.classList.contains('sabotage-item')) {
            useSabotageItem(0, e.target.dataset.item);
        }
    });
    p2SabotagePanel.addEventListener('click', (e) => {
        if (e.target.classList.contains('sabotage-item')) {
            useSabotageItem(1, e.target.dataset.item);
        }
    });

    // --- Initializations ---
    initGame();
});
