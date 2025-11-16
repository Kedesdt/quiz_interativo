const quizCode = window.location.pathname.split('/').pop();
document.getElementById('quizCodeDisplay').textContent = quizCode;

let socket;
let currentPlayerId;
let quizData;
let currentQuestionIndex = 0;
let players = new Map();
let timerInterval;
let canSelectAnswer = true;
let isAnonymous = false;

function joinAnonymously() {
    // Gerar nome aleatório
    const randomId = Math.floor(Math.random() * 10000);
    const anonymousName = `Anon${randomId}`;
    document.getElementById('playerName').value = anonymousName;
    joinGame();
}

async function joinGame() {
    const playerName = document.getElementById('playerName').value.trim();
    if (!playerName) {
        alert('Por favor, digite seu nome!');
        return;
    }

    // Conectar ao WebSocket
    socket = io();

    socket.on('connect', () => {
        socket.emit('join_game', {
            quiz_code: quizCode,
            player_name: playerName
        });
    });

    socket.on('players_list', (data) => {
        data.players.forEach(player => {
            players.set(player.id, player);
        });
        currentPlayerId = data.players[data.players.length - 1].id;
    });

    socket.on('quiz_state', (data) => {
        // Quiz já começou - carregar estado atual
        if (data.is_active && data.current_question_index >= 0) {
            currentQuestionIndex = data.current_question_index;
            document.getElementById('nameEntry').style.display = 'none';
            document.getElementById('gameArea').style.display = 'block';
            document.getElementById('waitingArea').style.display = 'none';
            document.getElementById('gameContainer').style.display = 'flex';
            initializePlayersInWaitingRoom();
            loadQuestion(currentQuestionIndex);
            
            // Carregar respostas atuais dos jogadores após um delay
            if (data.player_answers) {
                setTimeout(() => {
                    Object.keys(data.player_answers).forEach(pid => {
                        const answerId = data.player_answers[pid];
                        const player = players.get(parseInt(pid));
                        if (player && answerId) {
                            movePlayerToAnswerInstant(parseInt(pid), answerId, player.name, player.color);
                        }
                    });
                }, 500);
            }
        }
    });

    socket.on('player_joined', (data) => {
        players.set(data.player_id, data);
    });

    socket.on('player_left', (data) => {
        players.delete(data.player_id);
        updatePlayerPositions();
    });

    socket.on('quiz_started', (data) => {
        startQuiz();
    });

    socket.on('question_changed', (data) => {
        currentQuestionIndex = data.question_index;
        loadQuestion(currentQuestionIndex);
    });

    socket.on('answer_selected', (data) => {
        movePlayerToAnswer(data.player_id, data.answer_id, data.player_name, data.player_color);
    });

    socket.on('quiz_ended', () => {
        showResults();
    });

    socket.on('quiz_terminated', () => {
        alert('O quiz foi encerrado pelo host. Você será redirecionado.');
        window.location.href = '/';
    });

    // Carregar dados do quiz
    const response = await fetch(`/api/quiz/${quizCode}`);
    quizData = await response.json();
    isAnonymous = quizData.is_anonymous || false;
    document.getElementById('quizTitle').textContent = quizData.title;

    document.getElementById('nameEntry').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
}

function startQuiz() {
    document.getElementById('waitingArea').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';
    loadQuestion(0);
    initializePlayersInWaitingRoom();
}

function initializePlayersInWaitingRoom() {
    const waitingRoom = document.getElementById('playersWaiting');
    waitingRoom.innerHTML = '';
    
    const animations = ['idle-bounce', 'idle-wiggle', 'idle-pulse', 'idle-sway'];
    
    players.forEach((player, playerId) => {
        const avatar = document.createElement('div');
        avatar.className = 'player-avatar in-waiting-room idle-animation';
        avatar.style.backgroundColor = player.color;
        avatar.textContent = isAnonymous ? '?' : player.name.charAt(0).toUpperCase();
        avatar.setAttribute('data-player-id', playerId);
        avatar.setAttribute('data-name', isAnonymous ? 'Jogador' : player.name);
        avatar.id = `player-${playerId}`;
        
        // Escolher animação aleatória
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
        avatar.style.animationName = randomAnimation;
        
        // Delay aleatório para não sincronizar
        avatar.style.animationDelay = (Math.random() * 1.5) + 's';
        
        waitingRoom.appendChild(avatar);
    });
}

function loadQuestion(index) {
    if (index >= quizData.questions.length) {
        showResults();
        return;
    }

    const question = quizData.questions[index];
    document.getElementById('questionText').textContent = question.text;

    const leftColumn = document.getElementById('leftColumn');
    const rightColumn = document.getElementById('rightColumn');
    const road = document.querySelector('.vertical-road');
    
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    
    // Remover bifurcações antigas
    document.querySelectorAll('.road-branch').forEach(el => el.remove());
    
    canSelectAnswer = true;

    question.answers.forEach((answer, idx) => {
        const zone = document.createElement('div');
        zone.className = 'answer-zone';
        zone.onclick = () => selectAnswer(answer.id);
        zone.setAttribute('data-answer-id', answer.id);
        zone.setAttribute('data-answer-index', idx);

        zone.innerHTML = `
            <div class="answer-label">${String.fromCharCode(65 + idx)}</div>
            <div class="answer-text">${answer.text}</div>
            <div class="players-in-zone" id="zone-${answer.id}"></div>
        `;

        // Distribuir respostas: pares à esquerda, ímpares à direita
        if (idx % 2 === 0) {
            leftColumn.appendChild(zone);
        } else {
            rightColumn.appendChild(zone);
        }
    });

    // Criar bifurcações da rua para cada resposta após renderização
    setTimeout(() => {
        question.answers.forEach((answer, idx) => {
            const zone = document.querySelector(`[data-answer-id="${answer.id}"]`);
            if (!zone) return;

            const zoneRect = zone.getBoundingClientRect();
            const roadRect = road.getBoundingClientRect();
            
            const branch = document.createElement('div');
            branch.className = `road-branch ${idx % 2 === 0 ? 'left' : 'right'}`;
            branch.setAttribute('data-answer-id', answer.id);
            
            // Posicionar bifurcação no topo da zona de resposta
            const topPosition = zoneRect.top - roadRect.top;
            branch.style.top = topPosition + 'px';
            
            // Largura da bifurcação vai até a metade da resposta (50% da largura da zona)
            const branchWidth = zoneRect.width * 0.5;
            branch.style.width = branchWidth + 'px';
            
            branch.innerHTML = '<div class="road-branch-line"></div>';
            
            road.appendChild(branch);
        });
    }, 100);

    // Retornar todos os jogadores para a sala de espera
    returnAllPlayersToWaitingRoom();

    startTimer(quizData.time_limit);
}

function returnAllPlayersToWaitingRoom() {
    const waitingRoom = document.getElementById('playersWaiting');
    
    // Remover avatares das zonas de resposta
    document.querySelectorAll('.answer-zone .player-avatar').forEach(el => el.remove());
    
    // Recriar todos na sala de espera com animações
    const animations = ['idle-bounce', 'idle-wiggle', 'idle-pulse', 'idle-sway'];
    
    waitingRoom.innerHTML = '';
    players.forEach((player, playerId) => {
        const avatar = document.createElement('div');
        avatar.className = 'player-avatar in-waiting-room idle-animation';
        avatar.style.backgroundColor = player.color;
        avatar.textContent = isAnonymous ? '?' : player.name.charAt(0).toUpperCase();
        avatar.setAttribute('data-player-id', playerId);
        avatar.setAttribute('data-name', isAnonymous ? 'Jogador' : player.name);
        avatar.id = `player-${playerId}`;
        
        // Escolher animação aleatória
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
        avatar.style.animationName = randomAnimation;
        
        // Delay aleatório
        avatar.style.animationDelay = (Math.random() * 1.5) + 's';
        
        waitingRoom.appendChild(avatar);
    });
}

function selectAnswer(answerId) {
    if (!canSelectAnswer) {
        return; // Não permitir mudança após tempo acabar
    }
    
    socket.emit('select_answer', {
        player_id: currentPlayerId,
        question_id: quizData.questions[currentQuestionIndex].id,
        answer_id: answerId,
        quiz_code: quizCode
    });
}

function movePlayerToAnswerInstant(playerId, answerId, playerName, playerColor) {
    // Versão instantânea sem animação para carregar estado atual
    const player = players.get(playerId);
    if (!player) return;
    if (!answerId) return;

    // Remover da sala de espera
    const waitingAvatar = document.querySelector(`.players-waiting .player-avatar[data-player-id="${playerId}"]`);
    if (waitingAvatar) waitingAvatar.remove();

    // Adicionar diretamente na zona de resposta
    const animations = ['idle-bounce', 'idle-wiggle', 'idle-pulse', 'idle-sway'];
    const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
    
    const finalAvatar = document.createElement('div');
    finalAvatar.className = 'player-avatar idle-animation';
    finalAvatar.style.backgroundColor = playerColor || player.color;
    const displayName = playerName || player.name;
    finalAvatar.textContent = isAnonymous ? '?' : displayName.charAt(0).toUpperCase();
    finalAvatar.setAttribute('data-player-id', playerId);
    finalAvatar.setAttribute('data-name', isAnonymous ? 'Jogador' : displayName);
    finalAvatar.style.animationName = randomAnimation;
    finalAvatar.style.animationDelay = (Math.random() * 1.5) + 's';
    
    const playersZone = document.getElementById(`zone-${answerId}`);
    if (playersZone) {
        playersZone.appendChild(finalAvatar);
    }
}

// Mapa para rastrear animações em andamento
const activeAnimations = new Map();

function movePlayerToAnswer(playerId, answerId, playerName, playerColor) {
    const player = players.get(playerId);
    if (!player) return;
    if (!answerId) return;

    // Cancelar animação anterior se existir
    if (activeAnimations.has(playerId)) {
        activeAnimations.get(playerId).cancel = true;
    }

    // Verificar se o jogador já está em alguma resposta
    const existingInZone = document.querySelector(`.players-in-zone .player-avatar[data-player-id="${playerId}"]`);
    let startX, startY;
    let isComingFromAnswer = false;
    let originAnswerIndex, originIsLeft;

    if (existingInZone) {
        // Jogador está mudando de resposta
        const existingRect = existingInZone.getBoundingClientRect();
        startX = existingRect.left;
        startY = existingRect.top;
        isComingFromAnswer = true;
        
        const originZone = existingInZone.closest('.answer-zone');
        if (originZone) {
            originAnswerIndex = parseInt(originZone.getAttribute('data-answer-index'));
            originIsLeft = originAnswerIndex % 2 === 0;
        }
        
        existingInZone.remove();
    } else {
        // Primeira resposta - começar da sala de espera
        const waitingAvatar = document.querySelector(`.players-waiting .player-avatar[data-player-id="${playerId}"]`);
        if (waitingAvatar) {
            const waitingRect = waitingAvatar.getBoundingClientRect();
            startX = waitingRect.left;
            startY = waitingRect.top;
            waitingAvatar.remove();
        } else {
            const waitingRoom = document.getElementById('playersWaiting');
            const waitingRect = waitingRoom.getBoundingClientRect();
            startX = waitingRect.left + waitingRect.width / 2 - 25;
            startY = waitingRect.top + waitingRect.height / 2 - 25;
        }
    }

    // Remover TODOS os avatares antigos do jogador (incluindo temp)
    const allOldAvatars = document.querySelectorAll(`[data-player-id="${playerId}"], [data-player-id="${playerId}-temp"]`);
    allOldAvatars.forEach(el => {
        if (el.parentNode) el.remove();
    });

    // Criar avatar de viagem DEPOIS de limpar
    const tempAvatar = document.createElement('div');
    tempAvatar.className = 'player-avatar traveling';
    tempAvatar.style.backgroundColor = playerColor || player.color;
    const displayName = playerName || player.name;
    tempAvatar.textContent = isAnonymous ? '?' : displayName.charAt(0).toUpperCase();
    tempAvatar.setAttribute('data-player-id', playerId + '-temp');
    tempAvatar.style.width = '50px';
    tempAvatar.style.height = '50px';
    tempAvatar.style.transition = 'none';
    tempAvatar.style.left = startX + 'px';
    tempAvatar.style.top = startY + 'px';
    tempAvatar.style.position = 'fixed';
    tempAvatar.style.zIndex = '1000';
    tempAvatar.style.pointerEvents = 'none';
    
    document.body.appendChild(tempAvatar);

    // Calcular posições do destino - especificar .answer-zone para não pegar .road-branch
    const zone = document.querySelector(`.answer-zone[data-answer-id="${answerId}"]`);
    if (!zone) {
        tempAvatar.remove();
        return;
    }

    const zoneRect = zone.getBoundingClientRect();
    const road = document.querySelector('.vertical-road');
    const roadRect = road.getBoundingClientRect();
    
    const answerIndex = parseInt(zone.getAttribute('data-answer-index'));
    const isLeft = answerIndex % 2 === 0;
    
    // Centro da avenida
    const roadCenterX = roadRect.left + roadRect.width / 2 - 25;
    
    // Bifurcação: início (na borda da avenida) e fim (50% dentro da zona)
    const branchStartY = zoneRect.top + 30 - 25;
    const branchStartX = isLeft ? roadRect.left - 25 : roadRect.right - 25;
    
    // Fim da bifurcação: 50% da largura da zona, partindo da borda mais próxima da avenida
    const branchEndX = isLeft 
        ? zoneRect.right - zoneRect.width * 0.5 - 25
        : zoneRect.left + zoneRect.width * 0.5 - 25;
    const branchEndY = branchStartY;
    
    // Posição final dentro da zona de resposta (centro)
    const finalX = zoneRect.left + zoneRect.width / 2 - 25;
    const finalY = zoneRect.top + zoneRect.height / 2 - 25;

    // Definir waypoints (pontos do caminho)
    let waypoints = [];
    
    if (isComingFromAnswer) {
        // QUANDO SAI DE UMA RESPOSTA
        const originZoneElement = document.querySelector(`[data-answer-index="${originAnswerIndex}"]`);
        const originZoneRect = originZoneElement.getBoundingClientRect();
        
        // Pontos da bifurcação de origem
        const originBranchStartY = originZoneRect.top + 30 - 25;
        const originBranchStartX = originIsLeft ? roadRect.left - 25 : roadRect.right - 25;
        
        const originBranchEndX = originIsLeft 
            ? originZoneRect.right - originZoneRect.width * 0.5 - 25
            : originZoneRect.left + originZoneRect.width * 0.5 - 25;
        const originBranchEndY = originBranchStartY;
        
        waypoints = [
            { x: startX, y: startY },
            { x: originBranchEndX, y: originBranchEndY },
            { x: originBranchStartX, y: originBranchStartY },
            { x: roadCenterX, y: originBranchStartY },
            { x: roadCenterX, y: branchStartY },
            { x: branchStartX, y: branchStartY },
            { x: branchEndX, y: branchEndY },
            { x: finalX, y: finalY }
        ];
    } else {
        // QUANDO ESTÁ NA SALA DE ESPERA
        waypoints = [
            { x: startX, y: startY },
            { x: roadCenterX, y: startY },
            { x: roadCenterX, y: branchStartY },
            { x: branchStartX, y: branchStartY },
            { x: branchEndX, y: branchEndY },
            { x: finalX, y: finalY }
        ];
    }

    // Animação com requestAnimationFrame - velocidade constante baseada em distância
    let currentWaypoint = 0;
    let progress = 0;
    
    // Calcular distâncias totais entre cada par de waypoints
    const distances = [];
    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        const dx = waypoints[i + 1].x - waypoints[i].x;
        const dy = waypoints[i + 1].y - waypoints[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        distances.push(dist);
        totalDistance += dist;
    }
    
    // Calcular tempo proporcional para cada segmento (baseado na distância)
    const segmentDurations = distances.map(d => d / totalDistance);
    
    // Velocidade constante em pixels por frame (ajuste este valor para controlar velocidade geral)
    const pixelsPerFrame = 5;
    const baseSpeed = pixelsPerFrame / totalDistance;

    // Marcar animação como ativa
    const animationState = { cancel: false };
    activeAnimations.set(playerId, animationState);

    function animate() {
        // Verificar se animação foi cancelada
        if (animationState.cancel) {
            if (tempAvatar && tempAvatar.parentNode) {
                tempAvatar.remove();
            }
            activeAnimations.delete(playerId);
            return;
        }

        if (currentWaypoint >= waypoints.length - 1) {
            finishAnimation();
            return;
        }

        const start = waypoints[currentWaypoint];
        const end = waypoints[currentWaypoint + 1];
        const segmentDistance = distances[currentWaypoint];
        
        // Incremento proporcional à distância do segmento atual
        const segmentSpeed = pixelsPerFrame / segmentDistance;
        progress += segmentSpeed;
        
        // Garantir que progress não ultrapasse 1
        if (progress > 1) progress = 1;
        
        // Interpolação linear (velocidade constante)
        const currentX = start.x + (end.x - start.x) * progress;
        const currentY = start.y + (end.y - start.y) * progress;

        // Atualizar posição
        tempAvatar.style.left = currentX + 'px';
        tempAvatar.style.top = currentY + 'px';
        
        if (progress >= 1) {
            progress = 0;
            currentWaypoint++;
            if (currentWaypoint >= waypoints.length - 1) {
                finishAnimation();
                return;
            }
        }

        requestAnimationFrame(animate);
    }

    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function finishAnimation() {
        // Limpar estado de animação
        activeAnimations.delete(playerId);
        
        // Remover avatar temporário
        if (tempAvatar && tempAvatar.parentNode) {
            tempAvatar.remove();
        }
        
        // Remover qualquer avatar duplicado (incluindo temp) antes de criar o final
        const existingAvatars = document.querySelectorAll(`[data-player-id="${playerId}"], [data-player-id="${playerId}-temp"]`);
        existingAvatars.forEach(el => {
            if (el.parentNode) el.remove();
        });
        
        const animations = ['idle-bounce', 'idle-wiggle', 'idle-pulse', 'idle-sway'];
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
        
        const finalAvatar = document.createElement('div');
        finalAvatar.className = 'player-avatar bounce idle-animation';
        finalAvatar.style.backgroundColor = playerColor || player.color;
        const displayName = playerName || player.name;
        finalAvatar.textContent = isAnonymous ? '?' : displayName.charAt(0).toUpperCase();
        finalAvatar.setAttribute('data-player-id', playerId);
        finalAvatar.setAttribute('data-name', isAnonymous ? 'Jogador' : displayName);
        finalAvatar.style.animationName = randomAnimation;
        finalAvatar.style.animationDelay = (Math.random() * 1.5) + 's';
        
        const playersZone = document.getElementById(`zone-${answerId}`);
        if (playersZone) {
            playersZone.appendChild(finalAvatar);
            
            setTimeout(() => {
                finalAvatar.classList.remove('bounce');
            }, 500);
        }
    }

    // Iniciar animação
    requestAnimationFrame(animate);
}

function updatePlayerPositions() {
    // Atualizar visualização de todos os jogadores
    players.forEach((player, playerId) => {
        const avatars = document.querySelectorAll(`.player-avatar[data-player-id="${playerId}"]`);
        avatars.forEach(avatar => {
            avatar.style.backgroundColor = player.color;
        });
    });
}

function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);

    let timeLeft = seconds;
    const timerEl = document.getElementById('timer');
    
    timerInterval = setInterval(() => {
        timerEl.textContent = timeLeft;
        
        if (timeLeft <= 10) {
            timerEl.style.color = '#dc3545';
        } else {
            timerEl.style.color = '#28a745';
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            canSelectAnswer = false; // Bloquear seleção
            // Desabilitar visualmente as zonas de resposta
            document.querySelectorAll('.answer-zone').forEach(zone => {
                zone.classList.add('disabled');
            });
            timerEl.textContent = 'Tempo Esgotado!';
            timerEl.style.color = '#dc3545';
        }

        timeLeft--;
    }, 1000);
}

function showResults() {
    if (timerInterval) clearInterval(timerInterval);
    
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('resultsArea').style.display = 'block';
    
    loadQuizStatistics();
}

async function loadQuizStatistics() {
    try {
        const response = await fetch(`/api/quiz/${quizCode}/stats`);
        const data = await response.json();
        
        const container = document.getElementById('resultsChartsContainer');
        container.innerHTML = '';
        
        data.stats.forEach((questionData, index) => {
            const chartCard = document.createElement('div');
            chartCard.className = 'chart-card';
            
            const maxCount = Math.max(...questionData.answers.map(a => a.count), 1);
            
            let chartsHTML = '<div class="chart-bars">';
            questionData.answers.forEach((answer, idx) => {
                const percentage = (answer.count / maxCount) * 100;
                const barColor = answer.is_correct ? '#28a745' : '#6c757d';
                const answerText = answer.answer_text || answer.text || 'Sem texto';
                
                chartsHTML += `
                    <div class="chart-bar-container">
                        <div class="chart-label">${String.fromCharCode(65 + idx)}</div>
                        <div class="chart-bar-wrapper">
                            <div class="chart-bar" style="width: ${percentage}%; background-color: ${barColor};">
                                <span class="chart-count">${answer.count}</span>
                            </div>
                        </div>
                        <div class="chart-answer-text">${answerText}</div>
                    </div>
                `;
            });
            chartsHTML += '</div>';
            
            chartCard.innerHTML = `
                <h3>Pergunta ${index + 1}</h3>
                <p class="question-text-chart">${questionData.question_text}</p>
                ${chartsHTML}
            `;
            
            container.appendChild(chartCard);
        });
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

