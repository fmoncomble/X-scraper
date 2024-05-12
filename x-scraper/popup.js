document.addEventListener('DOMContentLoaded', function () {
    const errorMsg = document.getElementById('error-msg');
    const scrapeContainer = document.getElementById('scrape-container');
    const scrapeButton = document.getElementById('scrapeButton');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tab = tabs[0];
        const url = tab ? tab.url : '';
        if (!url.includes('twitter.com/search?') && !url.includes('x.com/search?')) {
            errorMsg.style.display = 'inline-block';
        } else {
            checkPermissions();
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

    // This function checks if the extension has the necessary permissions
    async function checkPermissions() {
        const permissionsToCheck = {
            origins: ['*://twitter.com/*', '*://x.com/*'],
        };

        const hasPermissions = await chrome.permissions.contains(
            permissionsToCheck
        );
        if (!hasPermissions) {
            document.getElementById('grant-permissions').style.display =
                'block';
        } else if (hasPermissions) {
            document.getElementById('scrape-container').style.display =
                'block';
        }
    }

    // This function requests permissions
    async function requestPermissions() {
        const permissionsToRequest = {
            origins: ['*://twitter.com/*', '*://x.com/*'],
        };

        function onResponse(response) {
            if (response) {
                console.log('Permission was granted');
            } else {
                console.log('Permission was refused');
            }
            return chrome.permissions.getAll();
        }

        const response = await chrome.permissions.request(permissionsToRequest);
        const currentPermissions = await onResponse(response);
        console.log(`Current permissions:`, currentPermissions);
    }

    document
        .getElementById('grant-permissions')
        .addEventListener('click', requestPermissions);
});
