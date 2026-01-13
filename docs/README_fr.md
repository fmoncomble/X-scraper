[(English version)](https://fmoncomble.github.io/X-scraper)

Une extension pour extraire et télécharger des tweets à des fins de fouille textuelle.

### Citer ce programme

Si vous utilisez cette extension pour votre recherche, veuillez la référencer comme suit :

Moncomble, F. (2024). _𝕏-Scraper_ (Version 0.7) [JavaScript]. Arras, France : Université d'Artois. Disponible à l'adresse : https://fmoncomble.github.io/X-scraper/

## Installation

### Firefox

[![Firefox add-on](https://github.com/fmoncomble/Figaro_extractor/assets/59739627/e4df008e-1aac-46be-a216-e6304a65ba97)](https://github.com/fmoncomble/X-scraper/releases/latest/download/x-scraper.xpi)

### Chrome/Edge

[![available-chrome-web-store4321](https://github.com/fmoncomble/X-scraper/assets/59739627/c23ea0a7-0c42-452e-89c0-0772314acac2)](https://chromewebstore.google.com/detail/%F0%9D%95%8F-scraper/elhnicjnbaaikfofmgmnbfdoeihnpmjg)

Pensez à épingler l'extension à la barre d'outils

## Mode d'emploi

-   Ouvrez [𝕏/Twitter](https://twitter.com/search-advanced) et effectuez une recherche (simple ou avancée).
    -   Il est conseillé de créer un compte spécifique pour la récupération automatique de contenu.
-   Cliquez sur l'icône de l'extension dans la barre d'outils.
-   Cliquez sur `Start`.
-   L'interface apparait par-dessus la page web :
    -   (Facultatif) Définissez le nombre maximum de tweets à récupérer.
    -   Vous pouvez arrêter la collecte à tout moment en cliquant sur `Stop`, ou l'annuler en fermant l'interface.
    -   ⚠️ Le nombre de requêtes utilisateur au serveur 𝕏 est plafonné à 50 par période de 15 minutes (chaque requête renvoyant 20 tweets maximum). À partir de la v0.5, l'extension gère ce plafond automatiquement : si le nombre de tweets souhaité dépasse votre limite actuelle, ou si vous ne réglez pas le nombre maximum de tweets à collecter, les requêtes sont espacées de 18 secondes. Cela permet au plafond d'être réinitialisé avant d'être atteint, et ainsi à la collecte de continuer sans interruption.
-   Une fois la collecte terminée, l'interface vous propose de choisir les données que vous souhaitez inclure dans le fichier final. Par défaut, le nom d'utilisateur, la date de publication (`created_at`), le texte et l'URL du tweet sont sélectionnés.
    -   (Facultatif) Cochez la case pour anonymiser les tweets : les noms d'utilisateur seront remplacés par des identifiants uniques du type `x_user_n°` et les URLs des tweets ne seront pas incluses.
    -   Choisissez le format de sortie désiré :
        -   `XML/XTZ` pour un fichier XML à importer dans [TXM](https://txm.gitpages.huma-num.fr/textometrie/en/index.html) en utilisant le module `XML/TEI-Zero`.
            -   Lors de l'import, ouvrez la section "Plans textuels" et entrez `ref` dans le champ « Hors texte à éditer »
        -   `TXT` pour du texte brut
        -   `CSV`
        -   `XLSX` (tableau Excel)
        -   `JSON`
    -   Cliquez sur `Download` pour sauvegarder sur votre ordinateur le fichier contenant les résultats.

## Limites et problèmes connus

### ~~Nombre excessif de requêtes~~

~~L'extension collecte les tweets en faisant défiler automatiquement la page des résultats de la recherche. Cela envoie des appels répétés au serveur 𝕏/Twitter, qui finit par **ne plus régénérer la page** avec une réponse 429 (nombre excessif de requêtes). Lorsque cela se produit (généralement après avoir collecté ~900 tweets), **téléchargez le fichier**, réinitialisez (bouton `Reset`), patientez quelques minutes, puis ajustez vos paramètres de recherche pour éviter de collecter des doublons et reprenez la collecte.~~

### Refonte de l'interface

**⚠️ Important!** Dans la v0.2, la fenêtre popup de l'extension doit rester ouverte pour que l'extension se comporte correctement. Cliquer en dehors de la fenêtre, passer à un autre onglet/fenêtre ou à une autre application entraine sa fermeture, empêchant ainsi l'utilisateur d'interagir avec l'extension pendant ou après le processus de scraping.  
**Ce problème a été résolu dans la version 0.3 grâce à une interface remaniée:** assurez-vous de télécharger la dernière version.

### Créer un compte 𝕏/Twitter dédié

Bien qu'Elon Musk ait exprimé à plusieurs reprises son opposition au scraping des données de 𝕏/Twitter, la collecte de données publiques à des fins de recherche est légale dans la plupart des pays. Toutefois, par précaution, il est conseillé de **créer un compte ad hoc** pour récupérer du contenu.
