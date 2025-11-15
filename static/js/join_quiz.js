const quizCode = window.location.pathname.split('/').pop();
document.getElementById('quizCodeDisplay').textContent = quizCode;

let socket;
let currentPlayerId;
let quizData;
let currentQuestionIndex = 0;
let players = new Map();
let timerInterval;
let canSelectAnswer = true;

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

    // Carregar dados do quiz
    const response = await fetch(`/api/quiz/${quizCode}`);
    quizData = await response.json();
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
        avatar.textContent = player.name.charAt(0).toUpperCase();
        avatar.setAttribute('data-player-id', playerId);
        avatar.setAttribute('data-name', player.name);
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
            
            branch.innerHTML = '<div class="road-branch-line"></div>';
            
            road.appendChild(branch);
        });
    }, 50);

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
        avatar.textContent = player.name.charAt(0).toUpperCase();
        avatar.setAttribute('data-player-id', playerId);
        avatar.setAttribute('data-name', player.name);
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
    finalAvatar.textContent = (playerName || player.name).charAt(0).toUpperCase();
    finalAvatar.setAttribute('data-player-id', playerId);
    finalAvatar.setAttribute('data-name', playerName || player.name);
    finalAvatar.style.animationName = randomAnimation;
    finalAvatar.style.animationDelay = (Math.random() * 1.5) + 's';
    
    const playersZone = document.getElementById(`zone-${answerId}`);
    if (playersZone) {
        playersZone.appendChild(finalAvatar);
    }
}

function movePlayerToAnswer(playerId, answerId, playerName, playerColor) {
    const player = players.get(playerId);
    if (!player) return;

    if (!answerId) return;

    // Verificar se o jogador já está em alguma resposta
    const existingInZone = document.querySelector(`.players-in-zone .player-avatar[data-player-id="${playerId}"]`);
    let startX, startY;

    // Criar avatar de viagem
    const tempAvatar = document.createElement('div');
    tempAvatar.className = 'player-avatar traveling';
    tempAvatar.style.backgroundColor = playerColor || player.color;
    tempAvatar.textContent = (playerName || player.name).charAt(0).toUpperCase();
    tempAvatar.setAttribute('data-player-id', playerId + '-temp');
    tempAvatar.style.width = '50px';
    tempAvatar.style.height = '50px';

    if (existingInZone) {
        // Jogador está mudando de resposta - começar de onde ele está
        const existingRect = existingInZone.getBoundingClientRect();
        startX = existingRect.left;
        startY = existingRect.top;
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

    // Remover qualquer outro avatar duplicado
    const allOldAvatars = document.querySelectorAll(`[data-player-id="${playerId}"]`);
    allOldAvatars.forEach(el => el.remove());

    tempAvatar.style.left = startX + 'px';
    tempAvatar.style.top = startY + 'px';
    
    document.body.appendChild(tempAvatar);

    // Calcular caminho com bifurcação
    const zone = document.querySelector(`[data-answer-id="${answerId}"]`);
    if (!zone) {
        tempAvatar.remove();
        return;
    }

    const zoneRect = zone.getBoundingClientRect();
    const road = document.querySelector('.vertical-road');
    const roadRect = road.getBoundingClientRect();
    const branch = document.querySelector(`.road-branch[data-answer-id="${answerId}"]`);
    
    // Determinar se é resposta da esquerda ou direita
    const answerIndex = parseInt(zone.getAttribute('data-answer-index'));
    const isLeft = answerIndex % 2 === 0;
    
    // Posição final (topo da zona de resposta)
    const finalX = zoneRect.left + zoneRect.width / 2 - 25;
    const finalY = zoneRect.top - 30; // Acima da zona
    
    // Posições da rua
    const roadCenterX = roadRect.left + roadRect.width / 2 - 25;
    const roadMidY = (startY + zoneRect.top) / 2;
    
    // Ponto da bifurcação
    const branchY = zoneRect.top;
    const branchX = isLeft ? roadCenterX - 40 : roadCenterX + 40;

    // Animar em 4 etapas: Origem -> Rua central -> Bifurcação -> Resposta
    setTimeout(() => {
        // Etapa 1: Ir para a rua central
        tempAvatar.style.transition = 'all 0.5s ease-in-out';
        tempAvatar.style.left = roadCenterX + 'px';
        tempAvatar.style.top = roadMidY + 'px';
        tempAvatar.style.transform = 'rotate(90deg) scale(1.2)';
    }, 50);

    setTimeout(() => {
        // Etapa 2: Descer pela rua até a altura da bifurcação
        tempAvatar.style.transition = 'all 0.7s ease-in-out';
        tempAvatar.style.top = branchY + 'px';
        tempAvatar.style.transform = 'rotate(180deg) scale(1.3)';
    }, 600);

    setTimeout(() => {
        // Etapa 3: Entrar na bifurcação (esquerda ou direita)
        tempAvatar.style.transition = 'all 0.5s ease-in-out';
        tempAvatar.style.left = branchX + 'px';
        tempAvatar.style.transform = `rotate(${isLeft ? 270 : 90}deg) scale(1.2)`;
    }, 1350);

    setTimeout(() => {
        // Etapa 4: Ir até a resposta
        tempAvatar.style.transition = 'all 0.6s ease-out';
        tempAvatar.style.left = finalX + 'px';
        tempAvatar.style.top = finalY + 'px';
        tempAvatar.style.transform = 'rotate(360deg) scale(1)';
    }, 1900);

    // Finalizar: adicionar avatar fixo na zona
    setTimeout(() => {
        tempAvatar.remove();
        
        const animations = ['idle-bounce', 'idle-wiggle', 'idle-pulse', 'idle-sway'];
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
        
        const finalAvatar = document.createElement('div');
        finalAvatar.className = 'player-avatar bounce idle-animation';
        finalAvatar.style.backgroundColor = playerColor || player.color;
        finalAvatar.textContent = (playerName || player.name).charAt(0).toUpperCase();
        finalAvatar.setAttribute('data-player-id', playerId);
        finalAvatar.setAttribute('data-name', playerName || player.name);
        finalAvatar.style.animationName = randomAnimation;
        finalAvatar.style.animationDelay = (Math.random() * 1.5) + 's';
        
        const playersZone = document.getElementById(`zone-${answerId}`);
        if (playersZone) {
            playersZone.appendChild(finalAvatar);
            
            setTimeout(() => {
                finalAvatar.classList.remove('bounce');
            }, 500);
        }
    }, 2550);
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
}
