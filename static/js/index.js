document.getElementById('joinForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const code = document.getElementById('quizCode').value.toUpperCase();
    if (code) {
        window.location.href = `/quiz/${code}`;
    }
});
