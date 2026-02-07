const STOCKFISH_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js";
const PIECE_URL = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

let board = null;
let game = new Chess();
let stockfish = null;
let playerColor = 'white';
let lastEval = 0.0;
let prevMaterial = 0;
let moveHistory = [];
let currentMoveIndex = -1;

const bookMoves = ["e4", "d4", "Nf3", "c4", "g3", "e5", "d5", "Nf6", "c5", "Nc3", "e6", "d6", "O-O"];

/**
 * 1. INIT ENGINE (Metode Blob Anti-Blokir)
 */
async function initEngine() {
    try {
        const response = await fetch(STOCKFISH_URL);
        const script = await response.text();
        const blob = new Blob([script], { type: "application/javascript" });
        stockfish = new Worker(URL.createObjectURL(blob));

        stockfish.onmessage = (e) => handleEngineMessage(e.data);
        stockfish.postMessage("uci");
        stockfish.postMessage("isready");
        document.getElementById('engine-status').innerText = "Stockfish 18 Aktif";
    } catch (e) {
        document.getElementById('engine-status').innerText = "Engine Gagal Dimuat";
    }
}

/**
 * 2. TRANSLASI KOORDINAT KE ALJABAR (SAN)
 */
function translateToAlgebraic(lanMove) {
    const tempGame = new Chess(game.fen());
    const move = tempGame.move(lanMove, { sloppy: true });
    return move ? move.san : lanMove;
}

/**
 * 3. ENGINE HANDLER
 */
function handleEngineMessage(msg) {
    if (msg.includes("score cp") || msg.includes("score mate")) {
        parseEvaluation(msg);
    }
    if (msg.startsWith("bestmove")) {
        const rawMove = msg.split(" ")[1];
        if (rawMove === "(none)") return;

        const algebraicMove = translateToAlgebraic(rawMove);
        document.getElementById('best-move-algebraic').innerText = "Saran: " + algebraicMove;
        document.getElementById('best-move-raw').innerText = "Koordinat: " + rawMove;

        const turn = game.turn();
        if ((turn === 'b' && playerColor === 'white') || (turn === 'w' && playerColor === 'black')) {
            if (currentMoveIndex === moveHistory.length - 1) {
                setTimeout(() => makeAIMove(rawMove), 800);
            }
        }
    }
}

function parseEvaluation(msg) {
    const match = msg.match(/score (cp|mate) (-?\d+)/);
    if (!match) return;
    let val = parseInt(match[2]);
    if (match[1] === "mate") val = (val > 0) ? 1000 : -1000;
    if (game.turn() === 'b') val = -val;
    const currentEval = val / 100;

    document.getElementById('eval-score').innerText = currentEval.toFixed(1);
    let barHeight = 50 + (currentEval * 10);
    barHeight = Math.max(5, Math.min(95, barHeight));
    document.getElementById('eval-bar').style.height = barHeight + "%";

    if (moveHistory.length > 0) classifyMove(currentEval);
    lastEval = currentEval;
}

/**
 * 4. LOGIKA MATERIAL & AKURASI
 */
function getMaterialScore(fen) {
    const vals = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 };
    let score = 0;
    const pieces = fen.split(' ')[0];
    for (const char of pieces) {
        let low = char.toLowerCase();
        if (vals[low]) score += (char === low ? -vals[low] : vals[low]);
    }
    return score;
}

function classifyMove(currentEval) {
    const badge = document.getElementById('move-quality');
    const side = (game.turn() === 'b') ? 1 : -1;
    const moveAccuracy = (currentEval - lastEval) * side;
    const isSac = (game.turn() === 'b') ? (getMaterialScore(game.fen()) < prevMaterial) : (getMaterialScore(game.fen()) > prevMaterial);

    badge.className = "move-quality-badge";
    let label = "Good", cls = "q-good";

    if (moveHistory.length <= 10 && bookMoves.includes(moveHistory[moveHistory.length-1])) {
        label = "📖 Book Move"; cls = "q-book";
    } else if (moveAccuracy > -0.2) {
        if (isSac && moveAccuracy > -0.25) { label = "!! Brilliant"; cls = "q-brilliant"; }
        else { label = "⭐ Best Move"; cls = "q-best"; }
    } else if (moveAccuracy > -1.2) {
        label = "?! Inaccuracy"; cls = "q-inaccuracy";
    } else if (moveAccuracy > -2.5) {
        label = "? Mistake"; cls = "q-mistake";
    } else {
        label = "?? Blunder"; cls = "q-blunder";
    }
    badge.innerText = label;
    badge.classList.add(cls);
}

/**
 * 5. CORE FUNCTIONS
 */
function makeAIMove(move) {
    game.move(move, { sloppy: true });
    board.position(game.fen());
    syncState();
}

function syncState() {
    moveHistory = game.history();
    currentMoveIndex = moveHistory.length - 1;
    updateStatusUI();
    askEngine();
}

function askEngine() {
    if (!stockfish) return;
    stockfish.postMessage("stop");
    stockfish.postMessage("position fen " + game.fen());
    stockfish.postMessage("go depth 15");
}

function updateStatusUI() {
    let status = game.turn() === 'w' ? "Putih melangkah" : "Hitam melangkah";
    if (game.in_checkmate()) status = "Checkmate!";
    document.getElementById('status').innerText = status;
    document.getElementById('pgn').innerText = game.pgn();
}

function jumpTo(index) {
    if (index < -1 || index >= moveHistory.length) return;
    const tempGame = new Chess();
    for (let i = 0; i <= index; i++) tempGame.move(moveHistory[i]);
    currentMoveIndex = index;
    board.position(tempGame.fen());
}

/**
 * 6. EVENT LISTENERS
 */
document.getElementById('btnNewGame').onclick = () => {
    game.reset(); lastEval = 0.0;
    playerColor = document.getElementById('playerColor').value;
    board.orientation(playerColor);
    board.start();
    syncState();
};

document.getElementById('btnTakeback').onclick = () => {
    game.undo(); game.undo(); board.position(game.fen()); syncState();
};

document.getElementById('btnFlip').onclick = () => board.flip();
document.getElementById('btnStart').onclick = () => jumpTo(-1);
document.getElementById('btnPrev').onclick = () => jumpTo(currentMoveIndex - 1);
document.getElementById('btnNext').onclick = () => jumpTo(currentMoveIndex + 1);
document.getElementById('btnEnd').onclick = () => jumpTo(moveHistory.length - 1);

document.getElementById('btnLoadFen').onclick = () => {
    if (game.load(document.getElementById('fenInput').value)) { 
        board.position(game.fen()); syncState(); 
    }
};

document.getElementById('btnLoadPgn').onclick = () => {
    const pgnVal = document.getElementById('pgnInput').value;
    if (game.load_pgn(pgnVal)) {
        board.position(game.fen()); syncState();
    } else {
        alert("PGN Tidak Valid!");
    }
};

const config = {
    draggable: true,
    position: 'start',
    pieceTheme: PIECE_URL,
    onDragStart: (s, p) => {
        if (game.game_over() || (playerColor === 'white' && p.search(/^b/) !== -1) || (playerColor === 'black' && p.search(/^w/) !== -1)) return false;
    },
    onDrop: (s, t) => {
        prevMaterial = getMaterialScore(game.fen());
        const move = game.move({ from: s, to: t, promotion: 'q' });
        if (move === null) return 'snapback';
        syncState();
    },
    onSnapEnd: () => board.position(game.fen())
};

board = Chessboard('myBoard', config);
initEngine();
updateStatusUI();
window.onresize = () => board.resize();