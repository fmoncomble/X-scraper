An extension for extracting and downloading tweets for text mining.  
  
### Cite this program
If you use this extension for your research, please reference it as follows:  
  
Moncomble, F. (2024). *𝕏-Scraper* (Version 0.2) [JavaScript]. Arras, France: Université d'Artois. Available at: https://fmoncomble.github.io/X-scraper/


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
- Navigate to [𝕏/Twitter](https://x.com/) and perform a search (simple or advanced)
    - It is advised to create a specific account for the purpose of scraping content
- Click the add-on's icon in the toolbar
- Click the `Reload` button for the add-on to work
- (Optional) Enter the maximum number of tweets to scrape
- Choose desired output file format:
    - `XML` for an XML-TEI file to import into [TXM](https://txm.gitpages.huma-num.fr/textometrie/) with the `XML-TEI Zero + CSV` module
    - `TXT` for a plain text file
    - `JSON`
- Click `Start scraping`
- You can abort at any time
- Click `Download` to collect the output or `Reload` to start again 