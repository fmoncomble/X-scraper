[(Version française)](https://fmoncomble.github.io/X-scraper/README_fr.html)

An extension for extracting and downloading tweets for text mining.  
  
### Cite this program
If you use this extension for your research, please reference it as follows:  
  
Moncomble, F. (2024). *𝕏-Scraper* (Version 0.3) [JavaScript]. Arras, France: Université d'Artois. Available at: https://fmoncomble.github.io/X-scraper/


## Installation
### Firefox (recommended: automatic updates)
[![Firefox add-on](https://github.com/fmoncomble/Figaro_extractor/assets/59739627/e4df008e-1aac-46be-a216-e6304a65ba97)](https://github.com/fmoncomble/X-scraper/releases/latest/download/x-scraper.xpi)  
Remember:
- to pin the add-on to the toolbar
- to "always allow on twitter.com" by right-clicking the icon

### Chrome/Edge
- [Download .zip archive](https://github.com/fmoncomble/X-scraper/releases/latest/download/x-scraper.zip)
- Unzip the archive
- Open the extensions manager: `chrome://extensions` or `edge://extensions`
  - Activate "developer mode"
  - Click "Load unpacked"
  - Select the unzipped folder
- Pin the add-on to the toolbar
 
## Instructions for use
- Navigate to [𝕏/Twitter](https://twitter.com/search-advanced) and perform a search (simple or advanced)
    - It is advised to create a specific account for the purpose of scraping content
- Click the add-on's icon in the toolbar
- Click `Start scraping`
- The interface appears as a layer over the current webpage:
    - (Optional) Set the maximum number of tweets to scrape
    - Choose your preferred output format:
        - `XML/XTZ` for an XML file to import into [TXM](https://txm.gitpages.huma-num.fr/textometrie/en/index.html) using the `XML/TEI-Zero`module
          - When initiating the import process, open the "Textual planes" section and type `ref` in the field labelled "Out of text to edit"
        - `TXT` for plain text
        - `CSV`
        - `JSON`
- You can abort at any time
- Click `Download` to collect the output 

## Known issues and limitations
### Too many requests
The add-on collects tweets by automatically scrolling the search results page. This makes repeated calls to the 𝕏/Twitter server, which eventually **times out** with a 429 response (Too may requests). When that happens (generally after scraping ~900 tweets), **download the file**, reset, allow a few minutes for the server to 'cool down', then adjust your search parameters to avoid collecting duplicates and resume scraping. 
### Interface redesign
**⚠️ Important!** In v0.2, the add-on's popup window needs to remain open for the extension to behave properly. Clicking outside it, switching to another tab/window, or switching to a different app will cause it to close, effectively preventing the user from interacting with the extension during or after the scraping process.  
**This is addressed in v0.3 through a redesigned interface:** make sure to download the newest version.
### Create an ad-hoc account
Although Elon Musk has repeatedly expressed his opposition to scraping 𝕏/Twitter data, collecting publicly available data for research purposes is legal in most countries. However, as a precaution, it is advisable to **create an ad-hoc account** for this specific purpose. 

