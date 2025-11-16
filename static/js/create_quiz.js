let questionCount = 0;
let createdQuizCode = '';

function addQuestion() {
    questionCount++;
    const container = document.getElementById('questionsContainer');
    
    const questionCard = document.createElement('div');
    questionCard.className = 'question-card';
    questionCard.id = `question-${questionCount}`;
    
    questionCard.innerHTML = `
        <div class="question-header">
            <span class="question-number">Pergunta ${questionCount}</span>
            <button type="button" class="btn-remove" onclick="removeQuestion(${questionCount})">
                🗑️ Remover
            </button>
        </div>
        <div class="form-group">
            <label>Texto da Pergunta</label>
            <textarea class="question-text" rows="2" placeholder="Digite a pergunta..." required></textarea>
        </div>
        <div class="form-group">
            <label>Respostas <span class="correct-indicator">(Selecione a resposta correta)</span></label>
            <div class="answers-container" id="answers-${questionCount}">
                ${generateAnswerInputs(questionCount, 4)}
            </div>
            <button type="button" class="btn btn-secondary" style="margin-top: 10px;" onclick="addAnswer(${questionCount})">
                ➕ Adicionar Resposta
            </button>
        </div>
    `;
    
    container.appendChild(questionCard);
}

function generateAnswerInputs(questionId, count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="answer-item" id="answer-${questionId}-${i}">
                <input type="radio" name="correct-${questionId}" value="${i}" ${i === 0 ? 'required' : ''}>
                <input type="text" class="answer-text" placeholder="Resposta ${i + 1}" required>
                ${i >= 2 ? `<button type="button" onclick="removeAnswer(${questionId}, ${i})">🗑️</button>` : ''}
            </div>
        `;
    }
    return html;
}

function addAnswer(questionId) {
    const container = document.getElementById(`answers-${questionId}`);
    const answerCount = container.children.length;
    
    const answerItem = document.createElement('div');
    answerItem.className = 'answer-item';
    answerItem.id = `answer-${questionId}-${answerCount}`;
    answerItem.innerHTML = `
        <input type="radio" name="correct-${questionId}" value="${answerCount}">
        <input type="text" class="answer-text" placeholder="Resposta ${answerCount + 1}" required>
        <button type="button" onclick="removeAnswer(${questionId}, ${answerCount})">🗑️</button>
    `;
    
    container.appendChild(answerItem);
}

function removeAnswer(questionId, answerId) {
    const answer = document.getElementById(`answer-${questionId}-${answerId}`);
    if (answer) {
        answer.remove();
    }
}

function removeQuestion(questionId) {
    const question = document.getElementById(`question-${questionId}`);
    if (question) {
        question.remove();
    }
}

// Adicionar primeira pergunta ao carregar
addQuestion();

document.getElementById('quizForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const title = document.getElementById('quizTitle').value;
    const timeLimit = document.getElementById('timeLimit').value;
    
    const questions = [];
    const questionCards = document.querySelectorAll('.question-card');
    
    questionCards.forEach((card, idx) => {
        const questionText = card.querySelector('.question-text').value;
        const answersContainer = card.querySelector('.answers-container');
        const answerItems = answersContainer.querySelectorAll('.answer-item');
        const correctRadio = card.querySelector('input[type="radio"]:checked');
        
        if (!correctRadio) {
            alert(`Selecione a resposta correta para a Pergunta ${idx + 1}`);
            throw new Error('Resposta correta não selecionada');
        }
        
        const correctIndex = parseInt(correctRadio.value);
        const answers = [];
        
        answerItems.forEach((item, ansIdx) => {
            const answerText = item.querySelector('.answer-text').value;
            answers.push({
                text: answerText,
                is_correct: ansIdx === correctIndex
            });
        });
        
        questions.push({
            text: questionText,
            answers: answers
        });
    });
    
    if (questions.length === 0) {
        alert('Adicione pelo menos uma pergunta!');
        return;
    }
    
    const isAnonymous = document.getElementById('isAnonymous').checked;
    
    const quizData = {
        title: title,
        time_limit: parseInt(timeLimit),
        is_anonymous: isAnonymous,
        questions: questions
    };
    
    try {
        const response = await fetch('/api/quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(quizData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            createdQuizCode = result.code;
            document.getElementById('generatedCode').textContent = result.code;
            document.getElementById('quizCodeModal').style.display = 'flex';
        } else {
            alert('Erro ao criar quiz!');
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao criar quiz!');
    }
});

function goToHost() {
    window.location.href = `/host/${createdQuizCode}`;
}
