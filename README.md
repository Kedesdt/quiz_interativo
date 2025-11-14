# Quiz.io - Sistema de Quiz Interativo em Tempo Real

Sistema moderno de quiz com visualização em tempo real usando Python, Flask e WebSocket.

## 🚀 Funcionalidades

- ✅ Criação de questionários com múltiplas perguntas
- ✅ Perguntas de múltipla escolha com resposta correta
- ✅ Link compartilhável para os participantes
- ✅ Visualização em tempo real com avatares coloridos
- ✅ Animação dos bonecos se movendo entre as respostas
- ✅ Tempo configurável para cada pergunta
- ✅ Todos veem as mudanças via WebSocket
- ✅ Interface moderna e responsiva

## 📋 Pré-requisitos

- Python 3.8 ou superior
- pip (gerenciador de pacotes Python)

## 🔧 Instalação

1. Clone ou baixe o projeto para sua máquina

2. Instale as dependências:

```powershell
pip install -r requirements.txt
```

## ▶️ Como Executar

Execute o aplicativo:

```powershell
python app.py
```

O servidor iniciará em `http://localhost:5000`

## 📖 Como Usar

### Criar um Quiz

1. Acesse `http://localhost:5000`
2. Clique em "Criar Novo Quiz"
3. Preencha:
   - Título do quiz
   - Tempo por pergunta (em segundos)
   - Perguntas e respostas
   - Marque a resposta correta para cada pergunta
4. Clique em "Criar Quiz"
5. Anote o código gerado (ex: ABC123)

### Hospedar o Quiz

1. Após criar, você será redirecionado para a tela de host
2. Compartilhe o código com os participantes
3. Aguarde os jogadores entrarem
4. Clique em "Iniciar Quiz" quando estiver pronto
5. Avance pelas perguntas usando o botão "Próxima Pergunta"

### Participar do Quiz

1. Acesse `http://localhost:5000`
2. Digite o código do quiz
3. Clique em "Entrar"
4. Digite seu nome
5. Aguarde o início do quiz
6. Clique nas respostas para selecionar
7. Veja seu boneco se mover em tempo real!

## 🎨 Características Técnicas

- **Backend**: Flask + Flask-SocketIO
- **Banco de Dados**: SQLite (criado automaticamente)
- **WebSocket**: Socket.IO para comunicação em tempo real
- **Frontend**: HTML5, CSS3, JavaScript puro
- **Design**: Interface moderna com gradientes e animações

## 📁 Estrutura do Projeto

```
quiz_io/
├── app.py              # Aplicação principal Flask
├── requirements.txt    # Dependências Python
├── quiz.db            # Banco de dados (criado automaticamente)
└── templates/         # Templates HTML
    ├── index.html          # Página inicial
    ├── create_quiz.html    # Criar quiz
    ├── host_quiz.html      # Hospedar quiz
    └── join_quiz.html      # Participar do quiz
```

## 🎮 Fluxo do Jogo

1. **Criador** faz o quiz e compartilha o código
2. **Jogadores** entram usando o código
3. Cada jogador é representado por um avatar colorido
4. **Host** inicia o quiz
5. Jogadores veem as perguntas e clicam nas respostas
6. Avatares se movem para a área da resposta escolhida
7. Todos veem os movimentos em tempo real via WebSocket
8. Jogadores podem mudar de resposta dentro do tempo limite
9. Host avança para próxima pergunta
10. Ao final, todos veem a tela de resultados

## 🌐 Tecnologias Utilizadas

- Python 3
- Flask (Framework Web)
- Flask-SocketIO (WebSocket)
- Flask-SQLAlchemy (ORM)
- SQLite (Banco de dados)
- Socket.IO (Cliente JavaScript)
- HTML5/CSS3/JavaScript

## 📝 Observações

- O banco de dados é criado automaticamente na primeira execução
- Cada jogador recebe uma cor aleatória automaticamente
- O código do quiz é gerado automaticamente e é único
- As respostas corretas só são visíveis para o host

## 🤝 Contribuições

Sinta-se à vontade para modificar e melhorar o projeto!

## 📄 Licença

Este projeto é livre para uso pessoal e educacional.
