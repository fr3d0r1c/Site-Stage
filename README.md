# 🌍 Mon Carnet de Stage (Internship Log)

![Node.js](https://img.shields.io/badge/Node.js-v20-green?style=flat&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey?style=flat&logo=express)
![SQLite](https://img.shields.io/badge/SQLite-3-blue?style=flat&logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker)
![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326ce5?style=flat&logo=kubernetes)
![Tests](https://img.shields.io/badge/Tests-24%2F24_Passed-success?style=flat&logo=jest)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

> Une plateforme de blogging **Full Stack**, sécurisée et progressive (PWA), développée "from scratch" pour documenter mon expérience d'ingénieur à l'international.

---

## 📖 À Propos

Ce projet n'est pas un simple blog. C'est un **CMS (Content Management System) complet** conçu pour démontrer la maîtrise des concepts fondamentaux du développement web moderne, sans dépendre de frameworks lourds.

L'objectif était de créer une application **robuste**, **sécurisée** et **accessible**, capable de fonctionner hors-ligne et de gérer une communauté, tout en étant déployable sur une infrastructure conteneurisée complexe.

### 🔗 Démo en ligne

👉 **[Accéder au site (Render)](https://my-internship.onrender.com)**

---

## ✨ Fonctionnalités Clés

### 🛡️ Sécurité & Administration (Fort Knox)

* **Double Authentification (2FA) :** Protection du compte admin via TOTP (Google Authenticator).
* **Sécurité Web :** Configuration stricte CSP (Helmet), Rate Limiting, Protection Anti-Spam (Honeypot).
* **Traçabilité :** Journal d'audit complet des actions sensibles.
* **Sauvegardes :** Système de backup/restauration de la base de données via l'interface.

### 🚀 Expérience Utilisateur (UX)

* **Progressive Web App (PWA) :** Installation sur mobile et fonctionnement **Hors-Ligne** (Service Workers).
* **Navigation Fluide :** Recherche instantanée (AJAX), Palette de commandes (`Ctrl+K`).
* **Confort de Lecture :** Mode "Zen", Estimation du temps de lecture, Sommaire automatique.
* **Internationalisation :** Site entièrement bilingue (FR/EN) avec détection automatique.

### 💬 Social & Communauté

* **Système Invité "Magic" :** Pas de mot de passe. Identification persistante via cookies sécurisés.
* **Gamification :** Attribution automatique de badges (Premier commentaire, Fan, Expert...).
* **Interactions :** Commentaires imbriqués, Likes (Toggle), Partage réseaux sociaux.

---

## 🛠️ Stack Technique

* **Backend :** Node.js, Express.js.
* **Base de Données :** SQLite (avec système de migrations personnalisé).
* **Frontend :** EJS (Templating), CSS3 Natif (Responsive, Thèmes Clair/Sombre/Sépia).
* **DevOps :** Docker, GitHub Actions (CI/CD).
* **Orchestration :** Kubernetes (Kubeadm sur Debian/WSL2), Gestion des PV/PVC (Persistance), Secrets.
* **Outils :** Chart.js (Dashboard), Leaflet (Cartes), Highlight.js (Code), PDFKit.

---

## 📸 Aperçu

| Accueil (Mode Sombre) | Dashboard Admin | Mobile & PWA |
|:---:|:---:|:---:|
| ![Accueil](https://github.com/user-attachments/assets/f527a521-67ee-4b4a-bf8c-a06426fba0b3) | ![Admin](https://github.com/user-attachments/assets/04a92e21-add5-4637-893b-cb3927323441) | ![Mobile](https://github.com/user-attachments/assets/08eb6842-b065-4f7c-8c00-15e671f9b767) |

---

## ⚙️ Installation & Démarrage

### Option A : Via Docker (Recommandé)

L'application est conteneurisée. Nous utilisons un volume pour assurer la persistance des données.

```bash
# 1. Construire l'image
docker build -t carnet-stage .

# 2. Créer un dossier pour les données persistantes
mkdir -p data

# 3. Lancer le conteneur (Port 3000)
docker run -d -p 3000:3000 \
  --name carnet-app \
  -e DB_PATH="/data/blog.db" \
  -v $(pwd)/data:/data \
  carnet-stage
```

Accédez à <http://localhost:3000>.

### Option B : Orchestration Kubernetes (Production)

Architecture déployée avec succès sur un cluster **Kubeadm** (**Bare-metal/WSL2**). La configuration inclut : **PersistentVolume** (HostPath), Secrets (Env vars) et **Service** (NodePort).

#### 1. Prérequis (Sur le Nœud)

```bash
# Création du dossier de persistance sur l'hôte
sudo mkdir -p /mnt/data && sudo chmod 777 /mnt/data
```

#### 2. Déploiement

```bash
# Appliquer la configuration complète
kubectl apply -f carnet-app.yaml
```

#### 3. Accès

```bash
# Tunnel vers le service (si pas de LoadBalancer)
kubectl port-forward service/site-service 8080:80 --address 0.0.0.0
```

Accédez à <http://localhost:8080>.

---

### Option C : Installation Locale (Node.js)

```bash
# 1. Cloner et Installer
git clone [https://github.com/fr3d0r1c/Site-Stage](https://github.com/fr3d0r1c/Site-Stage)
cd Site-Stage
npm install

# 2. Configurer (.env)
echo "PORT=3000" > .env
echo "SESSION_SECRET=votre_secret" >> .env

# 3. Démarrer
npm start
```

---

## 🆘 Note technique : Kubernetes sur WSL2

Si vous testez ce projet sur un cluster Kubeadm via WSL2, l'IP de la VM change à chaque redémarrage de Windows, ce qui nécessite une réinitialisation du cluster.

### Procédure de maintenance WSL2

1. `sudo kubeadm reset -f`
2. `sudo kubeadm init ...`
3. `kubectl apply -f ...` (Vos données dans `/mnt/data` seront conservées)

---

## ✅ Qualité du Code

Le projet met un point d'honneur sur la stabilité et l'accessibilité.

* Tests Automatisés : 24 tests d'intégration couvrant l'authentification, le CRUD et la sécurité.

```bash
npm test
```

* Accessibilité : Score Lighthouse de 100/100. (Navigation clavier, contrastes, ARIA labels).

---

## 👤 Auteur

Frederic Alleron - Étudiant Ingénieur Informatique & Réseaux - ESAIP Angers
Projet réalisé dans le cadre d'un futur stage à l'étranger.
