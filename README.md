# Onglet Patrimonial Biblio

Cette application web permet d'analyser la présence d'espèces végétales patrimoniales à proximité d'une adresse ou d'une zone sélectionnée sur une carte. Elle utilise Leaflet côté client et des fonctions Netlify pour certaines opérations serveur.

## Installation

1. Installez les dépendances npm :

```bash
npm install
```

2. Les fonctions serverless se trouvent dans `netlify/functions`.

## Utilisation en développement

Pour lancer l'application avec Netlify CLI :

```bash
npx netlify dev
```

Ouvrez ensuite `http://localhost:8888` dans votre navigateur.

Vous pouvez également ouvrir `index.html` directement, mais certaines fonctionnalités nécessitant la fonction Netlify ne seront pas disponibles.

## Structure du dépôt

- `index.html` – page principale de l'interface
- `style.css` – feuille de styles
- `ui.js` et `biblio-patri.js` – scripts front‑end
- `netlify/functions/` – fonctions Netlify, dont `analyze-patrimonial-status.js`
- `BDCstatut.csv` – données patrimoniales utilisées par le backend
- `netlify.toml` – configuration du déploiement Netlify

Ce dépôt ne contient pas encore de tests automatisés.
