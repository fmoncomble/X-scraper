document.addEventListener('DOMContentLoaded', function () {
    const errorMsg = document.getElementById('error-msg');
    const reloadDiv = document.getElementById('reload-div');
    const scrapeContainer = document.getElementById('scrape-container');
    const inputContainer = document.getElementById('input-container');
    const formatContainer = document.getElementById('format-container');
    const scrapeButton = document.getElementById('scrapeButton');
    const stopButton = document.getElementById('stopButton');
    const abortMsg = document.getElementById('abort-msg');
    const processContainer = document.getElementById('process-container');
    const downloadButton = document.getElementById('downloadButton');
    const dlContainer = document.getElementById('dl-container');
    const fileFormatSelect = document.getElementById('file-format');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tab = tabs[0];
        const url = tab ? tab.url : '';
        if (!url.includes('search')) {
            errorMsg.style.display = 'inline-block';
        } else {
            reloadDiv.style.display = 'inline-block';
        }
    });

    let maxTweets;
    const maxTweetInput = document.getElementById('max-tweets');

    reloadButton.addEventListener('click', function () {
        chrome.tabs.reload();
        reloadDiv.style.display = 'none';
        maxTweetInput.value = '';
        stopButton.style.display = 'none';
        abortMsg.style.display = 'none';
        processContainer.textContent = '';
        downloadButton.style.display = 'none';
        dlContainer.textContent = '';
        scrapeContainer.style.display = 'inline-block';
        inputContainer.style.display = 'inline-block';
        formatContainer.style.display = 'inline-block';
        scrapeButton.style.display = 'inline-block';
    });

    maxTweetInput.addEventListener('change', function () {
        maxTweets = maxTweetInput.value;
        console.log('maxTweets = ', maxTweets);
    });

    let fileFormat = 'xml';
    fileFormatSelect.addEventListener('change', function () {
        fileFormat = fileFormatSelect.value;
        downloadButton.textContent = `Download ${fileFormat.toUpperCase()}`;
        console.log('File format = ', fileFormat);
        console.log('Download text = ', downloadButton.textContent);
    });

    scrapeButton.addEventListener('click', function () {
        scrapeButton.style.display = 'none';
        stopButton.style.display = 'inline-block';
        updateTweetCount();
        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {
                        action: 'scrape',
                        maxTweets: maxTweets,
                        fileFormat: fileFormat,
                    },
                    (response) => {
                        console.log('Response = ', response);
                        if (response.success) {
                            processContainer.textContent =
                                response.data + ' tweet(s) scraped';
                            stopButton.style.display = 'none';
                            inputContainer.style.display = 'none';
                            formatContainer.style.display = 'none';
                            reloadDiv.style.display = 'block';
                            downloadButton.style.display = 'inline-block';
                        } else {
                            console.error('Error: ', response.error);
                        }
                    }
                );
            }
        );
    });

    stopButton.addEventListener('click', function () {
        stopButton.style.display = 'none';
        inputContainer.style.display = 'none';
        formatContainer.style.display = 'none';
        reloadDiv.style.display = 'block';
        processContainer.textContent = 'Aborting...';
        downloadButton.style.display = 'inline-block';

        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {
                        action: 'abort',
                    },
                    function (response) {
                        abortMsg.style.display = 'block';
                    }
                );
            }
        );
    });

    downloadButton.addEventListener('click', function () {
        dlContainer.textContent = `Downloading ${fileFormat} file...`;
        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {
                        action: 'download',
                        fileFormat: fileFormat,
                    },
                    function (response) {
                        dlContainer.textContent = response.data;
                    }
                );
            }
        );
    });

    // Function to update the number of scraped tweets
    let tweetCount;
    function updateTweetCount() {
        console.log('updateTweetCount function invoked');
        let port;
        chrome.runtime.onConnect.addListener(connect);
        function connect(p) {
            port = p;
            console.assert(port.name === 'contentjs');
            port.onMessage.addListener((msg) => respond(msg));
            function respond(msg) {
                if (msg) {
                    console.log('Message from content: ', msg);
                    console.log('Updating range');
                    tweetCount = msg.tweetCount;
                    processContainer.textContent = `Scraping ${tweetCount} tweet(s)...`;
                } else {
                    console.error('No message from background');
                }
            }
        }
    }
});
