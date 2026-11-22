#!/usr/bin/env bash
# Preparación de una instancia Ubuntu (EC2) — ejecutar UNA vez por SSH:
#   curl -fsSL https://get.docker.com | sh   (o este script)
#   bash setup-ec2.sh
set -euo pipefail

echo "==> Actualizando paquetes"
sudo apt-get update -y

echo "==> Instalando Docker y el plugin Compose (repositorio oficial)"
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

echo "==> Creando carpeta de despliegue"
mkdir -p "$HOME/app"

echo "==> Swap de 2 GB (evita quedarse sin memoria con OpenObserve + app + colector)"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Listo. Cierra la sesión SSH y vuelve a entrar para que el grupo 'docker' tenga efecto."
docker --version || true
