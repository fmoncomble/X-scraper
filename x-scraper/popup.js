document.addEventListener('DOMContentLoaded', function () {
    const errorMsg = document.getElementById('error-msg');
    const scrapeContainer = document.getElementById('scrape-container');
    const scrapeButton = document.getElementById('scrapeButton');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tab = tabs[0];
        const url = tab ? tab.url : '';
        if (!url.includes('search')) {
            errorMsg.style.display = 'inline-block';
        } else {
            scrapeContainer.style.display = 'inline-block';
        }
    });

    scrapeButton.addEventListener('click', function () {
        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {
                        action: 'scrape',
                    },
                    (response) => {
                        console.log('Response = ', response);
                    }
                );
            }
        );
        window.close();
    });
});