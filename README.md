# 🌍 Mon Carnet de Stage (Internship Log)

![Node.js](https://img.shields.io/badge/Node.js-v20-green?style=flat&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey?style=flat&logo=express)
![SQLite](https://img.shields.io/badge/SQLite-3-blue?style=flat&logo=sqlite)
![Tests](https://img.shields.io/badge/Tests-24%2F24_Passed-success?style=flat&logo=jest)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

> Une plateforme de blogging **Full Stack**, sécurisée et progressive (PWA), développée "from scratch" pour documenter mon expérience d'ingénieur à l'international.

---

## 📖 À Propos

Ce projet n'est pas un simple blog. C'est un **CMS (Content Management System) complet** conçu pour démontrer la maîtrise des concepts fondamentaux du développement web moderne, sans dépendre de frameworks lourds.

L'objectif était de créer une application **robuste**, **sécurisée** et **accessible**, capable de fonctionner hors-ligne et de gérer une communauté.

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
* **DevOps :** Docker, GitHub Actions (CI/CD), Tests d'intégration (Jest/Supertest).
* **Outils :** Chart.js (Dashboard), Leaflet (Cartes), Highlight.js (Code), PDFKit.

---

## 📸 Aperçu

| Accueil (Mode Sombre) | Dashboard Admin | Mobile & PWA |
|:---:|:---:|:---:|
| ![Accueil](/public/screenshots/home.png) | ![Admin](/public/screenshots/admin.png) | ![Mobile](/public/screenshots/mobile.png) |

---

## ⚙️ Installation & Démarrage

### Option A : Via Docker (Recommandé)
L'application est conteneurisée pour un déploiement instantané.

```
# Construire l'image
docker build -t carnet-stage .

# Lancer le conteneur sur le port 8080
docker run -p 8080:3000 carnet-stage
```
Accédez à http://localhost:8080.

### Option B : Installation Locale (Node.js)

```
# 1. Cloner le projet
git clone https://github.com/fr3d0r1c/Site-Stage
cd Site-Stage

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement Créez un fichier .env à la racine :
PORT=3000
SESSION_SECRET=votre_secret_super_securise
NODE_ENV=development
# Optionnel : Configuration Email
EMAIL_USER=votre@gmail.com
EMAIL_PASS=votre_app_password

# 4. Démarrer
npm start
```

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
Projet réalisé pour un stage à l'étranger
