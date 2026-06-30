pipeline {
    agent any

    environment {
        VPS_HOST   = '2.25.203.118'
        REMOTE_DIR = '/var/www/documentai/downloads'
        HOME       = '/var/jenkins_home'
    }

    options {
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5', artifactNumToKeepStr: '3'))
        disableConcurrentBuilds()
    }

    stages {

        stage('Instalar dependências') {
            steps {
                sh '''
                    export NVM_DIR="$HOME/.nvm"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use 20
                    . "$HOME/.cargo/env"

                    echo "Node: $(node --version)"
                    echo "npm:  $(npm --version)"
                    echo "Rust: $(rustc --version)"

                    npm ci
                '''
            }
        }

        stage('Build Linux') {
            steps {
                sh '''
                    export NVM_DIR="$HOME/.nvm"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use 20
                    . "$HOME/.cargo/env"

                    npm run tauri build
                '''
            }
        }

        stage('Artefatos') {
            steps {
                sh 'find src-tauri/target/release/bundle -name "*.AppImage" -o -name "*.deb" | sort'
                archiveArtifacts(
                    artifacts: 'src-tauri/target/release/bundle/**/*.AppImage,src-tauri/target/release/bundle/**/*.deb',
                    fingerprint: true
                )
            }
        }

        stage('Deploy') {
            when { branch 'main' }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'rovanly-vps',
                    usernameVariable: 'VPS_USER',
                    passwordVariable: 'VPS_PASS'
                )]) {
                    sh '''
                        APPIMAGE=$(find src-tauri/target/release/bundle/appimage -name "*.AppImage" 2>/dev/null | head -1)
                        DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" 2>/dev/null | head -1)

                        echo "→ AppImage: $APPIMAGE"
                        echo "→ .deb:     $DEB"

                        sshpass -p "$VPS_PASS" scp \
                            -o StrictHostKeyChecking=no \
                            -o ConnectTimeout=30 \
                            ${APPIMAGE:+"$APPIMAGE"} ${DEB:+"$DEB"} \
                            "$VPS_USER@$VPS_HOST:$REMOTE_DIR/"

                        sshpass -p "$VPS_PASS" ssh \
                            -o StrictHostKeyChecking=no \
                            -o ConnectTimeout=30 \
                            "$VPS_USER@$VPS_HOST" \
                            "chmod 644 \"$REMOTE_DIR\"/*.AppImage \"$REMOTE_DIR\"/*.deb 2>/dev/null || true"
                    '''
                }
            }
        }

    }

    post {
        success {
            echo "✔ Build #${env.BUILD_NUMBER} concluído com sucesso."
        }
        failure {
            echo "✘ Build #${env.BUILD_NUMBER} falhou. Verifique os logs."
        }
        cleanup {
            cleanWs()
        }
    }
}
