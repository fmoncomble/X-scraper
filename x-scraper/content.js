console.log('X-Scraper content script injected');

let abort = false;
let maxTweets;
let fileFormat;
let i = 1;
let tweetCount = 0;
let file;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === 'scrape') {
        try {
            console.log('Scraping function initiated');
            maxTweets = message.maxTweets;
            fileFormat = message.fileFormat;
            if (!maxTweets) {
                maxTweets = Infinity;
            }
            console.log('Max tweets = ', maxTweets);
            scrape()
                .then((tweetCount) => {
                    sendResponse({
                        success: true,
                        data: tweetCount,
                    });
                })
                .catch((error) => {
                    console.error('Error: ', error);
                    sendResponse({
                        success: false,
                        error: error,
                    });
                });
            return true;
        } catch (error) {
            console.error('Error: ', error);
        }
    } else if (message.action === 'abort') {
        console.log('Aborted');
        abort = true;
        sendResponse({
            data: tweetCount,
        });
        return true;
    } else if (message.action === 'download') {
        fileFormat = message.fileFormat;
        download();
        sendResponse({
            data: `${fileFormat.toUpperCase()} file downloaded`,
        });
        return true;
    }
});

function scrape() {
    console.log('File format = ', fileFormat);
    if (fileFormat === 'xml') {
        file = `<Text>`;
    } else if (fileFormat === 'json') {
        file = {};
    } else if (fileFormat === 'txt') {
        file = '';
    }
    return new Promise((resolve, reject) => {
        tweetCount = 0;
        let tweetSet = new Set();
        if (abort) return;
        let scrollPosition = 0;
        const scrollStep = 1000;
        const scrollDelay = 1000;
        function scrollToNext() {
            if (
                abort ||
                scrollPosition >= document.body.scrollHeight ||
                tweetCount >= maxTweets
            ) {
                if (fileFormat === 'xml') {
                    file =
                        file +
                        `
</Text>`;
                }
                if (tweetCount > maxTweets) {
                    console.log('Max tweets exceeded');
                }
                console.log(tweetCount + ' tweet(s) scraped');
                resolve(tweetCount);
                return;
            }
            console.log('Scrolling x ' + i);
            scrollPosition += scrollStep;
            window.scrollTo(0, scrollPosition);
            let element = document.querySelectorAll('article');

            for (
                let index = 0;
                index < element.length && tweetCount < maxTweets;
                index++
            ) {
                try {
                    let userNameContainers = Array.from(
                        element[index].querySelectorAll('a[role="link"]')
                    );
                    let userNameContainer = userNameContainers.find((e) =>
                        e.textContent.startsWith('@')
                    );
                    let userName = userNameContainer.textContent;
                    console.log('User name = ', userName);
                    let time = element[index]
                        .querySelector('time')
                        .getAttribute('datetime');

                    let tweetId = `${userName}-${time}`;
                    console.log('Tweet ID = ', tweetId);

                    time = time.split('T')[0];
                    console.log('Tweet time = ', time);

                    let rawUserName = userName.split('@')[1];
                    let tweetUrlContainer = userNameContainers.find((e) =>
                        e
                            .getAttribute('href')
                            .startsWith(`/${rawUserName}/status/`)
                    );
                    let tweetRelUrl = tweetUrlContainer.getAttribute('href');
                    let tweetUrl = `https://twitter.com${tweetRelUrl}`;

                    let status = element[index].querySelector(
                        'div[data-testid="tweetText"]'
                    ).textContent.replaceAll(/[\u201C\u201D]/g, '"').replaceAll(/[\u2018\u2019]/g, "'");
                    console.log('Status = ', status);

                    if (!tweetSet.has(tweetId)) {
                        if (fileFormat === 'xml') {
                            status = status
                                .replaceAll('&', '&amp;')
                                .replaceAll('<', '&lt;')
                                .replaceAll('>', '&gt;')
                                .replaceAll('"', '&quot;')
                                .replaceAll("'", '&apos;');
                            file =
                                file +
                                `
<tweet username="${userName}" time="${time}">
<ref target="${tweetUrl}">${tweetUrl}</ref><lb></lb>
${status}
</tweet>
<lb></lb>
<lb></lb>`;
                        } else if (fileFormat === 'json') {
                            file[tweetId] = {
                                username: `${userName}`,
                                date: `${time}`,
                                status: `${status}`,
                            };
                        } else if (fileFormat === 'txt') {
                            file =
                                file +
                                `
${status}
`;
                        }
                        console.log('Tweet count = ', tweetCount);
                        console.log('Max tweets = ', maxTweets);
                        tweetSet.add(tweetId);
                        console.log('Tweet set = ', tweetSet);
                        tweetCount++;
                    } else {
                        console.log('Skipping duplicate tweet: ', tweetId);
                    }
                } catch (error) {
                    console.log(error);
                }
            }
            if (tweetCount === maxTweets) {
                console.log('Max tweets reached');
                resolve(tweetCount);
                return;
            }
            setTimeout(scrollToNext, scrollDelay);
            i++;
        }
        scrollToNext();

        const interval = setInterval(() => {
            if (abort) {
                clearInterval(interval); // Stop the interval if abort is true
            }
        }, 100);
    });
}

function download() {
    console.log(`Downloading tweets as ${fileFormat} file`);
    if (fileFormat === 'xml') {
        var myBlob = new Blob([file], { type: 'application/xml' });
    } else if (fileFormat === 'json') {
        var fileString = JSON.stringify(file);
        var myBlob = new Blob([fileString], { type: 'text/plain' });
    } else if (fileFormat === 'txt') {
        var myBlob = new Blob([file], { type: 'text/plain' });
    }
    var url = window.URL.createObjectURL(myBlob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tweets.${fileFormat}`;
    anchor.click();
    window.URL.revokeObjectURL(url);
}
