#!/bin/bash
# Runa 3D: liga um servidor local e abre o protótipo no navegador.
# Para jogar, basta abrir o index.html no Chrome. O servidor só é preciso para dev.html e para ?modelo=.
cd "$(dirname "$0")"
PORT=8001
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
echo "Runa 3D em http://localhost:$PORT"
echo "Para parar, feche esta janela."
( sleep 1; open -a "Google Chrome" "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" ) &
python3 -m http.server $PORT
