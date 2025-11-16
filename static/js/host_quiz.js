const quizCode = window.QUIZ_CODE;
let socket;
let quizData;
let currentQuestionIndex = 0;
let players = new Map();
let timerInterval;
let playerAnswers = new Map(); // Map de question_id -> Map de player_id -> answer_id

async function init() {
    // Conectar WebSocket
    socket = io();

    socket.on('connect', () => {
        socket.emit('join_host', {
            quiz_code: quizCode
        });
    });

    socket.on('players_list', (data) => {
        data.players.forEach(player => {
            players.set(player.id, player);
        });
        updatePlayersList();
    });

    socket.on('player_joined', (data) => {
        players.set(data.player_id, data);
        updatePlayersList();
    });

    socket.on('player_left', (data) => {
        players.delete(data.player_id);
        updatePlayersList();
        updateAnswersDisplay();
    });

    socket.on('answer_selected', (data) => {
        const questionId = quizData.questions[currentQuestionIndex].id;
        if (!playerAnswers.has(questionId)) {
            playerAnswers.set(questionId, new Map());
        }
        playerAnswers.get(questionId).set(data.player_id, data.answer_id);
        updateAnswersDisplay();
    });

    socket.on('quiz_terminated', () => {
        // Redirecionar para a página inicial quando o quiz for encerrado
        alert('Quiz encerrado! Todos os dados foram limpos.');
        window.location.href = '/';
    });

    // Carregar quiz
    const response = await fetch(`/api/quiz/${quizCode}?host=true`);
    quizData = await response.json();
}

function updatePlayersList() {
    const list = document.getElementById('playersList');
    list.innerHTML = '';

    players.forEach(player => {
        const li = document.createElement('li');
        li.className = 'player-item';
        li.innerHTML = `
            <div class="player-color" style="background-color: ${player.color}"></div>
            <div class="player-name">${player.name}</div>
        `;
        list.appendChild(li);
    });

    document.getElementById('playerCount').textContent = players.size;
}

function startQuiz() {
    if (players.size === 0) {
        alert('Aguarde pelo menos um jogador entrar!');
        return;
    }

    socket.emit('start_quiz', {
        quiz_code: quizCode
    });

    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('questionScreen').style.display = 'block';
    
    loadQuestion(0);
}

function loadQuestion(index) {
    currentQuestionIndex = index;
    const question = quizData.questions[index];

    document.getElementById('questionNumber').textContent = `Pergunta ${index + 1} de ${quizData.questions.length}`;
    document.getElementById('questionText').textContent = question.text;

    const answersGrid = document.getElementById('answersGrid');
    answersGrid.innerHTML = '';

    question.answers.forEach((answer, idx) => {
        const card = document.createElement('div');
        card.className = 'answer-card';
        if (answer.is_correct) {
            card.classList.add('correct');
        }

        card.innerHTML = `
            <div class="answer-header">
                <div class="answer-label">${String.fromCharCode(65 + idx)}</div>
                ${answer.is_correct ? '<span style="color: #28a745; font-size: 1.5em;">✓</span>' : ''}
            </div>
            <div class="answer-text">${answer.text}</div>
            <div class="answer-players" id="answer-players-${answer.id}"></div>
        `;

        answersGrid.appendChild(card);
    });

    // Limpar respostas desta pergunta
    if (!playerAnswers.has(question.id)) {
        playerAnswers.set(question.id, new Map());
    }

    startTimer(quizData.time_limit);
    updateAnswersDisplay();

    // Atualizar botão
    const nextBtn = document.getElementById('nextBtn');
    if (index >= quizData.questions.length - 1) {
        nextBtn.textContent = '🏁 Finalizar Quiz';
    }
}

function updateAnswersDisplay() {
    if (!quizData || currentQuestionIndex >= quizData.questions.length) return;

    const question = quizData.questions[currentQuestionIndex];
    const answers = playerAnswers.get(question.id) || new Map();

    question.answers.forEach(answer => {
        const container = document.getElementById(`answer-players-${answer.id}`);
        if (!container) return;

        container.innerHTML = '';

        answers.forEach((selectedAnswerId, playerId) => {
            if (selectedAnswerId === answer.id) {
                const player = players.get(playerId);
                if (player) {
                    const avatar = document.createElement('div');
                    avatar.className = 'player-avatar-small';
                    avatar.style.backgroundColor = player.color;
                    avatar.textContent = player.name.charAt(0).toUpperCase();
                    avatar.setAttribute('data-name', player.name);
                    container.appendChild(avatar);
                }
            }
        });
    });
}

function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);

    let timeLeft = seconds;
    const timerEl = document.getElementById('timer');
    
    timerInterval = setInterval(() => {
        timerEl.textContent = timeLeft + 's';
        
        if (timeLeft <= 10) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }

        timeLeft--;
    }, 1000);
}

function nextQuestion() {
    if (timerInterval) clearInterval(timerInterval);

    if (currentQuestionIndex < quizData.questions.length - 1) {
        socket.emit('next_question', {
            quiz_code: quizCode
        });
        loadQuestion(currentQuestionIndex + 1);
    } else {
        endQuiz();
    }
}

function endQuiz() {
    if (timerInterval) clearInterval(timerInterval);

    socket.emit('quiz_ended', {
        quiz_code: quizCode
    });

    document.getElementById('questionScreen').style.display = 'none';
    document.getElementById('resultsScreen').style.display = 'block';

    document.getElementById('totalPlayers').textContent = players.size;
    document.getElementById('totalQuestions').textContent = quizData.questions.length;

    // Carregar e exibir gráficos de estatísticas
    loadStatistics();
}

async function loadStatistics() {
    const response = await fetch(`/api/quiz/${quizCode}/stats`);
    const data = await response.json();
    
    const container = document.getElementById('chartsContainer');
    container.innerHTML = '';
    
    data.stats.forEach((questionData, index) => {
        const chartCard = document.createElement('div');
        chartCard.className = 'chart-card';
        
        const maxCount = Math.max(...questionData.answers.map(a => a.count), 1);
        
        let chartsHTML = '<div class="chart-bars">';
        questionData.answers.forEach((answer, idx) => {
            const percentage = (answer.count / maxCount) * 100;
            const barColor = answer.is_correct ? '#28a745' : '#6c757d';
            
            chartsHTML += `
                <div class="chart-bar-container">
                    <div class="chart-label">${String.fromCharCode(65 + idx)}</div>
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar" style="width: ${percentage}%; background-color: ${barColor};">
                            <span class="chart-count">${answer.count}</span>
                        </div>
                    </div>
                    <div class="chart-answer-text">${answer.answer_text}</div>
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
}

function terminateQuiz() {
    if (!confirm('Tem certeza que deseja encerrar o quiz e limpar todos os dados? Esta ação não pode ser desfeita.')) {
        return;
    }
    
    socket.emit('terminate_quiz', {
        quiz_code: quizCode
    });
    
    alert('Quiz encerrado! Redirecionando...');
    window.location.href = '/';
}

init();
