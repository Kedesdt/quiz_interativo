from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import secrets
import json
import os
from dotenv import load_dotenv
import qrcode
from io import BytesIO
import base64
import threading
import time

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", secrets.token_hex(16))
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///quiz.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["HOST_URL"] = os.getenv("HOST_URL", "http://localhost:5000")

db = SQLAlchemy(app)
# Adicionar configurações de CORS e transporte para melhor compatibilidade mobile
socketio = SocketIO(app, cors_allowed_origins="*", 
                    async_mode='threading',
                    logger=True, 
                    engineio_logger=True,
                    ping_timeout=60,
                    ping_interval=25)

# Dicionário para controlar timers ativos
quiz_timers = {}  # {quiz_code: {'thread': Thread, 'stop_flag': bool}}

# Dicionário para rastrear heartbeats dos jogadores
player_heartbeats = (
    {}
)  # {session_id: {'player_id': int, 'quiz_code': str, 'last_heartbeat': timestamp}}
heartbeat_thread = None


# Funções de timer
def start_question_timer(quiz_code, time_limit):
    """Inicia o timer para uma pergunta do quiz"""
    # Parar timer anterior se existir
    stop_question_timer(quiz_code)

    def countdown():
        time_left = time_limit
        stop_flag = quiz_timers[quiz_code]["stop_flag"]

        while time_left > 0 and not stop_flag[0]:
            time.sleep(1)
            time_left -= 1

            # Enviar atualização para todos os clientes
            socketio.emit("timer_update", {"time_left": time_left}, room=quiz_code)

        # Tempo esgotado (se não foi interrompido)
        if not stop_flag[0]:
            socketio.emit("time_expired", {}, room=quiz_code)

        # Limpar da lista de timers
        if quiz_code in quiz_timers:
            del quiz_timers[quiz_code]

    # Criar flag de parada (lista para ser mutável)
    stop_flag = [False]
    thread = threading.Thread(target=countdown, daemon=True)
    quiz_timers[quiz_code] = {"thread": thread, "stop_flag": stop_flag}
    thread.start()


def stop_question_timer(quiz_code):
    """Para o timer ativo de um quiz"""
    if quiz_code in quiz_timers:
        quiz_timers[quiz_code]["stop_flag"][0] = True
        # Aguardar thread terminar
        if quiz_timers[quiz_code]["thread"].is_alive():
            quiz_timers[quiz_code]["thread"].join(timeout=1)


def start_heartbeat_monitor():
    """Inicia monitoramento de heartbeats dos jogadores"""

    def monitor():
        while True:
            time.sleep(5)  # Verificar a cada 5 segundos
            current_time = time.time()
            disconnected_players = []

            # Identificar jogadores sem heartbeat por mais de 15 segundos
            for session_id, data in list(player_heartbeats.items()):
                if current_time - data["last_heartbeat"] > 15:
                    disconnected_players.append(session_id)

            # Apenas remover do tracking de heartbeats, não deletar do banco
            for session_id in disconnected_players:
                player_heartbeats.pop(session_id, None)

    global heartbeat_thread
    if heartbeat_thread is None or not heartbeat_thread.is_alive():
        heartbeat_thread = threading.Thread(target=monitor, daemon=True)
        heartbeat_thread.start()


# Models
class Quiz(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    code = db.Column(db.String(10), unique=True, nullable=False)
    time_limit = db.Column(db.Integer, default=30)  # segundos por pergunta
    is_anonymous = db.Column(db.Boolean, default=False)  # Se o quiz é anônimo
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    questions = db.relationship(
        "Question", backref="quiz", lazy=True, cascade="all, delete-orphan"
    )
    players = db.relationship(
        "Player", backref="quiz", lazy=True, cascade="all, delete-orphan"
    )
    current_question_index = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=False)


class Question(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quiz.id"), nullable=False)
    text = db.Column(db.String(500), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    answers = db.relationship(
        "Answer", backref="question", lazy=True, cascade="all, delete-orphan"
    )


class Answer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey("question.id"), nullable=False)
    text = db.Column(db.String(200), nullable=False)
    is_correct = db.Column(db.Boolean, default=False)
    order = db.Column(db.Integer, nullable=False)


class Player(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quiz.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(7), nullable=False)  # Hex color
    session_id = db.Column(db.String(100), unique=True)
    responses = db.relationship(
        "PlayerResponse", backref="player", lazy=True, cascade="all, delete-orphan"
    )


class PlayerResponse(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey("player.id"), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey("question.id"), nullable=False)
    answer_id = db.Column(db.Integer, db.ForeignKey("answer.id"), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


# Routes
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/create")
def create_quiz():
    return render_template("create_quiz.html")


@app.route("/api/quiz", methods=["POST"])
def save_quiz():
    data = request.json

    # Gerar código único para o quiz
    code = secrets.token_urlsafe(6)[:6].upper()

    quiz = Quiz(
        title=data["title"],
        code=code,
        time_limit=data.get("time_limit", 30),
        is_anonymous=data.get("is_anonymous", False),
    )
    db.session.add(quiz)
    db.session.flush()

    # Adicionar perguntas
    for q_idx, question_data in enumerate(data["questions"]):
        question = Question(quiz_id=quiz.id, text=question_data["text"], order=q_idx)
        db.session.add(question)
        db.session.flush()

        # Adicionar respostas
        for a_idx, answer_data in enumerate(question_data["answers"]):
            answer = Answer(
                question_id=question.id,
                text=answer_data["text"],
                is_correct=answer_data["is_correct"],
                order=a_idx,
            )
            db.session.add(answer)

    db.session.commit()

    return jsonify({"success": True, "code": code, "quiz_id": quiz.id})


@app.route("/join/<code>")
def join_quiz(code):
    quiz = Quiz.query.filter_by(code=code).first()
    if not quiz:
        return "Quiz não encontrado", 404

    # Gerar QR Code
    join_url = f"{app.config['HOST_URL']}/join/{code}"
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(join_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    qr_code_base64 = base64.b64encode(buffered.getvalue()).decode()

    return render_template(
        "join_quiz.html", code=code, qr_code=qr_code_base64, join_url=join_url
    )


@app.route("/host/<code>")
def host_quiz(code):
    quiz = Quiz.query.filter_by(code=code).first()
    if not quiz:
        return "Quiz não encontrado", 404

    # Gerar QR Code
    join_url = f"{app.config['HOST_URL']}/join/{code}"
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(join_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    qr_code_base64 = base64.b64encode(buffered.getvalue()).decode()

    return render_template(
        "host_quiz.html",
        code=code,
        quiz=quiz,
        qr_code=qr_code_base64,
        join_url=join_url,
    )


@app.route("/api/quiz/<code>")
def get_quiz(code):
    quiz = Quiz.query.filter_by(code=code).first()
    if not quiz:
        return jsonify({"error": "Quiz não encontrado"}), 404

    questions_data = []
    for question in sorted(quiz.questions, key=lambda q: q.order):
        answers_data = []
        for answer in sorted(question.answers, key=lambda a: a.order):
            answers_data.append(
                {
                    "id": answer.id,
                    "text": answer.text,
                    "order": answer.order,
                    "is_correct": (
                        answer.is_correct
                        if request.args.get("host") == "true"
                        else None
                    ),
                }
            )

        questions_data.append(
            {
                "id": question.id,
                "text": question.text,
                "order": question.order,
                "answers": answers_data,
            }
        )

    return jsonify(
        {
            "id": quiz.id,
            "title": quiz.title,
            "code": quiz.code,
            "time_limit": quiz.time_limit,
            "is_anonymous": quiz.is_anonymous,
            "questions": questions_data,
            "current_question_index": quiz.current_question_index,
            "is_active": quiz.is_active,
        }
    )


# WebSocket Events
@socketio.on("join_game")
def handle_join_game(data):
    quiz_code = data["quiz_code"]
    player_name = data["player_name"]

    quiz = Quiz.query.filter_by(code=quiz_code).first()
    if not quiz:
        emit("error", {"message": "Quiz não encontrado"})
        return

    # Verificar se já existe um jogador com esse nome neste quiz
    existing_player = Player.query.filter_by(quiz_id=quiz.id, name=player_name).first()

    if existing_player and existing_player.session_id in player_heartbeats:
        # Já existe outro jogador ativo com esse nome - adicionar sufixo
        import random

        suffix = random.randint(10, 99)
        player_name = f"{player_name}{suffix}"

    # Sempre criar novo jogador (sem recuperar histórico)
    import random

    colors = [
        "#FF6B6B",
        "#4ECDC4",
        "#45B7D1",
        "#FFA07A",
        "#98D8C8",
        "#F7DC6F",
        "#BB8FCE",
        "#85C1E2",
        "#F8B739",
        "#52B788",
    ]
    color = random.choice(colors)

    player = Player(
        quiz_id=quiz.id, name=player_name, color=color, session_id=request.sid
    )
    db.session.add(player)
    db.session.commit()

    # Registrar heartbeat inicial
    player_heartbeats[request.sid] = {
        "player_id": player.id,
        "quiz_code": quiz_code,
        "last_heartbeat": time.time(),
    }

    # Iniciar monitor de heartbeat se ainda não estiver rodando
    start_heartbeat_monitor()

    join_room(quiz_code)

    # Notificar todos sobre o novo jogador
    emit(
        "player_joined",
        {"player_id": player.id, "name": player.name, "color": player.color},
        room=quiz_code,
    )

    # Enviar lista de jogadores para o novo jogador
    players = Player.query.filter_by(quiz_id=quiz.id).all()
    emit(
        "players_list",
        {"players": [{"id": p.id, "name": p.name, "color": p.color} for p in players]},
    )

    # Enviar estado atual do quiz se já estiver ativo
    player_answers = {}
    if quiz.is_active and quiz.current_question_index >= 0:
        # Buscar respostas atuais dos jogadores para a pergunta atual
        current_question = (
            quiz.questions[quiz.current_question_index]
            if quiz.current_question_index < len(quiz.questions)
            else None
        )
        if current_question:
            responses = PlayerResponse.query.filter_by(
                question_id=current_question.id
            ).all()
            for response in responses:
                if response.answer_id:
                    player_answers[response.player_id] = response.answer_id

    emit(
        "quiz_state",
        {
            "is_active": quiz.is_active,
            "current_question_index": quiz.current_question_index,
            "player_answers": player_answers,
        },
    )


@socketio.on("join_host")
def handle_join_host(data):
    quiz_code = data["quiz_code"]
    join_room(quiz_code)

    quiz = Quiz.query.filter_by(code=quiz_code).first()
    players = Player.query.filter_by(quiz_id=quiz.id).all()

    emit(
        "players_list",
        {"players": [{"id": p.id, "name": p.name, "color": p.color} for p in players]},
    )


@socketio.on("start_quiz")
def handle_start_quiz(data):
    quiz_code = data["quiz_code"]
    quiz = Quiz.query.filter_by(code=quiz_code).first()

    if quiz:
        quiz.is_active = True
        quiz.current_question_index = 0
        db.session.commit()

        emit("quiz_started", {"question_index": 0}, room=quiz_code)

        # Iniciar timer para primeira pergunta
        start_question_timer(quiz_code, quiz.time_limit)


@socketio.on("next_question")
def handle_next_question(data):
    quiz_code = data["quiz_code"]
    quiz = Quiz.query.filter_by(code=quiz_code).first()

    if quiz:
        # Parar timer da pergunta anterior
        stop_question_timer(quiz_code)

        quiz.current_question_index += 1
        db.session.commit()

        if quiz.current_question_index < len(quiz.questions):
            emit(
                "question_changed",
                {"question_index": quiz.current_question_index},
                room=quiz_code,
            )
            # Iniciar timer para próxima pergunta
            start_question_timer(quiz_code, quiz.time_limit)
        else:
            emit("quiz_ended", {}, room=quiz_code)


@socketio.on("select_answer")
def handle_select_answer(data):
    player_id = data["player_id"]
    question_id = data["question_id"]
    answer_id = data.get("answer_id")
    quiz_code = data["quiz_code"]

    player = Player.query.get(player_id)
    if not player:
        return

    # Atualizar ou criar resposta
    response = PlayerResponse.query.filter_by(
        player_id=player_id, question_id=question_id
    ).first()

    if response:
        response.answer_id = answer_id
        response.timestamp = datetime.utcnow()
    else:
        response = PlayerResponse(
            player_id=player_id, question_id=question_id, answer_id=answer_id
        )
        db.session.add(response)

    db.session.commit()

    # Notificar todos sobre a mudança
    emit(
        "answer_selected",
        {
            "player_id": player_id,
            "player_name": player.name,
            "player_color": player.color,
            "answer_id": answer_id,
        },
        room=quiz_code,
    )


@socketio.on("disconnect")
def handle_disconnect():
    # Apenas remover do rastreamento de heartbeat
    # O monitor de heartbeat vai cuidar de remover jogadores inativos
    if request.sid in player_heartbeats:
        del player_heartbeats[request.sid]


@socketio.on("heartbeat")
def handle_heartbeat():
    """Atualiza o timestamp do heartbeat do jogador"""
    if request.sid in player_heartbeats:
        player_heartbeats[request.sid]["last_heartbeat"] = time.time()


@socketio.on("terminate_quiz")
def handle_terminate_quiz(data):
    quiz_code = data["quiz_code"]
    quiz = Quiz.query.filter_by(code=quiz_code).first()

    if quiz:
        # Deletar todas as respostas dos jogadores
        for player in quiz.players:
            PlayerResponse.query.filter_by(player_id=player.id).delete()

        # Deletar todos os jogadores
        Player.query.filter_by(quiz_id=quiz.id).delete()

        # Resetar o quiz para poder ser usado novamente
        quiz.is_active = False
        quiz.current_question_index = 0

        db.session.commit()

        # Desconectar todos os jogadores
        emit("quiz_terminated", {}, room=quiz_code)


@app.route("/api/quiz/<code>/stats")
def get_quiz_stats(code):
    quiz = Quiz.query.filter_by(code=code).first()
    if not quiz:
        return jsonify({"error": "Quiz não encontrado"}), 404

    stats = []

    for question in sorted(quiz.questions, key=lambda q: q.order):
        question_stats = {
            "question_id": question.id,
            "question_text": question.text,
            "answers": [],
        }

        # Para cada resposta, contar quantos jogadores selecionaram
        for answer in sorted(question.answers, key=lambda a: a.order):
            count = PlayerResponse.query.filter_by(
                question_id=question.id, answer_id=answer.id
            ).count()

            question_stats["answers"].append(
                {
                    "answer_id": answer.id,
                    "answer_text": answer.text,
                    "is_correct": answer.is_correct,
                    "count": count,
                }
            )

        stats.append(question_stats)

    return jsonify(
        {"quiz_title": quiz.title, "total_players": len(quiz.players), "stats": stats}
    )


if __name__ == "__main__":
    with app.app_context():
        db.create_all()

    # Configurações de servidor a partir de variáveis de ambiente
    debug_mode = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))

    socketio.run(app, debug=debug_mode, host=host, port=port)
