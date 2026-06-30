#!/usr/bin/env bash
# Executa UMA VEZ no servidor para preparar o container Jenkins
# para builds Tauri no Linux.
#
# Uso (no servidor VPS):
#   bash scripts/jenkins-setup.sh
#
# Ou direto do repositório:
#   curl -s https://raw.githubusercontent.com/gabrielsyphan/documentaai/main/scripts/jenkins-setup.sh | bash

set -euo pipefail

CONTAINER=jenkins

echo "=== [1/3] Instalando pacotes de sistema (GTK, WebKit, Rust deps) ==="
docker exec -u root "$CONTAINER" bash -c "
  apt-get update -q
  apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libxdo-dev
  echo '✔ Pacotes instalados'
"

echo ""
echo "=== [2/3] Instalando Node.js via nvm ==="
docker exec -u jenkins "$CONTAINER" bash -c "
  export HOME=/var/jenkins_home
  if [ -s \"\$HOME/.nvm/nvm.sh\" ]; then
    echo 'nvm já instalado, verificando Node.js...'
    . \"\$HOME/.nvm/nvm.sh\"
  else
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    . \"\$HOME/.nvm/nvm.sh\"
  fi
  nvm install 20
  nvm alias default 20
  echo \"✔ Node.js \$(node --version) / npm \$(npm --version)\"
"

echo ""
echo "=== [3/3] Instalando Rust via rustup ==="
docker exec -u jenkins "$CONTAINER" bash -c "
  export HOME=/var/jenkins_home
  if command -v rustc &>/dev/null || [ -f \"\$HOME/.cargo/bin/rustc\" ]; then
    . \"\$HOME/.cargo/env\" 2>/dev/null || true
    echo \"Rust já instalado: \$(rustc --version)\"
  else
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    . \"\$HOME/.cargo/env\"
    echo \"✔ \$(rustc --version)\"
  fi
"

echo ""
echo "=================================================="
echo "✔ Setup concluído. Jenkins está pronto para builds Tauri."
echo ""
echo "Próximo passo: crie o job no Jenkins apontando para"
echo "https://github.com/gabrielsyphan/documentaai.git"
echo "=================================================="
