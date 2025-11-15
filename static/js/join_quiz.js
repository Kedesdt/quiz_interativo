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
    let isComingFromAnswer = false;

    // Criar avatar de viagem
    const tempAvatar = document.createElement('div');
    tempAvatar.className = 'player-avatar traveling';
    tempAvatar.style.backgroundColor = playerColor || player.color;
    tempAvatar.textContent = (playerName || player.name).charAt(0).toUpperCase();
    tempAvatar.setAttribute('data-player-id', playerId + '-temp');
    tempAvatar.style.width = '50px';
    tempAvatar.style.height = '50px';

    if (existingInZone) {
        // Jogador está mudando de resposta - começar exatamente de onde ele está
        const existingRect = existingInZone.getBoundingClientRect();
        startX = existingRect.left;
        startY = existingRect.top;
        isComingFromAnswer = true;
        
        // Pegar a zona de origem
        const originZone = existingInZone.closest('.answer-zone');
        if (originZone) {
            var originAnswerIndex = parseInt(originZone.getAttribute('data-answer-index'));
            var originIsLeft = originAnswerIndex % 2 === 0;
        }
        
        existingInZone.remove();
    } else {
        // Primeira resposta - começar exatamente da sala de espera
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
    tempAvatar.style.position = 'fixed';
    tempAvatar.style.zIndex = '1000';
    
    document.body.appendChild(tempAvatar);

    // Calcular posições do destino
    const zone = document.querySelector(`[data-answer-id="${answerId}"]`);
    if (!zone) {
        tempAvatar.remove();
        return;
    }

    const zoneRect = zone.getBoundingClientRect();
    const road = document.querySelector('.vertical-road');
    const roadRect = road.getBoundingClientRect();
    
    // Determinar se é resposta da esquerda ou direita
    const answerIndex = parseInt(zone.getAttribute('data-answer-index'));
    const isLeft = answerIndex % 2 === 0;
    
    // Posições chave
    const roadCenterX = roadRect.left + roadRect.width / 2 - 25;
    const branchY = zoneRect.top + 20; // Altura da bifurcação (alinhada com o topo da resposta)
    const branchX = isLeft ? roadCenterX - 60 : roadCenterX + 60; // Ponto na rua horizontal
    
    // Posição final dentro da zona de resposta
    const finalZone = document.getElementById(`zone-${answerId}`);
    const playersZone = finalZone || zone.querySelector('.players-in-zone');
    let finalX = zoneRect.left + zoneRect.width / 2 - 25;
    let finalY = zoneRect.top + zoneRect.height / 2 - 25;

    let delay = 50;

    if (isComingFromAnswer) {
        // CAMINHO DE RESPOSTA PARA RESPOSTA:
        // 1. Sair da posição atual até a rua da resposta (horizontal)
        // 2. Pela rua até o meio da avenida (horizontal)
        // 3. Descer/subir pela avenida até a altura da nova resposta (vertical)
        // 4. Entrar na rua da nova resposta (horizontal)
        // 5. Ir até a posição final (horizontal)

        const originBranchX = originIsLeft ? roadCenterX - 60 : roadCenterX + 60;
        const originBranchY = startY; // Mesma altura de onde está

        setTimeout(() => {
            // Etapa 1: Sair até a rua da resposta de origem (movimento horizontal)
            tempAvatar.style.transition = 'all 0.4s ease-in-out';
            tempAvatar.style.left = originBranchX + 'px';
            tempAvatar.style.transform = `rotate(${originIsLeft ? 0 : 180}deg) scale(1.1)`;
        }, delay);
        delay += 450;

        setTimeout(() => {
            // Etapa 2: Ir pela rua até a avenida central (movimento horizontal)
            tempAvatar.style.transition = 'all 0.4s ease-in-out';
            tempAvatar.style.left = roadCenterX + 'px';
            tempAvatar.style.transform = `rotate(${originIsLeft ? 90 : 270}deg) scale(1.2)`;
        }, delay);
        delay += 450;

        setTimeout(() => {
            // Etapa 3: Descer/subir pela avenida até a altura da nova resposta (movimento vertical)
            tempAvatar.style.transition = 'all 0.5s ease-in-out';
            tempAvatar.style.top = branchY + 'px';
            tempAvatar.style.transform = `rotate(${branchY > originBranchY ? 180 : 0}deg) scale(1.3)`;
        }, delay);
        delay += 550;

        setTimeout(() => {
            // Etapa 4: Entrar na rua da nova resposta (movimento horizontal)
            tempAvatar.style.transition = 'all 0.4s ease-in-out';
            tempAvatar.style.left = branchX + 'px';
            tempAvatar.style.transform = `rotate(${isLeft ? 270 : 90}deg) scale(1.1)`;
        }, delay);
        delay += 450;

        setTimeout(() => {
            // Etapa 5: Ir até a posição final (movimento horizontal)
            tempAvatar.style.transition = 'all 0.5s ease-out';
            tempAvatar.style.left = finalX + 'px';
            tempAvatar.style.top = finalY + 'px';
            tempAvatar.style.transform = 'rotate(360deg) scale(1)';
        }, delay);
        delay += 550;

    } else {
        // CAMINHO DA SALA DE ESPERA PARA RESPOSTA:
        // 1. Sair da sala até o meio da avenida (movimento diagonal/direto)
        // 2. Descer pela avenida até a altura da resposta (movimento vertical)
        // 3. Entrar na rua da resposta (movimento horizontal)
        // 4. Ir até a posição final (movimento horizontal)

        setTimeout(() => {
            // Etapa 1: Ir da sala de espera até a avenida central
            tempAvatar.style.transition = 'all 0.5s ease-in-out';
            tempAvatar.style.left = roadCenterX + 'px';
            tempAvatar.style.top = startY + 'px';
            tempAvatar.style.transform = 'rotate(90deg) scale(1.2)';
        }, delay);
        delay += 550;

        setTimeout(() => {
            // Etapa 2: Descer pela avenida até a altura da bifurcação
            tempAvatar.style.transition = 'all 0.6s ease-in-out';
            tempAvatar.style.top = branchY + 'px';
            tempAvatar.style.transform = 'rotate(180deg) scale(1.3)';
        }, delay);
        delay += 650;

        setTimeout(() => {
            // Etapa 3: Entrar na rua da resposta (esquerda ou direita)
            tempAvatar.style.transition = 'all 0.4s ease-in-out';
            tempAvatar.style.left = branchX + 'px';
            tempAvatar.style.transform = `rotate(${isLeft ? 270 : 90}deg) scale(1.1)`;
        }, delay);
        delay += 450;

        setTimeout(() => {
            // Etapa 4: Ir até a posição final
            tempAvatar.style.transition = 'all 0.5s ease-out';
            tempAvatar.style.left = finalX + 'px';
            tempAvatar.style.top = finalY + 'px';
            tempAvatar.style.transform = 'rotate(360deg) scale(1)';
        }, delay);
        delay += 550;
    }

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
    }, delay + 100);
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
