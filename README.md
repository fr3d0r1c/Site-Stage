# 🌍 Mon Carnet de Stage (Internship Log)

![Node.js](https://img.shields.io/badge/Node.js-v20-green?style=flat&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey?style=flat&logo=express)
![Kubernetes](https://img.shields.io/badge/Kubernetes-Scalable-326ce5?style=flat&logo=kubernetes)
![Redis](https://img.shields.io/badge/Redis-Session_Store-DC382D?style=flat&logo=redis)
![CI Status](https://github.com/fr3d0r1c/Site-Stage/actions/workflows/node.js.yml/badge.svg)
![Tests](https://img.shields.io/badge/Tests-24%2F24_Passed-success?style=flat&logo=jest)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

> Une plateforme de blogging **Full Stack**, sécurisée, distribuée et progressive (PWA), développée "from scratch" pour documenter mon expérience d'ingénieur.

---

## 📖 À Propos

Ce projet dépasse le simple blog. C'est un démonstrateur technique d'une **architecture Web moderne et scalable**.
Il est conçu pour être déployé dans un cluster Kubernetes, capable de gérer une forte charge grâce à la répartition de trafic et la gestion centralisée des sessions.

### 🏗️ Architecture Distribuée (Cloud Native)

L'application ne tourne pas sur un seul serveur, mais en **Cluster Haute Disponibilité** :

* **Ingress Controller (Nginx) :** Route le trafic via un nom de domaine (`carnet.local`).
* **Load Balancing :** Le trafic est réparti sur **3 Répliques (Pods)** de l'application.
* **Stateful Session (Redis) :** Les sessions utilisateurs sont stockées dans une base **Redis** partagée, permettant à l'utilisateur de passer d'un serveur à l'autre sans être déconnecté.
* **Persistance :** La base de données SQLite et les uploads sont stockés sur des volumes persistants (PV/PVC).

---

## ✨ Fonctionnalités Clés

### 🛡️ Sécurité & DevOps
* **CI/CD (GitHub Actions) :** Pipeline d'intégration continue qui lance automatiquement 24 tests unitaires/intégration à chaque push.
* **Double Authentification (2FA) :** Protection du compte admin via TOTP.
* **Protection Web :** Helmet (CSP strict), Rate Limiting, Honeypot anti-spam.

### 🚀 Expérience Utilisateur (UX)

* **Progressive Web App (PWA) :** Installation locale et fonctionnement Hors-Ligne.
* **Internationalisation :** Traduction automatique (API DeepL) et détection de langue.
* **Interactions :** Commentaires temps réel, Likes, Recherche AJAX.

---

## 🛠️ Stack Technique
* **Backend :** Node.js, Express.js.
* **Données :** SQLite (Data), Redis (Sessions & Caching).
* **Frontend :** EJS, CSS3 Natif (Mode Sombre/Clair), Vanilla JS.
* **Infra & Déploiement :**
    * Docker & Docker Hub.
    * Kubernetes (Kubeadm sur Bare-metal/WSL2).
    * Nginx Ingress Controller.
 
---

## 🚀 Déploiement sur Kubernetes (Production)

C'est la méthode recommandée pour profiter de l'architecture distribuée (Redis + 3 Répliques).

### 1. Prérequis
* Un cluster Kubernetes actif (Kubeadm, Minikube, ou Cloud).
* L'image Docker poussée sur le Hub (ex: `votre-pseudo/carnet-stage:v3`).

### 2. Installation de l'Infrastructure

Lancez les services dans l'ordre :
```bash
# 1. Base de données Redis (Pour les sessions partagées)
kubectl apply -f redis.yaml

# 2. L'Application (3 Répliques + Volume Persistant)
kubectl apply -f carnet-app.yaml

# 3. Le Contrôleur d'Entrée (Routage DNS)
kubectl apply -f ingress.yaml
```

### 3. Accès au site

L'application est configurée pour répondre au domaine carnet.local.

1. Récupérez le port de l'Ingress : kubectl get svc -n ingress-nginx
2. Ajoutez l'IP du cluster dans votre fichier hosts (Windows/Linux) : 172.x.x.x carnet.local
3. Accédez à : http://carnet.local:PORT

---

## 🧪 Tests & Qualité (CI)

Le projet intègre une suite de tests complète avec Jest et Supertest.
* Automatisé : GitHub Actions lance les tests à chaque commit.
* Manuel : Lancer les tests en local (avec base de données isolée) :
```bash
npm test -- --runInBand
```

---

## 🔐 Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `SESSION_SECRET` | **Oui** | Signe les cookies de session. L'appli refuse de démarrer sans. Générez-la avec `openssl rand -hex 48`. |
| `TWO_FA_KEY` | Recommandée | Clé de chiffrement des secrets 2FA en base. **À conserver** : sans elle la 2FA devient illisible. |
| `DB_PATH` | Non | Emplacement de la base SQLite (ex: `/data/blog.db` sur un volume persistant). |
| `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_TO` | Non | Envoi d'emails (contact, notifications, mot de passe oublié). |
| `DEEPL_API_KEY` | Non | Traduction automatique FR → EN. |
| `SITE_URL` | Non | URL publique du site, utilisée dans les liens des emails (sinon `RENDER_EXTERNAL_URL`, sinon localhost). |
| `TRUST_PROXY` | Non | Nombre de proxys devant l'appli (`1` derrière un Ingress/Nginx). À ne définir que si c'est vrai. |
| `INSECURE_COOKIES` | Non | `true` si le site est servi en HTTP simple en production (sinon le cookie « secure » bloque la connexion). |

Pour le développement local, créez un fichier `.env` (jamais commité) :
```bash
SESSION_SECRET=une-longue-valeur-aleatoire
TWO_FA_KEY=une-autre-valeur-aleatoire
```

---

## 🐳 Option Docker Simple (Développement)

Pour tester rapidement sans Kubernetes :
```bash
# Lancer l'app seule (Stockage local SQLite)
docker run -d -p 3000:3000 \
  -e DB_PATH="/data/blog.db" \
  -e SESSION_SECRET="$(openssl rand -hex 48)" \
  -e TWO_FA_KEY="$(openssl rand -hex 48)" \
  -e INSECURE_COOKIES=true \
  -v $(pwd)/data:/data \
  carnet-stage
```
> ⚠️ Avec `SESSION_SECRET` généré à chaque lancement, vous serez déconnecté à chaque redémarrage ; et `TWO_FA_KEY` doit rester la même
> d'un lancement à l'autre si la 2FA est activée. Pour un usage durable, mettez ces valeurs dans un fichier `--env-file`.

---

## 🆘 Dépannage (Environnement WSL2 / Kubeadm)

Si vous utilisez ce projet sur WSL2, l'IP de la VM change à chaque redémarrage de Windows, ce qui casse le cluster Kubernetes.

### Procédure de réparation rapide ("Routine du Matin") :
1. Reset : sudo kubeadm reset -f && rm -rf $HOME/.kube
2. Init : sudo kubeadm init --pod-network-cidr=192.168.0.0/16 --ignore-preflight-errors=Swap
3. Config : Copier les fichiers admin.conf (commandes données par l'init).
4. Réseau : kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
5. Taint : kubectl taint nodes --all node-role.kubernetes.io/control-plane-
6. Ingress : Réinstaller le contrôleur Nginx Baremetal.
7. Redéployer : kubectl apply -f redis.yaml && kubectl apply -f carnet-app.yaml && kubectl apply -f ingress.yaml

---

## 👤 Auteur
Frederic Alleron - Étudiant Ingénieur Informatique & Réseaux - ESAIP Angers
